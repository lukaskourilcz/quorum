import "server-only";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { readAdminSocialArchive } from "./admin-state";
import { parsePublicIdeaLedger } from "./idea-ledger-model";
import {
  currentRating,
  parseRatingLedger,
  type RatingObjectKind,
  type RatingRecord
} from "./rating-model";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const venturePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * Every tab a venture may declare. A tab no venture declares is dead, and a dead tab hides a
 * surface: `templates` fell out of the list and took the whole template gallery with it, leaving
 * a component nothing could route to. `decks` outlived the question it answered.
 *
 * This is the registry's validator, not the URL's — page.tsx already resolves an unknown
 * `?tab=` to the venture's first tab, so a stale bookmark lands somewhere rather than nowhere.
 */
const adminTabs = [
  "ideas", "plans", "visuals",
  "fighters", "bouts", "events", "slates", "sources",
  "articles", "predictions", "banners", "calendar", "social-lab", "studio", "templates", "inspiration", "hooks",
  "packages",
  "shortlist", "dossiers", "features", "recommendations", "actions", "knowledge",
  "library", "signals", "monitor", "claims"
] as const;

export type AdminVentureTab = (typeof adminTabs)[number];

export interface AdminCard {
  id: string;
  ventureId: string;
  kind: RatingObjectKind;
  title: string;
  summary: string;
  detailPath: string | null;
  status: string;
  originMeetingRef: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  contentHash: string;
  media: string[];
  ratings: RatingRecord[];
  /** The owner-facing next state derived from the latest saved idea rating. */
  graduation: string | null;
}

export interface AdminVenture {
  id: string;
  name: string;
  status: "exploration" | "operating" | "paused";
  visibility: "public" | "owner-only";
  tabs: AdminVentureTab[];
  cards: AdminCard[];
  unreadableFiles: string[];
}

export interface AdminPortfolio {
  ventures: AdminVenture[];
}

export interface AdminPlanDetail {
  id: string;
  ventureId: string;
  seasonId: string | null;
  title: string;
  objective: string;
  status: string;
  originMeetingRef: string;
  tactics: Array<{
    type: string;
    description: string;
    assetsNeeded: string[];
    estCostUsd: number | null;
    estimate: boolean | null;
    platformPolicyNote: string;
    legalityNote: string | null;
  }>;
  calendar: Array<{ week: string; focus: string }>;
  audienceRefs: string[];
  audienceSpecs: AdminAudienceSpec[];
  kpis: string[];
  assets: string[];
  rating: RatingRecord | null;
}

export interface AdminAudienceSpec {
  ref: string;
  subjectRef: string;
  regions: string[];
  ageRange: { min: number; max: number };
  genders: string[];
  interests: string[];
  platforms: string[];
  adTargetingNotes: string;
  status: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum = 1_000): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate && candidate.length <= maximum ? candidate : null;
}

function textArray(value: unknown, maximum = 80): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const parsed = value.map((entry) => text(entry, 500));
  return parsed.every((entry): entry is string => Boolean(entry)) ? parsed : null;
}

