import { createHash } from "node:crypto";
import { z } from "zod";
import { GoViralIntelligencePacketSchema } from "../../../contracts/venture-capability.js";
import type { WebDevCandidate, WebDevRecord, WebDevSelection } from "../../../contracts/webdev-signal.js";
import { WebDevSelectionSchema } from "../../../contracts/webdev-signal.js";
import type { WebDevSelectionConfig } from "./config.js";
import { buildWebDevRecords, type WebDevSelectionHistoryEntry } from "./records.js";
import { scoreWebDevRecord } from "./scoring.js";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function tokens(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase("en").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/u).filter((word) => word.length > 2));
}

interface GoViralContext {
  status: WebDevSelection["goviral"]["status"];
  packetRef: string | null;
  packetHash: string | null;
  observedAt: string | null;
  expiresAt: string | null;
  evidenceRefs: string[];
  topic: string | null;
  velocity: number | null;
}

function resolveGoViral(input: {
  packet?: unknown;
  packetRef?: string | null;
  capabilityDecision?: "allowed" | "held" | "denied";
  now: string;
}): GoViralContext {
  if (input.capabilityDecision === "denied") {
    return { status: "denied", packetRef: input.packetRef ?? null, packetHash: null, observedAt: null, expiresAt: null, evidenceRefs: [], topic: null, velocity: null };
  }
  if (input.capabilityDecision !== "allowed" || input.packet === undefined || input.packet === null) {
    return { status: "unavailable", packetRef: null, packetHash: null, observedAt: null, expiresAt: null, evidenceRefs: [], topic: null, velocity: null };
  }
  const parsed = GoViralIntelligencePacketSchema.safeParse(input.packet);
  if (!parsed.success) {
    return { status: "malformed", packetRef: input.packetRef ?? null, packetHash: null, observedAt: null, expiresAt: null, evidenceRefs: [], topic: null, velocity: null };
  }
  const packet = parsed.data;
  const context = {
    packetRef: input.packetRef ?? packet.evidenceRefs[0]!,
    packetHash: hash(packet),
    observedAt: packet.measuredAt,
    expiresAt: packet.expiresAt,
    evidenceRefs: packet.evidenceRefs,
    topic: packet.topic,
    velocity: packet.velocity
  };
  return Date.parse(packet.expiresAt) <= Date.parse(input.now)
    ? { ...context, status: "stale" }
    : { ...context, status: "available-unused" };
}

function goViralContribution(context: GoViralContext, record: WebDevRecord, config: WebDevSelectionConfig): number {
  if (context.status !== "available-unused" || context.velocity === null || context.velocity <= 0 || context.topic === null) return 0;
  const topic = tokens(context.topic);
  const recordTerms = tokens(`${record.project} ${record.topic} ${record.title}`);
  if (![...topic].some((word) => recordTerms.has(word))) return 0;
  return Math.round(Math.min(config.thresholds.maximumGoViralContribution, context.velocity / 20) * 1_000) / 1_000;
}

export const WebDevSelectionMetricsSchema = z.strictObject({
  schemaVersion: z.literal("webdev-selection-metrics/1"),
  fetchedCandidates: z.number().int().nonnegative(),
  prefilterDrops: z.number().int().nonnegative(),
  dropCounts: z.record(z.string(), z.number().int().nonnegative()),
  exactClusters: z.number().int().nonnegative(),
  fuzzyClusters: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  canonicalRecords: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
  scored: z.number().int().nonnegative(),
  outcome: z.enum(["selected", "NO_EDITION"]),
  reason: z.string().trim().min(1).max(500),
  goviralStatus: z.enum(["unavailable", "available-unused", "used", "stale", "denied", "malformed"]),
  cacheReused: z.number().int().nonnegative(),
  callsAvoided: z.number().int().nonnegative(),
  networkCalls: z.literal(0),
  modelCalls: z.literal(0),
  providerCostUsd: z.literal(0)
});

export type WebDevSelectionMetrics = z.infer<typeof WebDevSelectionMetricsSchema>;

