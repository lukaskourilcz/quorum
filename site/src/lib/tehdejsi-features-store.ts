import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CAROUSEL_BRANDS,
  CarouselPayloadSchema,
  buildTehdejsiCarouselSummary,
  renderCarouselSvg,
  reviewCarouselSummary,
  tehdejsiCarouselSummaryPath,
  tehdejsiCsSlot,
  tehdejsiDeckTemplate,
  tehdejsiPhotoIssues,
  tehdejsiUaSlot,
  TEHDEJSI_ATTRIBUTION_SLOT,
  TEHDEJSI_CHIP_SLOT,
  TEHDEJSI_EYEBROW_SLOT,
  TEHDEJSI_PHOTO_SLOT,
  toRenderablePng
} from "@boardlessai/carousel-studio";
import {
  parseTehdejsiFeaturePayload,
  parseTehdejsiFeatureRecommendation,
  type TehdejsiFeatureLocale,
  type TehdejsiFeaturePayload,
  type TehdejsiFeatureRecommendation,
  type TehdejsiFeatureStatus
} from "./tehdejsi-feature-model";
import { tehdejsiPhotoStatePath } from "./tehdejsi-design-lab";

export type TehdejsiFeatureAction =
  | { action: "approve"; recommendationId: string; idempotencyKey: string; at: string; humanReviewCompleted?: true }
  | { action: "edit-approve"; recommendationId: string; idempotencyKey: string; at: string; reason: string; payload: TehdejsiFeaturePayload; humanReviewCompleted?: true }
  | { action: "reject"; recommendationId: string; idempotencyKey: string; at: string; reason: string }
  | { action: "posted"; recommendationId: string; idempotencyKey: string; at: string; locale: TehdejsiFeatureLocale; url: string };

export interface TehdejsiFeatureActionResult {
  recommendationId: string;
  action: TehdejsiFeatureAction["action"];
  status: TehdejsiFeatureStatus;
  summaryRef: string | null;
  persistence: "filesystem" | "github";
  idempotent: boolean;
  readyToPost: {
    captions: { cs: string; ua: string };
    export: { venture: "tehdejsi-svet"; slug: string; date: string };
  } | null;
}

export type TehdejsiFeaturePersistenceCode = "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE" | "UNCONFIGURED" | "REFUSED";

export class TehdejsiFeaturePersistenceError extends Error {
  constructor(readonly code: TehdejsiFeaturePersistenceCode, message: string) {
    super(message);
  }
}

