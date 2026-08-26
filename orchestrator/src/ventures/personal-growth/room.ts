import path from "node:path";
import { z } from "zod";
import { PersonalGrowthDailyBriefSchema, PersonalGrowthHistoryEventSchema, type PersonalGrowthDailyBrief } from "../../contracts/personal-growth.js";
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

export async function runPersonalGrowthDesk(input: {
  now: Date;
  dry: boolean;
  root?: string;
  goviralAvailable?: boolean;
  ownerManualReferenceAvailable?: boolean;
}): Promise<PersonalGrowthDeskResult> {
  if (Number.isNaN(input.now.getTime())) {
    return { status: "failed", spendUsd: 0, brief: null, artifacts: [], reason: "invalid-input" };
  }
  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp/dry-run/state") : defaultStateRoot);
  try {
    const [foundation, config, historyFile] = await Promise.all([
      loadPersonalGrowthFoundation(),
      loadPersonalGrowthPlannerConfig(),
      readJson<unknown>(root, "ventures/personal-growth/history.json", {
        schemaVersion: "personal-growth-history/1",
        events: []
      })
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
    const runDate = pragueClockParts(input.now).date;
    await atomicWriteJson(root, briefPath(targetPragueDate), brief);
    await atomicWriteJson(root, roomPath(runDate), brief);
    return {
      status: brief.room.result,
      spendUsd: brief.budget.estimatedUsd,
      brief,
      artifacts: [briefPath(targetPragueDate), roomPath(runDate)],
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
