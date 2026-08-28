import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SocialProfileOperationSchema } from "../contracts/social-operations.js";
import { SocialProfileStrategyRegistrySchema } from "../contracts/social-inventory.js";
import { SocialDistributionExperimentRegisterSchema } from "../contracts/social-results.js";
import { pragueClockParts } from "../meetings/clock.js";
import { readJson } from "../state.js";
import { loadAmplificationPolicy } from "./amplifiers.js";
import { proposeSocialContinuation } from "./continuation.js";
import { evaluateSocialProfileLearning, loadSocialLearningPolicy } from "./learning.js";
import { persistSocialLearningCheckpoint } from "./learning-store.js";
import { loadSocialPublisherRegistry } from "./publisher-targets.js";
import { readSocialMetricObservations } from "./results.js";

async function jsonFiles(directory: string): Promise<unknown[]> {
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
  return Promise.all(names.filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown));
}

export async function runSocialLearningCheckpoint(input: { repoRoot: string; stateRoot: string; now: Date }): Promise<{ paths: string[]; profiles: number; corrections: number; droppedObservations: number }> {
  const configRoot = path.join(input.repoRoot, "config");
  const evaluatedAt = new Date(`${pragueClockParts(input.now).date}T00:00:00.000Z`);
  const [strategiesRaw, profiles, learningPolicy, amplificationPolicy, observationsResult, operationValues, experimentValue] = await Promise.all([
    readFile(path.join(configRoot, "social-profile-strategies.json"), "utf8"),
    loadSocialPublisherRegistry(configRoot),
    loadSocialLearningPolicy(path.join(configRoot, "social-learning-policy.json")),
    loadAmplificationPolicy(configRoot),
    readSocialMetricObservations(input.stateRoot),
    jsonFiles(path.join(input.stateRoot, "social", "profile-operations")),
    readJson<unknown | null>(input.stateRoot, "social/results/experiments.json", null)
  ]);
  const strategies = SocialProfileStrategyRegistrySchema.parse(JSON.parse(strategiesRaw) as unknown);
  const experimentRegister = SocialDistributionExperimentRegisterSchema.safeParse(experimentValue);
  const experiments = experimentRegister.success ? experimentRegister.data.experiments : [];
  const operations = operationValues.flatMap((value) => { const parsed = SocialProfileOperationSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  const paths: string[] = [];
  let corrections = 0;
  let processed = 0;

  for (const strategy of [...strategies.strategies].sort((left, right) => left.profileId.localeCompare(right.profileId))) {
    const profile = profiles.profiles.find(({ id }) => id === strategy.profileId);
    if (!profile || profile.role === "owner-personal" || profile.role === "simulation") continue;
    const targetRole = profile.role === "venture-primary" ? "primary" as const : profile.role === "company-umbrella" ? "umbrella" as const : "amplifier" as const;
    const result = evaluateSocialProfileLearning({ profileId: profile.id, targetRole, strategy, observations: observationsResult.accepted, operations, experiments, policy: learningPolicy, evaluatedAt });
    const sufficient = result.evaluation.sample.distinctPosts >= result.evaluation.minimumSample;
    const originalRatio = result.evaluation.robustMetrics.originalRatio;
    const supportRatio = result.evaluation.robustMetrics.supportRatio;
    const ratioPolicy = !sufficient || originalRatio === null || supportRatio === null
      ? "unavailable" as const
      : originalRatio >= amplificationPolicy.values.minimumOriginalContentRatio && supportRatio <= amplificationPolicy.values.maximumVentureSupportRatio
        ? "pass" as const
        : "incident" as const;
    const profileOperations = operations.filter(({ profileId }) => profileId === profile.id);
    const policyReasons = new Set(["denied-capability", "missing-authority", "original-support-ratio", "kill-switch"]);
    const policyIncidents = profileOperations.filter(({ reasons }) => reasons.some((reason) => policyReasons.has(reason))).length;
    const independentReason = targetRole === "amplifier" ? (profile.purpose && profile.originalContentPromise ? "recorded" as const : "missing" as const) : "not-applicable" as const;
    const separateProfileJustified = targetRole === "amplifier" ? (independentReason === "recorded" ? "yes" as const : "no" as const) : "unavailable" as const;
    const continuation = proposeSocialContinuation({
      evaluation: result.evaluation,
      policy: learningPolicy,
      validationStartedAt: new Date(profile.createdAt),
      evaluatedAt,
      evidence: {
        independentAudienceReason: independentReason,
        originalConsistency: !sufficient || originalRatio === null ? "unavailable" : originalRatio >= amplificationPolicy.values.minimumOriginalContentRatio ? "sufficient" : "insufficient",
        ratioPolicy,
        qualifiedOutcomeSample: result.evaluation.sample.qualifiedOutcomePosts,
        supportBaselineComparable: targetRole === "primary" || sufficient && result.evaluation.sample.originalPosts > 0 && result.evaluation.sample.supportPosts > 0,
        policyIncidents,
        separateProfileJustified
      }
    });
    const stored = await persistSocialLearningCheckpoint({ stateRoot: input.stateRoot, evaluation: result.evaluation, adjustment: result.adjustment, continuation, strategy });
    paths.push(...stored.paths);
    corrections += stored.checkpoint.correctionCount;
    processed += 1;
  }
  return { paths: [...new Set(paths)].sort(), profiles: processed, corrections, droppedObservations: observationsResult.dropped };
}
