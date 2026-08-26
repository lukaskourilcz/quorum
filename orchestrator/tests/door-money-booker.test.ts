import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BudgetLedgerEntrySchema,
  DEFAULT_BUDGET_LIMITS,
  type ReserveContext
} from "../src/budget.js";
import { ActionPacketSchema } from "../src/contracts/action-packet.js";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { PerformanceWeightsSchema } from "../src/contracts/performance-weights.js";
import { VentureRecommendationSchema } from "../src/contracts/venture-recommendation.js";
import { OpenAiTextClient } from "../src/llm/openai.js";
import { runDoorMoneyGrowthCycle } from "../src/ventures/door-money/run.js";
import { loadDoorMoneyBookerContext } from "../src/ventures/door-money/growth-booker.js";

const NOW = new Date("2026-08-13T14:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "door-money-booker-"));
  roots.push(root);
  return root;
}

async function writeJson(root: string, relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function goViralBrief(date: string, suffix = "weekly-brief"): Record<string, unknown> {
  return {
    schemaVersion: "marketing-plan/1",
    id: `plan-${date}-${suffix}`,
    ventureId: "goviral",
    title: `Synthetic brief ${date}`,
    summary: "An invented public-signal brief for contract testing.",
    objective: "Give a synthetic owner one bounded idea to inspect.",
    tactics: [{
      type: "content",
      description: "Review one fictional neighborhood reading concept.",
      assetsNeeded: [],
      platformPolicyNote: "Draft only. Nothing is sent or posted."
    }],
    calendar: [{ week: 1, focus: "Manual owner review only." }],
    audienceRefs: [],
    kpis: ["One synthetic brief stored."],
    postable_assets: [{
      id: `asset-${date.replaceAll("-", "")}-weekly-brief`,
      captions: {
        instagram: { A: "Synthetic caption A.", B: "Synthetic caption B." },
        threads: { A: "Synthetic thread A.", B: "Synthetic thread B." }
      },
      visual: {
        template_id: "cover-cta",
        version: "1.0.0",
        content: {
          locale: "en",
          strings: {
            "cover-title": "SYNTHETIC BRIEF",
            "cover-dek": "Invented contract fixture.",
            cta: "Review the fixture",
            destination: "boardless-ai.vercel.app"
          }
        }
      }
    }],
    status: "approved",
    originMeetingRef: `${date}-gv-brief`
  };
}

function budget(cycleId: string): ReserveContext {
  return {
    now: NOW,
    cycleId,
    stage: "VALIDATION",
    ledger: [],
    allInNonApiSpentUsd: 0,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    remainingScheduledCycles: 1,
    limits: {
      ...DEFAULT_BUDGET_LIMITS,
      dailyUsd: 1,
      monthlyApiUsd: 25,
      monthlyOperatingUsd: 50
    }
  };
}

function actionResponse(reference: string): string {
  return JSON.stringify({
    outcome: "ACTIONS",
    summary: "One supported synthetic owner action is ready.",
    noActionReason: null,
    tasks: [{
      id: "review-fictional-reading-note",
      title: "Review the fictional reading note",
      why: "The recorded synthetic brief supports one bounded manual check.",
      steps: ["Read the invented profile.", "Personalize the prepared note outside this system."],
      templates: [{
        id: "fictional-reading-email",
        label: "Fictional reading note",
        kind: "pitch-email",
        body: "Hello, would an invented neighborhood reading sample fit your fictional program?"
      }],
      effort: "15 minutes",
      expectedImpact: "One owner-recorded judgment about the synthetic premise.",
      evidenceRefs: [reference],
      completion: null
    }],
    playbookRevisions: [],
    performanceWeightProposal: null
  });
}

async function installResultWithSelectionDimensions(root: string): Promise<string> {
  const recommendationRaw = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"), "utf8"
  )) as Record<string, unknown>;
  const originalHistory = recommendationRaw.statusHistory as unknown[];
  const recommendation = VentureRecommendationSchema.parse({
    ...recommendationRaw,
    status: "posted",
    designLab: {
      eligible: true,
      summaryPath: "state/ventures/carousel-studio/summaries/door-money/2026-08-12-fixture-radio-carousel.json",
      readyAt: "2026-08-12T11:00:00.000Z"
    },
    owner: {
      ...(recommendationRaw.owner as object), approvedAt: "2026-08-12T11:00:00.000Z",
      postedAt: "2026-08-12T12:00:00.000Z", postedUrl: "https://example.test/synthetic-post"
    },
    statusHistory: [
      ...originalHistory,
      { from: "draft", to: "approved", at: "2026-08-12T11:00:00.000Z", actor: "owner", reason: null },
      { from: "approved", to: "posted", at: "2026-08-12T12:00:00.000Z", actor: "owner", reason: null }
    ],
    updatedAt: "2026-08-12T12:00:00.000Z"
  });
  const index = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/book-kb-index.valid.json"), "utf8"
  )) as { manuscriptHash: string };
  const resultId = "owner-result-fixture-weight";
  await Promise.all([
    writeJson(root, `ventures/door-money/recommendations/${recommendation.id}.json`, recommendation),
    writeJson(root, `ventures/door-money/knowledge/versions/${index.manuscriptHash.slice("sha256:".length)}/book-kb-index.json`, index),
    writeJson(root, `ventures/door-money/results/${resultId}.json`, {
      schemaVersion: "owner-result-entry/1", id: resultId, ventureId: "door-money",
      recommendationId: recommendation.id, platform: "instagram", postUrl: recommendation.owner.postedUrl,
      metrics: { views: 21, saves: 3 }, outcome: "The synthetic owner recorded three saves.",
      source: "owner-entry", capturedAt: "2026-08-13T13:00:00.000Z"
    })
  ]);
  return resultId;
}