export function decideWebDevEdition(input: {
  candidates: readonly WebDevCandidate[];
  pragueDate: string;
  now: string;
  config: WebDevSelectionConfig;
  history?: readonly WebDevSelectionHistoryEntry[];
  goviralPacket?: unknown;
  goviralPacketRef?: string | null;
  goviralCapabilityDecision?: "allowed" | "held" | "denied";
  ownerCorrectionRef?: string | null;
  supersedesRef?: string | null;
  cacheReused?: number;
  callsAvoided?: number;
}): { records: WebDevRecord[]; selection: WebDevSelection; metrics: WebDevSelectionMetrics } {
  const built = buildWebDevRecords({ candidates: input.candidates, now: input.now, config: input.config, history: input.history });
  const goviral = resolveGoViral({
    packet: input.goviralPacket,
    packetRef: input.goviralPacketRef,
    capabilityDecision: input.goviralCapabilityDecision,
    now: input.now
  });
  const byId = new Map(built.records.map(({ record }) => [record.id, record]));
  const selectionCandidates: WebDevSelection["candidates"] = built.records.map(({ record, gateHint, gateReasons }) => {
    if (gateHint !== "eligible") {
      return { recordId: record.id, gate: gateHint, gateReasons, components: [], baseScore: null, finalScore: null, confidence: null };
    }
    const overlay = goViralContribution(goviral, record, input.config);
    const score = scoreWebDevRecord({ record, now: input.now, config: input.config, goViralContribution: overlay, goViralEvidenceRefs: goviral.evidenceRefs });
    return { recordId: record.id, gate: "eligible", gateReasons, ...score };
  });
  const ranked = selectionCandidates
    .filter((value) => value.gate === "eligible" && value.baseScore !== null && value.finalScore !== null && value.confidence !== null)
    .sort((left, right) => right.finalScore! - left.finalScore!
      || byId.get(right.recordId)!.publishedAt.localeCompare(byId.get(left.recordId)!.publishedAt)
      || left.recordId.localeCompare(right.recordId));
  const passing = ranked.filter((value) => value.baseScore! >= input.config.thresholds.minimumBaseScore
    && value.confidence! >= input.config.thresholds.minimumConfidence);
  const winner = passing[0];
  const runnerUp = passing[1];
  const margin = winner && runnerUp ? winner.finalScore! - runnerUp.finalScore! : Number.POSITIVE_INFINITY;
  let outcome: "selected" | "NO_EDITION" = "NO_EDITION";
  let selectedRecordId: string | null = null;
  let noEditionReason: string | null;
  if (winner && margin >= input.config.thresholds.minimumWinnerMargin) {
    outcome = "selected";
    selectedRecordId = winner.recordId;
    noEditionReason = null;
  } else if (built.records.length === 0) {
    noEditionReason = "No candidate survived deterministic prefiltering and official-confirmation requirements.";
  } else if (ranked.length === 0) {
    noEditionReason = "No canonical record cleared the hard evidence gates.";
  } else if (passing.length === 0) {
    noEditionReason = "No eligible record cleared the base materiality and confidence thresholds.";
  } else {
    noEditionReason = `The leading eligible records were separated by ${Math.max(0, margin).toFixed(3)}, below the ${input.config.thresholds.minimumWinnerMargin} winner margin.`;
  }
  const usedContribution = selectedRecordId
    ? selectionCandidates.find(({ recordId }) => recordId === selectedRecordId)?.components.find(({ name }) => name === "goviral-momentum")?.contribution ?? 0
    : 0;
  const overlayStatus = goviral.status === "available-unused" && usedContribution > 0 ? "used" : goviral.status;
  const inputSnapshotHash = hash({
    candidates: [...input.candidates].sort((left, right) => left.contentHash.localeCompare(right.contentHash)).map(({ contentHash }) => contentHash),
    history: input.history ?? [],
    canonicalizationVersion: input.config.canonicalizationVersion,
    extractionVersion: input.config.extractionVersion,
    scoringVersion: input.config.scoringVersion,
    goviralPacketHash: goviral.packetHash
  });
  const core = {
    schemaVersion: "webdev-selection/1" as const,
    pragueDate: input.pragueDate,
    inputSnapshotHash,
    scoringVersion: input.config.scoringVersion,
    candidates: selectionCandidates.sort((left, right) => left.recordId.localeCompare(right.recordId)),
    outcome,
    selectedRecordId,
    noEditionReason,
    urgencyOverride: { used: false, evidenceRefs: [], exactAffectedScope: null, exactFixedScope: null },
    goviral: {
      status: overlayStatus,
      packetRef: goviral.packetRef,
      packetHash: goviral.packetHash,
      observedAt: goviral.observedAt,
      expiresAt: goviral.expiresAt,
      contribution: overlayStatus === "used" ? usedContribution : 0,
      actorRerun: false,
      duplicateChargeUsd: 0
    },
    threshold: {
      minimumBaseScore: input.config.thresholds.minimumBaseScore,
      minimumConfidence: input.config.thresholds.minimumConfidence,
      minimumWinnerMargin: input.config.thresholds.minimumWinnerMargin,
      tieBreaker: "final-score-desc,published-at-desc,record-id-asc" as const
    },
    ownerCorrectionRef: input.ownerCorrectionRef ?? null,
    supersedesRef: input.supersedesRef ?? null
  };
  const selection = WebDevSelectionSchema.parse({ ...core, idempotencyHash: hash(core) });
  const dropCounts = Object.fromEntries([...new Set(built.drops.map(({ gate }) => gate))].sort().map((gate) => [gate, built.drops.filter((drop) => drop.gate === gate).length]));
  const metrics = WebDevSelectionMetricsSchema.parse({
    schemaVersion: "webdev-selection-metrics/1",
    fetchedCandidates: input.candidates.length,
    prefilterDrops: built.drops.length,
    dropCounts,
    exactClusters: built.exactClusters,
    fuzzyClusters: built.fuzzyClusters,
    conflicts: built.conflicts,
    canonicalRecords: built.records.length,
    eligible: selectionCandidates.filter(({ gate }) => gate === "eligible").length,
    scored: selectionCandidates.filter(({ components }) => components.length > 0).length,
    outcome,
    reason: noEditionReason ?? `Selected ${selectedRecordId}.`,
    goviralStatus: overlayStatus,
    cacheReused: input.cacheReused ?? 0,
    callsAvoided: input.callsAvoided ?? 0,
    networkCalls: 0,
    modelCalls: 0,
    providerCostUsd: 0
  });
  return { records: built.records.map(({ record }) => record), selection, metrics };
}
