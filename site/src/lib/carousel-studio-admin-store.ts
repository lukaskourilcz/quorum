import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { TemplateLifecycleOverrideSchema, type CarouselTemplate } from "@boardlessai/carousel-studio";
import { readCarouselStudio, type CarouselInspirationLink } from "./carousel-studio";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const linksPath = "state/ventures/carousel-studio/inspiration/owner-links.json";
const overridesPath = "state/ventures/carousel-studio/template-overrides.json";

export class CarouselStudioPersistenceError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE", message: string) {
    super(message);
  }
}

async function readJson(relative: string, root = repositoryRoot): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CarouselStudioPersistenceError("UNAVAILABLE", `Missing ${relative}.`);
    throw error;
  }
}

async function writeLocal(relative: string, value: unknown, root = repositoryRoot): Promise<void> {
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
}

async function writeGitHub(relative: string, value: unknown, message: string, token: string): Promise<void> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    if (!response.ok) throw new CarouselStudioPersistenceError("REMOTE", `GitHub Studio read failed with ${response.status}.`);
    const current = await response.json() as { sha?: string };
    if (!current.sha) throw new CarouselStudioPersistenceError("REMOTE", "GitHub returned an invalid Studio file.");
    const update = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString("base64"), branch, sha: current.sha })
    });
    if (update.ok) return;
    if (update.status !== 409) throw new CarouselStudioPersistenceError("REMOTE", `GitHub Studio write failed with ${update.status}.`);
  }
  throw new CarouselStudioPersistenceError("CONFLICT", "Studio state changed during every save attempt.");
}

async function persist(relative: string, value: unknown, message: string, root = repositoryRoot): Promise<void> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return writeGitHub(relative, value, message, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new CarouselStudioPersistenceError("UNAVAILABLE", "GitHub writing is not configured for this admin.");
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
  venture: "caught-up" | "mma-files";
  slug: string;
  style: string;
  changedAt: string;
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
  return (entry.venture === "caught-up" || entry.venture === "mma-files")
    && typeof entry.slug === "string"
    && typeof entry.style === "string"
    && typeof entry.changedAt === "string";
}

export async function setDeckStyleOverride(
  input: { venture: DeckStyleOverride["venture"]; slug: string; style: string; styles: readonly string[]; now?: Date },
  root = repositoryRoot
): Promise<DeckStyleOverride[]> {
  const slug = input.slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new CarouselStudioPersistenceError("CONFLICT", "That is not an article slug.");
  }
  if (!input.styles.includes(input.style)) {
    throw new CarouselStudioPersistenceError("CONFLICT", "That deck design does not exist.");
  }
  const changedAt = (input.now ?? new Date()).toISOString();
  const overrides = [
    { venture: input.venture, slug, style: input.style, changedAt },
    ...(await readDeckStyleOverrides(root)).filter(
      (override) => override.venture !== input.venture || override.slug !== slug
    )
  ].slice(0, 200);
  await persist(
    deckStyleOverridesPath,
    { schemaVersion: "carousel-deck-style-overrides/1", overrides, updatedAt: changedAt },
    `admin: set the ${input.venture} deck design for ${slug}`,
    root
  );
  return overrides;
}
