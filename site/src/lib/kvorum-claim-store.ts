import "server-only";
import { createHash } from "node:crypto";
import {
  kvorumRepositoryRoot,
  KvorumRecommendationPersistenceError,
  persistKvorum
} from "./kvorum-admin-persistence";
import type { KvorumRecommendation } from "./kvorum-recommendation-store";

const INDEX_REF = "state/ventures/kvorum/recommendations/index.json";

export interface KvorumClaimSourceRecord {
  itemRef: string;
  sourceId: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  excerpt: string;
  discoveryOnly: boolean;
  stitEngagement: { likes: number | null; comments: number | null; shares: number | null } | null;
}

export interface KvorumClaimRecord {
  schemaVersion: "kvorum-claim/1";
  id: string;
  ventureId: "kvorum";
  recommendationId: string;
  recommendationRef: string;
  recommendationStatus: "approved-draft" | "posted";
  monitorDate: string;
  receiptRef: string;
  clusterId: string;
  claimId: string;
  claim: string;
  type: "fact-multi" | "fact-single" | "commentary";
  refs: KvorumClaimSourceRecord[];
  status: "standing" | "corrected" | "retracted";
  correctionRef: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  postedUrl: string | null;
}

export type KvorumClaimAction = {
  action: "draft-correction";
  ref: string;
  resolution: "corrected" | "retracted";
};

