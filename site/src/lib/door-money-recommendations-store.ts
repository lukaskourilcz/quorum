import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCarouselSummary, reviewCarouselSummary, type CarouselSummary } from "@boardlessai/carousel-studio";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const recommendationDirectory = "state/ventures/door-money/recommendations";
const summaryDirectory = "state/ventures/carousel-studio/summaries/door-money";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const FORMATS = ["carousel", "single-image", "thread", "caption", "short-video-script"] as const;
const COPY_KINDS = ["cover", "body", "outro", "thread-post", "caption", "script", "shot-list"] as const;
const STATUSES = ["draft", "approved", "posted", "archived", "rejected"] as const;
const PLATFORMS = ["instagram", "tiktok", "x", "threads", "youtube"] as const;
const GATES = ["voice", "claims", "quotes", "excerpt-cap", "duplicate", "cta-frequency", "living-person"] as const;
const SCORE_AXES = [
  "entertainment", "emotionalImpact", "shock", "humor", "relatability", "hipHopRelevance",
  "storytellingStrength", "controversy", "shareability", "educationalValue", "quotePotential",
  "carouselPotential", "shortVideoPotential", "threadPotential", "bookCuriosityPotential"
] as const;
const CHUNK_ID = /^ch\d{2,}-s\d{2,}-c\d{3,}$/u;
const MANUSCRIPT_HASH = /^sha256:[a-f0-9]{64}$/u;
const STATE_PATH = /^state\/[a-zA-Z0-9._/-]+$/u;

export type DoorMoneyRecommendationFormat = (typeof FORMATS)[number];
export type DoorMoneyRecommendationStatus = (typeof STATUSES)[number];
export type DoorMoneyCopyBlockKind = (typeof COPY_KINDS)[number];

export interface DoorMoneyCopyBlock {
  kind: DoorMoneyCopyBlockKind;
  ordinal: number;
  text: string;
}

interface DoorMoneyOwnerFields {
  editedCopyBlocks: DoorMoneyCopyBlock[] | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  postedAt: string | null;
  archivedAt: string | null;
  postedUrl: string | null;
  resultIds: string[];
  ratingRef: string | null;
}

interface DoorMoneyStatusEntry {
  from: DoorMoneyRecommendationStatus | null;
  to: DoorMoneyRecommendationStatus;
  at: string;
  actor: "system" | "owner";
  reason: string | null;
}

