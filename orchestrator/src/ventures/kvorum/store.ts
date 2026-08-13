import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  KvorumPackageGateEvaluation,
  TribunPackage
} from "../../contracts/kvorum-desk.js";
import type { KvorumMonitorReceipt } from "../../contracts/kvorum-monitor.js";
import {
  KvorumRecommendationSchema,
  KvorumRecommendationStatusSchema,
  type KvorumRecommendation
} from "../../contracts/kvorum-recommendation.js";
import { atomicWriteJson, resolveStatePath, withFileLock } from "../../state.js";
import { kvorumMonitorItemRef } from "./cluster.js";

const RECOMMENDATION_DIRECTORY = "ventures/kvorum/recommendations";
const INDEX_PATH = `${RECOMMENDATION_DIRECTORY}/index.json`;
const MAX_RECOMMENDATION_SLUG = 64;

export const KvorumRecommendationIndexSchema = z.strictObject({
  schemaVersion: z.literal("kvorum-recommendation-index/1"),
  date: z.iso.date(),
  generatedAt: z.iso.datetime({ offset: true }),
  queue: z.array(z.strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    ref: z.string().regex(/^state\/ventures\/kvorum\/recommendations\/\d{4}-\d{2}-\d{2}-.+\.json$/u).max(220),
    clusterId: z.string().regex(/^[a-f0-9]{40}$/),
    status: KvorumRecommendationStatusSchema,
    headline: z.string().trim().min(1).max(240),
    createdAt: z.iso.datetime({ offset: true })
  })).max(20)
}).superRefine((index, context) => {
  const ids = new Set<string>();
  const clusters = new Set<string>();
  for (const [entryIndex, entry] of index.queue.entries()) {
    if (ids.has(entry.id)) {
      context.addIssue({ code: "custom", message: "Queue recommendation ids must be unique", path: ["queue", entryIndex, "id"] });
    }
    if (clusters.has(entry.clusterId)) {
      context.addIssue({ code: "custom", message: "A day may queue one recommendation per cluster", path: ["queue", entryIndex, "clusterId"] });
    }
    ids.add(entry.id);
    clusters.add(entry.clusterId);
  }
});

export type KvorumRecommendationIndex = z.infer<typeof KvorumRecommendationIndexSchema>;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, MAX_RECOMMENDATION_SLUG)
    .replace(/-+$/gu, "");
  return slug || "recommendation";
}

function recordPath(date: string, slug: string): string {
  return `${RECOMMENDATION_DIRECTORY}/${date}-${slug}.json`;
}

async function loadRecommendationFiles(root: string): Promise<Array<{
  filename: string;
  relativePath: string;
  recommendation: KvorumRecommendation;
}>> {
  const directory = resolveStatePath(root, RECOMMENDATION_DIRECTORY);
  const filenames = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const records = [];
  for (const filename of filenames.filter((entry) => /^\d{4}-\d{2}-\d{2}-.+\.json$/u.test(entry)).sort()) {
    const relativePath = `${RECOMMENDATION_DIRECTORY}/${filename}`;
    records.push({
      filename,
      relativePath,
      recommendation: KvorumRecommendationSchema.parse(JSON.parse(
        await readFile(resolveStatePath(root, relativePath), "utf8")
      ) as unknown)
    });
  }
  return records;
}

function collisionSafeSlug(input: {
  date: string;
  headline: string;
  clusterId: string;
  files: readonly { filename: string }[];
}): string {
  const base = slugify(input.headline);
  const names = new Set(input.files.map((file) => file.filename));
  if (!names.has(`${input.date}-${base}.json`)) return base;
  for (const suffixLength of [8, 12, 16, 20, 40]) {
    const suffix = input.clusterId.slice(0, suffixLength);
    const candidate = `${base.slice(0, MAX_RECOMMENDATION_SLUG - suffix.length - 1).replace(/-+$/gu, "")}-${suffix}`;
    if (!names.has(`${input.date}-${candidate}.json`)) return candidate;
  }
  throw new Error(`No collision-safe recommendation filename remained for cluster ${input.clusterId}.`);
}

function copyBlocks(candidate: TribunPackage) {
  return candidate.targets.map((target, index) => ({
    id: `copy-${index + 1}-${target.platform}-${target.format}-cs`,
    platform: target.platform,
    format: target.format,
    locale: "cs" as const,
    text: target.copy,
    altText: target.altText,
    reason: target.reason
  }));
}

