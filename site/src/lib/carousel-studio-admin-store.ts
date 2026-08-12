import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CarouselPresetFileSchema,
  CarouselPresetSchema,
  MAX_SLIDE_WORDS,
  TemplateLifecycleOverrideSchema,
  type CarouselPreset,
  type CarouselSummaryVenture,
  type CarouselTemplate
} from "@boardlessai/carousel-studio";
import { readCarouselStudio, type CarouselInspirationLink } from "./carousel-studio";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const linksPath = "state/ventures/carousel-studio/inspiration/owner-links.json";
const overridesPath = "state/ventures/carousel-studio/template-overrides.json";

/**
 * Why a Studio write did not happen, in the terms the owner needs to act on.
 *
 * `UNCONFIGURED` and `REFUSED` are split apart deliberately. Both used to be one silent failure
 * — the panel said "Design se neuložil" and the owner had no way to tell a missing token from a
 * token GitHub had stopped accepting. Fine-grained tokens expire, so the next occurrence of this
 * bug is a year away and looks identical to the first. Naming the two cases separately is what
 * makes it diagnosable at a glance instead of by reading Vercel logs.
 */
export type CarouselStudioPersistenceCode =
  | "UNAVAILABLE"
  | "CONFLICT"
  | "CORRUPT"
  | "REMOTE"
  | "UNCONFIGURED"
  | "REFUSED";

export class CarouselStudioPersistenceError extends Error {
  constructor(readonly code: CarouselStudioPersistenceCode, message: string) {
    super(message);
  }
}

/** What a completed write can say about itself. `commit` is null for a local write. */
export interface CarouselStudioWrite {
  commit: string | null;
}

export const GITHUB_TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";

async function readJson(relative: string, root = repositoryRoot): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CarouselStudioPersistenceError("UNAVAILABLE", `Missing ${relative}.`);
    throw error;
  }
}

async function writeLocal(relative: string, value: unknown, root = repositoryRoot): Promise<CarouselStudioWrite> {
  const target = path.join(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new CarouselStudioPersistenceError("CONFLICT", "Studio path escaped the repository.");
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return { commit: null };
}

/** A GitHub status turned into the failure the owner can act on. */
function githubFailure(status: number, what: string): CarouselStudioPersistenceError {
  if (status === 401 || status === 403) {
    return new CarouselStudioPersistenceError(
      "REFUSED",
      `GitHub refused the ${what} with ${status}. ${GITHUB_TOKEN_ENV} exists but is expired or no longer carries Contents read and write.`
    );
  }
  return new CarouselStudioPersistenceError("REMOTE", `GitHub Studio ${what} failed with ${status}.`);
}

async function writeGitHub(relative: string, value: unknown, message: string, token: string): Promise<CarouselStudioWrite> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    /*
     * A 404 read is a file that does not exist yet, and creating it is the same PUT one field
     * lighter. Without this branch the store could only ever update, so every new state document
     * — the first deck-style override, the preset list — had to be seeded into main by hand
     * before the admin could touch it. Any other read failure is still a failure: a 403 must not
     * be mistaken for "no such file" and answered by overwriting whatever is really there.
     */
    let sha: string | undefined;
    if (response.status !== 404) {
      if (!response.ok) throw githubFailure(response.status, "read");
      const current = await response.json() as { sha?: string };
      if (!current.sha) throw new CarouselStudioPersistenceError("REMOTE", "GitHub returned an invalid Studio file.");
      sha = current.sha;
    }
    const update = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString("base64"),
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (update.ok) {
      const body = await update.json().catch(() => ({})) as { commit?: { sha?: unknown } };
      const commit = typeof body.commit?.sha === "string" ? body.commit.sha.slice(0, 7) : null;
      return { commit };
    }
    // 409 is the file moving under a read. On a create, 422 is the same race told differently:
    // the file appeared between our 404 and our PUT. Both deserve the retry; nothing else does.
    if (update.status !== 409 && !(update.status === 422 && sha === undefined)) throw githubFailure(update.status, "write");
  }
  throw new CarouselStudioPersistenceError("CONFLICT", "Studio state changed during every save attempt.");
}

