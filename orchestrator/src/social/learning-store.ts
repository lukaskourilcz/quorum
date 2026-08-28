import {
  SocialContinuationProposalSchema,
  SocialLearningCheckpointSchema,
  SocialLearningEvaluationSchema,
  SocialStrategyAdjustmentSchema,
  socialLearningCheckpointHash,
  type SocialLearningCheckpoint
} from "../contracts/social-learning.js";
import { SocialProfileStrategySchema } from "../contracts/social-inventory.js";
import { canonicalJson } from "../hashing.js";
import { atomicWriteJson, readJson, withFileLock } from "../state.js";

async function appendExact(root: string, relative: string, value: unknown): Promise<boolean> {
  const existing = await readJson<unknown | null>(root, relative, null);
  if (existing !== null) {
    if (canonicalJson(existing) !== canonicalJson(value)) throw new Error(`Immutable Social learning conflict at ${relative}`);
    return false;
  }
  await atomicWriteJson(root, relative, value);
  return true;
}

export async function persistSocialLearningCheckpoint(input: {
  stateRoot: string;
  evaluation: unknown;
  adjustment: unknown | null;
  continuation: unknown;
  strategy: unknown;
}): Promise<{ checkpoint: SocialLearningCheckpoint; paths: string[]; appended: boolean }> {
  const evaluation = SocialLearningEvaluationSchema.parse(input.evaluation);
  const adjustment = input.adjustment === null ? null : SocialStrategyAdjustmentSchema.parse(input.adjustment);
  const continuation = SocialContinuationProposalSchema.parse(input.continuation);
  const strategy = SocialProfileStrategySchema.parse(input.strategy);
  if (new Set([evaluation.profileId, continuation.profileId, strategy.profileId]).size !== 1 || adjustment && adjustment.profileId !== evaluation.profileId) throw new Error("Social learning checkpoint profile records do not match");
  const root = `social/learning/checkpoints/${evaluation.profileId}`;
  return withFileLock(input.stateRoot, `${root}/${evaluation.evaluatedWeek}.lock`, async () => {
    const evaluationPath = `social/learning/evaluations/${evaluation.profileId}/${evaluation.id}.json`;
    const continuationPath = `social/learning/continuations/${evaluation.profileId}/${continuation.id}.json`;
    const strategyPath = `social/learning/strategy-versions/${strategy.profileId}/${strategy.version}.json`;
    const adjustmentPath = adjustment ? `social/learning/adjustments/${adjustment.profileId}/${adjustment.id}/${adjustment.status}-${adjustment.updatedAt.replace(/[:.]/gu, "-")}.json` : null;
    const paths = [evaluationPath, continuationPath, strategyPath, ...(adjustmentPath ? [adjustmentPath] : [])];
    const appendedValues = await Promise.all([
      appendExact(input.stateRoot, evaluationPath, evaluation),
      appendExact(input.stateRoot, continuationPath, continuation),
      appendExact(input.stateRoot, strategyPath, strategy),
      ...(adjustment && adjustmentPath ? [appendExact(input.stateRoot, adjustmentPath, adjustment)] : [])
    ]);
    const manifestPath = `${root}/${evaluation.evaluatedWeek}.json`;
    const previousValue = await readJson<unknown | null>(input.stateRoot, manifestPath, null);
    const previous = previousValue === null ? null : SocialLearningCheckpointSchema.parse(previousValue);
    const ref = (relative: string) => `state/${relative}`;
    const evaluationRefs = [...new Set([...(previous?.evaluationRefs ?? []), ref(evaluationPath)])];
    const adjustmentEventRefs = [...new Set([...(previous?.adjustmentEventRefs ?? []), ...(adjustmentPath ? [ref(adjustmentPath)] : [])])];
    const continuationRefs = [...new Set([...(previous?.continuationRefs ?? []), ref(continuationPath)])];
    const strategyVersionRefs = [...new Set([...(previous?.strategyVersionRefs ?? []), ref(strategyPath)])];
    const base = {
      schemaVersion: "social-learning-checkpoint/1" as const,
      profileId: evaluation.profileId,
      evaluatedWeek: evaluation.evaluatedWeek,
      currentEvaluationRef: ref(evaluationPath),
      evaluationRefs,
      adjustmentEventRefs,
      continuationRefs,
      strategyVersionRefs,
      correctionCount: evaluationRefs.length - 1,
      generatedAt: evaluation.evaluatedAt,
      checkpointHash: "0".repeat(64),
      authorityGranted: false as const,
      publishingAuthorized: false as const
    };
    const checkpointHash = socialLearningCheckpointHash(base);
    const checkpoint = SocialLearningCheckpointSchema.parse({ ...base, checkpointHash });
    const changed = previous === null || canonicalJson(previous) !== canonicalJson(checkpoint);
    if (changed) await atomicWriteJson(input.stateRoot, manifestPath, checkpoint);
    return { checkpoint, paths: [...paths, manifestPath], appended: appendedValues.some(Boolean) || changed };
  });
}
