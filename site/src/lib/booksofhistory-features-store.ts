import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  booksofhistoryCarouselSummaryPath,
  buildBooksofhistoryCarouselSummary,
  reviewCarouselSummary
} from "@boardlessai/carousel-studio";

export type BhFeatureLocale = "cs" | "en";
type BhRecommendationStatus = "draft" | "approved" | "posted" | "archived" | "rejected";

interface BhLanguageFeature {
  schemaVersion: "bh-language-feature/1";
  locale: BhFeatureLocale;
  headline: string;
  slides: Array<{
    role: "hook" | "context" | "turn" | "ending";
    text: string;
    factualSentences: Array<{ text: string; claimRefs: string[] }>;
  }>;
  caption: string;
  quotes: Array<{ text: string; attribution: string; claimRef: string }>;
}

export interface BhRecommendation {
  schemaVersion: "venture-recommendation/1";
  recommendationId: string;
  ventureId: "booksofhistory";
  cycleId: string;
  status: BhRecommendationStatus;
  createdAt: string;
  updatedAt: string;
  evidence: { kind: "dossier-story"; dossierRef: string; storyRef: string; claimRefs: string[] };
  payloads: { cs: BhLanguageFeature; en: BhLanguageFeature };
  gateResults: {
    cs: { passed: boolean; violations: Array<{ code: string; message: string }> };
    en: { passed: boolean; violations: Array<{ code: string; message: string }> };
  };
  designLab: {
    status: "pending" | "ready" | "rendered";
    summaryRefs: { cs: string; en: string } | null;
  };
  owner: {
    postedUrls: { cs: string | null; en: string | null };
    resultRefs: { cs: string[]; en: string[] };
    editHistory: Array<{
      at: string;
      action: "edit" | "approve" | "reject" | "post" | "result" | "archive";
      locale: BhFeatureLocale | null;
      reason: string | null;
    }>;
  };
}

export type BhFeatureAction =
  | { action: "approve"; recommendationId: string; idempotencyKey: string; at: string }
  | { action: "edit-approve"; recommendationId: string; idempotencyKey: string; at: string; reason: string; payloads: { cs: BhLanguageFeature; en: BhLanguageFeature } }
  | { action: "reject"; recommendationId: string; idempotencyKey: string; at: string; reason: string }
  | { action: "posted"; recommendationId: string; idempotencyKey: string; at: string; locale: BhFeatureLocale; url: string }
  | { action: "result"; recommendationId: string; idempotencyKey: string; at: string; locale: BhFeatureLocale; resultRef: string };

export interface BhFeatureActionResult {
  recommendationId: string;
  action: BhFeatureAction["action"];
  status: BhRecommendationStatus;
  summaryRefs: { cs: string; en: string } | null;
  persistence: "filesystem" | "github";
  idempotent: boolean;
}

export type BhFeaturePersistenceCode = "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE" | "UNCONFIGURED" | "REFUSED";

export class BhFeaturePersistenceError extends Error {
  constructor(readonly code: BhFeaturePersistenceCode, message: string) {
    super(message);
  }
}