async function persist(relative: string, value: unknown, message: string, root = repositoryRoot): Promise<CarouselStudioWrite> {
  const token = process.env[GITHUB_TOKEN_ENV];
  if (token) return writeGitHub(relative, value, message, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new CarouselStudioPersistenceError(
      "UNCONFIGURED",
      `${GITHUB_TOKEN_ENV} is not set on this deployment, so nothing the admin changes can be written down.`
    );
  }
  return writeLocal(relative, value, root);
}

function parseLinks(value: unknown): CarouselInspirationLink[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { links?: unknown }).links)) {
    throw new CarouselStudioPersistenceError("CORRUPT", "The Studio inspiration list is malformed.");
  }
  const links = (value as { links: unknown[] }).links;
  if (!links.every((entry) => entry && typeof entry === "object" && typeof (entry as CarouselInspirationLink).url === "string" && typeof (entry as CarouselInspirationLink).label === "string" && typeof (entry as CarouselInspirationLink).addedAt === "string")) {
    throw new CarouselStudioPersistenceError("CORRUPT", "The Studio inspiration list contains an invalid link.");
  }
  return links as CarouselInspirationLink[];
}

function allowedIndividualUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CarouselStudioPersistenceError("CONFLICT", "Enter a complete HTTPS article or post URL.");
  }
  if (parsed.protocol !== "https:" || /(?:^|\.)pinterest\.(?:com|cz)$|(?:^|\.)pin\.it$/i.test(parsed.hostname) || parsed.pathname === "/") {
    throw new CarouselStudioPersistenceError("CONFLICT", "Use one individual HTTPS article or post. Pinterest and broad homepages are not allowed.");
  }
  parsed.hash = "";
  return parsed.toString();
}

export async function addCarouselInspiration(input: { url: string; label: string; now?: Date }, root = repositoryRoot): Promise<CarouselInspirationLink[]> {
  const current = parseLinks(await readJson(linksPath, root));
  const url = allowedIndividualUrl(input.url.trim());
  const label = input.label.trim();
  if (!label || label.length > 120) throw new CarouselStudioPersistenceError("CONFLICT", "Add a short label of 1–120 characters.");
  const addedAt = (input.now ?? new Date()).toISOString();
  const links = [{ url, label, addedAt }, ...current.filter((link) => link.url !== url)].slice(0, 100);
  await persist(linksPath, { schemaVersion: "carousel-inspiration-links/1", links, updatedAt: addedAt }, "admin: add Design Lab inspiration", root);
  return links;
}

export async function setCarouselTemplateStatus(input: { templateId: string; version: string; status: CarouselTemplate["status"]; reason: string; now?: Date }, root = repositoryRoot): Promise<CarouselTemplate["status"]> {
  const snapshot = await readCarouselStudio(root);
  const selected = snapshot.templates.find((entry) => entry.template.id === input.templateId && entry.template.version === input.version);
  if (!selected) throw new CarouselStudioPersistenceError("CONFLICT", "That template version does not exist.");
  if (input.status === "live" && !selected.allChecksPass) throw new CarouselStudioPersistenceError("CONFLICT", "A template can go live only after every check passes.");
  const reason = input.reason.trim();
  if (!reason || reason.length > 400) throw new CarouselStudioPersistenceError("CONFLICT", "Add a reason of 1–400 characters.");
  const parsed = TemplateLifecycleOverrideSchema.safeParse(await readJson(overridesPath, root));
  if (!parsed.success) throw new CarouselStudioPersistenceError("CORRUPT", "The Studio template override file is malformed.");
  const changedAt = (input.now ?? new Date()).toISOString();
  const overrides = [
    { templateId: input.templateId, version: input.version, status: input.status, reason, changedAt, changedBy: "owner" as const },
    ...parsed.data.overrides.filter((override) => override.templateId !== input.templateId || override.version !== input.version)
  ];
  const value = TemplateLifecycleOverrideSchema.parse({ schemaVersion: "carousel-template-overrides/1", overrides, updatedAt: changedAt });
  await persist(overridesPath, value, `admin: mark ${input.templateId}@${input.version} ${input.status}`, root);
  return input.status;
}