describe("Door Money BOOKER call", () => {
  it("selects only the latest dated GoVIRAL weekly brief and drops unrelated plans", async () => {
    const root = await temporaryRoot();
    await writeJson(root, "ventures/goviral/plans/plan-2026-08-03-weekly-brief.json", goViralBrief("2026-08-03"));
    await writeJson(root, "ventures/goviral/plans/plan-2026-08-10-weekly-brief.json", goViralBrief("2026-08-10"));
    await writeJson(root, "ventures/goviral/plans/plan-2026-08-17-weekly-brief.json", goViralBrief("2026-08-17"));
    await writeJson(root, "ventures/goviral/plans/unrelated.json", goViralBrief("2026-08-12", "campaign-plan"));
    await writeJson(root, "ventures/goviral/plans/malformed.json", { schemaVersion: "marketing-plan/1" });

    const context = await loadDoorMoneyBookerContext(root, "2026-08-13");

    expect(context.latestGoViralBrief).toMatchObject({
      date: "2026-08-10",
      id: "plan-2026-08-10-weekly-brief",
      originMeetingRef: "2026-08-10-gv-brief"
    });
    expect(context.allowedEvidenceRefs).toEqual(["goviral-plan:plan-2026-08-10-weekly-brief"]);
    expect(context.droppedGoViralBriefs).toBe(3);
    expect(context.playbooks).toEqual({ state: "missing", items: [] });
    expect(context.ownerCompletions).toEqual({ state: "missing", items: [] });
    expect(context.ownerResults).toEqual({ state: "missing", items: [] });
  });

  it("makes a canonical owner-entered result available as bounded BOOKER learning", async () => {
    const root = await temporaryRoot();
    await writeJson(root, "ventures/door-money/results/owner-result-fixture.json", {
      schemaVersion: "owner-result-entry/1", id: "owner-result-fixture", ventureId: "door-money",
      recommendationId: "fixture-radio-carousel", platform: "instagram",
      postUrl: "https://example.test/synthetic-post", metrics: { views: 21, saves: 3 },
      outcome: "The synthetic manual entry recorded three saves.", source: "owner-entry",
      capturedAt: "2026-08-13T13:00:00.000Z"
    });

    const context = await loadDoorMoneyBookerContext(root, "2026-08-13", "2026-08-13T14:00:00.000Z");
    expect(context.ownerResults).toEqual({ state: "present", items: [expect.objectContaining({
      ref: "result:owner-result-fixture", recommendationId: "fixture-radio-carousel",
      metrics: { views: 21, saves: 3 }
    })] });
    expect(context.allowedEvidenceRefs).toEqual(["result:owner-result-fixture"]);
    expect(context.availableLearningRefs).toEqual(["result:owner-result-fixture"]);
    expect(context).toMatchObject({ droppedOwnerResults: 0, omittedOwnerResults: 0 });
  });

  it("uses one guarded OpenAI call and records a supported synthetic action packet", async () => {
    const root = await temporaryRoot();
    await writeJson(root, "ventures/goviral/plans/plan-2026-08-10-weekly-brief.json", goViralBrief("2026-08-10"));
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    const reference = "goviral-plan:plan-2026-08-10-weekly-brief";
    const provider = vi.spyOn(OpenAiTextClient.prototype, "generate").mockResolvedValue({
      text: actionResponse(reference),
      model: "gpt-5.6-luna",
      tokensIn: 320,
      tokensOut: 140,
      cachedTokensIn: 0,
      cacheWriteTokensIn: 0,
      toolUses: 0
    });
    try {
      const result = await runDoorMoneyGrowthCycle({
        cycleId: "fixture-booker-action",
        now: NOW,
        dry: false,
        root,
        stage: "VALIDATION",
        budgetContext: budget("fixture-booker-action")
      });

      expect(provider).toHaveBeenCalledOnce();
      expect(provider.mock.calls[0]?.[0].input).toContain('"ownerResults":{"state":"missing","items":[]}');
      expect(result).toMatchObject({ decision: "PLAN", status: "live_complete" });
      expect(result.actionPacket?.tasks).toHaveLength(1);
      const stored = ActionPacketSchema.parse(JSON.parse(await readFile(
        path.join(root, "ventures/door-money/actions/2026-08-13.json"), "utf8"
      )));
      expect(stored.tasks[0]).toMatchObject({ completion: null, evidenceRefs: [reference] });
      const ledger = JSON.parse(await readFile(path.join(root, "budget/ledger.json"), "utf8")) as { entries: unknown[] };
      expect(BudgetLedgerEntrySchema.parse(ledger.entries[0])).toMatchObject({
        phase: "dm-growth",
        ventureId: "door-money",
        agent: "BOOKER",
        kind: "text"
      });
      const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
        path.join(root, "meetings/2026-08-13-dm-growth.json"), "utf8"
      )));
      expect(meeting).toMatchObject({ status: "PLAN", decision: { outcome: "PLAN" } });
      expect(meeting.growthPlan).toMatch(/Nothing was published, posted, scheduled, bought or sent/u);
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it("records a cited weekly weight proposal through the growth room and no other writer", async () => {
    const root = await temporaryRoot();
    const resultId = await installResultWithSelectionDimensions(root);
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    const provider = vi.spyOn(OpenAiTextClient.prototype, "generate").mockResolvedValue({
      text: JSON.stringify({
        outcome: "NO_ACTION",
        summary: "No owner task was required, but one cited synthetic weight proposal was recorded.",
        noActionReason: "The recorded synthetic result supports selection learning, not a new owner task.",
        tasks: [],
        playbookRevisions: [],
        performanceWeightProposal: {
          rationale: "The synthetic owner result supports a bounded carousel adjustment.",
          evidenceResultIds: [resultId],
          changes: {
            formatPriors: { carousel: 1.1 },
            themePriors: { "community-memory": 1.05 },
            hookStylePriors: { "narrative-led": 1.05 }
          }
        }
      }),
      model: "gpt-5.6-luna", tokensIn: 320, tokensOut: 140, cachedTokensIn: 0, cacheWriteTokensIn: 0, toolUses: 0
    });
    try {
      const result = await runDoorMoneyGrowthCycle({
        cycleId: "fixture-booker-weights", now: NOW, dry: false, root, stage: "VALIDATION",
        budgetContext: budget("fixture-booker-weights")
      });
      expect(provider).toHaveBeenCalledOnce();
      expect(provider.mock.calls[0]?.[0].input).toContain('"selectionDimensions":{"formats":["carousel"]');
      expect(result).toMatchObject({ decision: "NO_ACTION", status: "live_complete" });
      expect(result.artifacts.some((item) => item.endsWith("ventures/door-money/performance-weights.json"))).toBe(true);
      const stored = PerformanceWeightsSchema.parse(JSON.parse(await readFile(
        path.join(root, "ventures/door-money/performance-weights.json"), "utf8"
      )));
      expect(stored).toMatchObject({
        formatPriors: { carousel: 1.1 },
        themePriors: { "community-memory": 1.05 },
        hookStylePriors: { "narrative-led": 1.05 },
        revisions: [{ sourceCycleId: "fixture-booker-weights", evidenceResultIds: [resultId] }]
      });
      const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
        path.join(root, "meetings/2026-08-13-dm-growth.json"), "utf8"
      )));
      expect(meeting.proposals).toContainEqual(expect.objectContaining({ evidenceRefs: [`result:${resultId}`] }));
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it("records BOOKER's honest NO_ACTION without padding the packet with fake tasks", async () => {
    const root = await temporaryRoot();
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    const provider = vi.spyOn(OpenAiTextClient.prototype, "generate").mockResolvedValue({
      text: JSON.stringify({
        outcome: "NO_ACTION",
        summary: "No recorded context supports an owner-executable step.",
        noActionReason: "Playbooks, owner results and a GoVIRAL weekly brief are unavailable.",
        tasks: [],
        playbookRevisions: [],
        performanceWeightProposal: null
      }),
      model: "gpt-5.6-luna",
      tokensIn: 240,
      tokensOut: 60,
      cachedTokensIn: 0,
      cacheWriteTokensIn: 0,
      toolUses: 0
    });
    try {
      const result = await runDoorMoneyGrowthCycle({
        cycleId: "fixture-booker-no-action",
        now: NOW,
        dry: false,
        root,
        stage: "VALIDATION",
        budgetContext: budget("fixture-booker-no-action")
      });

      expect(provider).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ decision: "NO_ACTION", status: "live_complete" });
      expect(result.actionPacket).toMatchObject({ outcome: "NO_ACTION", tasks: [] });
      const raw = await readFile(path.join(root, "ventures/door-money/actions/2026-08-13.json"), "utf8");
      expect(ActionPacketSchema.parse(JSON.parse(raw)).tasks).toEqual([]);
      expect(raw).not.toMatch(/fabricated|fake task/iu);
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});