function contentHash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function dateFromReference(reference: string | null): string | null {
  return reference?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

async function safeDirectory(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter((filename) => filename.endsWith(".json"))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Subdirectory names, sorted. Missing is empty, because a venture that has not run yet is not an error. */
async function directoryEntries(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** A JSON file that may not exist, or may not parse. Both read as absent to the caller. */
async function optionalJsonFile(absolute: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(absolute, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function readRatings(root: string, ventureId: string): Promise<{
  ratings: RatingRecord[];
  malformed: boolean;
}> {
  try {
    const raw = await readFile(path.join(root, "state", "ratings", ventureId, "ledger.jsonl"), "utf8");
    const parsed = parseRatingLedger(raw);
    return parsed ? { ratings: parsed, malformed: false } : { ratings: [], malformed: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ratings: [], malformed: false };
    throw error;
  }
}

function ratingsFor(ratings: readonly RatingRecord[], objectId: string): RatingRecord[] {
  return ratings
    .filter((rating) => rating.objectRef.id === objectId)
    .sort((left, right) => right.ratedAt.localeCompare(left.ratedAt) || right.id.localeCompare(left.id));
}

/**
 * The site cannot import the orchestrator package at runtime, but the words and branches here
 * deliberately mirror taste/graduation.ts. The raw ledger status remains available to code;
 * this is the status an owner needs while deciding whether to request the next board step.
 */
function ideaGraduation(rating: RatingRecord | null): string | null {
  if (!rating) return null;
  if (rating.rating === "perfect") return "Rated perfect — graduated";
  if (rating.rating === "good") return "Rated good — awaiting board approval";
  return "Rated bad — archived";
}

function parsePlan(
  raw: string,
  ventureId: string,
  ratings: readonly RatingRecord[]
): { card: AdminCard; detail: AdminPlanDetail } | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const plan = object(value);
  const title = text(plan?.title, 160);
  const objective = text(plan?.objective, 1_000);
  const originMeetingRef = text(plan?.originMeetingRef, 240);
  const status = text(plan?.status, 40);
  const id = text(plan?.id, 160);
  if (
    plan?.schemaVersion !== "marketing-plan/1" || plan.ventureId !== ventureId ||
    !id || !/^plan-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
    !title || !objective || !originMeetingRef ||
    !status || !["draft", "owner_rated", "approved", "archived"].includes(status)
  ) return null;
  const rawTactics = Array.isArray(plan.tactics) ? plan.tactics : null;
  const tactics = rawTactics?.map((entry) => {
    const tactic = object(entry);
    const type = text(tactic?.type, 40);
    const description = text(tactic?.description, 1_000);
    const assetsNeeded = textArray(tactic?.assetsNeeded);
    const platformPolicyNote = text(tactic?.platformPolicyNote, 1_000);
    const estCostUsd = typeof tactic?.estCostUsd === "number" && Number.isFinite(tactic.estCostUsd) && tactic.estCostUsd >= 0 ? tactic.estCostUsd : null;
    const estimate = typeof tactic?.estimate === "boolean" ? tactic.estimate : null;
    if (
      !type || !["guerrilla", "social", "content", "paid", "partnership"].includes(type) ||
      !description || !assetsNeeded || !platformPolicyNote ||
      (estCostUsd !== null && estimate !== true)
    ) return null;
    return {
      type,
      description,
      assetsNeeded,
      estCostUsd,
      estimate,
      platformPolicyNote,
      legalityNote: text(tactic?.legalityNote, 1_000)
    };
  }) ?? null;
  const calendar = Array.isArray(plan.calendar) ? plan.calendar.map((entry) => {
    const item = object(entry);
    const week = typeof item?.week === "number" && Number.isInteger(item.week) && item.week > 0
      ? String(item.week)
      : null;
    const focus = text(item?.focus, 500);
    return week && focus ? { week, focus } : null;
  }) : null;
  const audienceRefs = textArray(plan.audienceRefs);
  const kpis = textArray(plan.kpis);
  if (!tactics?.length || tactics.some((entry) => entry === null) || !calendar?.length || calendar.some((entry) => entry === null) || !audienceRefs || !kpis?.length) return null;
  const createdAt = text(plan.createdAt, 80) ?? dateFromReference(originMeetingRef);
  const updatedAt = text(plan.updatedAt, 80) ?? createdAt;
  const history = ratingsFor(ratings, id);
  return {
    card: {
      id,
      ventureId,
      kind: "plan",
      title,
      summary: text(plan.summary, 280) ?? objective,
      detailPath: `ventures/${ventureId}/plans/${id}.md`,
      status,
      originMeetingRef,
      createdAt,
      updatedAt,
      contentHash: contentHash(raw),
      media: textArray(plan.assets) ?? [],
      ratings: history,
      graduation: null
    },
    detail: {
      id,
      ventureId,
      seasonId: text(plan.seasonId, 160),
      title,
      objective,
      status,
      originMeetingRef,
      tactics: tactics as AdminPlanDetail["tactics"],
      calendar: calendar as AdminPlanDetail["calendar"],
      audienceRefs,
      audienceSpecs: [],
      kpis,
      assets: textArray(plan.assets) ?? [],
      rating: currentRating(history, id)
    }
  };
}

async function audienceSpec(
  root: string,
  ventureId: string,
  reference: string
): Promise<AdminAudienceSpec | null> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(reference)) return null;
  for (const directory of ["audience-specs", "audiences"]) {
    try {
      const raw = JSON.parse(
        await readFile(path.join(root, "state", "ventures", ventureId, directory, `${reference}.json`), "utf8")
      ) as unknown;
      const spec = object(raw);
      const subjectRef = text(spec?.subjectRef, 160);
      const regions = textArray(spec?.regions);
      const ageRange = object(spec?.ageRange);
      const genders = textArray(spec?.genders);
      const interests = textArray(spec?.interests);
      const platforms = textArray(spec?.platforms);
      const adTargetingNotes = text(spec?.adTargetingNotes, 800);
      const status = text(spec?.status, 40);
      if (
        spec?.schemaVersion === "audience-spec/1" && spec.ventureId === ventureId &&
        subjectRef && regions?.length &&
        typeof ageRange?.min === "number" && typeof ageRange?.max === "number" && ageRange.min >= 18 && ageRange.min <= ageRange.max &&
        genders?.length && interests?.length && platforms?.length && adTargetingNotes && status
      ) {
        return {
          ref: reference,
          subjectRef,
          regions,
          ageRange: { min: ageRange.min, max: ageRange.max },
          genders,
          interests,
          platforms,
          adTargetingNotes,
          status
        };
      }
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
    }
  }
  return null;
}

async function planRecords(root: string, ventureId: string, ratings: readonly RatingRecord[]) {
  const directory = path.join(root, "state", "ventures", ventureId, "plans");
  const cards: AdminCard[] = [];
  const details: AdminPlanDetail[] = [];
  const unreadable: string[] = [];
  for (const filename of await safeDirectory(directory)) {
    const raw = await readFile(path.join(directory, filename), "utf8");
    const parsed = parsePlan(raw, ventureId, ratings);
    if (parsed) {
      cards.push(parsed.card);
      details.push(parsed.detail);
    } else {
      unreadable.push(`plans/${filename}`);
    }
  }
  return { cards, details, unreadable };
}

async function ideaCards(root: string, ventureId: string, ledgerNamespace: string, ratings: readonly RatingRecord[]) {
  try {
    const raw = await readFile(path.join(root, "state", "ideas", ledgerNamespace, "ledger.jsonl"), "utf8");
    const ideas = parsePublicIdeaLedger(raw, ventureId);
    if (!ideas) return { cards: [], unreadable: [`ideas/${ledgerNamespace}/ledger.jsonl`] };
    return {
      cards: ideas.map((idea): AdminCard => {
        const history = ratingsFor(ratings, idea.id);
        return {
        id: idea.id,
        ventureId,
        kind: "idea",
        title: idea.title,
        summary: idea.summary,
        detailPath: `ideas/${ledgerNamespace}/details/${idea.id}.md`,
        status: idea.status,
        originMeetingRef: idea.origin.meetingRef,
        createdAt: idea.statusHistory[0]?.at ?? null,
        updatedAt: idea.statusHistory.at(-1)?.at ?? null,
        contentHash: contentHash(JSON.stringify(idea)),
        media: [],
        ratings: history,
        graduation: ideaGraduation(currentRating(history, idea.id))
      };
      }),
      unreadable: []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { cards: [], unreadable: [] };
    throw error;
  }
}

/** DNESKAi's social archive is the only current implementation of the `visuals` tab. */
async function caughtUpVisualCards(root: string, ratings: readonly RatingRecord[]) {
  const archive = await readAdminSocialArchive(root);
  return archive.packs.flatMap((pack) =>
    (Object.keys(pack.byLocale) as Array<"en" | "cs">).flatMap((locale) => {
      const localized = pack.byLocale[locale];
      if (!localized) return [];
      return (["instagram", "threads"] as const).map((channel): AdminCard => {
        const item = localized[channel];
        const queue = pack.queue.find((entry) => entry.locale === locale && entry.channel === channel);
        const id = `caught-up-${pack.date}-${locale}-${channel}`;
        return {
          id,
          ventureId: "caught-up",
          kind: "visual",
          title: `${locale.toUpperCase()} ${channel} package`,
          summary: item.text,
          detailPath: null,
          status: queue?.status ?? "unavailable",
          originMeetingRef: pack.quoteCard.sourceTurnRef.split("#")[0] ?? null,
          createdAt: pack.date,
          updatedAt: pack.date,
          contentHash: contentHash(JSON.stringify(item)),
          media: item.frames,
          ratings: ratingsFor(ratings, id),
          graduation: null
        };
      })
    })
  );
}

/**
 * marketingShark's drafted packages, read from what is committed.
 *
 * The admin tab is the whole review surface for this venture: nothing publishes, so a person
 * reading these cards is the only thing between a draft and the bin. Each card names the question,
 * the hook that fronted it and the alternate that did not, and carries the recorded render
 * summaries as media rather than rebuilding the slides from the copy.
 */
async function packageCards(root: string, ventureId: string, ratings: readonly RatingRecord[]): Promise<{ cards: AdminCard[]; unreadable: string[] }> {
  if (ventureId !== "marketingshark") return { cards: [], unreadable: [] };
  const packagesRoot = path.join(root, "state", "ventures", "marketingshark", "packages");
  const cards: AdminCard[] = [];
  const unreadable: string[] = [];

  for (const date of (await directoryEntries(packagesRoot)).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))) {
    for (const brand of await directoryEntries(path.join(packagesRoot, date))) {
      const relative = `ventures/marketingshark/packages/${date}/${brand}/package.json`;
      const parsed = object(await optionalJsonFile(path.join(packagesRoot, date, brand, "package.json")));
      if (!parsed) {
        unreadable.push(relative);
        continue;
      }
      const question = object(parsed.question);
      const hooks = object(parsed.hooks);
      const hookA = object(hooks?.a);
      const hookB = object(hooks?.b);
      const render = object(parsed.render);
      const id = `marketingshark-${date}-${brand}`;
      cards.push({
        id,
        ventureId,
        kind: "social-variant",
        title: `${brand} · ${date}`,
        summary: `Question ${String(question?.id ?? "unknown")} (${String(question?.category ?? "?")}). Hook ${String(hookA?.patternId ?? "?")}, alternate ${String(hookB?.patternId ?? "?")}. ${String(hookA?.en ?? "")}`.trim(),
        detailPath: null,
        status: String(parsed.status ?? "unavailable"),
        originMeetingRef: `meetings/${date}-ms-daily`,
        createdAt: date,
        updatedAt: date,
        contentHash: contentHash(JSON.stringify(parsed)),
        media: Array.isArray(render?.summaryPaths) ? render.summaryPaths.filter((entry): entry is string => typeof entry === "string") : [],
        ratings: ratingsFor(ratings, id),
        graduation: null
      });
    }
  }
  return { cards, unreadable };
}

interface VentureConfig {
  id: string;
  name: string;
  status: AdminVenture["status"];
  visibility: AdminVenture["visibility"];
  ledgerNamespace: string;
  adminTabs: AdminVentureTab[];
}

async function ventureConfigs(root: string): Promise<VentureConfig[]> {
  const parsed = object(JSON.parse(await readFile(path.join(root, "config", "ventures.json"), "utf8")));
  if (parsed?.schemaVersion !== "venture-registry/1" || !Array.isArray(parsed.ventures)) {
    throw new Error("Admin could not read venture-registry/1");
  }
  return parsed.ventures.map((value) => {
    const venture = object(value);
    const id = text(venture?.id, 80);
    const name = text(venture?.name, 100);
    const ledgerNamespace = text(venture?.ledgerNamespace, 80);
    const status = venture?.status === "exploration" || venture?.status === "operating" || venture?.status === "paused"
      ? venture.status
      : null;
    const visibility = venture?.visibility === "public" || venture?.visibility === "owner-only"
      ? venture.visibility
      : null;
    const tabs = Array.isArray(venture?.adminTabs)
      ? venture.adminTabs.filter((tab): tab is AdminVentureTab => typeof tab === "string" && adminTabs.includes(tab as AdminVentureTab))
      : null;
    if (!id || !venturePattern.test(id) || !name || !ledgerNamespace || !venturePattern.test(ledgerNamespace) || !status || !visibility || !tabs) {
      throw new Error("Admin encountered an invalid venture registry entry");
    }
    return { id, name, ledgerNamespace, status, visibility, adminTabs: tabs };
  });
}

/** The ventures whose `visuals` tab has a reader behind it. */
const VISUALS_READERS = ["caught-up", "titty-tuesdays"];

export async function readAdminPortfolio(root = repositoryRoot): Promise<AdminPortfolio> {
  const [configs, social] = await Promise.all([
    ventureConfigs(root),
    readAdminSocialArchive(root)
  ]);
  const ventures = await Promise.all(configs.map(async (venture): Promise<AdminVenture> => {
    /*
     * A `visuals` tab needs somebody to fill it.
     *
     * `caughtUpVisualCards` reads DNESKAi's social packs and nothing else, so a third venture
     * declaring the tab would have rendered an empty grid forever. Titty Tuesdays is the
     * exception because it brought its own reader: the garment proposals have their own loader
     * and their own panel, rendered straight from `readTittyTuesdaysProposals` rather than
     * through the card store. Any other venture still has to bring one before it may declare it.
     */
    if (venture.adminTabs.includes("visuals") && !VISUALS_READERS.includes(venture.id)) {
      throw new Error(`Admin has no visuals reader for venture ${venture.id}.`);
    }
    const ratingState = await readRatings(root, venture.id);
    const [ideas, plans, visuals, packages] = await Promise.all([
      ideaCards(root, venture.id, venture.ledgerNamespace, ratingState.ratings),
      planRecords(root, venture.id, ratingState.ratings),
      venture.id === "caught-up" && venture.adminTabs.includes("visuals")
        ? caughtUpVisualCards(root, ratingState.ratings)
        : Promise.resolve([]),
      packageCards(root, venture.id, ratingState.ratings)
    ]);
    return {
      id: venture.id,
      name: venture.name,
      status: venture.status,
      visibility: venture.visibility,
      tabs: venture.adminTabs,
      cards: [...ideas.cards, ...plans.cards, ...visuals, ...packages.cards]
        .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.id.localeCompare(right.id)),
      unreadableFiles: [
        ...ideas.unreadable,
        ...plans.unreadable,
        ...packages.unreadable,
        ...(venture.id === "caught-up" ? social.unreadableFiles.map((file) => `social/${file}`) : []),
        ...(ratingState.malformed ? [`ratings/${venture.id}/ledger.jsonl`] : [])
      ]
    };
  }));
  return { ventures };
}