const ID = /^rec-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CLAIM = /^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const RESULT_REF = /^ventures\/booksofhistory\/results\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u;
const ACTIONS_ROOT = "state/ventures/booksofhistory/feature-actions";
const RECOMMENDATIONS_ROOT = "state/ventures/booksofhistory/recommendations";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function https(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function parseFeature(value: unknown, locale: BhFeatureLocale): BhLanguageFeature | null {
  if (!isObject(value) || value.schemaVersion !== "bh-language-feature/1" || value.locale !== locale) return null;
  if (typeof value.headline !== "string" || value.headline.trim().length < 8 || value.headline.length > 180) return null;
  if (typeof value.caption !== "string" || value.caption.trim().length < 8 || value.caption.length > 2_200) return null;
  if (!Array.isArray(value.slides) || value.slides.length < 3 || value.slides.length > 10) return null;
  if (!Array.isArray(value.quotes) || value.quotes.length > 5) return null;
  for (const slide of value.slides) {
    if (!isObject(slide) || !["hook", "context", "turn", "ending"].includes(String(slide.role))) return null;
    if (typeof slide.text !== "string" || slide.text.trim().length < 8 || slide.text.length > 800) return null;
    if (!Array.isArray(slide.factualSentences) || slide.factualSentences.length > 10) return null;
    for (const sentence of slide.factualSentences) {
      if (!isObject(sentence) || typeof sentence.text !== "string" || !Array.isArray(sentence.claimRefs)) return null;
      if (sentence.claimRefs.length < 1 || sentence.claimRefs.some((ref) => typeof ref !== "string" || !CLAIM.test(ref))) return null;
    }
  }
  for (const quote of value.quotes) {
    if (!isObject(quote) || typeof quote.text !== "string" || quote.text.length < 1 || quote.text.length > 300) return null;
    if (typeof quote.attribution !== "string" || quote.attribution.trim().length < 1 || quote.attribution.length > 300) return null;
    if (typeof quote.claimRef !== "string" || !CLAIM.test(quote.claimRef)) return null;
  }
  return value as unknown as BhLanguageFeature;
}

export function parseBhRecommendation(value: unknown): BhRecommendation | null {
  if (!isObject(value) || value.schemaVersion !== "venture-recommendation/1" || value.ventureId !== "booksofhistory") return null;
  if (typeof value.recommendationId !== "string" || !ID.test(value.recommendationId)) return null;
  if (typeof value.cycleId !== "string" || !ISO.test(String(value.createdAt)) || !ISO.test(String(value.updatedAt))) return null;
  if (!["draft", "approved", "posted", "archived", "rejected"].includes(String(value.status))) return null;
  if (!isObject(value.evidence) || value.evidence.kind !== "dossier-story" || !Array.isArray(value.evidence.claimRefs)) return null;
  if (value.evidence.claimRefs.length < 1 || value.evidence.claimRefs.some((ref) => typeof ref !== "string" || !CLAIM.test(ref))) return null;
  if (!isObject(value.payloads)) return null;
  const cs = parseFeature(value.payloads.cs, "cs");
  const en = parseFeature(value.payloads.en, "en");
  if (!cs || !en || !isObject(value.gateResults) || !isObject(value.designLab) || !isObject(value.owner)) return null;
  const gates = value.gateResults;
  if (![gates.cs, gates.en].every((gate) => isObject(gate) && typeof gate.passed === "boolean" && Array.isArray(gate.violations))) return null;
  const designLab = value.designLab;
  if (!["pending", "ready", "rendered"].includes(String(designLab.status))) return null;
  if (designLab.summaryRefs !== null && (!isObject(designLab.summaryRefs) || typeof designLab.summaryRefs.cs !== "string" || typeof designLab.summaryRefs.en !== "string")) return null;
  const owner = value.owner;
  if (!isObject(owner.postedUrls) || !isObject(owner.resultRefs) || !Array.isArray(owner.editHistory)) return null;
  if (![owner.postedUrls.cs, owner.postedUrls.en].every((url) => url === null || https(url))) return null;
  if (![owner.resultRefs.cs, owner.resultRefs.en].every((refs) => Array.isArray(refs) && refs.every((ref) => typeof ref === "string"))) return null;
  if (owner.editHistory.length > 500 || owner.editHistory.some((entry) =>
    !isObject(entry) || !ISO.test(String(entry.at))
    || !["edit", "approve", "reject", "post", "result", "archive"].includes(String(entry.action))
    || (entry.locale !== null && entry.locale !== "cs" && entry.locale !== "en")
    || (entry.reason !== null && typeof entry.reason !== "string"))) return null;
  return { ...value, payloads: { cs, en } } as unknown as BhRecommendation;
}

function parseAction(value: unknown): BhFeatureAction | null {
  if (!isObject(value) || typeof value.action !== "string" || typeof value.recommendationId !== "string") return null;
  if (!ID.test(value.recommendationId) || typeof value.idempotencyKey !== "string" || !KEY.test(value.idempotencyKey) || value.idempotencyKey.length > 100) return null;
  if (typeof value.at !== "string" || !ISO.test(value.at)) return null;
  const base = { recommendationId: value.recommendationId, idempotencyKey: value.idempotencyKey, at: value.at };
  if (value.action === "approve") return { action: "approve", ...base };
  if (value.action === "reject" && typeof value.reason === "string" && value.reason.trim().length > 0 && value.reason.length <= 500) {
    return { action: "reject", ...base, reason: value.reason.trim() };
  }
  if (value.action === "edit-approve" && typeof value.reason === "string" && value.reason.trim().length > 0 && value.reason.length <= 500 && isObject(value.payloads)) {
    const cs = parseFeature(value.payloads.cs, "cs");
    const en = parseFeature(value.payloads.en, "en");
    return cs && en ? { action: "edit-approve", ...base, reason: value.reason.trim(), payloads: { cs, en } } : null;
  }
  if (value.action === "posted" && (value.locale === "cs" || value.locale === "en") && https(value.url)) {
    return { action: "posted", ...base, locale: value.locale, url: value.url };
  }
  if (value.action === "result" && (value.locale === "cs" || value.locale === "en") && typeof value.resultRef === "string" && RESULT_REF.test(value.resultRef)) {
    return { action: "result", ...base, locale: value.locale, resultRef: value.resultRef };
  }
  return null;
}

export { parseAction as parseBhFeatureAction };

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function insideRoot(relative: string): string {
  const root = repositoryRoot();
  const target = path.join(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new BhFeaturePersistenceError("CONFLICT", "Feature path escaped the repository.");
  return target;
}

async function optionalLocal(relative: string): Promise<unknown | null> {
  try { return JSON.parse(await readFile(insideRoot(relative), "utf8")) as unknown; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function findRecommendation(id: string): Promise<{ relative: string; recommendation: BhRecommendation }> {
  let names: string[];
  try { names = (await readdir(insideRoot(RECOMMENDATIONS_ROOT))).filter((name) => name.endsWith(".json")); }
  catch { throw new BhFeaturePersistenceError("UNAVAILABLE", "No BOOKSOFHISTORY recommendations are recorded."); }
  const matches: Array<{ relative: string; recommendation: BhRecommendation }> = [];
  for (const name of names) {
    const relative = `${RECOMMENDATIONS_ROOT}/${name}`;
    const parsed = parseBhRecommendation(await optionalLocal(relative));
    if (!parsed) throw new BhFeaturePersistenceError("CORRUPT", `Recommendation ${name} is malformed.`);
    if (parsed.recommendationId === id) matches.push({ relative, recommendation: parsed });
  }
  if (matches.length !== 1) throw new BhFeaturePersistenceError(matches.length ? "CORRUPT" : "UNAVAILABLE", `Expected one recommendation ${id}; found ${matches.length}.`);
  return matches[0]!;
}

function requestHash(action: BhFeatureAction): string {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

function receiptPath(action: BhFeatureAction): string {
  return `${ACTIONS_ROOT}/${action.recommendationId}/${action.idempotencyKey}.json`;
}

async function remoteJson(relative: string, token: string): Promise<unknown | null> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${encoded}?ref=${encodeURIComponent(branch)}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" },
    cache: "no-store"
  });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) throw new BhFeaturePersistenceError("REFUSED", `GitHub refused the feature read with ${response.status}.`);
  if (!response.ok) throw new BhFeaturePersistenceError("REMOTE", `GitHub feature read failed with ${response.status}.`);
  const body = await response.json() as { content?: string };
  return body.content ? JSON.parse(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8")) as unknown : null;
}

async function putGitHub(relative: string, value: unknown, message: string, token: string): Promise<void> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encoded}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10" };
  const current = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
  if (current.status === 401 || current.status === 403) throw new BhFeaturePersistenceError("REFUSED", `GitHub refused the feature read with ${current.status}.`);
  if (!current.ok && current.status !== 404) throw new BhFeaturePersistenceError("REMOTE", `GitHub feature read failed with ${current.status}.`);
  const sha = current.ok ? (await current.json() as { sha?: string }).sha : undefined;
  const response = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({
    message,
    content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString("base64"),
    branch,
    ...(sha ? { sha } : {})
  }) });
  if (response.status === 401 || response.status === 403) throw new BhFeaturePersistenceError("REFUSED", `GitHub refused the feature write with ${response.status}.`);
  if (!response.ok) throw new BhFeaturePersistenceError("REMOTE", `GitHub feature write failed with ${response.status}.`);
}

