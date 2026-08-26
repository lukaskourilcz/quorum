import { readdir } from "node:fs/promises";
import {
  PersonalGrowthProviderObservationSchema,
  PersonalGrowthResultSchema,
  type PersonalGrowthProviderObservation,
  type PersonalGrowthResult
} from "../../contracts/personal-growth-results.js";
import { atomicWriteJson, readJson, resolveStatePath } from "../../state.js";
import { personalGrowthHash } from "./planner.js";

export const PERSONAL_GROWTH_RESULTS_DIRECTORY = "ventures/personal-growth/results";

function resultPath(resultId: string): string {
  return `${PERSONAL_GROWTH_RESULTS_DIRECTORY}/${resultId}.json`;
}

export function createPersonalGrowthResult(
  input: Omit<PersonalGrowthResult, "schemaVersion" | "resultId" | "observations" | "corrections" | "updatedAt"> & {
    observations?: readonly PersonalGrowthProviderObservation[];
    updatedAt: Date;
  }
): PersonalGrowthResult {
  const resultId = `pg-result-${personalGrowthHash({
    platform: input.platform,
    nativePostId: input.nativePostId,
    publishedAt: input.publishedAt
  }).slice(-16)}`;
  return PersonalGrowthResultSchema.parse({
    ...input,
    schemaVersion: "personal-growth-result/1",
    resultId,
    observations: input.observations ?? [],
    corrections: [],
    updatedAt: input.updatedAt.toISOString()
  });
}

export async function readPersonalGrowthResult(root: string, resultId: string): Promise<PersonalGrowthResult | null> {
  const raw = await readJson<unknown>(root, resultPath(resultId), null);
  const parsed = PersonalGrowthResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function readPersonalGrowthResultInputs(root: string): Promise<unknown[]> {
  let names: string[];
  try {
    names = (await readdir(resolveStatePath(root, PERSONAL_GROWTH_RESULTS_DIRECTORY)))
      .filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(names.map((name) => readJson<unknown>(root, `${PERSONAL_GROWTH_RESULTS_DIRECTORY}/${name}`, null)
    .catch(() => null)));
}

export async function writeNewPersonalGrowthResult(root: string, input: PersonalGrowthResult): Promise<{ result: PersonalGrowthResult; created: boolean }> {
  const result = PersonalGrowthResultSchema.parse(input);
  const existing = await readPersonalGrowthResult(root, result.resultId);
  if (existing) {
    if (existing.nativePostId !== result.nativePostId || existing.platform !== result.platform) {
      throw new Error("A Personal Growth result id cannot change native identity");
    }
    return { result: existing, created: false };
  }
  await atomicWriteJson(root, resultPath(result.resultId), result);
  return { result, created: true };
}

/** Append one maturity observation. A retry returns the recorded result byte-equivalent. */
export async function appendPersonalGrowthObservation(input: {
  root: string;
  resultId: string;
  observation: PersonalGrowthProviderObservation;
}): Promise<{ result: PersonalGrowthResult; appended: boolean }> {
  const observation = PersonalGrowthProviderObservationSchema.parse(input.observation);
  const current = await readPersonalGrowthResult(input.root, input.resultId);
  if (!current) throw new Error("Personal Growth result is unavailable");
  if (observation.scope !== "post" || observation.platform !== current.platform || observation.nativePostId !== current.nativePostId) {
    throw new Error("An insight observation must belong to the same Personal Growth post");
  }
  if (current.observations.some(({ idempotencyKey }) => idempotencyKey === observation.idempotencyKey)) {
    return { result: current, appended: false };
  }
  const entryMode = current.provenance.entryMode === "manual" ? "manual-and-api" as const : current.provenance.entryMode;
  const result = PersonalGrowthResultSchema.parse({
    ...current,
    provenance: { ...current.provenance, entryMode },
    observations: [...current.observations, observation],
    updatedAt: observation.observedAt
  });
  await atomicWriteJson(input.root, resultPath(result.resultId), result);
  return { result, appended: true };
}

export async function appendPersonalGrowthCorrection(input: {
  root: string;
  resultId: string;
  recordedAt: Date;
  reason: string;
  evidenceRefs: readonly string[];
  ownerRating?: number | null;
  ownerNote?: string | null;
}): Promise<PersonalGrowthResult> {
  const current = await readPersonalGrowthResult(input.root, input.resultId);
  if (!current) throw new Error("Personal Growth result is unavailable");
  const correctionBase = {
    recordedAt: input.recordedAt.toISOString(),
    reason: input.reason,
    evidenceRefs: input.evidenceRefs
  };
  const correction = {
    ...correctionBase,
    correctionId: `pg-correction-${personalGrowthHash(correctionBase).slice(-16)}`
  };
  if (current.corrections.some(({ correctionId }) => correctionId === correction.correctionId)) return current;
  const result = PersonalGrowthResultSchema.parse({
    ...current,
    ownerRating: input.ownerRating === undefined ? current.ownerRating : input.ownerRating,
    ownerNote: input.ownerNote === undefined ? current.ownerNote : input.ownerNote,
    corrections: [...current.corrections, correction],
    updatedAt: input.recordedAt.toISOString()
  });
  await atomicWriteJson(input.root, resultPath(result.resultId), result);
  return result;
}