export interface KvorumClaimActionResult {
  claim: KvorumClaimRecord;
  correction: KvorumRecommendation;
  correctionRef: string;
  idempotent: boolean;
  persistence: "filesystem" | "github";
  commits: string[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonempty(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function claimRef(value: unknown): string | null {
  return typeof value === "string"
    && /^state\/ventures\/kvorum\/claims\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(value)
    ? value
    : null;
}

function recommendationRef(value: unknown): string | null {
  return typeof value === "string"
    && /^state\/ventures\/kvorum\/recommendations\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(value)
    ? value
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function parseKvorumClaimAction(value: unknown): KvorumClaimAction | null {
  const body = object(value);
  if (!body || !exactKeys(body, ["action", "ref", "resolution"]) || body.action !== "draft-correction") return null;
  const ref = claimRef(body.ref);
  if (!ref || (body.resolution !== "corrected" && body.resolution !== "retracted")) return null;
  return { action: "draft-correction", ref, resolution: body.resolution };
}

function parseClaimSource(value: unknown): KvorumClaimSourceRecord | null {
  const source = object(value);
  const engagement = object(source?.stitEngagement);
  if (!source || !nonempty(source.itemRef, 40) || !nonempty(source.sourceId, 120)
    || !nonempty(source.sourceName, 120) || !nonempty(source.url, 2_000)
    || !nonempty(source.publishedAt, 40) || !nonempty(source.excerpt, 600)
    || typeof source.discoveryOnly !== "boolean"
    || (source.stitEngagement !== null && (!engagement || !nullableNumber(engagement.likes)
      || !nullableNumber(engagement.comments) || !nullableNumber(engagement.shares)))) return null;
  return source as unknown as KvorumClaimSourceRecord;
}

export function parseKvorumClaim(value: unknown): KvorumClaimRecord {
  const entry = object(value);
  if (!entry || entry.schemaVersion !== "kvorum-claim/1" || entry.ventureId !== "kvorum"
    || !nonempty(entry.id, 120) || !nonempty(entry.recommendationId, 120)
    || !recommendationRef(entry.recommendationRef)
    || !["approved-draft", "posted"].includes(String(entry.recommendationStatus))
    || !nonempty(entry.monitorDate, 10) || !nonempty(entry.receiptRef, 160)
    || !nonempty(entry.clusterId, 40) || !nonempty(entry.claimId, 120)
    || !nonempty(entry.claim, 1_000) || !["fact-multi", "fact-single", "commentary"].includes(String(entry.type))
    || !Array.isArray(entry.refs) || entry.refs.length === 0
    || entry.refs.map(parseClaimSource).some((source) => source === null)
    || !["standing", "corrected", "retracted"].includes(String(entry.status))
    || (entry.correctionRef !== null && !recommendationRef(entry.correctionRef))
    || !nonempty(entry.createdAt, 40) || !nonempty(entry.updatedAt, 40)
    || (entry.publishedAt !== null && !nonempty(entry.publishedAt, 40))
    || (entry.postedUrl !== null && !nonempty(entry.postedUrl, 2_000))) {
    throw new KvorumRecommendationPersistenceError("CORRUPT", "The saved Kvórum claim is malformed.");
  }
  const parsed = entry as unknown as KvorumClaimRecord;
  const unpublished = parsed.publishedAt === null && parsed.postedUrl === null;
  const published = parsed.publishedAt !== null && parsed.postedUrl !== null;
  if ((parsed.status === "standing") !== (parsed.correctionRef === null)
    || (parsed.recommendationStatus === "approved-draft" ? !unpublished : !published)
    || (parsed.type === "fact-multi" && parsed.refs.length < 2)
    || (parsed.type !== "commentary" && parsed.refs.some((source) => source.discoveryOnly))) {
    throw new KvorumRecommendationPersistenceError("CORRUPT", "The saved Kvórum claim has an impossible lifecycle.");
  }
  return parsed;
}

function recommendationSlug(entry: KvorumRecommendation): string {
  const prefix = `kv-${entry.date}-`;
  const slug = entry.id.startsWith(prefix) ? entry.id.slice(prefix.length) : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new KvorumRecommendationPersistenceError("CORRUPT", "The recommendation id cannot address its claims.");
  }
  return slug;
}

function claimAddress(entry: KvorumRecommendation, sourceClaimId: string): { id: string; ref: string } {
  const candidate = `${recommendationSlug(entry)}-${sourceClaimId}`;
  const slug = candidate.length <= 100
    ? candidate
    : `${candidate.slice(0, 89).replace(/-+$/u, "")}-${createHash("sha256").update(candidate).digest("hex").slice(0, 10)}`;
  return {
    id: `kv-claim-${entry.date}-${slug}`,
    ref: `state/ventures/kvorum/claims/${entry.date}-${slug}.json`
  };
}

function recordFromRecommendation(
  entry: KvorumRecommendation,
  ref: string,
  claim: KvorumRecommendation["evidence"]["claims"][number],
  at: string
): KvorumClaimRecord {
  const sourceByRef = new Map(entry.evidence.sources.map((source) => [source.itemRef, source]));
  const stitByRef = new Map((entry.evidence.stitAttribution?.posts ?? []).map((post) => [post.itemRef, post.engagement]));
  const sources = claim.refs.map((itemRef) => {
    const source = sourceByRef.get(itemRef);
    if (!source) throw new KvorumRecommendationPersistenceError("CORRUPT", `Claim ${claim.id} lost source ${itemRef}.`);
    return {
      ...source,
      stitEngagement: source.discoveryOnly ? stitByRef.get(itemRef) ?? null : null
    };
  });
  if (sources.some((source) => source.discoveryOnly && source.stitEngagement === null)) {
    throw new KvorumRecommendationPersistenceError("CORRUPT", `Claim ${claim.id} lost its internal Štít context.`);
  }
  const address = claimAddress(entry, claim.id);
  return {
    schemaVersion: "kvorum-claim/1",
    id: address.id,
    ventureId: "kvorum",
    recommendationId: entry.id,
    recommendationRef: ref,
    recommendationStatus: entry.status === "posted" ? "posted" : "approved-draft",
    monitorDate: entry.evidence.monitorDate,
    receiptRef: entry.evidence.receiptRef,
    clusterId: entry.evidence.clusterId,
    claimId: claim.id,
    claim: claim.text,
    type: claim.type,
    refs: sources,
    status: "standing",
    correctionRef: null,
    createdAt: entry.owner.approvedAt ?? at,
    updatedAt: entry.status === "posted" ? entry.owner.postedAt ?? at : entry.owner.approvedAt ?? at,
    publishedAt: entry.status === "posted" ? entry.owner.postedAt : null,
    postedUrl: entry.status === "posted" ? entry.owner.postedUrl : null
  };
}

function immutableClaim(record: KvorumClaimRecord): unknown {
  return {
    schemaVersion: record.schemaVersion,
    id: record.id,
    ventureId: record.ventureId,
    recommendationId: record.recommendationId,
    recommendationRef: record.recommendationRef,
    monitorDate: record.monitorDate,
    receiptRef: record.receiptRef,
    clusterId: record.clusterId,
    claimId: record.claimId,
    claim: record.claim,
    type: record.type,
    refs: record.refs,
    createdAt: record.createdAt
  };
}

export async function syncKvorumClaimsForRecommendation(
  entry: KvorumRecommendation,
  ref: string,
  options: { root?: string; now?: Date } = {}
): Promise<{ refs: string[]; commits: string[]; idempotent: boolean }> {
  if (entry.status !== "approved" && entry.status !== "posted") return { refs: [], commits: [], idempotent: true };
  const root = options.root ?? kvorumRepositoryRoot();
  const now = options.now ?? new Date();
  const results = [];
  for (const claim of entry.evidence.claims) {
    const address = claimAddress(entry, claim.id);
    const desired = recordFromRecommendation(entry, ref, claim, now.toISOString());
    results.push(await persistKvorum(address.ref, (current) => {
      if (current === null) return { value: desired, idempotent: false };
      const saved = parseKvorumClaim(current);
      if (JSON.stringify(immutableClaim(saved)) !== JSON.stringify(immutableClaim(desired))) {
        throw new KvorumRecommendationPersistenceError("CONFLICT", `Claim ${saved.id} no longer matches its approved recommendation.`);
      }
      if (entry.status === "approved") return { value: saved, idempotent: true };
      if (saved.recommendationStatus === "posted") {
        if (saved.publishedAt !== desired.publishedAt || saved.postedUrl !== desired.postedUrl) {
          throw new KvorumRecommendationPersistenceError("CONFLICT", `Claim ${saved.id} already has a different manual post receipt.`);
        }
        return { value: saved, idempotent: true };
      }
      return {
        value: {
          ...saved,
          recommendationStatus: "posted" as const,
          updatedAt: desired.updatedAt,
          publishedAt: desired.publishedAt,
          postedUrl: desired.postedUrl
        },
        idempotent: false
      };
    }, `admin: sync Kvórum claim ${desired.id}`, root));
  }
  return {
    refs: entry.evidence.claims.map((claim) => claimAddress(entry, claim.id).ref),
    commits: [...new Set(results.flatMap((result) => result.commit ? [result.commit] : []))],
    idempotent: results.every((result) => result.idempotent)
  };
}

function correctionAddress(claim: KvorumClaimRecord, date: string): { id: string; ref: string; slug: string } {
  const digest = createHash("sha256").update(claim.id).digest("hex").slice(0, 10);
  const claimSlug = claim.claimId.slice(0, 32).replace(/-+$/u, "") || "claim";
  const slug = `correction-${claimSlug}-${digest}`;
  return {
    slug,
    id: `kv-${date}-${slug}`,
    ref: `state/ventures/kvorum/recommendations/${date}-${slug}.json`
  };
}

function correctionRecommendation(
  claim: KvorumClaimRecord,
  resolution: "corrected" | "retracted",
  at: string
): { value: KvorumRecommendation; ref: string } {
  const date = at.slice(0, 10);
  const address = correctionAddress(claim, date);
  const resolutionCs = resolution === "corrected" ? "opravujeme" : "stahujeme";
  const original = claim.claim.length > 180 ? `${claim.claim.slice(0, 177)}…` : claim.claim;
  const notice = `Dříve jsme uvedli: „${claim.claim}“ Toto tvrzení ${resolutionCs}. Původní záznam a zdroje zůstávají dohledatelné.`;
  const discovery = claim.refs.filter((source) => source.discoveryOnly);
  const value: KvorumRecommendation = {
    schemaVersion: "venture-recommendation/1",
    id: address.id,
    ventureId: "kvorum",
    date,
    createdAt: at,
    updatedAt: at,
    status: "draft",
    headline: `${resolution === "corrected" ? "Oprava" : "Stažení tvrzení"}: ${original}`,
    summary: notice,
    whyItMatters: "Dohledatelná oprava drží veřejný záznam přesnější než tiché přepsání původního tvrzení.",
    whyThisIsWorthIt: "Rychlá, zdrojovaná oprava je součást redakčního produktu a zachovává původní stopu.",
    ourAngle: "Popsat přesně, které tvrzení měníme, a ponechat vedle něj původní zdroje.",
    ourAngleDiffers: "Opravu připravujeme jako samostatný obsah; nemažeme původní záznam ani nepředstíráme, že už byla zveřejněna.",
    platforms: ["threads"],
    formats: ["thread"],
    copyBlocks: [{
      id: "threads-thread-cs",
      platform: "threads",
      format: "thread",
      locale: "cs",
      text: notice,
      altText: null,
      reason: "Textová oprava drží změnu, původní tvrzení a zdrojovou stopu v jednom návrhu."
    }],
    evidence: {
      kind: "monitor-cluster",
      monitorDate: claim.monitorDate,
      receiptRef: claim.receiptRef,
      clusterId: claim.clusterId,
      continuationOf: claim.recommendationId,
      sources: claim.refs.map((source) => ({
        itemRef: source.itemRef,
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        url: source.url,
        publishedAt: source.publishedAt,
        excerpt: source.excerpt,
        discoveryOnly: source.discoveryOnly
      })),
      claims: [{
        id: "claim-correction-notice",
        type: "commentary",
        text: `Tvrzení ${claim.claimId} bylo označeno jako ${resolution}.`,
        refs: claim.refs.map((source) => source.itemRef)
      }],
      stitAttribution: discovery.length ? {
        internalOnly: true,
        summary: "Původní discovery kontext zůstává interní a není důkazem opravy.",
        posts: discovery.map((source) => ({
          itemRef: source.itemRef,
          postUrl: source.url,
          excerpt: source.excerpt,
          engagement: source.stitEngagement!
        }))
      } : null
    },
    gateResults: {
      evaluatedAt: at,
      passed: true,
      results: [{
        gate: "correction-record",
        verdict: "pass",
        message: "The correction draft preserves the original claim and every retained source ref.",
        claimIds: ["claim-correction-notice"]
      }]
    },
    designLab: {
      status: "not-requested",
      requestedAt: null,
      resolvedAt: null,
      recipeRef: null,
      artifactRefs: [],
      failureReason: null
    },
    owner: {
      postingMode: "manual-only",
      approvedAt: null,
      postedAt: null,
      archivedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      postedUrl: null,
      resultRefs: [],
      ratingRef: null,
      original: null,
      editHistory: []
    }
  };
  return { value, ref: address.ref };
}

async function syncCorrectionIndex(
  correction: KvorumRecommendation,
  ref: string,
  root: string
) {
  return persistKvorum(INDEX_REF, (current) => {
    const queueEntry = {
      id: correction.id,
      ref,
      clusterId: correction.evidence.clusterId,
      status: "draft",
      headline: correction.headline,
      createdAt: correction.createdAt
    };
    const existing = object(current);
    if (!existing || existing.date !== correction.date || !Array.isArray(existing.queue)) {
      return {
        value: {
          schemaVersion: "kvorum-recommendation-index/1",
          date: correction.date,
          generatedAt: correction.createdAt,
          queue: [queueEntry]
        },
        idempotent: false
      };
    }
    const match = existing.queue.find((entry) => object(entry)?.ref === ref);
    if (match) {
      if (JSON.stringify(match) !== JSON.stringify(queueEntry)) {
        throw new KvorumRecommendationPersistenceError("CONFLICT", "The correction draft has a different queue entry.");
      }
      return { value: current, idempotent: true };
    }
    const value = structuredClone(existing);
    value.generatedAt = correction.createdAt;
    value.queue = [...value.queue as unknown[], queueEntry];
    return { value, idempotent: false };
  }, `admin: queue Kvórum correction ${correction.id}`, root);
}

export async function applyKvorumClaimAction(
  input: KvorumClaimAction,
  options: { root?: string; now?: Date } = {}
): Promise<KvorumClaimActionResult> {
  const root = options.root ?? kvorumRepositoryRoot();
  const now = options.now ?? new Date();
  const observed = await persistKvorum(input.ref, (current) => {
    if (current === null) throw new KvorumRecommendationPersistenceError("CONFLICT", "That Kvórum claim no longer exists.");
    return { value: parseKvorumClaim(current), idempotent: true };
  }, "admin: read Kvórum claim for correction", root);
  const claim = observed.value;
  if (claim.recommendationStatus !== "posted") {
    throw new KvorumRecommendationPersistenceError("CONFLICT", "Only a manually posted claim can receive a correction draft.");
  }
  if (claim.status !== "standing" && claim.status !== input.resolution) {
    throw new KvorumRecommendationPersistenceError("CONFLICT", `A ${claim.status} claim cannot become ${input.resolution}.`);
  }
  if (Date.parse(now.toISOString()) < Date.parse(claim.updatedAt)) {
    throw new KvorumRecommendationPersistenceError("CONFLICT", "The correction action predates the saved claim.");
  }
  const draftAt = claim.status === "standing" ? now.toISOString() : claim.updatedAt;
  const correction = correctionRecommendation(claim, input.resolution, draftAt);
  if (claim.correctionRef !== null && claim.correctionRef !== correction.ref) {
    throw new KvorumRecommendationPersistenceError("CONFLICT", "That claim already points to a different correction draft.");
  }
  const savedCorrection = await persistKvorum(correction.ref, (current) => {
    if (current === null) return { value: correction.value, idempotent: false };
    if (JSON.stringify(current) !== JSON.stringify(correction.value)) {
      throw new KvorumRecommendationPersistenceError("CONFLICT", "A different correction recommendation already exists.");
    }
    return { value: correction.value, idempotent: true };
  }, `admin: draft Kvórum ${input.resolution} notice`, root);
  const index = await syncCorrectionIndex(correction.value, correction.ref, root);
  const changedClaim = await persistKvorum(input.ref, (current) => {
    if (current === null) throw new KvorumRecommendationPersistenceError("CONFLICT", "That Kvórum claim no longer exists.");
    const latest = parseKvorumClaim(current);
    if (latest.status === input.resolution && latest.correctionRef === correction.ref) {
      return { value: latest, idempotent: true };
    }
    if (latest.status !== "standing") {
      throw new KvorumRecommendationPersistenceError("CONFLICT", `A ${latest.status} claim cannot become ${input.resolution}.`);
    }
    return {
      value: { ...latest, status: input.resolution, correctionRef: correction.ref, updatedAt: draftAt },
      idempotent: false
    };
  }, `admin: mark Kvórum claim ${input.resolution}`, root);
  const commits = [savedCorrection.commit, index.commit, changedClaim.commit]
    .filter((commit): commit is string => typeof commit === "string");
  return {
    claim: changedClaim.value,
    correction: savedCorrection.value,
    correctionRef: correction.ref,
    idempotent: savedCorrection.idempotent && index.idempotent && changedClaim.idempotent,
    persistence: changedClaim.persistence,
    commits: [...new Set(commits)]
  };
}
