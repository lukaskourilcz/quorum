import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { KvorumEntityLexicon } from "../../contracts/kvorum-entities.js";
import {
  KvorumPackageGateEvaluationSchema,
  TribunPackageSchema,
  type KvorumGateResult,
  type KvorumPackageGateEvaluation,
  type TribunPackage
} from "../../contracts/kvorum-desk.js";
import type {
  KvorumMonitorCluster,
  KvorumMonitorItem,
  KvorumMonitorReceipt
} from "../../contracts/kvorum-monitor.js";
import { configRoot } from "../../paths.js";
import { kvorumMonitorItemRef } from "./cluster.js";
import { evaluateKvorumContentGates } from "./content-gates.js";

const DuplicatePolicySchema = z.object({
  duplicateThreshold: z.number().finite().min(0).max(1)
});
const Sha1Pattern = /^[a-f0-9]{40}$/u;
const QUOTED_TEXT = /„([^“\n]{2,500})“|“([^”\n]{2,500})”|"([^"\n]{2,500})"/gu;
const MIN_ORIGINALITY_CHARS = 24;

export interface KvorumGateBatch {
  accepted: TribunPackage[];
  droppedCount: number;
  evaluations: KvorumPackageGateEvaluation[];
}

interface CandidateBlock {
  text: string;
  claimId: string | null;
}

