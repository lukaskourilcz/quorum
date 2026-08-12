import { readFile } from "node:fs/promises";
import path from "node:path";
import { BookKbIndexSchema } from "../../contracts/book-kb-index.js";
import type { OwnerResultEntry } from "../../contracts/owner-result-entry.js";
import {
  PerformanceWeightProposalSchema,
  PerformanceWeightsSchema,
  type PerformanceHookStyle,
  type PerformanceWeightProposal,
  type PerformanceWeights
} from "../../contracts/performance-weights.js";
import { VentureRecommendationSchema, type VentureRecommendation } from "../../contracts/venture-recommendation.js";
import { atomicWriteJson } from "../../state.js";
import { doorMoneyHookStyle, type DoorMoneyFormat, type SelectionPerformanceWeights } from "./select.js";

const RELATIVE_PATH = "ventures/door-money/performance-weights.json";

const NEUTRAL_FORMAT_PRIORS: Record<DoorMoneyFormat, number> = {
  carousel: 1,
  "single-image": 1,
  thread: 1,
  caption: 1,
  "short-video-script": 1
};

const NEUTRAL_HOOK_STYLE_PRIORS: Record<PerformanceHookStyle, number> = {
  "narrative-led": 1,
  "quote-led": 1,
  "lesson-led": 1,
  "tension-led": 1,
  "humor-led": 1
};

export interface DoorMoneyResultDimensions {
  formats: DoorMoneyFormat[];
  themes: string[];
  hookStyles: PerformanceHookStyle[];
}

export interface DoorMoneyPerformanceEvidence {
  id: string;
  selectionDimensions: DoorMoneyResultDimensions | null;
}

export interface LoadedDoorMoneyPerformanceWeights {
  state: "missing" | "invalid" | "present";
  record: PerformanceWeights | null;
  weights: SelectionPerformanceWeights;
}

export interface DoorMoneyPerformanceWeightPlan {
  relative: typeof RELATIVE_PATH;
  record: PerformanceWeights;
  changed: boolean;
}

function sortedRecord(source: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(source).sort(([left], [right]) => left.localeCompare(right)));
}

function selectionWeights(record?: PerformanceWeights): SelectionPerformanceWeights {
  return record ? {
    formatPriors: sortedRecord(record.formatPriors) as Record<DoorMoneyFormat, number>,
    themePriors: sortedRecord(record.themePriors),
    hookStylePriors: sortedRecord(record.hookStylePriors) as Record<PerformanceHookStyle, number>
  } : {
    formatPriors: { ...NEUTRAL_FORMAT_PRIORS },
    themePriors: {},
    hookStylePriors: { ...NEUTRAL_HOOK_STYLE_PRIORS }
  };
}

function neutralRecord(at: string): PerformanceWeights {
  return PerformanceWeightsSchema.parse({
    schemaVersion: "performance-weights/1",
    ventureId: "door-money",
    floor: 0.5,
    ceiling: 1.5,
    ...selectionWeights(),
    revisions: [],
    generatedAt: at,
    updatedAt: at
  });
}

export async function loadDoorMoneyPerformanceWeights(root: string): Promise<LoadedDoorMoneyPerformanceWeights> {
  try {
    const parsed = PerformanceWeightsSchema.safeParse(JSON.parse(await readFile(path.join(root, RELATIVE_PATH), "utf8")) as unknown);
    if (!parsed.success || parsed.data.ventureId !== "door-money") {
      return { state: "invalid", record: null, weights: selectionWeights() };
    }
    return { state: "present", record: parsed.data, weights: selectionWeights(parsed.data) };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", record: null, weights: selectionWeights() }
      : { state: "invalid", record: null, weights: selectionWeights() };
  }
}

