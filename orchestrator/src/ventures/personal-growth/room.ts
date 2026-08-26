import path from "node:path";
import { z } from "zod";
import { PersonalGrowthDailyBriefSchema, PersonalGrowthHistoryEventSchema, type PersonalGrowthDailyBrief } from "../../contracts/personal-growth.js";
import type { PersonalGrowthThreadsCandidate } from "../../contracts/personal-growth-recommendations.js";
import { repoRoot, stateRoot as defaultStateRoot } from "../../paths.js";
import { atomicWriteJson, readJson } from "../../state.js";
import { pragueClockParts } from "../../meetings/clock.js";
import { loadPersonalGrowthFoundation } from "./foundation.js";
import {
  buildPersonalGrowthDailyBrief,
  buildPersonalGrowthRollingPlan,
  loadPersonalGrowthPlannerConfig,
  nextPragueCalendarDate
} from "./planner.js";
import { readPersonalGrowthGoViralPacket } from "./goviral.js";
import { buildPersonalGrowthBaseline } from "./analytics.js";
import {
  buildPersonalGrowthInstagramRecommendation,
  buildPersonalGrowthThreadsPacket,
  loadPersonalGrowthContentConfig
} from "./recommendations.js";
import { readPersonalGrowthResultInputs } from "./results.js";

const HistoryFileSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-history/1"),
  events: z.array(PersonalGrowthHistoryEventSchema).max(500)
});

export interface PersonalGrowthDeskResult {
  status: "planned" | "quiet" | "not-needed" | "held" | "failed" | "unavailable";
  spendUsd: number;
  brief: PersonalGrowthDailyBrief | null;
  artifacts: string[];
  reason: "none-due" | "project-held" | "configuration-unavailable" | "invalid-input" | null;
}

function briefPath(targetDate: string): string {
  return `ventures/personal-growth/briefs/${targetDate}.json`;
}

function roomPath(runDate: string): string {
  return `meetings/${runDate}-pg-desk.json`;
}

function platformPath(platform: "threads" | "instagram", targetDate: string): string {
  return `ventures/personal-growth/recommendations/${platform}/${targetDate}.json`;
}

const BASELINE_PATH = "ventures/personal-growth/analysis/baseline.json";

export async function runPersonalGrowthDesk(input: {
  now: Date;
  dry: boolean;
  root?: string;
  goviralAvailable?: boolean;
  ownerManualReferenceAvailable?: boolean;
  threadsCandidates?: readonly PersonalGrowthThreadsCandidate[];
  recentThreadsPosts?: readonly string[];
  privateVoiceSources?: readonly string[];
  conversationCandidates?: readonly unknown[];
}): Promise<PersonalGrowthDeskResult> {
  if (Number.isNaN(input.now.getTime())) {
    return { status: "failed", spendUsd: 0, brief: null, artifacts: [], reason: "invalid-input" };
  }
  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp/dry-run/state") : defaultStateRoot);
  try {
    const [foundation, config, contentConfig, historyFile, resultInputs] = await Promise.all([
      loadPersonalGrowthFoundation(),
      loadPersonalGrowthPlannerConfig(),
      loadPersonalGrowthContentConfig(),
      readJson<unknown>(root, "ventures/personal-growth/history.json", {
        schemaVersion: "personal-growth-history/1",
        events: []
      }),
      readPersonalGrowthResultInputs(root)
    ]);
    const history = HistoryFileSchema.parse(historyFile).events;
    const targetPragueDate = nextPragueCalendarDate(input.now);
    const plan = buildPersonalGrowthRollingPlan({ config, targetPragueDate, history });
    const existingRaw = await readJson<unknown>(root, briefPath(targetPragueDate), null);
    const existing = existingRaw === null ? null : PersonalGrowthDailyBriefSchema.parse(existingRaw);
    const held = !foundation.featureGates.projectLive;
    const goviralPacket = input.goviralAvailable === undefined
      ? await readPersonalGrowthGoViralPacket(root, input.now)
      : null;
    const goviralAvailable = input.goviralAvailable ?? (goviralPacket !== null);
    const brief = buildPersonalGrowthDailyBrief({
      plan,
      generatedAt: input.now,
      dry: input.dry,
      runResult: held ? "held" : "automatic",
      goviralAvailability: goviralAvailable ? "available" : foundation.featureGates.insightsIngestion ? "unavailable" : "held",
      goviralInputHash: goviralPacket?.inputHash ?? null,
      ownerManualReferenceAvailability: input.ownerManualReferenceAvailable ? "available" : "not-needed",
      existing
    });
    const threads = buildPersonalGrowthThreadsPacket({
      recommendationDate: targetPragueDate,
      generatedAt: input.now,
      config: contentConfig,
      candidates: input.threadsCandidates ?? [],
      recentPosts: input.recentThreadsPosts ?? [],
      privateSources: input.privateVoiceSources ?? [],
      conversationCandidates: input.conversationCandidates ?? [],
      officialSearchEnabled: foundation.featureGates.providerLive && foundation.featureGates.threadsSearch,
      recommendationAuthority: !held
    });
    const occurrence = brief.primaryAction.occurrenceId === null
      ? null
      : plan.occurrences.find(({ occurrenceId }) => occurrenceId === brief.primaryAction.occurrenceId) ?? null;
    const instagram = buildPersonalGrowthInstagramRecommendation({
      recommendationDate: targetPragueDate,
      generatedAt: input.now,
      actionType: occurrence?.lane === "okraj" ? "okraj-distribution"
        : occurrence?.lane === "bbarak" ? "bbarak-distribution" : "no-post",
      pillar: occurrence ? "writing-publishing" : null,
      goal: occurrence ? "Distribute the finished owner-authored publication." : null,
      dueWindow: occurrence?.scheduledDate ?? null,
      ownerSourceRefs: occurrence ? [`ventures/personal-growth/briefs/${targetPragueDate}.json#${occurrence.occurrenceId}`] : [],
      collaborator: occurrence?.lane ?? null,
      assetChecklist: occurrence ? ["Owner-confirmed final publication URL"] : [],
      distributionChecklist: occurrence ? ["Confirm the owner-authored artifact is already published"] : [],
      reason: occurrence ? "The recorded publication recurrence is due." : "No owner-grounded Instagram action is due.",
      englishProfileAvailable: contentConfig.englishProfileAvailable,
      recommendationAuthority: !held
    });
    const baseline = buildPersonalGrowthBaseline({
      startsOn: contentConfig.baseline.startsOn,
      evaluatedAt: input.now,
      results: resultInputs
    });
    const runDate = pragueClockParts(input.now).date;
    await Promise.all([
      atomicWriteJson(root, briefPath(targetPragueDate), brief),
      atomicWriteJson(root, roomPath(runDate), brief),
      atomicWriteJson(root, platformPath("threads", targetPragueDate), threads),
      atomicWriteJson(root, platformPath("instagram", targetPragueDate), instagram),
      atomicWriteJson(root, BASELINE_PATH, baseline)
    ]);
    return {
      status: brief.room.result,
      spendUsd: brief.budget.estimatedUsd,
      brief,
      artifacts: [
        briefPath(targetPragueDate),
        roomPath(runDate),
        platformPath("threads", targetPragueDate),
        platformPath("instagram", targetPragueDate),
        BASELINE_PATH
      ],
      reason: held ? "project-held" : brief.room.result === "not-needed" ? "none-due" : null
    };
  } catch {
    return {
      status: "unavailable",
      spendUsd: 0,
      brief: null,
      artifacts: [],
      reason: "configuration-unavailable"
    };
  }
}
