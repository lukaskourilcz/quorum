import "server-only";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseTehdejsiFeatureRecommendation, type TehdejsiFeatureRecommendation } from "./tehdejsi-feature-model";
import {
  parseTehdejsiOwnerResult,
  parseTehdejsiOwnerResultInput,
  type TehdejsiOwnerResult,
  type TehdejsiOwnerResultInput,
  type TehdejsiResultPlatform
} from "./tehdejsi-result-model";
import { persistTehdejsiState, readTehdejsiStateJson, TehdejsiStateError } from "./tehdejsi-state-store";

const DEFAULT_ROOT = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const RESULTS_ROOT = "state/ventures/tehdejsi-svet/results";
const DRAFTS_ROOT = "state/ventures/tehdejsi-svet/drafts";
const PLATFORM_HOSTS: Readonly<Record<TehdejsiResultPlatform, string>> = {
  instagram: "instagram.com",
  facebook: "facebook.com",
  threads: "threads.net"
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function resultsApproved(root: string): Promise<void> {
  const inbox = await readFile(path.join(root, "state/INBOX.md"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (!/^- \[[xX]\] HUMAN_APPROVAL TS-RESULTS-005\b/mu.test(inbox)) {
    throw new TehdejsiStateError("CONFLICT", "TS-RESULTS-005 is pending; owner-entered results remain disabled.");
  }
}

async function recommendation(input: TehdejsiOwnerResultInput, root: string): Promise<TehdejsiFeatureRecommendation> {
  let names: string[];
  try { names = (await readdir(path.join(root, DRAFTS_ROOT))).filter((name) => name.endsWith(".json")).sort(); }
  catch { throw new TehdejsiStateError("UNAVAILABLE", "No Tehdejsi svet recommendations are recorded."); }
  const matches: Array<{ relative: string; local: TehdejsiFeatureRecommendation }> = [];
  for (const name of names) {
    const relative = `${DRAFTS_ROOT}/${name}`;
    try {
      const local = parseTehdejsiFeatureRecommendation(JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown);
      if (local?.id === input.recommendationId) matches.push({ relative, local });
    } catch { /* Malformed siblings do not identify the requested recommendation. */ }
  }
  if (matches.length !== 1) {
    throw new TehdejsiStateError(matches.length ? "CORRUPT" : "UNAVAILABLE", `Expected one recommendation ${input.recommendationId}; found ${matches.length}.`);
  }
  const match = matches[0]!;
  const current = process.env.BOARDLESSAI_GITHUB_TOKEN
    ? parseTehdejsiFeatureRecommendation(await readTehdejsiStateJson(match.relative, root))
    : match.local;
  if (!current || current.id !== input.recommendationId) throw new TehdejsiStateError("CORRUPT", "The recorded recommendation is malformed.");
  if (!["approved", "posted", "archived"].includes(current.status)) {
    throw new TehdejsiStateError("CONFLICT", "Results require an owner-approved recommendation.");
  }
  const postUrl = current.owner.postedUrls[input.locale];
  if (!postUrl) throw new TehdejsiStateError("CONFLICT", `Record the ${input.locale.toUpperCase()} posted URL before its result.`);
  const hostname = new URL(postUrl).hostname.toLocaleLowerCase("en");
  const expected = PLATFORM_HOSTS[input.platform];
  if (hostname !== expected && !hostname.endsWith(`.${expected}`)) {
    throw new TehdejsiStateError("CONFLICT", `The recorded URL is not on ${input.platform}.`);
  }
  return current;
}

function sameResult(left: TehdejsiOwnerResult, right: TehdejsiOwnerResult): boolean {
  return stable(left) === stable(right);
}

/** Persists owner-typed metrics only. No platform or analytics endpoint is read. */
export async function saveTehdejsiOwnerResult(
  raw: unknown,
  options: { root?: string } = {}
): Promise<{ result: TehdejsiOwnerResult; changed: boolean; commits: string[] }> {
  const input = parseTehdejsiOwnerResultInput(raw);
  if (!input) throw new TehdejsiStateError("CONFLICT", "Result fields and at least one nonnegative metric are required.");
  const root = options.root ?? DEFAULT_ROOT;
  await resultsApproved(root);
  const feature = await recommendation(input, root);
  const postUrl = feature.owner.postedUrls[input.locale]!;
  const identity = { ...input, postUrl };
  const resultId = `result-${createHash("sha256").update(stable(identity)).digest("hex").slice(0, 20)}`;
  const result = parseTehdejsiOwnerResult({
    schemaVersion: "owner-result-entry/1",
    resultId,
    ventureId: "tehdejsi-svet",
    recommendationId: input.recommendationId,
    locale: input.locale,
    platform: input.platform,
    postUrl,
    capturedAt: input.capturedAt,
    recordedAt: input.recordedAt,
    enteredBy: "owner",
    metrics: input.metrics,
    note: input.note
  });
  if (!result) throw new TehdejsiStateError("CORRUPT", "The owner result would produce an invalid record.");
  const relative = `${RESULTS_ROOT}/${resultId}.json`;
  try {
    const existing = parseTehdejsiOwnerResult(await readTehdejsiStateJson(relative, root));
    if (!existing) throw new TehdejsiStateError("CORRUPT", `${relative} is malformed.`);
    if (!sameResult(existing, result)) throw new TehdejsiStateError("CONFLICT", `${resultId} already names another result.`);
    return { result: existing, changed: false, commits: [] };
  } catch (error) {
    if (!(error instanceof TehdejsiStateError) || error.code !== "UNAVAILABLE") throw error;
  }
  const write = await persistTehdejsiState(relative, result, `admin: record Tehdejsi svet ${input.locale} owner result`, root);
  return { result, changed: true, commits: write.commit ? [write.commit] : [] };
}
