import "server-only";
import {
  buildCarouselSummary,
  type CarouselSummary
} from "@boardlessai/carousel-studio";
import {
  kvorumRepositoryRoot,
  KvorumRecommendationPersistenceError,
  persistKvorum,
  type KvorumPersistenceResult
} from "./kvorum-admin-persistence";
import { syncKvorumClaimsForRecommendation } from "./kvorum-claim-store";

export { KvorumRecommendationPersistenceError } from "./kvorum-admin-persistence";

const INDEX_REF = "state/ventures/kvorum/recommendations/index.json";

interface KvorumCopyBlock {
  id: string;
  platform: string;
  format: string;
  locale: "cs" | "en" | "uk";
  text: string;
  altText: string | null;
  reason: string;
}

interface KvorumOriginalDraft {
  capturedAt: string;
  headline: string;
  summary: string;
  whyItMatters: string;
  whyThisIsWorthIt: string;
  ourAngle: string;
  ourAngleDiffers: string;
  platforms: string[];
  formats: string[];
  copyBlocks: KvorumCopyBlock[];
}

export interface KvorumRecommendation {
  schemaVersion: "venture-recommendation/1";
  id: string;
  ventureId: "kvorum";
  date: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "approved" | "posted" | "archived" | "rejected";
  headline: string;
  summary: string;
  whyItMatters: string;
  whyThisIsWorthIt: string;
  ourAngle: string;
  ourAngleDiffers: string;
  platforms: string[];
  formats: string[];
  copyBlocks: KvorumCopyBlock[];
  evidence: {
    kind: "monitor-cluster";
    monitorDate: string;
    receiptRef: string;
    clusterId: string;
    continuationOf: string | null;
    sources: Array<{
      itemRef: string;
      sourceId: string;
      sourceName: string;
      url: string;
      publishedAt: string;
      excerpt: string;
      discoveryOnly: boolean;
    }>;
    claims: Array<{
      id: string;
      type: "fact-multi" | "fact-single" | "commentary";
      text: string;
      refs: string[];
    }>;
    stitAttribution: {
      internalOnly: true;
      summary: string;
      posts: Array<{
        itemRef: string;
        postUrl: string;
        excerpt: string;
        engagement: { likes: number | null; comments: number | null; shares: number | null };
      }>;
    } | null;
  };
  gateResults: { passed: boolean; [key: string]: unknown };
  designLab: {
    status: "not-requested" | "queued" | "rendered" | "failed";
    requestedAt: string | null;
    resolvedAt: string | null;
    recipeRef: string | null;
    artifactRefs: string[];
    failureReason: string | null;
  };
  owner: {
    postingMode: "manual-only";
    approvedAt: string | null;
    postedAt: string | null;
    archivedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    postedUrl: string | null;
    resultRefs: string[];
    ratingRef: string | null;
    original: KvorumOriginalDraft | null;
    editHistory: Array<{
      editedAt: string;
      changedBy: "owner";
      fields: string[];
      note: string;
    }>;
  };
  [key: string]: unknown;
}

const TEXT_LIMITS = {
  headline: 240,
  summary: 2_000,
  whyItMatters: 2_000,
  whyThisIsWorthIt: 1_000,
  ourAngle: 2_000,
  ourAngleDiffers: 2_000
} as const;

type EditableTextField = keyof typeof TEXT_LIMITS;

interface CopyBlockEdit {
  id: string;
  text?: string;
  altText?: string | null;
  reason?: string;
}

interface RecommendationEdits extends Partial<Record<EditableTextField, string>> {
  copyBlocks?: CopyBlockEdit[];
}

export type KvorumRecommendationAction =
  | { action: "approve"; ref: string; edits?: RecommendationEdits }
  | { action: "reject"; ref: string; reason: string }
  | { action: "posted"; ref: string; postedUrl: string };