const deckStyleOverridesPath = "state/ventures/carousel-studio/deck-style-overrides.json";

export interface DeckStyleOverride {
  venture: CarouselSummaryVenture;
  slug: string;
  /**
   * The article's publication date, which is the other half of its identity.
   *
   * Optional, and that is the migration rather than laxity: three overrides recorded before this
   * field existed name only a slug, and they must keep binding to the article the owner was
   * looking at when they clicked. Matching prefers an exact `venture+slug+date` and falls back to
   * the slug alone, so an old record still applies to every redelivery of its event until the
   * owner picks a design for one of them specifically.
   */
  date?: string;
  style: string;
  changedAt: string;
}

/** The recorded choice for one article, exact date first and slug-only as the fallback. */
export function matchDeckStyleOverride(
  overrides: readonly DeckStyleOverride[],
  venture: DeckStyleOverride["venture"],
  slug: string,
  date: string
): DeckStyleOverride | undefined {
  const forArticle = overrides.filter((entry) => entry.venture === venture && entry.slug === slug);
  return forArticle.find((entry) => entry.date === date) ?? forArticle.find((entry) => entry.date === undefined);
}

/**
 * The design the owner chose for one article's deck.
 *
 * The /admin switcher re-rendered a preview and nothing else: the shipped deck used the style
 * `deckStyleFor` derives from the date, so choosing a design changed a picture on the screen and
 * no bytes anywhere. This file is what the render path reads, so the choice binds. Same text and
 * same photo either way — only the design changes.
 */
export async function readDeckStyleOverrides(root = repositoryRoot): Promise<DeckStyleOverride[]> {
  try {
    const raw = await readJson(deckStyleOverridesPath, root) as { overrides?: unknown };
    return Array.isArray(raw.overrides) ? raw.overrides.filter(isDeckStyleOverride) : [];
  } catch (error) {
    if (error instanceof CarouselStudioPersistenceError && error.code === "UNAVAILABLE") return [];
    throw error;
  }
}

function isDeckStyleOverride(value: unknown): value is DeckStyleOverride {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DeckStyleOverride>;
  return (entry.venture === "caught-up" || entry.venture === "mma-files" || entry.venture === "door-money")
    && typeof entry.slug === "string"
    && (entry.date === undefined || typeof entry.date === "string")
    && typeof entry.style === "string"
    && typeof entry.changedAt === "string";
}

export async function setDeckStyleOverride(
  input: { venture: DeckStyleOverride["venture"]; slug: string; date: string; style: string; styles: readonly string[]; now?: Date },
  root = repositoryRoot
): Promise<{ overrides: DeckStyleOverride[]; commit: string | null }> {
  const slug = input.slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new CarouselStudioPersistenceError("CONFLICT", "That is not an article slug.");
  }
  const date = input.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new CarouselStudioPersistenceError("CONFLICT", "That is not an article date.");
  }
  if (!input.styles.includes(input.style)) {
    throw new CarouselStudioPersistenceError("CONFLICT", "That deck design does not exist.");
  }
  const changedAt = (input.now ?? new Date()).toISOString();
  /*
   * Replaces the record for this exact article and nothing else.
   *
   * Three redeliveries of one event share a slug, so a record written before dates existed
   * answers for all three. Picking a design for one of them must not silently un-pick the other
   * two: the dated record wins for its own date, the undated one keeps answering for the rest.
   */
  const overrides = [
    { venture: input.venture, slug, date, style: input.style, changedAt },
    ...(await readDeckStyleOverrides(root)).filter(
      (override) => override.venture !== input.venture || override.slug !== slug || override.date !== date
    )
  ].slice(0, 200);
  const write = await persist(
    deckStyleOverridesPath,
    { schemaVersion: "carousel-deck-style-overrides/1", overrides, updatedAt: changedAt },
    `admin: set the ${input.venture} deck design for ${date} ${slug}`,
    root
  );
  return { overrides, commit: write.commit };
}

const slideOverridesPath = "state/ventures/carousel-studio/slide-overrides.json";

