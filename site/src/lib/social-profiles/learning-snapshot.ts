import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseAdminSocialContinuation,
  parseAdminSocialLearningCheckpoint,
  parseAdminSocialLearningEvaluation,
  parseAdminSocialStrategyAdjustment,
  type AdminSocialContinuationProposal,
  type AdminSocialLearningCheckpoint,
  type AdminSocialLearningEvaluation,
  type AdminSocialStrategyAdjustment
} from "./learning-model";

export interface AdminSocialLearningProfile {
  profileId: string;
  checkpoint: AdminSocialLearningCheckpoint;
  evaluation: AdminSocialLearningEvaluation | null;
  adjustments: AdminSocialStrategyAdjustment[];
  continuation: AdminSocialContinuationProposal | null;
}

export interface AdminSocialLearningSnapshot {
  profiles: AdminSocialLearningProfile[];
  summary: { profiles: number; insufficient: number; boundedChanges: number; activeExperimentsMaximum: 2; corrections: number; ownerDecisionsRequired: number };
  dropped: { checkpoints: number; evaluations: number; adjustments: number; continuations: number; orphanRecords: number };
  unavailable: string[];
  authorityGranted: false;
  publishingAuthorized: false;
}

async function parsedFiles<T>(directory: string, parse: (value: unknown) => T | null, recursive = false): Promise<{ values: T[]; dropped: number; missing: boolean }> {
  const files = await readdir(directory, recursive ? { recursive: true } : undefined).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (files === null) return { values: [], dropped: 1, missing: false };
  const names = (files as string[]).filter((name) => name.endsWith(".json")).sort().slice(0, 4_000);
  const values: T[] = []; let dropped = 0;
  for (const name of names) {
    try { const parsed = parse(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown); if (parsed) values.push(parsed); else dropped += 1; } catch { dropped += 1; }
  }
  return { values, dropped, missing: names.length === 0 };
}

export async function readAdminSocialLearning(root: string, profileIds: ReadonlySet<string>): Promise<AdminSocialLearningSnapshot> {
  const base = path.join(root, "state/social/learning");
  const [checkpoints, evaluations, adjustments, continuations] = await Promise.all([
    parsedFiles(path.join(base, "checkpoints"), parseAdminSocialLearningCheckpoint, true),
    parsedFiles(path.join(base, "evaluations"), parseAdminSocialLearningEvaluation, true),
    parsedFiles(path.join(base, "adjustments"), parseAdminSocialStrategyAdjustment, true),
    parsedFiles(path.join(base, "continuations"), parseAdminSocialContinuation, true)
  ]);
  const knownCheckpoints = checkpoints.values.filter(({ profileId }) => profileIds.has(profileId)).sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
  const latestByProfile = new Map<string, AdminSocialLearningCheckpoint>(); for (const checkpoint of knownCheckpoints) latestByProfile.set(checkpoint.profileId, checkpoint);
  const knownEvaluations = evaluations.values.filter(({ profileId }) => profileIds.has(profileId)); const knownAdjustments = adjustments.values.filter(({ profileId }) => profileIds.has(profileId)); const knownContinuations = continuations.values.filter(({ profileId }) => profileIds.has(profileId));
  const profiles = [...latestByProfile.values()].sort((left, right) => left.profileId.localeCompare(right.profileId)).map((checkpoint): AdminSocialLearningProfile => {
    const currentId = checkpoint.currentEvaluationRef.split("/").at(-1)?.replace(/\.json$/u, "");
    const evaluation = knownEvaluations.find(({ id }) => id === currentId) ?? null;
    const adjustmentSet = knownAdjustments.filter(({ profileId }) => profileId === checkpoint.profileId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const continuation = knownContinuations.filter(({ profileId }) => profileId === checkpoint.profileId).sort((left, right) => right.evaluatedAt.localeCompare(left.evaluatedAt))[0] ?? null;
    return { profileId: checkpoint.profileId, checkpoint, evaluation, adjustments: adjustmentSet, continuation };
  });
  const orphanRecords = checkpoints.values.length - knownCheckpoints.length + evaluations.values.length - knownEvaluations.length + adjustments.values.length - knownAdjustments.length + continuations.values.length - knownContinuations.length;
  return {
    profiles,
    summary: { profiles: profiles.length, insufficient: profiles.filter(({ evaluation }) => evaluation?.conclusion === "INSUFFICIENT_DATA").length, boundedChanges: profiles.filter(({ evaluation }) => evaluation?.conclusion === "PROPOSE_BOUNDED_CHANGE").length, activeExperimentsMaximum: 2, corrections: profiles.reduce((total, { checkpoint }) => total + checkpoint.correctionCount, 0), ownerDecisionsRequired: profiles.filter(({ continuation }) => continuation !== null).length + knownAdjustments.filter(({ status }) => status === "proposed").length },
    dropped: { checkpoints: checkpoints.dropped, evaluations: evaluations.dropped, adjustments: adjustments.dropped, continuations: continuations.dropped, orphanRecords },
    unavailable: checkpoints.missing ? ["weekly learning checkpoint: unavailable"] : [],
    authorityGranted: false,
    publishingAuthorized: false
  };
}
