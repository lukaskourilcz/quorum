import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { TehdejsiFactsFileSchema, type TehdejsiFact } from "../../contracts/tehdejsi-facts.js";
import { TehdejsiOwnerResultEntrySchema, type TehdejsiOwnerResultEntry } from "../../contracts/owner-result-entry.js";
import {
  TEHDEJSI_PERFORMANCE_WEIGHT_CEILING,
  TEHDEJSI_PERFORMANCE_WEIGHT_FLOOR,
  TehdejsiPerformanceWeightProposalSchema,
  TehdejsiPerformanceWeightsSchema,
  type TehdejsiPerformanceWeightProposal,
  type TehdejsiPerformanceWeights
} from "../../contracts/performance-weights.js";
import { TehdejsiRecommendationSchema, type TehdejsiRecommendation } from "../../contracts/tehdejsi-recommendation.js";
import { pragueClockParts } from "../../meetings/clock.js";
import { atomicWriteJson, readJson, withFileLock } from "../../state.js";

export const TEHDEJSI_PERFORMANCE_WEIGHTS_PATH = "ventures/tehdejsi-svet/performance-weights.json";
export const TEHDEJSI_PERFORMANCE_PROPOSALS_ROOT = "ventures/tehdejsi-svet/performance-weight-proposals";

type Dimension = "pillars" | "cohorts" | "countries";
export type TehdejsiScoringWeights = TehdejsiPerformanceWeights["dimensions"];

interface ResultEvidence {
  result: TehdejsiOwnerResultEntry;
  primary: number;
  dimensions: Record<Dimension, string[]>;
}

function neutralWeights(): TehdejsiPerformanceWeights {
  return TehdejsiPerformanceWeightsSchema.parse({
    schemaVersion: "performance-weights/1",
    ventureId: "tehdejsi-svet",
    floor: TEHDEJSI_PERFORMANCE_WEIGHT_FLOOR,
    ceiling: TEHDEJSI_PERFORMANCE_WEIGHT_CEILING,
    dimensions: { pillars: {}, cohorts: {}, countries: {} },
    appliedProposalIds: [],
    appliedResultIds: [],
    updatedAt: "1970-01-01T00:00:00.000Z"
  });
}

export async function readTehdejsiPerformanceWeights(root: string): Promise<TehdejsiPerformanceWeights> {
  const raw = await readJson<unknown | null>(root, TEHDEJSI_PERFORMANCE_WEIGHTS_PATH, null);
  if (raw === null) return neutralWeights();
  const weights = TehdejsiPerformanceWeightsSchema.parse(raw);
  const replay: TehdejsiScoringWeights = { pillars: {}, cohorts: {}, countries: {} };
  const citedBefore = new Set<string>();
  let lastAppliedAt: string | null = null;
  for (const proposalId of weights.appliedProposalIds) {
    const proposalRaw = await readJson<unknown | null>(root, proposalPath(proposalId), null);
    if (proposalRaw === null) throw new Error(`Applied Tehdejsi svet proposal ${proposalId} is missing`);
    const proposal = TehdejsiPerformanceWeightProposalSchema.parse(proposalRaw);
    if (proposal.proposalId !== proposalId || !isSundayProposal(proposal)) {
      throw new Error(`Applied Tehdejsi svet proposal ${proposalId} is not a canonical Sunday record`);
    }
    if (lastAppliedAt && Date.parse(proposal.appliedAt) < Date.parse(lastAppliedAt)) {
      throw new Error("Tehdejsi svet performance proposals moved backward in time");
    }
    const available = new Map((await resultEvidence(root, proposal.createdAt)).map((entry) => [entry.result.resultId, entry]));
    const citedNow = new Set<string>();
    for (const adjustment of proposal.adjustments) {
      const bucket = replay[adjustment.dimension] as Record<string, number>;
      if ((bucket[adjustment.key] ?? 1) !== adjustment.from) {
        throw new Error(`Tehdejsi svet proposal history does not replay at ${adjustment.dimension}/${adjustment.key}`);
      }
      for (const resultId of adjustment.resultIds) {
        const evidence = available.get(resultId);
        if (citedBefore.has(resultId) || !evidence || !evidence.dimensions[adjustment.dimension].includes(adjustment.key)) {
          throw new Error(`Tehdejsi svet proposal ${proposalId} has unsupported or reused result ${resultId}`);
        }
        citedNow.add(resultId);
      }
      bucket[adjustment.key] = adjustment.to;
    }
    for (const resultId of citedNow) citedBefore.add(resultId);
    lastAppliedAt = proposal.appliedAt;
  }
  const normalize = (dimensions: TehdejsiScoringWeights) => Object.fromEntries(
    (Object.keys(dimensions) as Dimension[]).map((dimension) => [
      dimension,
      Object.fromEntries(Object.entries(dimensions[dimension]).sort(([left], [right]) => left.localeCompare(right)))
    ])
  );
  if (JSON.stringify(normalize(replay)) !== JSON.stringify(normalize(weights.dimensions))
      || JSON.stringify([...citedBefore].sort()) !== JSON.stringify(weights.appliedResultIds)
      || (lastAppliedAt !== null && weights.updatedAt !== lastAppliedAt)
      || (lastAppliedAt === null && (Object.values(weights.dimensions).some((entries) => Object.keys(entries).length > 0)
        || weights.appliedResultIds.length > 0))) {
    throw new Error("Tehdejsi svet performance weights do not replay from their cited Sunday proposals");
  }
  return weights;
}