async function writeLocal(relative: string, value: unknown): Promise<void> {
  const target = insideRoot(relative);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}

async function resultEntryApproved(): Promise<boolean> {
  try {
    const inbox = await readFile(insideRoot("state/INBOX.md"), "utf8");
    return /^- \[[xX]\] HUMAN_APPROVAL BH-RESULTS-004\b/mu.test(inbox);
  } catch { return false; }
}

async function stateRecordExists(relative: string): Promise<boolean> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  return (token ? await remoteJson(relative, token) : await optionalLocal(relative)) !== null;
}

function assertClaimRefs(recommendation: BhRecommendation, payloads: { cs: BhLanguageFeature; en: BhLanguageFeature }): void {
  const allowed = new Set(recommendation.evidence.claimRefs);
  for (const feature of Object.values(payloads)) {
    const refs = [
      ...feature.slides.flatMap((slide) => slide.factualSentences.flatMap((sentence) => sentence.claimRefs)),
      ...feature.quotes.map((quote) => quote.claimRef)
    ];
    if (refs.some((ref) => !allowed.has(ref))) throw new BhFeaturePersistenceError("CONFLICT", "An edited package cites a claim outside the approved dossier story.");
  }
}

function summariesFor(recommendation: BhRecommendation) {
  const make = (locale: BhFeatureLocale) => {
    const summary = buildBooksofhistoryCarouselSummary({ recommendationId: recommendation.recommendationId, createdAt: recommendation.createdAt, locale, feature: recommendation.payloads[locale] });
    const review = reviewCarouselSummary(summary);
    if (!review.renderable) throw new BhFeaturePersistenceError("CONFLICT", `${locale} summary is not renderable: ${review.problems.join(" ")}`);
    return { summary, ref: booksofhistoryCarouselSummaryPath(summary) };
  };
  return { cs: make("cs"), en: make("en") };
}

