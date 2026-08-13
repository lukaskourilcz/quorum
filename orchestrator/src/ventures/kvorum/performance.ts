import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { KvorumMonitorReceiptSchema } from "../../contracts/kvorum-monitor.js";
import { KvorumOwnerResultEntrySchema } from "../../contracts/kvorum-owner-result-entry.js";
import { KvorumRecommendationSchema } from "../../contracts/kvorum-recommendation.js";
import {
  PerformanceWeightsSchema,
  applyPerformanceWeightProposal,
  type PerformanceResultEvidence,
  type PerformanceWeightProposal
} from "../../performance/weights.js";
import { repoRoot, stateRoot } from "../../paths.js";
import { atomicWriteJson, readJson, readText, resolveStatePath, withFileLock } from "../../state.js";

export const KVORUM_PERFORMANCE_WEIGHTS_PATH = "ventures/kvorum/performance-weights.json";
const KVORUM_PERFORMANCE_LOCK = "ventures/kvorum/.performance-weights.lock";
export const KVORUM_FORMATS = ["caption", "carousel", "single-image", "thread"] as const;
export const KVORUM_WEIGHTED_TOPICS = [
  "agrofert-conflict",
  "cost-of-living",
  "disinformation",
  "eu-nato-orientation",
  "municipal-elections-2026",
  "public-media-funding",
  "senate-elections-2026",
  "ukraine-aid"
] as const;

export const KvorumPerformanceWeightsSchema = PerformanceWeightsSchema.superRefine((state, context) => {
  if (state.ventureId !== "kvorum") {
    context.addIssue({ code: "custom", message: "Kvórum weights require ventureId kvorum", path: ["ventureId"] });
  }
  const formats = Object.keys(state.formats).sort();
  if (JSON.stringify(formats) !== JSON.stringify([...KVORUM_FORMATS].sort())) {
    context.addIssue({ code: "custom", message: "Kvórum weights require every closed package format", path: ["formats"] });
  }
  const topics = Object.keys(state.topics).sort();
  if (JSON.stringify(topics) !== JSON.stringify([...KVORUM_WEIGHTED_TOPICS].sort())) {
    context.addIssue({ code: "custom", message: "Kvórum weights require every curated topic", path: ["topics"] });
  }
});

export type KvorumPerformanceWeights = z.infer<typeof KvorumPerformanceWeightsSchema>;

function stateRelative(reference: string): string {
  if (!reference.startsWith("state/")) throw new Error(`Performance evidence is not a state ref: ${reference}`);
  return reference.slice("state/".length);
}

export async function loadKvorumPerformanceWeights(root = stateRoot): Promise<KvorumPerformanceWeights> {
  const stored = await readText(root, KVORUM_PERFORMANCE_WEIGHTS_PATH);
  const raw = JSON.parse(stored || await readFile(
    path.join(repoRoot, "state", KVORUM_PERFORMANCE_WEIGHTS_PATH),
    "utf8"
  )) as unknown;
  return KvorumPerformanceWeightsSchema.parse(raw);
}

export function kvorumTopicPerformanceWeight(
  weights: KvorumPerformanceWeights | undefined,
  topic: string
): number {
  return weights?.topics[topic]?.weight ?? 1;
}

export function kvorumFormatPerformanceWeight(
  weights: KvorumPerformanceWeights | undefined,
  format: string
): number {
  return weights?.formats[format]?.weight ?? 1;
}

async function performanceEvidence(
  root: string,
  resultIds: readonly string[]
): Promise<PerformanceResultEvidence[]> {
  const wanted = new Set(resultIds);
  const directory = resolveStatePath(root, "ventures/kvorum/results");
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const results = new Map<string, {
    record: z.infer<typeof KvorumOwnerResultEntrySchema>;
    stateRef: string;
  }>();
  for (const name of names.filter((entry) => /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}\.json$/u.test(entry)).sort()) {
    const record = KvorumOwnerResultEntrySchema.parse(JSON.parse(
      await readFile(path.join(directory, name), "utf8")
    ) as unknown);
    if (!wanted.has(record.id)) continue;
    if (results.has(record.id)) throw new Error(`Performance result id is duplicated: ${record.id}`);
    results.set(record.id, { record, stateRef: `state/ventures/kvorum/results/${name}` });
  }

  const evidence: PerformanceResultEvidence[] = [];
  for (const resultId of [...wanted].sort()) {
    const found = results.get(resultId);
    if (!found) throw new Error(`Performance proposal cannot resolve result ${resultId}.`);
    const recommendation = KvorumRecommendationSchema.parse(await readJson<unknown>(
      root,
      stateRelative(found.record.recommendationRef),
      null
    ));
    if (recommendation.ventureId !== "kvorum" || recommendation.id !== found.record.recommendationId
      || (recommendation.status !== "posted" && recommendation.status !== "archived")
      || recommendation.owner.postedAt !== found.record.postedAt
      || recommendation.owner.postedUrl !== found.record.postUrl
      || !recommendation.owner.resultRefs.includes(found.stateRef)
      || !recommendation.platforms.includes(found.record.platform)
      || recommendation.evidence.kind !== "monitor-cluster") {
      throw new Error(`Performance result ${resultId} does not resolve to its manual post receipt.`);
    }
    const receipt = KvorumMonitorReceiptSchema.parse(await readJson<unknown>(
      root,
      stateRelative(recommendation.evidence.receiptRef),
      null
    ));
    const cluster = receipt.clusters.find((entry) => entry.id === recommendation.evidence.clusterId);
    if (!cluster) throw new Error(`Performance result ${resultId} has no retained topic cluster.`);
    evidence.push({
      resultId,
      formats: recommendation.formats,
      topics: cluster.entityIds
    });
  }
  return evidence;
}

/** The only performance-weights writer: one locked, validated proposal transaction per ISO week. */
export async function writeKvorumPerformanceProposal(input: {
  root?: string;
  proposal: PerformanceWeightProposal;
  now?: Date;
}): Promise<{ state: KvorumPerformanceWeights; idempotent: boolean; artifact: string }> {
  const root = input.root ?? stateRoot;
  const now = input.now ?? new Date();
  return withFileLock(root, KVORUM_PERFORMANCE_LOCK, async () => {
    const current = await loadKvorumPerformanceWeights(root);
    const resultIds = [...new Set(input.proposal.changes.flatMap((change) => change.resultIds))];
    const evidence = await performanceEvidence(root, resultIds);
    const applied = applyPerformanceWeightProposal({ state: current, proposal: input.proposal, evidence, now });
    const state = KvorumPerformanceWeightsSchema.parse(applied.state);
    if (!applied.idempotent) await atomicWriteJson(root, KVORUM_PERFORMANCE_WEIGHTS_PATH, state);
    return {
      state,
      idempotent: applied.idempotent,
      artifact: `state/${KVORUM_PERFORMANCE_WEIGHTS_PATH}`
    };
  });
}
