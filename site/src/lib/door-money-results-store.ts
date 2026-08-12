import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseDoorMoneyOwnerResult,
  parseDoorMoneyOwnerResultInput,
  type DoorMoneyOwnerResult,
  type DoorMoneyOwnerResultInput
} from "./door-money-result-model";
import {
  DoorMoneyPersistenceError,
  persistDoorMoneyState,
  readDoorMoneyRecommendation,
  readDoorMoneyStateJson
} from "./door-money-recommendations-store";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const resultsDirectory = "state/ventures/door-money/results";
const RESULTS_APPROVAL_ID = "DM-RESULTS-004";

export interface DoorMoneyOwnerResultWrite {
  result: DoorMoneyOwnerResult;
  changed: boolean;
  commits: string[];
}

function stableBytes(value: unknown): string {
  return JSON.stringify(value);
}

function relativeResultPath(id: string): string {
  return `${resultsDirectory}/${id}.json`;
}

async function assertOwnerResultApproval(root: string): Promise<void> {
  const inbox = await readFile(path.join(root, "state", "INBOX.md"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (!/^- \[[xX]\] HUMAN_APPROVAL DM-RESULTS-004\b/mu.test(inbox)) {
    throw new DoorMoneyPersistenceError(
      "CONFLICT",
      `${RESULTS_APPROVAL_ID} is pending; owner-entered Door Money results remain disabled.`
    );
  }
}

function semanticallyEqual(result: DoorMoneyOwnerResult, input: DoorMoneyOwnerResultInput, postUrl: string): boolean {
  return result.recommendationId === input.recommendationId && result.platform === input.platform &&
    result.postUrl === postUrl && result.outcome === input.outcome &&
    stableBytes(result.metrics) === stableBytes(input.metrics);
}

/** Saves only owner-typed data against a post URL already recorded by the owner. */
export async function saveDoorMoneyOwnerResult(
  raw: unknown,
  options: { now?: Date; root?: string } = {}
): Promise<DoorMoneyOwnerResultWrite> {
  const input = parseDoorMoneyOwnerResultInput(raw);
  if (!input) throw new DoorMoneyPersistenceError("CONFLICT", "A recommendation, platform, outcome and at least one metric are required.");
  const root = options.root ?? repositoryRoot;
  await assertOwnerResultApproval(root);
  const recommendation = await readDoorMoneyRecommendation(input.recommendationId, root);
  if (!recommendation.owner.postedUrl || !["posted", "archived"].includes(recommendation.status)) {
    throw new DoorMoneyPersistenceError("CONFLICT", "Results can be recorded only after the owner records a posted URL.");
  }
  if (!recommendation.platforms.includes(input.platform)) {
    throw new DoorMoneyPersistenceError("CONFLICT", "That platform is not part of this recommendation.");
  }
  const postUrl = new URL(recommendation.owner.postedUrl).toString();
  const identity = { ...input, postUrl };
  const id = `owner-result-${createHash("sha256").update(stableBytes(identity)).digest("hex").slice(0, 24)}`;
  const relative = relativeResultPath(id);
  try {
    const existing = parseDoorMoneyOwnerResult(await readDoorMoneyStateJson(relative, root));
    if (!existing) throw new DoorMoneyPersistenceError("CORRUPT", `${relative} is not a valid owner result.`);
    if (!semanticallyEqual(existing, input, postUrl)) {
      throw new DoorMoneyPersistenceError("CONFLICT", "That result id already holds different owner-entered data.");
    }
    return { result: existing, changed: false, commits: [] };
  } catch (error) {
    if (!(error instanceof DoorMoneyPersistenceError) || error.code !== "UNAVAILABLE") throw error;
  }

  const result = parseDoorMoneyOwnerResult({
    schemaVersion: "owner-result-entry/1",
    id,
    ventureId: "door-money",
    recommendationId: input.recommendationId,
    platform: input.platform,
    postUrl,
    metrics: input.metrics,
    outcome: input.outcome,
    source: "owner-entry",
    capturedAt: (options.now ?? new Date()).toISOString()
  });
  if (!result) throw new DoorMoneyPersistenceError("CORRUPT", "The owner result would produce an invalid record.");
  const write = await persistDoorMoneyState(relative, result, `admin: save Door Money owner result ${result.id}`, root);
  return { result, changed: true, commits: write.commit ? [write.commit] : [] };
}