export interface KvorumRecommendationActionResult {
  recommendation: KvorumRecommendation;
  summary: CarouselSummary | null;
  idempotent: boolean;
  persistence: "filesystem" | "github";
  commits: string[];
  claimRefs: string[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonempty(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function copyBlock(value: unknown): value is KvorumCopyBlock {
  const entry = object(value);
  return Boolean(entry
    && nonempty(entry.id, 80)
    && nonempty(entry.platform, 80)
    && nonempty(entry.format, 80)
    && (entry.locale === "cs" || entry.locale === "en" || entry.locale === "uk")
    && nonempty(entry.text, 12_000)
    && (entry.altText === null || nonempty(entry.altText, 2_000))
    && nonempty(entry.reason, 800));
}

function recommendation(value: unknown, ref: string): KvorumRecommendation {
  const entry = object(value);
  const owner = object(entry?.owner);
  const designLab = object(entry?.designLab);
  const evidence = object(entry?.evidence);
  const gateResults = object(entry?.gateResults);
  const stitAttribution = object(evidence?.stitAttribution);
  const filename = ref.split("/").at(-1)?.replace(/\.json$/u, "") ?? "";
  const copyBlocks = entry?.copyBlocks;
  if (!entry
    || entry.schemaVersion !== "venture-recommendation/1"
    || entry.ventureId !== "kvorum"
    || !nonempty(entry.id, 80)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(entry.date))
    || !filename.startsWith(`${String(entry.date)}-`)
    || !["draft", "approved", "posted", "archived", "rejected"].includes(String(entry.status))
    || !nonempty(entry.headline, TEXT_LIMITS.headline)
    || !nonempty(entry.summary, TEXT_LIMITS.summary)
    || !nonempty(entry.whyItMatters, TEXT_LIMITS.whyItMatters)
    || !nonempty(entry.whyThisIsWorthIt, TEXT_LIMITS.whyThisIsWorthIt)
    || !nonempty(entry.ourAngle, TEXT_LIMITS.ourAngle)
    || !nonempty(entry.ourAngleDiffers, TEXT_LIMITS.ourAngleDiffers)
    || !Array.isArray(entry.platforms) || !entry.platforms.every((item) => typeof item === "string")
    || !Array.isArray(entry.formats) || !entry.formats.every((item) => typeof item === "string")
    || !Array.isArray(copyBlocks) || !copyBlocks.every(copyBlock)
    || !evidence || evidence.kind !== "monitor-cluster"
    || !nonempty(evidence.monitorDate, 10) || !nonempty(evidence.receiptRef, 160)
    || !nonempty(evidence.clusterId, 40) || !Array.isArray(evidence.sources)
    || !evidence.sources.every((source) => {
      const candidate = object(source);
      return Boolean(candidate && nonempty(candidate.itemRef, 40) && nonempty(candidate.sourceId, 80)
        && nonempty(candidate.sourceName, 120) && nonempty(candidate.url, 2_000)
        && nonempty(candidate.publishedAt, 40) && nonempty(candidate.excerpt, 600)
        && typeof candidate.discoveryOnly === "boolean");
    })
    || !Array.isArray(evidence.claims) || !evidence.claims.every((claim) => {
      const candidate = object(claim);
      return Boolean(candidate && nonempty(candidate.id, 80)
        && ["fact-multi", "fact-single", "commentary"].includes(String(candidate.type))
        && nonempty(candidate.text, 1_000) && Array.isArray(candidate.refs)
        && candidate.refs.every((ref) => nonempty(ref, 40)));
    })
    || (evidence.stitAttribution !== null && (!stitAttribution || stitAttribution.internalOnly !== true
      || !Array.isArray(stitAttribution.posts)))
    || !gateResults || typeof gateResults.passed !== "boolean"
    || !designLab || !["not-requested", "queued", "rendered", "failed"].includes(String(designLab.status))
    || !owner || owner.postingMode !== "manual-only" || !Array.isArray(owner.editHistory)
    || !("original" in owner)) {
    throw new KvorumRecommendationPersistenceError("CORRUPT", "The saved Kvórum recommendation is malformed.");
  }
  return entry as unknown as KvorumRecommendation;
}

function recommendationRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^state\/ventures\/kvorum\/recommendations\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(value)
    ? value
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseEdits(value: unknown): RecommendationEdits | null | undefined {
  if (value === undefined) return undefined;
  const edits = object(value);
  if (!edits || !exactKeys(edits, [...Object.keys(TEXT_LIMITS), "copyBlocks"])) return null;
  const parsed: RecommendationEdits = {};
  for (const [field, limit] of Object.entries(TEXT_LIMITS) as Array<[EditableTextField, number]>) {
    if (!(field in edits)) continue;
    if (!nonempty(edits[field], limit)) return null;
    parsed[field] = (edits[field] as string).trim();
  }
  if ("copyBlocks" in edits) {
    if (!Array.isArray(edits.copyBlocks) || edits.copyBlocks.length === 0 || edits.copyBlocks.length > 40) return null;
    const ids = new Set<string>();
    parsed.copyBlocks = [];
    for (const raw of edits.copyBlocks) {
      const block = object(raw);
      if (!block || !exactKeys(block, ["id", "text", "altText", "reason"]) || !nonempty(block.id, 80)) return null;
      if (ids.has(block.id)) return null;
      ids.add(block.id);
      const next: CopyBlockEdit = { id: block.id.trim() };
      if ("text" in block) {
        if (!nonempty(block.text, 12_000)) return null;
        next.text = block.text.trim();
      }
      if ("altText" in block) {
        if (block.altText !== null && !nonempty(block.altText, 2_000)) return null;
        next.altText = block.altText === null ? null : block.altText.trim();
      }
      if ("reason" in block) {
        if (!nonempty(block.reason, 800)) return null;
        next.reason = block.reason.trim();
      }
      if (Object.keys(next).length === 1) return null;
      parsed.copyBlocks.push(next);
    }
  }
  return parsed;
}

export function parseKvorumRecommendationAction(value: unknown): KvorumRecommendationAction | null {
  const body = object(value);
  if (!body || !exactKeys(body, ["action", "ref", "edits", "reason", "postedUrl"])) return null;
  const ref = recommendationRef(body.ref);
  if (!ref) return null;
  if (body.action === "approve") {
    if ("reason" in body || "postedUrl" in body) return null;
    const edits = parseEdits(body.edits);
    if (edits === null) return null;
    return { action: "approve", ref, ...(body.edits === undefined ? {} : { edits }) };
  }
  if (body.action === "reject") {
    if ("edits" in body || "postedUrl" in body || !nonempty(body.reason, 800)) return null;
    return { action: "reject", ref, reason: body.reason.trim() };
  }
  if (body.action === "posted") {
    if ("edits" in body || "reason" in body || typeof body.postedUrl !== "string") return null;
    try {
      const url = new URL(body.postedUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.toString().length > 2_000) return null;
      return { action: "posted", ref, postedUrl: url.toString() };
    } catch {
      return null;
    }
  }
  return null;
}

function originalDraft(entry: KvorumRecommendation, capturedAt: string): KvorumOriginalDraft {
  return {
    capturedAt,
    headline: entry.headline,
    summary: entry.summary,
    whyItMatters: entry.whyItMatters,
    whyThisIsWorthIt: entry.whyThisIsWorthIt,
    ourAngle: entry.ourAngle,
    ourAngleDiffers: entry.ourAngleDiffers,
    platforms: [...entry.platforms],
    formats: [...entry.formats],
    copyBlocks: structuredClone(entry.copyBlocks)
  };
}

function editedRecommendation(
  entry: KvorumRecommendation,
  edits: RecommendationEdits | undefined
): { value: KvorumRecommendation; fields: string[] } {
  if (!edits) return { value: entry, fields: [] };
  const value = structuredClone(entry);
  const fields: string[] = [];
  for (const field of Object.keys(TEXT_LIMITS) as EditableTextField[]) {
    const next = edits[field];
    if (next !== undefined && value[field] !== next) {
      value[field] = next;
      fields.push(field);
    }
  }
  if (edits.copyBlocks) {
    const byId = new Map(value.copyBlocks.map((block) => [block.id, block]));
    for (const patch of edits.copyBlocks) {
      const block = byId.get(patch.id);
      if (!block) throw new KvorumRecommendationPersistenceError("INVALID", `Copy block ${patch.id} does not exist.`);
      if (patch.text !== undefined) block.text = patch.text;
      if (patch.altText !== undefined) block.altText = patch.altText;
      if (patch.reason !== undefined) block.reason = patch.reason;
    }
    if (JSON.stringify(value.copyBlocks) !== JSON.stringify(entry.copyBlocks)) fields.push("copyBlocks");
  }
  return { value, fields };
}

function transition(
  current: unknown | null,
  input: KvorumRecommendationAction,
  now: Date
): { value: KvorumRecommendation; idempotent: boolean } {
  if (current === null) throw new KvorumRecommendationPersistenceError("CONFLICT", "That Kvórum recommendation no longer exists.");
  const entry = recommendation(current, input.ref);
  if (!entry.gateResults.passed) {
    throw new KvorumRecommendationPersistenceError("CONFLICT", "A recommendation without passing gates cannot receive an owner action.");
  }
  const at = now.toISOString();
  if (Date.parse(at) < Date.parse(entry.updatedAt)) {
    throw new KvorumRecommendationPersistenceError("CONFLICT", "The owner action predates the saved recommendation.");
  }
  if (input.action === "approve") {
    const edited = editedRecommendation(entry, input.edits);
    if (entry.status === "approved") {
      if (edited.fields.length > 0) {
        throw new KvorumRecommendationPersistenceError("CONFLICT", "An approved recommendation cannot be edited by retry.");
      }
      return { value: entry, idempotent: true };
    }
    if (entry.status !== "draft") {
      throw new KvorumRecommendationPersistenceError("CONFLICT", `A ${entry.status} recommendation cannot be approved.`);
    }
    const value = edited.value;
    value.status = "approved";
    value.updatedAt = at;
    value.owner.approvedAt = at;
    if (edited.fields.length > 0) {
      value.owner.original = originalDraft(entry, at);
      value.owner.editHistory.push({
        editedAt: at,
        changedBy: "owner",
        fields: edited.fields,
        note: "Owner edited the draft before approval; the original remains attached."
      });
    }
    value.designLab = {
      status: "queued",
      requestedAt: at,
      resolvedAt: null,
      recipeRef: null,
      artifactRefs: [],
      failureReason: null
    };
    return { value, idempotent: false };
  }
  if (input.action === "reject") {
    if (entry.status === "rejected") {
      if (entry.owner.rejectionReason !== input.reason) {
        throw new KvorumRecommendationPersistenceError("CONFLICT", "That recommendation was rejected with a different reason.");
      }
      return { value: entry, idempotent: true };
    }
    if (entry.status !== "draft") {
      throw new KvorumRecommendationPersistenceError("CONFLICT", `A ${entry.status} recommendation cannot be rejected.`);
    }
    const value = structuredClone(entry);
    value.status = "rejected";
    value.updatedAt = at;
    value.owner.rejectedAt = at;
    value.owner.rejectionReason = input.reason;
    return { value, idempotent: false };
  }
  if (entry.status === "posted") {
    if (entry.owner.postedUrl !== input.postedUrl) {
      throw new KvorumRecommendationPersistenceError("CONFLICT", "That recommendation already records a different posted URL.");
    }
    return { value: entry, idempotent: true };
  }
  if (entry.status !== "approved") {
    throw new KvorumRecommendationPersistenceError("CONFLICT", `A ${entry.status} recommendation cannot record a posted URL.`);
  }
  const value = structuredClone(entry);
  value.status = "posted";
  value.updatedAt = at;
  value.owner.postedAt = at;
  value.owner.postedUrl = input.postedUrl;
  return { value, idempotent: false };
}

function summarySlug(entry: KvorumRecommendation): string {
  const prefix = `kv-${entry.date}-`;
  const slug = entry.id.startsWith(prefix) ? entry.id.slice(prefix.length) : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new KvorumRecommendationPersistenceError("CORRUPT", "The recommendation id cannot address a Design Lab summary.");
  }
  return slug;
}

function designLabSummary(entry: KvorumRecommendation): CarouselSummary {
  return buildCarouselSummary({
    venture: "kvorum",
    slug: summarySlug(entry),
    date: entry.date,
    title: entry.headline,
    dek: entry.whyItMatters,
    points: [entry.summary, entry.ourAngle, entry.ourAngleDiffers],
    sources: entry.evidence.sources
      .filter((source) => !source.discoveryOnly && source.sourceId !== "stit-demokracie-facebook")
      .map((source) => ({ kind: "source", label: source.sourceName }))
      .filter((source, index, all) => all.findIndex((candidate) => candidate.label === source.label) === index),
    hasHero: false,
    heroCredit: null
  });
}

async function syncIndexStatus(
  ref: string,
  entry: KvorumRecommendation,
  now: Date,
  root: string
): Promise<KvorumPersistenceResult<unknown>> {
  return persistKvorum(INDEX_REF, (current) => {
    if (current === null) return { value: null, idempotent: true };
    const index = object(current);
    if (!index || !Array.isArray(index.queue) || typeof index.date !== "string") {
      throw new KvorumRecommendationPersistenceError("CORRUPT", "The Kvórum recommendation index is malformed.");
    }
    if (index.date !== entry.date) return { value: current, idempotent: true };
    const position = index.queue.findIndex((raw) => object(raw)?.ref === ref);
    if (position < 0) {
      throw new KvorumRecommendationPersistenceError("CORRUPT", "The current-day recommendation is missing from its queue index.");
    }
    const queueEntry = object(index.queue[position]);
    if (!queueEntry) throw new KvorumRecommendationPersistenceError("CORRUPT", "The Kvórum queue entry is malformed.");
    if (queueEntry.status === entry.status) return { value: current, idempotent: true };
    const value = structuredClone(index);
    (value.queue as unknown[])[position] = { ...queueEntry, status: entry.status };
    value.generatedAt = now.toISOString();
    return { value, idempotent: false };
  }, `admin: sync Kvórum queue ${entry.id}`, root);
}

export async function applyKvorumRecommendationAction(
  input: KvorumRecommendationAction,
  options: { root?: string; now?: Date } = {}
): Promise<KvorumRecommendationActionResult> {
  const root = options.root ?? kvorumRepositoryRoot();
  const now = options.now ?? new Date();
  const changed = await persistKvorum(
    input.ref,
    (current) => transition(current, input, now),
    `admin: ${input.action} Kvórum recommendation`,
    root
  );
  const index = await syncIndexStatus(input.ref, changed.value, now, root);
  let summary: KvorumPersistenceResult<CarouselSummary> | null = null;
  if (input.action === "approve") {
    const value = designLabSummary(changed.value);
    const relative = `state/ventures/carousel-studio/summaries/kvorum/${value.date}-${value.slug}.json`;
    summary = await persistKvorum(relative, (current) => {
      if (current === null) return { value, idempotent: false };
      if (JSON.stringify(current) !== JSON.stringify(value)) {
        throw new KvorumRecommendationPersistenceError("CONFLICT", "A different Design Lab summary already exists for this recommendation.");
      }
      return { value, idempotent: true };
    }, `admin: queue Kvórum summary ${value.slug}`, root);
  }
  const claims = input.action === "approve" || input.action === "posted"
    ? await syncKvorumClaimsForRecommendation(changed.value, input.ref, { root, now })
    : { refs: [], commits: [], idempotent: true };
  const commits = [changed.commit, index.commit, summary?.commit, ...claims.commits]
    .filter((commit): commit is string => typeof commit === "string");
  return {
    recommendation: changed.value,
    summary: summary?.value ?? null,
    idempotent: changed.idempotent && index.idempotent && (summary?.idempotent ?? true) && claims.idempotent,
    persistence: changed.persistence,
    commits: [...new Set(commits)],
    claimRefs: claims.refs
  };
}