function history(at: string, action: BhRecommendation["owner"]["editHistory"][number]["action"], locale: BhFeatureLocale | null, reason: string | null) {
  return { at, action, locale, reason };
}

async function applyAction(current: BhRecommendation, action: BhFeatureAction): Promise<{ recommendation: BhRecommendation; summaries: ReturnType<typeof summariesFor> | null }> {
  if ((action.action === "approve" || action.action === "edit-approve" || action.action === "reject") && current.status !== "draft") {
    throw new BhFeaturePersistenceError("CONFLICT", `A ${current.status} recommendation cannot be ${action.action}d.`);
  }
  if (action.action === "reject") return {
    recommendation: { ...current, status: "rejected", updatedAt: action.at, owner: { ...current.owner, editHistory: [...current.owner.editHistory, history(action.at, "reject", null, action.reason)] } },
    summaries: null
  };
  if (action.action === "approve" || action.action === "edit-approve") {
    if (!current.gateResults.cs.passed || current.gateResults.cs.violations.length > 0
      || !current.gateResults.en.passed || current.gateResults.en.violations.length > 0) {
      throw new BhFeaturePersistenceError("CONFLICT", "Both production gates must pass before owner approval.");
    }
    const payloads = action.action === "edit-approve" ? action.payloads : current.payloads;
    assertClaimRefs(current, payloads);
    const edited = { ...current, payloads };
    const summaries = summariesFor(edited);
    const edits = action.action === "edit-approve" ? [history(action.at, "edit", null, action.reason)] : [];
    return {
      recommendation: {
        ...edited,
        status: "approved",
        updatedAt: action.at,
        designLab: { status: "ready", summaryRefs: { cs: summaries.cs.ref, en: summaries.en.ref } },
        owner: { ...current.owner, editHistory: [...current.owner.editHistory, ...edits, history(action.at, "approve", null, null)] }
      },
      summaries
    };
  }
  if (current.status !== "approved" && current.status !== "posted") throw new BhFeaturePersistenceError("CONFLICT", `A ${current.status} recommendation is not ready for owner outcomes.`);
  if (action.action === "posted") {
    const postedUrls = { ...current.owner.postedUrls, [action.locale]: action.url };
    return {
      recommendation: {
        ...current,
        status: postedUrls.cs && postedUrls.en ? "posted" : "approved",
        updatedAt: action.at,
        owner: { ...current.owner, postedUrls, editHistory: [...current.owner.editHistory, history(action.at, "post", action.locale, null)] }
      },
      summaries: null
    };
  }
  if (!(await resultEntryApproved())) throw new BhFeaturePersistenceError("CONFLICT", "BH-RESULTS-004 is not approved; owner results remain disabled.");
  if (!(await stateRecordExists(`state/${action.resultRef}`))) throw new BhFeaturePersistenceError("CONFLICT", "The referenced owner result entry does not exist.");
  const existing = current.owner.resultRefs[action.locale];
  const repeated = existing.includes(action.resultRef);
  return {
    recommendation: repeated ? current : {
      ...current,
      updatedAt: action.at,
      owner: {
        ...current.owner,
        resultRefs: { ...current.owner.resultRefs, [action.locale]: [...existing, action.resultRef] },
        editHistory: [...current.owner.editHistory, history(action.at, "result", action.locale, null)]
      }
    },
    summaries: null
  };
}