export function tehdejsiFactPerformanceDimensions(fact: TehdejsiFact): Record<Dimension, string> {
  return {
    pillars: fact.kind,
    cohorts: `${Math.floor(fact.yearFrom / 10) * 10}s`,
    countries: fact.country
  };
}

function clamp(value: number): number {
  return Number(Math.min(
    TEHDEJSI_PERFORMANCE_WEIGHT_CEILING,
    Math.max(TEHDEJSI_PERFORMANCE_WEIGHT_FLOOR, value)
  ).toFixed(4));
}

/** Product of the three strategy dimensions, with a final floor and ceiling. */
export function tehdejsiPerformanceMultiplier(fact: TehdejsiFact, weights?: TehdejsiScoringWeights): number {
  if (!weights) return 1;
  const dimensions = tehdejsiFactPerformanceDimensions(fact);
  return clamp(
    (weights.pillars[dimensions.pillars] ?? 1)
    * (weights.cohorts[dimensions.cohorts] ?? 1)
    * (weights.countries[dimensions.countries as "cz" | "ua"] ?? 1)
  );
}

function isSunday(date: string): boolean {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay() === 0;
}

function isSundayProposal(proposal: TehdejsiPerformanceWeightProposal): boolean {
  return isSunday(proposal.sourceDate)
    && pragueClockParts(new Date(proposal.createdAt)).date === proposal.sourceDate
    && pragueClockParts(new Date(proposal.appliedAt)).date === proposal.sourceDate;
}

function proposalPath(proposalId: string): string {
  return `${TEHDEJSI_PERFORMANCE_PROPOSALS_ROOT}/${proposalId}.json`;
}

async function recommendations(root: string): Promise<Map<string, TehdejsiRecommendation>> {
  const directory = path.join(root, "ventures/tehdejsi-svet/drafts");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
  const records = new Map<string, TehdejsiRecommendation>();
  const duplicates = new Set<string>();
  for (const name of names) {
    try {
      const parsed = TehdejsiRecommendationSchema.safeParse(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown);
      if (!parsed.success || duplicates.has(parsed.data.id)) continue;
      if (records.has(parsed.data.id)) {
        records.delete(parsed.data.id);
        duplicates.add(parsed.data.id);
        continue;
      }
      records.set(parsed.data.id, parsed.data);
    } catch { /* One malformed draft cannot become weight evidence. */ }
  }
  return records;
}

