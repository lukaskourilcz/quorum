import {
  BooksofHistoryPerformanceWeightProposalSchema,
  BooksofHistoryPerformanceWeightsSchema,
  type BooksofHistoryPerformanceWeightProposal,
  type BooksofHistoryPerformanceWeights
} from "../../contracts/performance-weights.js";
import { BooksofHistoryOwnerResultEntrySchema } from "../../contracts/owner-result-entry.js";
import { atomicWriteJson, readJson, withFileLock } from "../../state.js";
import type { BhLanePerformanceWeights } from "./score.js";

export const BH_PERFORMANCE_WEIGHT_FLOOR = 0.75;
export const BH_PERFORMANCE_WEIGHT_CEILING = 1.25;
export const BH_PERFORMANCE_WEIGHTS_PATH = "ventures/booksofhistory/performance-weights.json";
export const BH_PERFORMANCE_PROPOSALS_ROOT = "ventures/booksofhistory/performance-weight-proposals";

const LANES = ["cs", "en"] as const;
const DIMENSIONS = ["categories", "eras", "geographies"] as const;

type Lane = (typeof LANES)[number];
type Dimension = (typeof DIMENSIONS)[number];

function neutralWeights(): BooksofHistoryPerformanceWeights {
  return BooksofHistoryPerformanceWeightsSchema.parse({
    schemaVersion: "performance-weights/1",
    ventureId: "booksofhistory",
    floor: BH_PERFORMANCE_WEIGHT_FLOOR,
    ceiling: BH_PERFORMANCE_WEIGHT_CEILING,
    lanes: {
      cs: { categories: {}, eras: {}, geographies: {} },
      en: { categories: {}, eras: {}, geographies: {} }
    },
    appliedProposalIds: [],
    updatedAt: "1970-01-01T00:00:00.000Z"
  });
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function assertBhShape(weights: BooksofHistoryPerformanceWeights): BooksofHistoryPerformanceWeights {
  if (weights.ventureId !== "booksofhistory") throw new Error("BOOKSOFHISTORY cannot read another venture's performance weights");
  if (weights.floor !== BH_PERFORMANCE_WEIGHT_FLOOR || weights.ceiling !== BH_PERFORMANCE_WEIGHT_CEILING) {
    throw new Error("BOOKSOFHISTORY performance floor or ceiling changed outside the recorded mechanism");
  }
  if (!exactKeys(weights.lanes, LANES)) throw new Error("BOOKSOFHISTORY performance weights require exactly the cs and en lanes");
  for (const lane of LANES) {
    if (!exactKeys(weights.lanes[lane] ?? {}, DIMENSIONS)) {
      throw new Error(`BOOKSOFHISTORY ${lane} weights require category, era and geography dimensions`);
    }
  }
  return weights;
}

export async function readBhPerformanceWeights(root: string): Promise<BooksofHistoryPerformanceWeights> {
  const raw = await readJson<unknown | null>(root, BH_PERFORMANCE_WEIGHTS_PATH, null);
  return raw === null ? neutralWeights() : assertBhShape(BooksofHistoryPerformanceWeightsSchema.parse(raw));
}

export async function readBhLanePerformanceWeights(root: string): Promise<BhLanePerformanceWeights> {
  const weights = await readBhPerformanceWeights(root);
  return {
    cs: {
      categories: weights.lanes.cs!.categories,
      eras: weights.lanes.cs!.eras,
      geographies: weights.lanes.cs!.geographies
    },
    en: {
      categories: weights.lanes.en!.categories,
      eras: weights.lanes.en!.eras,
      geographies: weights.lanes.en!.geographies
    }
  };
}

function proposalPath(proposalId: string): string {
  return `${BH_PERFORMANCE_PROPOSALS_ROOT}/${proposalId}.json`;
}

async function verifyCitations(root: string, proposal: BooksofHistoryPerformanceWeightProposal): Promise<void> {
  const cached = new Map<string, ReturnType<typeof BooksofHistoryOwnerResultEntrySchema.parse>>();
  for (const adjustment of proposal.adjustments) {
    for (const resultId of adjustment.resultIds) {
      let result = cached.get(resultId);
      if (!result) {
        const raw = await readJson<unknown | null>(root, `ventures/booksofhistory/results/${resultId}.json`, null);
        if (raw === null) throw new Error(`Performance proposal ${proposal.proposalId} cites missing result ${resultId}`);
        result = BooksofHistoryOwnerResultEntrySchema.parse(raw);
        cached.set(resultId, result);
      }
      if (result.ventureId !== "booksofhistory" || result.locale !== adjustment.lane) {
        throw new Error(`Performance proposal ${proposal.proposalId} cites ${resultId} outside adjustment lane ${adjustment.lane}`);
      }
      if (Date.parse(result.recordedAt) > Date.parse(proposal.createdAt)) {
        throw new Error(`Performance proposal ${proposal.proposalId} cites future result ${resultId}`);
      }
    }
  }
}

/** Record evidence first, then update the only weights file under a single-writer lock. */
export async function applyBhPerformanceWeightProposal(input: {
  root: string;
  proposal: BooksofHistoryPerformanceWeightProposal;
}): Promise<BooksofHistoryPerformanceWeights> {
  const proposal = BooksofHistoryPerformanceWeightProposalSchema.parse(input.proposal);
  if (proposal.ventureId !== "booksofhistory" || proposal.recordedBy !== "FOLIO") {
    throw new Error("Only a recorded FOLIO proposal may adjust BOOKSOFHISTORY performance weights");
  }
  return withFileLock(input.root, "ventures/booksofhistory/.performance-weights.lock", async () => {
    const current = await readBhPerformanceWeights(input.root);
    const existingRaw = await readJson<unknown | null>(input.root, proposalPath(proposal.proposalId), null);
    if (existingRaw !== null && JSON.stringify(BooksofHistoryPerformanceWeightProposalSchema.parse(existingRaw)) !== JSON.stringify(proposal)) {
      throw new Error(`Performance proposal id ${proposal.proposalId} already names a different record`);
    }
    if (current.appliedProposalIds.includes(proposal.proposalId)) {
      if (existingRaw === null) throw new Error(`Applied performance proposal ${proposal.proposalId} has no recorded evidence`);
      return current;
    }
    if (Date.parse(proposal.appliedAt) < Date.parse(current.updatedAt)) {
      throw new Error(`Performance proposal ${proposal.proposalId} predates the current weights`);
    }
    for (const adjustment of proposal.adjustments) {
      if (!(LANES as readonly string[]).includes(adjustment.lane) || !(DIMENSIONS as readonly string[]).includes(adjustment.dimension)) {
        throw new Error(`Unsupported BOOKSOFHISTORY performance target ${adjustment.lane}/${adjustment.dimension}`);
      }
      if (adjustment.to < BH_PERFORMANCE_WEIGHT_FLOOR || adjustment.to > BH_PERFORMANCE_WEIGHT_CEILING) {
        throw new Error(`Performance weight ${adjustment.to} breaches the ${BH_PERFORMANCE_WEIGHT_FLOOR}-${BH_PERFORMANCE_WEIGHT_CEILING} bounds`);
      }
      const lane = adjustment.lane as Lane;
      const dimension = adjustment.dimension as Dimension;
      const present = current.lanes[lane]![dimension]![adjustment.key] ?? 1;
      if (present !== adjustment.from) {
        throw new Error(`Performance proposal ${proposal.proposalId} expected ${adjustment.from} at ${lane}/${dimension}/${adjustment.key}, found ${present}`);
      }
    }
    await verifyCitations(input.root, proposal);

    const lanes = structuredClone(current.lanes);
    for (const adjustment of proposal.adjustments) {
      const lane = adjustment.lane as Lane;
      const dimension = adjustment.dimension as Dimension;
      lanes[lane]![dimension]![adjustment.key] = adjustment.to;
    }
    const next = assertBhShape(BooksofHistoryPerformanceWeightsSchema.parse({
      ...current,
      lanes,
      appliedProposalIds: [...current.appliedProposalIds, proposal.proposalId],
      updatedAt: proposal.appliedAt
    }));
    if (existingRaw === null) await atomicWriteJson(input.root, proposalPath(proposal.proposalId), proposal);
    await atomicWriteJson(input.root, BH_PERFORMANCE_WEIGHTS_PATH, next);
    return next;
  });
}
