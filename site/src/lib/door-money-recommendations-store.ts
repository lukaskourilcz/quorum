import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCarouselSummary, reviewCarouselSummary, type CarouselSummary } from "@boardlessai/carousel-studio";
import {
  parseDoorMoneyRecommendation,
  type DoorMoneyCopyBlock,
  type DoorMoneyRecommendation
} from "./door-money-recommendation-model";

export {
  parseDoorMoneyCopyBlocks,
  parseDoorMoneyRecommendation,
  type DoorMoneyCopyBlock,
  type DoorMoneyRecommendation
} from "./door-money-recommendation-model";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const recommendationDirectory = "state/ventures/door-money/recommendations";
const summaryDirectory = "state/ventures/carousel-studio/summaries/door-money";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function httpsUrl(value: string): boolean {
  if (value.length > 2_000) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
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