async function resultEvidence(root: string, asOf: string): Promise<ResultEvidence[]> {
  const [factsRaw, byRecommendation] = await Promise.all([
    readJson<unknown | null>(root, "ventures/tehdejsi-svet/facts.json", null),
    recommendations(root)
  ]);
  if (factsRaw === null) return [];
  const facts = TehdejsiFactsFileSchema.parse(factsRaw);
  const byFact = new Map(facts.facts.map((fact) => [fact.id, fact]));
  const directory = path.join(root, "ventures/tehdejsi-svet/results");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const evidence: ResultEvidence[] = [];
  for (const name of names) {
    try {
      const parsed = TehdejsiOwnerResultEntrySchema.safeParse(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown);
      if (!parsed.success || name !== `${parsed.data.resultId}.json` || Date.parse(parsed.data.recordedAt) > Date.parse(asOf)) continue;
      const recommendation = byRecommendation.get(parsed.data.recommendationId);
      if (!recommendation || !["posted", "archived"].includes(recommendation.status)
          || recommendation.evidence.factsHash !== facts.contentHash
          || recommendation.owner.postedUrls[parsed.data.locale] !== parsed.data.postUrl) continue;
      const selected = recommendation.evidence.factIds.map((id) => byFact.get(id));
      if (selected.some((fact) => fact === undefined)) continue;
      const sends = parsed.data.metrics.sends;
      const saves = parsed.data.metrics.saves;
      if (sends === null && saves === null) continue;
      const dimensions: Record<Dimension, string[]> = { pillars: [], cohorts: [], countries: [] };
      for (const fact of selected as TehdejsiFact[]) {
        const keys = tehdejsiFactPerformanceDimensions(fact);
        for (const dimension of Object.keys(dimensions) as Dimension[]) dimensions[dimension].push(keys[dimension]);
      }
      for (const dimension of Object.keys(dimensions) as Dimension[]) {
        dimensions[dimension] = [...new Set(dimensions[dimension])].sort();
      }
      evidence.push({ result: parsed.data, primary: (sends ?? 0) + (saves ?? 0), dimensions });
    } catch { /* Parse-or-drop: malformed result files never support a proposal. */ }
  }
  return evidence.sort((left, right) => left.result.resultId.localeCompare(right.result.resultId));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Builds one deterministic proposal from previously unapplied sends+saves evidence. */
export async function proposeTehdejsiPerformanceWeights(input: {
  root: string;
  date: string;
  now: Date;
}): Promise<TehdejsiPerformanceWeightProposal | null> {
  if (!isSunday(input.date) || pragueClockParts(input.now).date !== input.date) return null;
  const current = await readTehdejsiPerformanceWeights(input.root);
  const evidence = (await resultEvidence(input.root, input.now.toISOString()))
    .filter(({ result }) => !current.appliedResultIds.includes(result.resultId));
  if (evidence.length < 2) return null;
  const benchmark = median(evidence.map(({ primary }) => primary));
  const adjustments: TehdejsiPerformanceWeightProposal["adjustments"] = [];
  for (const dimension of ["pillars", "cohorts", "countries"] as const) {
    const keys = [...new Set(evidence.flatMap((entry) => entry.dimensions[dimension]))].sort();
    for (const key of keys) {
      const supporting = evidence.filter((entry) => entry.dimensions[dimension].includes(key));
      const average = supporting.reduce((sum, entry) => sum + entry.primary, 0) / supporting.length;
      if (average === benchmark) continue;
      const from = current.dimensions[dimension][key as never] ?? 1;
      const to = clamp(from + (average > benchmark ? 0.05 : -0.05));
      if (to === from) continue;
      adjustments.push({
        dimension,
        key,
        from,
        to,
        resultIds: supporting.slice(0, 20).map(({ result }) => result.resultId),
        rationale: `Owner-entered sends plus saves for ${key} sit ${average > benchmark ? "above" : "below"} this Sunday's recorded median.`
      });
    }
  }
  if (adjustments.length === 0) return null;
  const identity = JSON.stringify({ sourceDate: input.date, adjustments });
  return TehdejsiPerformanceWeightProposalSchema.parse({
    schemaVersion: "performance-weight-proposal/1",
    proposalId: `weights-${createHash("sha256").update(identity).digest("hex").slice(0, 20)}`,
    ventureId: "tehdejsi-svet",
    recordedBy: "LETOPIS",
    sourceDate: input.date,
    createdAt: input.now.toISOString(),
    appliedAt: input.now.toISOString(),
    adjustments
  });
}

/** Stores cited evidence before the bounded weights snapshot under one writer lock. */
export async function applyTehdejsiPerformanceWeightProposal(input: {
  root: string;
  proposal: TehdejsiPerformanceWeightProposal;
}): Promise<{ weights: TehdejsiPerformanceWeights; changed: boolean }> {
  const proposal = TehdejsiPerformanceWeightProposalSchema.parse(input.proposal);
  if (!isSundayProposal(proposal)) {
    throw new Error("Tehdejsi svet performance proposals are Sunday-only");
  }
  return withFileLock(input.root, "ventures/tehdejsi-svet/.performance-weights.lock", async () => {
    const current = await readTehdejsiPerformanceWeights(input.root);
    const existing = await readJson<unknown | null>(input.root, proposalPath(proposal.proposalId), null);
    if (existing !== null && JSON.stringify(TehdejsiPerformanceWeightProposalSchema.parse(existing)) !== JSON.stringify(proposal)) {
      throw new Error(`Performance proposal ${proposal.proposalId} already names another record`);
    }
    if (current.appliedProposalIds.includes(proposal.proposalId)) {
      if (existing === null) throw new Error(`Applied proposal ${proposal.proposalId} has no recorded evidence`);
      return { weights: current, changed: false };
    }
    const proposedResultIds = new Set(proposal.adjustments.flatMap(({ resultIds }) => resultIds));
    if ([...proposedResultIds].some((resultId) => current.appliedResultIds.includes(resultId))) {
      throw new Error("Tehdejsi svet performance proposals cannot reuse an applied owner result");
    }
    if (Date.parse(proposal.appliedAt) < Date.parse(current.updatedAt)) throw new Error("Performance weights cannot move backward in time");
    const available = new Map((await resultEvidence(input.root, proposal.createdAt)).map((entry) => [entry.result.resultId, entry]));
    const dimensions = structuredClone(current.dimensions);
    for (const adjustment of proposal.adjustments) {
      const bucket = dimensions[adjustment.dimension] as Record<string, number>;
      const present = bucket[adjustment.key] ?? 1;
      if (present !== adjustment.from) throw new Error(`Proposal expected ${adjustment.from} at ${adjustment.dimension}/${adjustment.key}, found ${present}`);
      for (const resultId of adjustment.resultIds) {
        const evidence = available.get(resultId);
        if (!evidence || !evidence.dimensions[adjustment.dimension].includes(adjustment.key)) {
          throw new Error(`Proposal ${proposal.proposalId} cites unsupported result ${resultId}`);
        }
      }
      bucket[adjustment.key] = adjustment.to;
    }
    const cited = [...new Set(proposal.adjustments.flatMap(({ resultIds }) => resultIds))].sort();
    const next = TehdejsiPerformanceWeightsSchema.parse({
      ...current,
      dimensions,
      appliedProposalIds: [...current.appliedProposalIds, proposal.proposalId],
      appliedResultIds: [...new Set([...current.appliedResultIds, ...cited])].sort(),
      updatedAt: proposal.appliedAt
    });
    if (existing === null) await atomicWriteJson(input.root, proposalPath(proposal.proposalId), proposal);
    await atomicWriteJson(input.root, TEHDEJSI_PERFORMANCE_WEIGHTS_PATH, next);
    return { weights: next, changed: true };
  });
}

export async function runSundayPerformanceOverlay(input: {
  root: string;
  date: string;
  now: Date;
  approvalGranted: boolean;
}): Promise<string[]> {
  if (!input.approvalGranted || !isSunday(input.date)) return [];
  const proposal = await proposeTehdejsiPerformanceWeights(input);
  if (!proposal) return [];
  const applied = await applyTehdejsiPerformanceWeightProposal({ root: input.root, proposal });
  return applied.changed ? [proposalPath(proposal.proposalId), TEHDEJSI_PERFORMANCE_WEIGHTS_PATH] : [];
}