/** Resolves the dimensions the desk actually selected without reading private book text. */
export async function loadDoorMoneyResultDimensions(
  root: string,
  result: OwnerResultEntry
): Promise<DoorMoneyResultDimensions | null> {
  try {
    const recommendation = VentureRecommendationSchema.parse(JSON.parse(await readFile(path.join(
      root, "ventures", "door-money", "recommendations", `${result.recommendationId}.json`
    ), "utf8")) as unknown);
    if (recommendation.id !== result.recommendationId || recommendation.ventureId !== "door-money" ||
        !recommendation.platforms.includes(result.platform) ||
        !["posted", "archived"].includes(recommendation.status) ||
        recommendation.owner.postedUrl !== result.postUrl || !recommendation.owner.postedAt ||
        Date.parse(result.capturedAt) < Date.parse(recommendation.owner.postedAt)) return null;
    const version = recommendation.evidence.manuscriptHash.slice("sha256:".length);
    const index = BookKbIndexSchema.parse(JSON.parse(await readFile(path.join(
      root, "ventures", "door-money", "knowledge", "versions", version, "book-kb-index.json"
    ), "utf8")) as unknown);
    if (index.manuscriptHash !== recommendation.evidence.manuscriptHash) return null;
    const chunks = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
    const selected = recommendation.evidence.chunkIds.map((id) => chunks.get(id));
    if (selected.some((chunk) => chunk === undefined)) return null;
    return {
      formats: [...recommendation.formats].sort(),
      themes: [...new Set(selected.flatMap((chunk) => chunk!.themes))].sort(),
      hookStyles: [...new Set(recommendation.evidence.scoresAtSelection
        .map(({ scores }) => doorMoneyHookStyle(scores)))].sort()
    };
  } catch {
    return null;
  }
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateDoorMoneyPerformanceEvidence(
  raw: PerformanceWeightProposal,
  available: readonly DoorMoneyPerformanceEvidence[]
): PerformanceWeightProposal {
  const proposal = PerformanceWeightProposalSchema.parse(raw);
  const byId = new Map(available.map((result) => [result.id, result.selectionDimensions]));
  if (proposal.evidenceResultIds.some((id) => !byId.has(id))) {
    throw new Error("A performance-weight proposal cited an owner result outside the bounded growth context");
  }
  const dimensions = proposal.evidenceResultIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  const supports = (dimension: keyof DoorMoneyResultDimensions, key: string) =>
    dimensions.some((item) => item[dimension].includes(key as never));
  if (Object.keys(proposal.changes.formatPriors).some((key) => !supports("formats", key)) ||
      Object.keys(proposal.changes.themePriors).some((key) => !supports("themes", key)) ||
      Object.keys(proposal.changes.hookStylePriors).some((key) => !supports("hookStyles", key))) {
    throw new Error("A performance-weight proposal changed a dimension its cited owner results do not support");
  }
  return proposal;
}

export async function prepareDoorMoneyPerformanceWeights(input: {
  root: string;
  cycleId: string;
  now: Date;
  proposal: PerformanceWeightProposal;
  availableResults: readonly DoorMoneyPerformanceEvidence[];
}): Promise<DoorMoneyPerformanceWeightPlan> {
  const proposal = validateDoorMoneyPerformanceEvidence(input.proposal, input.availableResults);
  const loaded = await loadDoorMoneyPerformanceWeights(input.root);
  if (loaded.state === "invalid") throw new Error("Stored Door Money performance weights are invalid and were not overwritten");
  const at = input.now.toISOString();
  const current = loaded.record ?? neutralRecord(at);
  const priorRevision = current.revisions.find(({ sourceCycleId }) => sourceCycleId === input.cycleId);
  if (priorRevision) {
    const { revision: _revision, sourceCycleId: _cycle, updatedAt: _updatedAt, ...priorProposal } = priorRevision;
    if (!same(priorProposal, proposal)) throw new Error("This growth cycle already recorded a different weight proposal");
    return { relative: RELATIVE_PATH, record: current, changed: false };
  }
  if (Date.parse(at) < Date.parse(current.updatedAt)) throw new Error("Performance weights cannot move backward in time");
  const nextPriors = {
    formatPriors: sortedRecord({ ...current.formatPriors, ...proposal.changes.formatPriors }),
    themePriors: sortedRecord({ ...current.themePriors, ...proposal.changes.themePriors }),
    hookStylePriors: sortedRecord({ ...current.hookStylePriors, ...proposal.changes.hookStylePriors })
  };
  if (same(selectionWeights(current), nextPriors)) throw new Error("The performance-weight proposal does not change any prior");
  const revision = {
    ...proposal,
    revision: current.revisions.length + 1,
    sourceCycleId: input.cycleId,
    updatedAt: at
  };
  return {
    relative: RELATIVE_PATH,
    changed: true,
    record: PerformanceWeightsSchema.parse({
      ...current,
      ...nextPriors,
      revisions: [...current.revisions, revision],
      updatedAt: at
    })
  };
}

/** Called only by the commissioned Thursday growth runner after all proposals preflight. */
export async function commitDoorMoneyPerformanceWeights(
  root: string,
  plan: DoorMoneyPerformanceWeightPlan
): Promise<void> {
  if (plan.changed) await atomicWriteJson(root, plan.relative, plan.record);
}