function buildRecommendation(input: {
  date: string;
  now: Date;
  slug: string;
  candidate: TribunPackage;
  evaluation: KvorumPackageGateEvaluation;
  receipt: KvorumMonitorReceipt;
}): KvorumRecommendation {
  if (!input.evaluation.passed || input.evaluation.clusterId !== input.candidate.clusterId) {
    throw new Error("Only a matching, fully gated Kvórum package can enter the recommendation store.");
  }
  const cluster = input.receipt.clusters.find((entry) => entry.id === input.candidate.clusterId);
  if (!cluster) throw new Error(`Kvórum cluster ${input.candidate.clusterId} is missing from its receipt.`);
  const rawItems = new Map(input.receipt.rawItems.map((item) => [kvorumMonitorItemRef(item), item]));
  const discovery = cluster.attributions.filter((source) =>
    source.discoveryOnly || source.sourceId === "stit-demokracie-facebook"
  );
  const stitSummary = input.candidate.stitAttribution?.summary;
  if (discovery.length > 0 && !stitSummary) {
    throw new Error("A discovery-backed package requires its internal Štít summary.");
  }
  const stitAttribution = discovery.length === 0
    ? null
    : {
        internalOnly: true as const,
        summary: stitSummary!,
        posts: discovery.map((source) => {
          const item = rawItems.get(source.itemRef);
          if (!item || !("stit" in item)) {
            throw new Error(`Štít item ${source.itemRef} is missing from the retained monitor receipt.`);
          }
          return {
            itemRef: source.itemRef,
            postUrl: source.url,
            excerpt: source.excerpt,
            engagement: {
              likes: item.stit.likes,
              comments: item.stit.comments,
              shares: item.stit.shares
            }
          };
        })
      };
  const createdAt = input.now.toISOString();
  return KvorumRecommendationSchema.parse({
    schemaVersion: "venture-recommendation/1",
    id: `kv-${input.date}-${input.slug}`,
    ventureId: "kvorum",
    date: input.date,
    createdAt,
    updatedAt: createdAt,
    status: "draft",
    headline: input.candidate.headline,
    summary: input.candidate.summary.text,
    whyItMatters: input.candidate.whyItMatters.text,
    whyThisIsWorthIt: input.candidate.whyThisIsWorthIt,
    ourAngle: input.candidate.ourAngle,
    ourAngleDiffers: input.candidate.ourAngleDiffers,
    platforms: unique(input.candidate.targets.map((target) => target.platform)),
    formats: unique(input.candidate.targets.map((target) => target.format)),
    copyBlocks: copyBlocks(input.candidate),
    evidence: {
      kind: "monitor-cluster",
      monitorDate: input.date,
      receiptRef: `state/ventures/kvorum/monitor/${input.date}.json`,
      clusterId: cluster.id,
      continuationOf: cluster.continuationOf,
      sources: cluster.attributions,
      claims: input.candidate.claims,
      stitAttribution
    },
    gateResults: {
      evaluatedAt: createdAt,
      passed: true,
      results: input.evaluation.results
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
  });
}

function buildIndex(
  date: string,
  now: Date,
  files: readonly { relativePath: string; recommendation: KvorumRecommendation }[]
): KvorumRecommendationIndex {
  return KvorumRecommendationIndexSchema.parse({
    schemaVersion: "kvorum-recommendation-index/1",
    date,
    generatedAt: now.toISOString(),
    queue: files
      .filter((file) => file.recommendation.date === date)
      .map((file) => ({
        id: file.recommendation.id,
        ref: `state/${file.relativePath}`,
        clusterId: file.recommendation.evidence.clusterId,
        status: file.recommendation.status,
        headline: file.recommendation.headline,
        createdAt: file.recommendation.createdAt
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  });
}

export async function writeKvorumRecommendationDay(input: {
  root: string;
  date: string;
  now: Date;
  receipt: KvorumMonitorReceipt;
  packages: readonly TribunPackage[];
  gateEvaluations: readonly KvorumPackageGateEvaluation[];
}): Promise<{
  recommendations: KvorumRecommendation[];
  index: KvorumRecommendationIndex;
  created: number;
  artifacts: string[];
}> {
  return withFileLock(input.root, `${RECOMMENDATION_DIRECTORY}/.lock`, async () => {
    let files = await loadRecommendationFiles(input.root);
    const recommendations: KvorumRecommendation[] = [];
    const artifacts: string[] = [];
    let created = 0;
    const handledClusters = new Set<string>();
    for (const candidate of input.packages) {
      if (handledClusters.has(candidate.clusterId)) continue;
      handledClusters.add(candidate.clusterId);
      const existing = files.find((file) =>
        file.recommendation.date === input.date
        && file.recommendation.evidence.clusterId === candidate.clusterId
      );
      if (existing) {
        recommendations.push(existing.recommendation);
        continue;
      }
      const evaluation = input.gateEvaluations.find((entry) =>
        entry.passed && entry.clusterId === candidate.clusterId
      );
      if (!evaluation) throw new Error(`Kvórum package ${candidate.clusterId} has no passing gate evaluation.`);
      const slug = collisionSafeSlug({
        date: input.date,
        headline: candidate.headline,
        clusterId: candidate.clusterId,
        files
      });
      const recommendation = buildRecommendation({
        date: input.date,
        now: input.now,
        slug,
        candidate,
        evaluation,
        receipt: input.receipt
      });
      const relativePath = recordPath(input.date, slug);
      await atomicWriteJson(input.root, relativePath, recommendation);
      files = [...files, { filename: path.basename(relativePath), relativePath, recommendation }];
      recommendations.push(recommendation);
      artifacts.push(relativePath);
      created += 1;
    }
    const index = buildIndex(input.date, input.now, files);
    await atomicWriteJson(input.root, INDEX_PATH, index);
    artifacts.push(INDEX_PATH);
    return { recommendations, index, created, artifacts };
  });
}