/**
 * One slide's words, as the owner edited them.
 *
 * Kept apart from the article. A package is what the desk delivered and its hash covers its body;
 * a carousel slide is a rendering of that article, and shortening a line to fit a square is a
 * design decision rather than a correction to the piece. So the edit lives here, keyed by the
 * article's full identity and the slide's index, and the render route reads it server-side — so
 * the preview, the export and anything the pipeline later composes all show the edited deck.
 */
export interface SlideTextOverride {
  venture: CarouselSummaryVenture;
  slug: string;
  date: string;
  slide: number;
  text: string;
  changedAt: string;
}

function isSlideOverride(value: unknown): value is SlideTextOverride {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SlideTextOverride>;
  return (entry.venture === "caught-up" || entry.venture === "mma-files" || entry.venture === "door-money")
    && typeof entry.slug === "string"
    && typeof entry.date === "string"
    && typeof entry.slide === "number"
    && typeof entry.text === "string"
    && typeof entry.changedAt === "string";
}

export async function readSlideTextOverrides(root = repositoryRoot): Promise<SlideTextOverride[]> {
  try {
    const raw = await readJson(slideOverridesPath, root) as { overrides?: unknown };
    return Array.isArray(raw.overrides) ? raw.overrides.filter(isSlideOverride) : [];
  } catch (error) {
    if (error instanceof CarouselStudioPersistenceError && error.code === "UNAVAILABLE") return [];
    throw error;
  }
}

/** The edited slides for one article, by index. */
export function slideTextFor(
  overrides: readonly SlideTextOverride[],
  venture: SlideTextOverride["venture"],
  slug: string,
  date: string
): Map<number, string> {
  return new Map(
    overrides
      .filter((entry) => entry.venture === venture && entry.slug === slug && entry.date === date)
      .map((entry) => [entry.slide, entry.text] as const)
  );
}

export async function setSlideTextOverride(
  input: {
    venture: SlideTextOverride["venture"];
    slug: string;
    date: string;
    slide: number;
    /** An empty string clears the edit and the deck falls back to the article's own words. */
    text: string;
    now?: Date;
  },
  root = repositoryRoot
): Promise<{ overrides: SlideTextOverride[]; commit: string | null }> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new CarouselStudioPersistenceError("CONFLICT", "That is not an article slug.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new CarouselStudioPersistenceError("CONFLICT", "That is not an article date.");
  if (!Number.isInteger(input.slide) || input.slide < 0 || input.slide > 9) {
    throw new CarouselStudioPersistenceError("CONFLICT", "That slide is not part of a deck.");
  }
  const text = input.text.trim();
  // The engine's own limit, enforced here as well as in the editor: a save that reaches this far
  // with thirty-one words would render a slide the review refuses, which is worse than a refusal.
  if (text.split(/\s+/u).filter(Boolean).length > MAX_SLIDE_WORDS) {
    throw new CarouselStudioPersistenceError("CONFLICT", `Slide je delší než ${MAX_SLIDE_WORDS} slov.`);
  }
  const changedAt = (input.now ?? new Date()).toISOString();
  const kept = (await readSlideTextOverrides(root)).filter(
    (entry) => entry.venture !== input.venture || entry.slug !== input.slug || entry.date !== input.date || entry.slide !== input.slide
  );
  const overrides = (text ? [{ ...input, text, changedAt }, ...kept] : kept).slice(0, 400);
  const write = await persist(
    slideOverridesPath,
    { schemaVersion: "carousel-slide-overrides/1", overrides, updatedAt: changedAt },
    `admin: edit ${input.venture} slide ${input.slide + 1} for ${input.date} ${input.slug}`,
    root
  );
  return { overrides, commit: write.commit };
}

const recipeOverridesPath = deckStyleOverridesPath;

/**
 * The owner's recipe for one article: any subset of the fields, the rest still derived.
 *
 * The same file the deck-style switcher has always written, because a bare `style` is a family
 * and the two records already on main have to keep binding. Writing a fuller record beside them
 * is additive; nothing that reads the old shape stops working.
 */