export async function readAdminLaunchBinder(
  ventureId: string,
  root = repositoryRoot
): Promise<{ venture: VentureConfig; plans: AdminPlanDetail[] } | null> {
  if (!venturePattern.test(ventureId)) return null;
  const venture = (await ventureConfigs(root)).find((candidate) => candidate.id === ventureId);
  if (!venture) return null;
  const ratingState = await readRatings(root, venture.id);
  /*
   * A Perfect rating makes a plan ready whatever its file still says.
   *
   * The filter used to also require `status === "owner_rated"`, and nothing ever sets that: rating
   * a plan appends to `state/ratings/<venture>/ledger.jsonl` and does not touch the plan file. So
   * two Perfect-rated Titty Tuesdays plans sat at `"status": "draft"` and the binder reported zero
   * ready plans beside them.
   *
   * The alternative was to have the rating route write the plan file too. That would put a second
   * writer on `state/ventures/<id>/plans/` for a fact the append-only ledger already records — the
   * ledger is the owner's verdict, the file's `status` is the plan's own lifecycle, and reading the
   * two together is cheaper and truer than keeping them in sync. `archived` still wins over a
   * rating: a plan the owner retired is not ready, however well it once scored.
   */
  const ready = (await planRecords(root, venture.id, ratingState.ratings)).details
    .filter((plan) => plan.status !== "archived" && (plan.status === "approved" || plan.rating?.rating === "perfect"))
    .sort((left, right) => (left.seasonId ?? "unassigned").localeCompare(right.seasonId ?? "unassigned") || left.title.localeCompare(right.title));
  const plans = await Promise.all(ready.map(async (plan) => ({
    ...plan,
    audienceSpecs: (await Promise.all(plan.audienceRefs.map((reference) =>
      audienceSpec(root, venture.id, reference)
    ))).filter((spec): spec is AdminAudienceSpec => Boolean(spec))
  })));
  return { venture, plans };
}