export async function loadKvorumDuplicateThreshold(): Promise<number> {
  const policy = DuplicatePolicySchema.parse(JSON.parse(
    await readFile(path.join(configRoot, "social-policy.json"), "utf8")
  ) as unknown);
  return policy.duplicateThreshold;
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function trigrams(value: string): Set<string> {
  const normalized = normalizedText(value);
  if (normalized.length < 3) return new Set(normalized ? [normalized] : []);
  return new Set(Array.from({ length: normalized.length - 2 }, (_, index) =>
    normalized.slice(index, index + 3)
  ));
}

/** Overlap coefficient catches copied short blocks even when their source article is longer. */
export function kvorumTrigramOverlap(left: string, right: string): number {
  const leftSet = trigrams(left);
  const rightSet = trigrams(right);
  const denominator = Math.min(leftSet.size, rightSet.size);
  if (denominator === 0) return 0;
  let shared = 0;
  for (const trigram of leftSet) if (rightSet.has(trigram)) shared += 1;
  return Number((shared / denominator).toFixed(6));
}

function quotes(value: string): string[] {
  return [...value.matchAll(QUOTED_TEXT)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .filter(Boolean);
}

function withoutQuotes(value: string): string {
  return value.replace(QUOTED_TEXT, " ");
}

function candidateBlocks(candidate: TribunPackage): CandidateBlock[] {
  return [
    { text: candidate.headline, claimId: null },
    { text: candidate.summary.text, claimId: null },
    { text: candidate.whyItMatters.text, claimId: null },
    { text: candidate.whyThisIsWorthIt, claimId: null },
    { text: candidate.ourAngle, claimId: null },
    { text: candidate.ourAngleDiffers, claimId: null },
    ...candidate.targets.flatMap((target) => [
      { text: target.copy, claimId: null },
      ...(target.altText ? [{ text: target.altText, claimId: null }] : [])
    ]),
    ...candidate.claims.map((claim) => ({ text: claim.text, claimId: claim.id }))
  ];
}

function gate(
  id: string,
  failures: readonly string[],
  passMessage: string,
  claimIds: readonly string[] = []
): KvorumGateResult {
  return {
    gate: id,
    verdict: failures.length === 0 ? "pass" : "fail",
    message: failures.length === 0 ? passMessage : failures.join(" ").slice(0, 800),
    claimIds: [...new Set(claimIds)].sort()
  };
}

function sourceDomain(item: KvorumMonitorItem): string {
  const labels = new URL(item.url).hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "").split(".");
  return labels.length > 1 ? labels.slice(-2).join(".") : labels[0]!;
}

function clusterItems(input: {
  receipt: KvorumMonitorReceipt;
  cluster: KvorumMonitorCluster | undefined;
}): Map<string, KvorumMonitorItem> {
  const retained = new Map(input.receipt.rawItems.map((item) => [kvorumMonitorItemRef(item), item]));
  return new Map((input.cluster?.itemRefs ?? [])
    .map((ref) => [ref, retained.get(ref)] as const)
    .filter((entry): entry is readonly [string, KvorumMonitorItem] => Boolean(entry[1])));
}

function eligibleEvidence(source: KvorumMonitorCluster["attributions"][number] | undefined): boolean {
  return Boolean(source && !source.discoveryOnly && source.sourceId !== "stit-demokracie-facebook");
}

function claimResolutionGate(
  candidate: TribunPackage,
  cluster: KvorumMonitorCluster | undefined,
  items: ReadonlyMap<string, KvorumMonitorItem>
): KvorumGateResult {
  const failures: string[] = [];
  const claimIds: string[] = [];
  if (!cluster) failures.push("The candidate cluster does not resolve in the retained digest.");
  const attribution = new Map(cluster?.attributions.map((source) => [source.itemRef, source]) ?? []);
  const discoveryRefs = (cluster?.attributions ?? [])
    .filter((source) => source.discoveryOnly || source.sourceId === "stit-demokracie-facebook")
    .map((source) => source.itemRef)
    .sort();
  const candidateDiscoveryRefs = [...(candidate.stitAttribution?.itemRefs ?? [])].sort();
  if (JSON.stringify(discoveryRefs) !== JSON.stringify(candidateDiscoveryRefs)) {
    failures.push("The internal Štít attribution block does not match the cluster's discovery-only refs.");
  }
  const factualBlocks = [
    { label: "summary", refs: candidate.summary.refs },
    { label: "why-it-matters", refs: candidate.whyItMatters.refs }
  ];
  for (const block of factualBlocks) {
    const invalid = block.refs.filter((ref) => !items.has(ref) || !eligibleEvidence(attribution.get(ref)));
    if (invalid.length > 0) failures.push(`The ${block.label} block has ${invalid.length} unresolved or discovery-only ref${invalid.length === 1 ? "" : "s"}.`);
  }
  for (const claim of candidate.claims) {
    const unresolved = claim.refs.filter((ref) => !items.has(ref) || !attribution.has(ref));
    if (unresolved.length > 0) {
      failures.push(`Claim ${claim.id} has ${unresolved.length} ref${unresolved.length === 1 ? "" : "s"} outside its cluster.`);
      claimIds.push(claim.id);
    }
    if (claim.type === "commentary") continue;
    const direct = claim.refs.filter((ref) => items.has(ref) && eligibleEvidence(attribution.get(ref)));
    if (direct.length !== claim.refs.length) {
      failures.push(`Factual claim ${claim.id} uses discovery-only or unresolved evidence.`);
      claimIds.push(claim.id);
    }
    if (claim.type === "fact-multi") {
      const domains = new Set(direct.map((ref) => sourceDomain(items.get(ref)!)));
      if (domains.size < 2) {
        failures.push(`Multi-source claim ${claim.id} resolves to fewer than two independent domains.`);
        claimIds.push(claim.id);
      }
    }
  }
  return gate(
    "claim-resolution",
    failures,
    "Every factual block resolves to eligible cluster evidence and every multi-source claim spans two domains.",
    claimIds
  );
}

function quoteGate(
  candidate: TribunPackage,
  cluster: KvorumMonitorCluster | undefined,
  items: ReadonlyMap<string, KvorumMonitorItem>
): KvorumGateResult {
  const failures: string[] = [];
  const claimIds: string[] = [];
  const sourceNames = new Map(cluster?.attributions.map((source) => [source.itemRef, source.sourceName]) ?? []);
  let quoted = 0;
  for (const block of candidateBlocks(candidate)) {
    for (const quote of quotes(block.text)) {
      quoted += 1;
      const exactSources = [...items.entries()].filter(([, item]) => item.text.includes(quote));
      if (exactSources.length === 0) {
        failures.push("A marked quote is not an exact substring of any retained cluster source.");
        if (block.claimId) claimIds.push(block.claimId);
        continue;
      }
      const normalizedBlock = normalizedText(block.text);
      const attributed = exactSources.some(([ref]) => {
        const name = sourceNames.get(ref);
        return name ? normalizedBlock.includes(normalizedText(name)) : false;
      });
      if (!attributed) {
        failures.push("A marked quote does not visibly name its matching source.");
        if (block.claimId) claimIds.push(block.claimId);
      }
    }
  }
  return gate(
    "quote-verification",
    failures,
    quoted === 0
      ? "The candidate contains no marked quotations."
      : `All ${quoted} marked quotation${quoted === 1 ? " is" : "s are"} exact and visibly attributed.`,
    claimIds
  );
}

function originalityGate(
  candidate: TribunPackage,
  items: ReadonlyMap<string, KvorumMonitorItem>,
  duplicateThreshold: number
): KvorumGateResult {
  let maximum = 0;
  for (const block of candidateBlocks(candidate)) {
    const originalText = withoutQuotes(block.text);
    if (normalizedText(originalText).length < MIN_ORIGINALITY_CHARS) continue;
    for (const item of items.values()) {
      maximum = Math.max(maximum, kvorumTrigramOverlap(originalText, item.text));
    }
  }
  const failures = maximum >= duplicateThreshold
    ? [`Draft wording reaches ${maximum.toFixed(3)} trigram overlap, at or above the configured ${duplicateThreshold.toFixed(2)} ceiling.`]
    : [];
  return gate(
    "originality",
    failures,
    `Maximum source overlap ${maximum.toFixed(3)} stays below the configured ${duplicateThreshold.toFixed(2)} ceiling.`
  );
}

function angleGate(candidate: TribunPackage, duplicateThreshold: number): KvorumGateResult {
  const overlap = kvorumTrigramOverlap(candidate.ourAngleDiffers, candidate.summary.text);
  const failures = normalizedText(candidate.ourAngleDiffers) === normalizedText(candidate.summary.text)
    || overlap >= duplicateThreshold
    ? [`The angle-difference field restates the package summary at ${overlap.toFixed(3)} overlap.`]
    : [];
  return gate(
    "angle-distinction",
    failures,
    `The required angle-difference field is distinct from the package summary (${overlap.toFixed(3)} overlap).`
  );
}

function rawClusterId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const clusterId = (value as Record<string, unknown>).clusterId;
  return typeof clusterId === "string" && Sha1Pattern.test(clusterId) ? clusterId : null;
}