export async function setRecipeOverride(
  input: {
    venture: DeckStyleOverride["venture"];
    slug: string;
    date: string;
    family: string;
    variant?: "A" | "B";
    accentSwap?: boolean;
    treatment?: "none" | "mono" | "duotone";
    typeScale?: number;
    designs: readonly string[];
    now?: Date;
  },
  root = repositoryRoot
): Promise<{ overrides: unknown[]; commit: string | null }> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new CarouselStudioPersistenceError("CONFLICT", "That is not an article slug.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new CarouselStudioPersistenceError("CONFLICT", "That is not an article date.");
  if (!input.designs.includes(input.family)) throw new CarouselStudioPersistenceError("CONFLICT", "That deck design does not exist.");
  const changedAt = (input.now ?? new Date()).toISOString();
  const record = {
    venture: input.venture,
    slug: input.slug,
    date: input.date,
    // `style` is written as well as `family` so a reader of the old shape — and the panel that
    // still speaks it — keeps working against a record written by the new one.
    style: input.family,
    family: input.family,
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.accentSwap === undefined ? {} : { accentSwap: input.accentSwap }),
    ...(input.treatment ? { treatment: input.treatment } : {}),
    ...(input.typeScale === undefined ? {} : { typeScale: input.typeScale }),
    changedAt
  };
  const kept = (await readDeckStyleOverrides(root)).filter(
    (entry) => entry.venture !== input.venture || entry.slug !== input.slug || entry.date !== input.date
  );
  const overrides = [record, ...kept].slice(0, 200);
  const write = await persist(
    recipeOverridesPath,
    { schemaVersion: "carousel-deck-style-overrides/1", overrides, updatedAt: changedAt },
    `admin: set the ${input.venture} deck design for ${input.date} ${input.slug}`,
    root
  );
  return { overrides, commit: write.commit };
}

const presetsPath = "state/ventures/carousel-studio/presets.json";

/**
 * The saved designs, from a file that will not exist the first time it is written.
 *
 * That is the whole reason DL-01's create path had to exist: the deck-style overrides had to be
 * hand-seeded onto main before the switcher worked, and doing that again for every new state
 * document is not a system, it is a chore with a deploy in it.
 */
export async function readCarouselPresets(root = repositoryRoot): Promise<CarouselPreset[]> {
  try {
    const parsed = CarouselPresetFileSchema.safeParse(await readJson(presetsPath, root));
    return parsed.success ? parsed.data.presets : [];
  } catch (error) {
    if (error instanceof CarouselStudioPersistenceError && error.code === "UNAVAILABLE") return [];
    throw error;
  }
}

export async function saveCarouselPreset(
  input: {
    id?: string;
    name: string;
    ventureScope: CarouselSummaryVenture[];
    formats: CarouselPreset["formats"];
    family: string;
    variant: "A" | "B";
    accentSwap: boolean;
    treatment: "none" | "mono" | "duotone";
    typeScale: number;
    /** A preset goes live only by the owner saying so, the same as a template's lifecycle. */
    status: "draft" | "live";
    now?: Date;
  },
  root = repositoryRoot
): Promise<{ presets: CarouselPreset[]; commit: string | null }> {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new CarouselStudioPersistenceError("CONFLICT", "Add a preset name of 2–80 characters.");
  const id = (input.id ?? name)
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 60);
  if (!id) throw new CarouselStudioPersistenceError("CONFLICT", "That preset name has no letters in it.");
  const changedAt = (input.now ?? new Date()).toISOString();
  const candidate = CarouselPresetSchema.safeParse({
    id,
    name,
    ventureScope: input.ventureScope,
    formats: input.formats,
    family: input.family,
    variant: input.variant,
    accentSwap: input.accentSwap,
    treatment: input.treatment,
    typeScale: input.typeScale,
    status: input.status,
    changedAt,
    changedBy: "owner"
  });
  if (!candidate.success) throw new CarouselStudioPersistenceError("CONFLICT", "That preset is not a valid design.");
  const presets = [candidate.data, ...(await readCarouselPresets(root)).filter((preset) => preset.id !== id)].slice(0, 60);
  const write = await persist(
    presetsPath,
    CarouselPresetFileSchema.parse({ schemaVersion: "carousel-preset/1", presets, updatedAt: changedAt }),
    `admin: save the ${input.status} Design Lab preset ${id}`,
    root
  );
  return { presets, commit: write.commit };
}