export async function applyBhFeatureAction(action: BhFeatureAction): Promise<BhFeatureActionResult> {
  const hash = requestHash(action);
  const receiptRelative = receiptPath(action);
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  const existingReceipt = token ? await remoteJson(receiptRelative, token) : await optionalLocal(receiptRelative);
  if (isObject(existingReceipt)) {
    if (existingReceipt.requestHash !== hash || !isObject(existingReceipt.result)) throw new BhFeaturePersistenceError("CONFLICT", "Idempotency key was already used for a different feature action.");
    return { ...existingReceipt.result as unknown as BhFeatureActionResult, idempotent: true };
  }

  const located = await findRecommendation(action.recommendationId);
  const applied = await applyAction(located.recommendation, action);
  const result: BhFeatureActionResult = {
    recommendationId: action.recommendationId,
    action: action.action,
    status: applied.recommendation.status,
    summaryRefs: applied.recommendation.designLab.summaryRefs,
    persistence: token ? "github" : "filesystem",
    idempotent: false
  };
  const files: Array<{ relative: string; value: unknown; message: string }> = [];
  if (applied.summaries) {
    files.push(
      { relative: `state/${applied.summaries.cs.ref}`, value: applied.summaries.cs.summary, message: `admin: record ${action.recommendationId} cs summary` },
      { relative: `state/${applied.summaries.en.ref}`, value: applied.summaries.en.summary, message: `admin: record ${action.recommendationId} en summary` }
    );
  }
  files.push(
    { relative: located.relative, value: applied.recommendation, message: `admin: ${action.action} BOOKSOFHISTORY ${action.recommendationId}` },
    { relative: receiptRelative, value: { schemaVersion: "bh-feature-action/1", requestHash: hash, action, before: located.recommendation, after: applied.recommendation, result }, message: `admin: record ${action.idempotencyKey}` }
  );
  if (token) {
    for (const file of files) await putGitHub(file.relative, file.value, file.message, token);
    return result;
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new BhFeaturePersistenceError("UNCONFIGURED", "BOOKSOFHISTORY feature storage is not configured for this deployment.");
  for (const file of files) await writeLocal(file.relative, file.value);
  return result;
}