export function evaluateKvorumPackages(input: {
  receipt: KvorumMonitorReceipt;
  candidates: readonly unknown[];
  duplicateThreshold: number;
  entityLexicon: KvorumEntityLexicon;
}): KvorumGateBatch {
  const threshold = DuplicatePolicySchema.shape.duplicateThreshold.parse(input.duplicateThreshold);
  const accepted: TribunPackage[] = [];
  const evaluations: KvorumPackageGateEvaluation[] = [];
  for (const [candidateIndex, raw] of input.candidates.entries()) {
    const parsed = TribunPackageSchema.safeParse(raw);
    if (!parsed.success) {
      evaluations.push(KvorumPackageGateEvaluationSchema.parse({
        candidateIndex,
        clusterId: rawClusterId(raw),
        passed: false,
        results: [{
          gate: "schema-validation",
          verdict: "fail",
          message: `Candidate package failed ${parsed.error.issues.length} schema check${parsed.error.issues.length === 1 ? "" : "s"}.`,
          claimIds: []
        }]
      }));
      continue;
    }
    const candidate = parsed.data;
    const cluster = input.receipt.clusters.find((entry) => entry.id === candidate.clusterId);
    const items = clusterItems({ receipt: input.receipt, cluster });
    const results: KvorumGateResult[] = [
      gate("schema-validation", [], "Candidate package matches the closed schema."),
      claimResolutionGate(candidate, cluster, items),
      originalityGate(candidate, items, threshold),
      quoteGate(candidate, cluster, items),
      angleGate(candidate, threshold),
      ...evaluateKvorumContentGates({ candidate, cluster, items, lexicon: input.entityLexicon })
    ];
    const evaluation = KvorumPackageGateEvaluationSchema.parse({
      candidateIndex,
      clusterId: candidate.clusterId,
      passed: results.every((result) => result.verdict === "pass"),
      results
    });
    evaluations.push(evaluation);
    if (evaluation.passed) accepted.push(candidate);
  }
  return {
    accepted,
    droppedCount: evaluations.filter((evaluation) => !evaluation.passed).length,
    evaluations
  };
}