const ID = /^ts-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const RECOMMENDATIONS_ROOT = "state/ventures/tehdejsi-svet/drafts";
const ACTIONS_ROOT = "state/ventures/tehdejsi-svet/feature-actions";

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function https(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

/** Strict request parser. Unknown fields cannot become owner authority by accident. */
export function parseTehdejsiFeatureAction(value: unknown): TehdejsiFeatureAction | null {
  const action = object(value);
  if (!action || typeof action.action !== "string") return null;
  const shared = ["action", "recommendationId", "idempotencyKey", "at"];
  if (typeof action.recommendationId !== "string" || !ID.test(action.recommendationId)) return null;
  if (typeof action.idempotencyKey !== "string" || action.idempotencyKey.length > 100 || !KEY.test(action.idempotencyKey)) return null;
  if (typeof action.at !== "string" || !INSTANT.test(action.at)) return null;
  const base = { recommendationId: action.recommendationId, idempotencyKey: action.idempotencyKey, at: action.at };
  if (action.action === "approve") {
    if (!exact(action, [...shared, ...(action.humanReviewCompleted === true ? ["humanReviewCompleted"] : [])])) return null;
    return { action: "approve", ...base, ...(action.humanReviewCompleted === true ? { humanReviewCompleted: true as const } : {}) };
  }
  if (action.action === "edit-approve") {
    if (!exact(action, [...shared, "reason", "payload", ...(action.humanReviewCompleted === true ? ["humanReviewCompleted"] : [])])) return null;
    if (typeof action.reason !== "string" || !action.reason.trim() || action.reason.length > 500) return null;
    const payload = parseTehdejsiFeaturePayload(action.payload);
    if (!payload) return null;
    return {
      action: "edit-approve",
      ...base,
      reason: action.reason.trim(),
      payload,
      ...(action.humanReviewCompleted === true ? { humanReviewCompleted: true as const } : {})
    };
  }
  if (action.action === "reject") {
    if (!exact(action, [...shared, "reason"]) || typeof action.reason !== "string" || !action.reason.trim() || action.reason.length > 1_000) return null;
    return { action: "reject", ...base, reason: action.reason.trim() };
  }
  if (action.action === "posted") {
    if (!exact(action, [...shared, "locale", "url"]) || (action.locale !== "cs" && action.locale !== "ua") || !https(action.url)) return null;
    return { action: "posted", ...base, locale: action.locale, url: new URL(action.url).toString() };
  }
  return null;
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function insideRoot(relative: string): string {
  const root = repositoryRoot();
  const target = path.join(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", "Feature path escaped the repository.");
  }
  return target;
}

async function optionalLocal(relative: string): Promise<unknown | null> {
  try { return JSON.parse(await readFile(insideRoot(relative), "utf8")) as unknown; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function findRecommendation(id: string): Promise<{ relative: string; recommendation: TehdejsiFeatureRecommendation }> {
  let names: string[];
  try { names = (await readdir(insideRoot(RECOMMENDATIONS_ROOT))).filter((name) => name.endsWith(".json")).sort(); }
  catch { throw new TehdejsiFeaturePersistenceError("UNAVAILABLE", "No Tehdejsi svet recommendations are recorded."); }
  const matches: Array<{ relative: string; recommendation: TehdejsiFeatureRecommendation }> = [];
  for (const name of names) {
    const relative = `${RECOMMENDATIONS_ROOT}/${name}`;
    const parsed = parseTehdejsiFeatureRecommendation(await optionalLocal(relative));
    if (parsed?.id === id) matches.push({ relative, recommendation: parsed });
  }
  if (matches.length !== 1) {
    throw new TehdejsiFeaturePersistenceError(matches.length ? "CORRUPT" : "UNAVAILABLE", `Expected one recommendation ${id}; found ${matches.length}.`);
  }
  const located = matches[0]!;
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (!token) return located;
  const remote = parseTehdejsiFeatureRecommendation(await remoteJson(located.relative, token));
  if (!remote || remote.id !== id) {
    throw new TehdejsiFeaturePersistenceError("CORRUPT", `The remote recommendation ${id} is missing or malformed.`);
  }
  return { relative: located.relative, recommendation: remote };
}

function requestHash(action: TehdejsiFeatureAction): string {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

function receiptPath(action: TehdejsiFeatureAction): string {
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
  if (response.status === 401 || response.status === 403) throw new TehdejsiFeaturePersistenceError("REFUSED", `GitHub refused the feature read with ${response.status}.`);
  if (!response.ok) throw new TehdejsiFeaturePersistenceError("REMOTE", `GitHub feature read failed with ${response.status}.`);
  const body = await response.json() as { content?: unknown };
  if (typeof body.content !== "string") throw new TehdejsiFeaturePersistenceError("REMOTE", "GitHub returned an invalid feature file.");
  return JSON.parse(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8")) as unknown;
}

async function putGitHub(relative: string, value: unknown, message: string, token: string): Promise<void> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encoded}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    if (current.status === 401 || current.status === 403) throw new TehdejsiFeaturePersistenceError("REFUSED", `GitHub refused the feature read with ${current.status}.`);
    if (!current.ok && current.status !== 404) throw new TehdejsiFeaturePersistenceError("REMOTE", `GitHub feature read failed with ${current.status}.`);
    const sha = current.ok ? (await current.json() as { sha?: string }).sha : undefined;
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString("base64"),
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (response.ok) return;
    if (response.status !== 409 && !(response.status === 422 && !sha)) {
      if (response.status === 401 || response.status === 403) throw new TehdejsiFeaturePersistenceError("REFUSED", `GitHub refused the feature write with ${response.status}.`);
      throw new TehdejsiFeaturePersistenceError("REMOTE", `GitHub feature write failed with ${response.status}.`);
    }
  }
  throw new TehdejsiFeaturePersistenceError("CONFLICT", "Feature state changed during every save attempt.");
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

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

const STOP_SLOP = /\b(?:delve|tapestry|game[ -]?changer|you won't believe|neuv[ěe][řr][íi]te|fascinuj[íi]c[íi] cesta)\b|(?:ви не повірите|неймовірна історія|це змінить усе)/iu;
const AI_IMAGERY = /(?:midjourney|dall[- ]?e|stable diffusion|ai[- ](?:generated|generov)|згенеровано (?:ші|ai))/iu;
const FLAG = /(?:\u{1F1E8}\u{1F1FF}|\u{1F1FA}\u{1F1E6})/u;

async function checkedApproval(current: TehdejsiFeatureRecommendation, action: Extract<TehdejsiFeatureAction, { action: "approve" | "edit-approve" }>): Promise<{
  recommendation: TehdejsiFeatureRecommendation;
  summary: ReturnType<typeof buildTehdejsiCarouselSummary>;
}> {
  if (current.status !== "draft") throw new TehdejsiFeaturePersistenceError("CONFLICT", `A ${current.status} recommendation cannot be approved.`);
  if (current.humanReviewRequired && action.humanReviewCompleted !== true) {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", "Tier-2 approval requires the owner to complete and explicitly confirm human review.");
  }
  const payload = action.action === "edit-approve" ? action.payload : current.payload;
  if (payload.slides.length !== current.payload.slides.length) {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", "Owner edits must preserve the canonical brief's slide count.");
  }
  const copy = [...payload.slides.flatMap(({ cs, ua }) => [cs, ua]), payload.captionCs, payload.captionUa].join("\n");
  if (payload.slides.some(({ cs, ua }) => wordCount(cs) > 20 || wordCount(ua) > 20)) {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", "An edited slide exceeds the 20-word production cap.");
  }
  if (STOP_SLOP.test(copy) || AI_IMAGERY.test(copy) || FLAG.test(copy)) {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", "Owner edits fail a blocking Tehdejsi svet craft rule.");
  }
  if (current.evidence.sensitivityTier === 2 && (/\?\s*$/mu.test(payload.captionCs) || /\?\s*$/mu.test(payload.captionUa))) {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", "A tier-2 feature carries no participation question.");
  }
  const licensed = current.media.filter(({ licence }) => licence !== "own-render");
  if (licensed.length > 1 || licensed.some(({ slideOrdinal }) => slideOrdinal !== 2)) {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", "The dedicated deck accepts one licensed photograph on slide 2 only.");
  }
  let photoPng: Buffer | null = null;
  if (licensed.length === 1) {
    try { photoPng = await toRenderablePng(await readFile(insideRoot(tehdejsiPhotoStatePath(current.id)))); }
    catch { photoPng = null; }
    if (!photoPng) {
      throw new TehdejsiFeaturePersistenceError("CONFLICT", "The licensed photograph has no recorded renderable PNG, so this package is not ready.");
    }
  }
  const summary = buildTehdejsiCarouselSummary({
    recommendationId: current.id,
    date: current.date,
    slides: payload.slides,
    captionCs: payload.captionCs,
    dossierCount: current.evidence.dossierRefs.length,
    photoAttribution: licensed[0]?.attribution ?? null
  });
  const review = reviewCarouselSummary(summary);
  if (!review.renderable) throw new TehdejsiFeaturePersistenceError("CONFLICT", `The approved feature is not Studio-ready: ${review.problems.join(" ")}`);

  const template = tehdejsiDeckTemplate(payload.slides.length);
  const strings: Record<string, string> = {
    [TEHDEJSI_EYEBROW_SLOT]: "Rodinná paměť · Родинна памʼять",
    [TEHDEJSI_CHIP_SLOT]: `${current.date.slice(0, 4)} · Tehdejší svět`,
    [TEHDEJSI_ATTRIBUTION_SLOT]: licensed[0]?.attribution ?? ""
  };
  payload.slides.forEach((slide, index) => {
    strings[tehdejsiCsSlot(index)] = slide.cs;
    strings[tehdejsiUaSlot(index)] = slide.ua;
  });
  const photoIssues = tehdejsiPhotoIssues({ strings, hasPhoto: photoPng !== null, licence: licensed[0]?.licence ?? null });
  if (photoIssues.length > 0) throw new TehdejsiFeaturePersistenceError("CONFLICT", photoIssues.map(({ detail }) => detail).join(" "));
  const rendered = renderCarouselSvg({
    template,
    payload: CarouselPayloadSchema.parse({ locale: "cs", strings }),
    brand: CAROUSEL_BRANDS["tehdejsi-svet"],
    format: "instagram-portrait",
    ...(photoPng ? { images: { [TEHDEJSI_PHOTO_SLOT]: photoPng } } : {})
  });
  const clipped = rendered.flatMap(({ truncatedSlots }) => truncatedSlots);
  if (clipped.length > 0) throw new TehdejsiFeaturePersistenceError("CONFLICT", `Owner edits clip in Studio slots: ${[...new Set(clipped)].join(", ")}`);

  const summaryPath = `state/${tehdejsiCarouselSummaryPath(summary)}`;
  const recommendation = parseTehdejsiFeatureRecommendation({
    ...current,
    status: "approved",
    payload,
    humanReviewedAt: current.humanReviewRequired ? action.at : current.humanReviewedAt,
    designLab: { summaryPath, readyAt: action.at },
    updatedAt: action.at
  });
  if (!recommendation) throw new TehdejsiFeaturePersistenceError("CORRUPT", "The approval would produce an invalid recommendation.");
  return { recommendation, summary };
}

async function appliedAction(current: TehdejsiFeatureRecommendation, action: TehdejsiFeatureAction): Promise<{
  recommendation: TehdejsiFeatureRecommendation;
  summary: ReturnType<typeof buildTehdejsiCarouselSummary> | null;
}> {
  if (Date.parse(action.at) < Date.parse(current.updatedAt)) {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", "The owner action time precedes the saved recommendation.");
  }
  if (action.action === "approve" || action.action === "edit-approve") return checkedApproval(current, action);
  if (action.action === "reject") {
    if (current.status !== "draft") throw new TehdejsiFeaturePersistenceError("CONFLICT", `A ${current.status} recommendation cannot be rejected.`);
    const recommendation = parseTehdejsiFeatureRecommendation({
      ...current,
      status: "rejected",
      owner: { ...current.owner, rejectionReason: action.reason },
      updatedAt: action.at
    });
    if (!recommendation) throw new TehdejsiFeaturePersistenceError("CORRUPT", "The rejection would produce an invalid recommendation.");
    return { recommendation, summary: null };
  }
  if (current.status !== "approved" && current.status !== "posted") {
    throw new TehdejsiFeaturePersistenceError("CONFLICT", `A ${current.status} recommendation cannot record an owner-posted URL.`);
  }
  const postedUrls = { ...current.owner.postedUrls, [action.locale]: action.url };
  const recommendation = parseTehdejsiFeatureRecommendation({
    ...current,
    status: postedUrls.cs && postedUrls.ua ? "posted" : "approved",
    owner: { ...current.owner, postedUrls },
    updatedAt: action.at
  });
  if (!recommendation) throw new TehdejsiFeaturePersistenceError("CORRUPT", "The posted URL would produce an invalid recommendation.");
  return { recommendation, summary: null };
}

/** Apply one authenticated owner action; it has no posting or analytics capability. */
export async function applyTehdejsiFeatureAction(action: TehdejsiFeatureAction): Promise<TehdejsiFeatureActionResult> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  const receiptRelative = receiptPath(action);
  const hash = requestHash(action);
  const existing = token ? await remoteJson(receiptRelative, token) : await optionalLocal(receiptRelative);
  const receipt = object(existing);
  if (receipt) {
    if (receipt.requestHash !== hash || !object(receipt.result)) {
      throw new TehdejsiFeaturePersistenceError("CONFLICT", "Idempotency key was already used for another feature action.");
    }
    return { ...receipt.result as unknown as TehdejsiFeatureActionResult, idempotent: true };
  }

  const located = await findRecommendation(action.recommendationId);
  const applied = await appliedAction(located.recommendation, action);
  const result: TehdejsiFeatureActionResult = {
    recommendationId: action.recommendationId,
    action: action.action,
    status: applied.recommendation.status,
    summaryRef: applied.recommendation.designLab.summaryPath,
    persistence: token ? "github" : "filesystem",
    idempotent: false,
    readyToPost: ["approved", "posted", "archived"].includes(applied.recommendation.status)
      ? {
          captions: {
            cs: applied.recommendation.payload.captionCs,
            ua: applied.recommendation.payload.captionUa
          },
          export: {
            venture: "tehdejsi-svet",
            slug: applied.recommendation.id,
            date: applied.recommendation.date
          }
        }
      : null
  };
  const files: Array<{ relative: string; value: unknown; message: string }> = [];
  if (applied.summary && applied.recommendation.designLab.summaryPath) {
    files.push({
      relative: applied.recommendation.designLab.summaryPath,
      value: applied.summary,
      message: `admin: record ${action.recommendationId} Studio summary`
    });
  }
  files.push(
    { relative: located.relative, value: applied.recommendation, message: `admin: ${action.action} Tehdejsi svet ${action.recommendationId}` },
    {
      relative: receiptRelative,
      value: {
        schemaVersion: "tehdejsi-feature-action/1",
        requestHash: hash,
        action,
        before: located.recommendation,
        after: applied.recommendation,
        result
      },
      message: `admin: record ${action.idempotencyKey}`
    }
  );
  if (token) {
    for (const file of files) await putGitHub(file.relative, file.value, file.message, token);
    return result;
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new TehdejsiFeaturePersistenceError("UNCONFIGURED", "Tehdejsi svet feature storage is not configured for this deployment.");
  }
  for (const file of files) await writeLocal(file.relative, file.value);
  return result;
}