/** The fields the owner route changes, plus the gated record it must preserve byte-for-byte. */
export interface DoorMoneyRecommendation {
  schemaVersion: "venture-recommendation/1";
  id: string;
  ventureId: "door-money";
  date: string;
  status: DoorMoneyRecommendationStatus;
  hook: string;
  formats: DoorMoneyRecommendationFormat[];
  platforms: string[];
  copyBlocks: DoorMoneyCopyBlock[];
  rationale: string;
  curiosityBridge: string;
  cta: { mode: "soft-curiosity" | "explicit-buy-book"; text: string | null };
  evidence: {
    kind: "book-passage";
    excerpt: string;
    privateStoreLink: string;
    chunkIds: string[];
    [key: string]: unknown;
  };
  gateResults: Array<{ gate: string; passed: true; detail: string }>;
  designLab: { eligible: boolean; summaryPath: string | null; readyAt: string | null };
  owner: DoorMoneyOwnerFields;
  statusHistory: DoorMoneyStatusEntry[];
  generatedAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export type DoorMoneyPersistenceCode =
  | "UNAVAILABLE"
  | "CONFLICT"
  | "CORRUPT"
  | "REMOTE"
  | "UNCONFIGURED"
  | "REFUSED";

export class DoorMoneyPersistenceError extends Error {
  constructor(readonly code: DoorMoneyPersistenceCode, message: string) {
    super(message);
  }
}

export interface DoorMoneyWrite {
  commit: string | null;
}

export const GITHUB_TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strictKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function string(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function nullableString(value: unknown, max: number): value is string | null {
  return value === null || string(value, max);
}

function nullableDateTime(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && DATE_TIME.test(value));
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Owner-edited public copy, contract-bounded and normalized without touching the original. */
export function parseDoorMoneyCopyBlocks(value: unknown): DoorMoneyCopyBlock[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) return null;
  const parsed: DoorMoneyCopyBlock[] = [];
  for (const entry of value) {
    if (!object(entry) || Object.keys(entry).some((key) => !["kind", "ordinal", "text"].includes(key))) return null;
    if (typeof entry.kind !== "string" || !(COPY_KINDS as readonly string[]).includes(entry.kind)) return null;
    if (!Number.isInteger(entry.ordinal) || (entry.ordinal as number) < 1) return null;
    if (!string(entry.text, 4_000)) return null;
    parsed.push({
      kind: entry.kind as DoorMoneyCopyBlockKind,
      ordinal: entry.ordinal as number,
      text: entry.text.trim()
    });
  }
  return parsed;
}

/**
 * Parse a public recommendation without importing the private orchestrator into the Next app.
 *
 * The owner route accepts only an id and a bounded decision, never a replacement recommendation.
 * This boundary still rechecks the fields it relies on and the irreversible public constraints:
 * a gated Door Money record, a capped excerpt, no raw-text/vector fields and contiguous history.
 */
export function parseDoorMoneyRecommendation(value: unknown): DoorMoneyRecommendation | null {
  if (!object(value) || value.schemaVersion !== "venture-recommendation/1" || value.ventureId !== "door-money") return null;
  if (!strictKeys(value, [
    "schemaVersion", "id", "ventureId", "date", "status", "hook", "formats", "platforms",
    "copyBlocks", "rationale", "curiosityBridge", "cta", "evidence", "gateResults", "designLab",
    "owner", "statusHistory", "generatedAt", "updatedAt"
  ])) return null;
  if (!string(value.id, 160) || !SLUG.test(value.id) || typeof value.date !== "string" || !DATE.test(value.date)) return null;
  if (typeof value.status !== "string" || !(STATUSES as readonly string[]).includes(value.status)) return null;
  if (!string(value.hook, 500) || !string(value.rationale, 2_000) || !string(value.curiosityBridge, 1_000)) return null;
  if (!Array.isArray(value.formats) || value.formats.length < 1 || value.formats.length > 3 ||
      value.formats.some((format) => typeof format !== "string" || !(FORMATS as readonly string[]).includes(format))) return null;
  if (!Array.isArray(value.platforms) || value.platforms.length < 1 || value.platforms.length > 5 ||
      value.platforms.some((platform) => typeof platform !== "string" || !(PLATFORMS as readonly string[]).includes(platform)) ||
      new Set(value.platforms).size !== value.platforms.length) return null;
  if (new Set(value.formats).size !== value.formats.length) return null;
  const originalCopy = parseDoorMoneyCopyBlocks(value.copyBlocks);
  if (!originalCopy) return null;
  if (!object(value.cta) || !strictKeys(value.cta, ["mode", "text"]) ||
      (value.cta.mode !== "soft-curiosity" && value.cta.mode !== "explicit-buy-book") ||
      !(value.cta.text === null || string(value.cta.text, 500))) return null;
  if ((value.cta.mode === "explicit-buy-book") !== (value.cta.text !== null)) return null;

  if (!object(value.evidence) || !strictKeys(value.evidence, [
    "kind", "manuscriptHash", "chunkIds", "scoresAtSelection", "excerptChunkId", "excerpt", "privateStoreLink"
  ]) || value.evidence.kind !== "book-passage" || typeof value.evidence.manuscriptHash !== "string" ||
      !MANUSCRIPT_HASH.test(value.evidence.manuscriptHash) || typeof value.evidence.excerptChunkId !== "string" ||
      !CHUNK_ID.test(value.evidence.excerptChunkId) || !string(value.evidence.excerpt, 600) ||
      !string(value.evidence.privateStoreLink, 500) || !Array.isArray(value.evidence.chunkIds) ||
      value.evidence.chunkIds.length < 1 || value.evidence.chunkIds.length > 3 ||
      value.evidence.chunkIds.some((id) => typeof id !== "string" || !CHUNK_ID.test(id)) ||
      new Set(value.evidence.chunkIds).size !== value.evidence.chunkIds.length ||
      !value.evidence.chunkIds.includes(value.evidence.excerptChunkId)) return null;
  const expectedPrivateLink = `private-book://sha256/${value.evidence.manuscriptHash.slice("sha256:".length)}/chunks/${value.evidence.excerptChunkId}.json`;
  if (value.evidence.privateStoreLink !== expectedPrivateLink || !Array.isArray(value.evidence.scoresAtSelection) ||
      value.evidence.scoresAtSelection.length !== value.evidence.chunkIds.length) return null;
  const scoredIds: string[] = [];
  for (const selection of value.evidence.scoresAtSelection) {
    if (!object(selection) || !strictKeys(selection, ["chunkId", "scores"]) || typeof selection.chunkId !== "string" ||
        !CHUNK_ID.test(selection.chunkId) || !object(selection.scores) || !strictKeys(selection.scores, SCORE_AXES)) return null;
    scoredIds.push(selection.chunkId);
    for (const axis of SCORE_AXES) {
      const score = selection.scores[axis];
      if (!object(score) || !strictKeys(score, ["score", "justification"]) ||
          !Number.isInteger(score.score) || (score.score as number) < 0 || (score.score as number) > 5 ||
          !string(score.justification, 240)) return null;
    }
  }
  if ([...scoredIds].sort().join("\n") !== [...value.evidence.chunkIds].sort().join("\n")) return null;

  if (!Array.isArray(value.gateResults) || value.gateResults.length < 1 || value.gateResults.length > 20 ||
      value.gateResults.some((gate) => !object(gate) || !strictKeys(gate, ["gate", "passed", "detail"]) ||
        typeof gate.gate !== "string" || !(GATES as readonly string[]).includes(gate.gate) ||
        gate.passed !== true || !string(gate.detail, 500))) return null;
  const gateNames = value.gateResults.map((gate) => (gate as Record<string, unknown>).gate);
  if (new Set(gateNames).size !== gateNames.length) return null;
  if (!object(value.designLab) || !strictKeys(value.designLab, ["eligible", "summaryPath", "readyAt"]) ||
      typeof value.designLab.eligible !== "boolean" ||
      !(value.designLab.summaryPath === null || (string(value.designLab.summaryPath, 400) &&
        STATE_PATH.test(value.designLab.summaryPath) && !value.designLab.summaryPath.includes(".."))) ||
      !nullableDateTime(value.designLab.readyAt)) return null;
  const visual = (value.formats as string[]).some((format) => format === "carousel" || format === "single-image");
  if (value.designLab.eligible !== visual) return null;

  if (!object(value.owner) || !strictKeys(value.owner, [
    "editedCopyBlocks", "approvalNote", "rejectionReason", "approvedAt", "rejectedAt", "postedAt",
    "archivedAt", "postedUrl", "resultIds", "ratingRef"
  ]) || !(value.owner.editedCopyBlocks === null || parseDoorMoneyCopyBlocks(value.owner.editedCopyBlocks)) ||
      !nullableString(value.owner.approvalNote, 1_000) || !nullableString(value.owner.rejectionReason, 1_000) ||
      !nullableDateTime(value.owner.approvedAt) || !nullableDateTime(value.owner.rejectedAt) ||
      !nullableDateTime(value.owner.postedAt) || !nullableDateTime(value.owner.archivedAt) ||
      !(value.owner.postedUrl === null || httpsUrl(value.owner.postedUrl)) || !Array.isArray(value.owner.resultIds) ||
      value.owner.resultIds.length > 100 || value.owner.resultIds.some((id) => typeof id !== "string" || !SLUG.test(id)) ||
      new Set(value.owner.resultIds).size !== value.owner.resultIds.length ||
      !(value.owner.ratingRef === null || (string(value.owner.ratingRef, 400) &&
        STATE_PATH.test(value.owner.ratingRef) && !value.owner.ratingRef.includes("..")))) return null;

  if (!Array.isArray(value.statusHistory) || value.statusHistory.length < 1 || value.statusHistory.length > 20) return null;
  let previous: DoorMoneyRecommendationStatus | null = null;
  for (const [index, entry] of value.statusHistory.entries()) {
    if (!object(entry) || !strictKeys(entry, ["from", "to", "at", "actor", "reason"]) ||
        !(entry.from === null || (typeof entry.from === "string" && (STATUSES as readonly string[]).includes(entry.from))) ||
        typeof entry.to !== "string" || !(STATUSES as readonly string[]).includes(entry.to) || !DATE_TIME.test(String(entry.at)) ||
        (entry.actor !== "system" && entry.actor !== "owner") || !nullableString(entry.reason, 500)) return null;
    if (index === 0 && (entry.from !== null || entry.to !== "draft" || entry.actor !== "system")) return null;
    if (index > 0 && entry.from !== previous) return null;
    if (!["null>draft", "draft>approved", "draft>rejected", "approved>posted", "posted>archived"]
      .includes(`${entry.from ?? "null"}>${entry.to}`)) return null;
    previous = entry.to as DoorMoneyRecommendationStatus;
  }
  if (previous !== value.status || typeof value.generatedAt !== "string" || !DATE_TIME.test(value.generatedAt) ||
      typeof value.updatedAt !== "string" || !DATE_TIME.test(value.updatedAt) ||
      Date.parse(value.updatedAt) < Date.parse(value.generatedAt)) return null;

  const owner = value.owner as unknown as DoorMoneyOwnerFields;
  if (value.status === "draft" && [owner.approvedAt, owner.rejectedAt, owner.postedAt, owner.archivedAt, owner.postedUrl].some(Boolean)) return null;
  if (value.status === "rejected" && (!owner.rejectedAt || !owner.rejectionReason || owner.approvedAt)) return null;
  if (["approved", "posted", "archived"].includes(value.status) && !owner.approvedAt) return null;
  if (["posted", "archived"].includes(value.status) && (!owner.postedAt || !owner.postedUrl)) return null;
  if (value.status === "archived" && !owner.archivedAt) return null;
  if (visual && ["approved", "posted", "archived"].includes(value.status) &&
      (!value.designLab.summaryPath || !value.designLab.readyAt)) return null;
  if (!visual && (value.designLab.summaryPath !== null || value.designLab.readyAt !== null)) return null;

  return value as unknown as DoorMoneyRecommendation;
}

function relativeRecommendationPath(id: string): string {
  if (!SLUG.test(id) || id.length > 160) throw new DoorMoneyPersistenceError("CONFLICT", "That recommendation id is invalid.");
  return `${recommendationDirectory}/${id}.json`;
}

function resolveInside(root: string, relative: string): string {
  const target = path.join(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    throw new DoorMoneyPersistenceError("CONFLICT", "Door Money state path escaped the repository.");
  }
  return target;
}

function githubEndpoint(relative: string): string {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  return `https://api.github.com/repos/${repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}`;
}

function githubHeaders(token: string): Record<string, string> {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
}

function githubFailure(status: number, what: string): DoorMoneyPersistenceError {
  if (status === 401 || status === 403) {
    return new DoorMoneyPersistenceError(
      "REFUSED",
      `GitHub refused the ${what} with ${status}. ${GITHUB_TOKEN_ENV} exists but is expired or no longer carries Contents read and write.`
    );
  }
  return new DoorMoneyPersistenceError("REMOTE", `GitHub Door Money ${what} failed with ${status}.`);
}

async function readJson(relative: string, root = repositoryRoot): Promise<unknown> {
  const token = process.env[GITHUB_TOKEN_ENV];
  if (token) {
    const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
    const response = await fetch(`${githubEndpoint(relative)}?ref=${encodeURIComponent(branch)}`, {
      headers: githubHeaders(token), cache: "no-store"
    });
    if (response.status === 404) throw new DoorMoneyPersistenceError("UNAVAILABLE", `Missing ${relative}.`);
    if (!response.ok) throw githubFailure(response.status, "read");
    const current = await response.json() as { encoding?: unknown; content?: unknown };
    if (current.encoding !== "base64" || typeof current.content !== "string") {
      throw new DoorMoneyPersistenceError("REMOTE", "GitHub returned an invalid Door Money file.");
    }
    try {
      return JSON.parse(Buffer.from(current.content.replaceAll("\n", ""), "base64").toString("utf8")) as unknown;
    } catch {
      throw new DoorMoneyPersistenceError("CORRUPT", `${relative} is not valid JSON.`);
    }
  }
  try {
    return JSON.parse(await readFile(resolveInside(root, relative), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DoorMoneyPersistenceError("UNAVAILABLE", `Missing ${relative}.`);
    if (error instanceof SyntaxError) throw new DoorMoneyPersistenceError("CORRUPT", `${relative} is not valid JSON.`);
    throw error;
  }
}

async function writeLocal(relative: string, value: unknown, root = repositoryRoot): Promise<DoorMoneyWrite> {
  const target = resolveInside(root, relative);
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

async function writeGitHub(relative: string, value: unknown, message: string, token: string): Promise<DoorMoneyWrite> {
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = githubEndpoint(relative);
  const headers = githubHeaders(token);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    let sha: string | undefined;
    if (response.status !== 404) {
      if (!response.ok) throw githubFailure(response.status, "read");
      const current = await response.json() as { sha?: string };
      if (!current.sha) throw new DoorMoneyPersistenceError("REMOTE", "GitHub returned an invalid Door Money file.");
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
      return { commit: typeof body.commit?.sha === "string" ? body.commit.sha.slice(0, 7) : null };
    }
    if (update.status !== 409 && !(update.status === 422 && sha === undefined)) throw githubFailure(update.status, "write");
  }
  throw new DoorMoneyPersistenceError("CONFLICT", "Door Money state changed during every save attempt.");
}

async function persist(relative: string, value: unknown, message: string, root = repositoryRoot): Promise<DoorMoneyWrite> {
  const token = process.env[GITHUB_TOKEN_ENV];
  if (token) return writeGitHub(relative, value, message, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new DoorMoneyPersistenceError(
      "UNCONFIGURED",
      `${GITHUB_TOKEN_ENV} is not set on this deployment, so the owner decision was not written.`
    );
  }
  return writeLocal(relative, value, root);
}

export async function readDoorMoneyRecommendation(id: string, root = repositoryRoot): Promise<DoorMoneyRecommendation> {
  const relative = relativeRecommendationPath(id);
  const parsed = parseDoorMoneyRecommendation(await readJson(relative, root));
  if (!parsed) throw new DoorMoneyPersistenceError("CORRUPT", `${relative} is not a valid gated Door Money recommendation.`);
  return parsed;
}

function effectiveCopy(recommendation: DoorMoneyRecommendation): DoorMoneyCopyBlock[] {
  return [...(recommendation.owner.editedCopyBlocks ?? recommendation.copyBlocks)]
    .sort((left, right) => left.ordinal - right.ordinal);
}

/** A gated public recommendation turned into the small record Studio reads, never source text. */
export function recommendationCarouselSummary(recommendation: DoorMoneyRecommendation): CarouselSummary | null {
  if (!recommendation.designLab.eligible || !["approved", "posted", "archived"].includes(recommendation.status)) return null;
  const blocks = effectiveCopy(recommendation);
  const cover = blocks.find(({ kind }) => kind === "cover");
  const bodies = blocks.filter(({ kind }) => kind === "body");
  const outro = blocks.find(({ kind }) => kind === "outro");
  const singleImage = recommendation.formats.includes("single-image") && !recommendation.formats.includes("carousel");
  const standfirst = bodies[0]?.text ?? recommendation.rationale;
  // The summary needs enough beats for a real carousel, but may only reuse gated public fields.
  // No source text is fetched and no connective line is invented here.
  const candidates = [
    ...bodies.slice(1).map(({ text }) => text),
    ...blocks.filter(({ kind }) => kind !== "cover" && kind !== "body" && kind !== "outro").map(({ text }) => text),
    recommendation.rationale,
    recommendation.curiosityBridge,
    recommendation.hook,
    ...(recommendation.cta.text ? [recommendation.cta.text] : [])
  ];
  const passages = [...new Set(candidates.map((value) => value.trim()))]
    .filter((value) => value && value !== standfirst && value !== cover?.text && value !== outro?.text);
  const summary = buildCarouselSummary({
    venture: "door-money",
    slug: recommendation.id,
    date: recommendation.date,
    ...(singleImage ? { deckMode: "single-image" as const } : {}),
    title: recommendation.hook,
    ...(cover ? { coverLine: cover.text } : {}),
    dek: standfirst,
    points: passages,
    closing: outro?.text ?? recommendation.curiosityBridge,
    sources: [{ kind: "private", label: "Private book passage" }],
    hasHero: false,
    heroCredit: null
  });
  const review = reviewCarouselSummary(summary);
  if (!review.renderable) {
    throw new DoorMoneyPersistenceError("CONFLICT", `The approved copy is not Studio-ready: ${review.problems.join(" ")}`);
  }
  return summary;
}

export type DoorMoneyRecommendationAction =
  | { action: "approve"; editedCopyBlocks?: DoorMoneyCopyBlock[] | undefined; approvalNote?: string | undefined }
  | { action: "reject"; reason: string }
  | { action: "posted"; postedUrl: string };

export interface DoorMoneyDecisionResult {
  recommendation: DoorMoneyRecommendation;
  summary: CarouselSummary | null;
  changed: boolean;
  commits: string[];
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function transition(
  current: DoorMoneyRecommendation,
  action: DoorMoneyRecommendationAction,
  at: string
): { recommendation: DoorMoneyRecommendation; changed: boolean } {
  if (Date.parse(at) < Date.parse(current.updatedAt)) {
    throw new DoorMoneyPersistenceError("CONFLICT", "The owner decision time precedes the saved recommendation.");
  }

  if (action.action === "approve") {
    const edited = action.editedCopyBlocks ?? null;
    const note = action.approvalNote?.trim() || null;
    if (["approved", "posted", "archived"].includes(current.status)) {
      if (same(current.owner.editedCopyBlocks, edited) && current.owner.approvalNote === note) return { recommendation: current, changed: false };
      throw new DoorMoneyPersistenceError("CONFLICT", "That recommendation was already approved with different owner edits.");
    }
    if (current.status !== "draft") throw new DoorMoneyPersistenceError("CONFLICT", "Only a draft can be approved.");
    const summaryPath = current.designLab.eligible ? `${summaryDirectory}/${current.date}-${current.id}.json` : null;
    const recommendation = {
      ...current,
      status: "approved" as const,
      designLab: { ...current.designLab, summaryPath, readyAt: current.designLab.eligible ? at : null },
      owner: { ...current.owner, editedCopyBlocks: edited, approvalNote: note, approvedAt: at },
      statusHistory: [...current.statusHistory, { from: "draft" as const, to: "approved" as const, at, actor: "owner" as const, reason: note?.slice(0, 500) ?? null }],
      updatedAt: at
    };
    return { recommendation, changed: true };
  }

  if (action.action === "reject") {
    const reason = action.reason.trim();
    if (!reason || reason.length > 1_000) throw new DoorMoneyPersistenceError("CONFLICT", "A rejection needs a reason of 1–1000 characters.");
    if (current.status === "rejected") {
      if (current.owner.rejectionReason === reason) return { recommendation: current, changed: false };
      throw new DoorMoneyPersistenceError("CONFLICT", "That recommendation was already rejected for a different reason.");
    }
    if (current.status !== "draft") throw new DoorMoneyPersistenceError("CONFLICT", "Only a draft can be rejected.");
    return {
      changed: true,
      recommendation: {
        ...current,
        status: "rejected",
        owner: { ...current.owner, rejectionReason: reason, rejectedAt: at },
        statusHistory: [...current.statusHistory, { from: "draft", to: "rejected", at, actor: "owner", reason: reason.slice(0, 500) }],
        updatedAt: at
      }
    };
  }

  if (!httpsUrl(action.postedUrl)) throw new DoorMoneyPersistenceError("CONFLICT", "A posted record needs a complete HTTPS URL.");
  const postedUrl = new URL(action.postedUrl).toString();
  if (current.status === "posted" || current.status === "archived") {
    if (current.owner.postedUrl === postedUrl) return { recommendation: current, changed: false };
    throw new DoorMoneyPersistenceError("CONFLICT", "That recommendation already records a different post URL.");
  }
  if (current.status !== "approved") throw new DoorMoneyPersistenceError("CONFLICT", "Only an approved recommendation can be marked posted.");
  return {
    changed: true,
    recommendation: {
      ...current,
      status: "posted",
      owner: { ...current.owner, postedAt: at, postedUrl },
      statusHistory: [...current.statusHistory, { from: "approved", to: "posted", at, actor: "owner", reason: null }],
      updatedAt: at
    }
  };
}

export async function applyDoorMoneyRecommendationDecision(
  input: { id: string; decision: DoorMoneyRecommendationAction; now?: Date },
  root = repositoryRoot
): Promise<DoorMoneyDecisionResult> {
  const current = await readDoorMoneyRecommendation(input.id, root);
  const at = (input.now ?? new Date()).toISOString();
  const applied = transition(current, input.decision, at);
  const checked = parseDoorMoneyRecommendation(applied.recommendation);
  if (!checked) throw new DoorMoneyPersistenceError("CORRUPT", "The owner decision would produce an invalid recommendation record.");
  const summary = recommendationCarouselSummary(checked);
  if (!applied.changed) return { recommendation: checked, summary, changed: false, commits: [] };

  const writes: DoorMoneyWrite[] = [];
  if (summary && checked.designLab.summaryPath) {
    writes.push(await persist(
      checked.designLab.summaryPath,
      summary,
      `admin: approve Door Money Studio summary ${checked.id}`,
      root
    ));
  }
  writes.push(await persist(
    relativeRecommendationPath(checked.id),
    checked,
    `admin: ${input.decision.action} Door Money recommendation ${checked.id}`,
    root
  ));
  return {
    recommendation: checked,
    summary,
    changed: true,
    commits: writes.flatMap(({ commit }) => commit ? [commit] : [])
  };
}
