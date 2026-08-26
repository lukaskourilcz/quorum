import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  BudgetLedgerEntrySchema,
  DEFAULT_BUDGET_LIMITS,
  type ReserveContext
} from "../src/budget.js";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { AnthropicTextClient } from "../src/llm/anthropic.js";
import {
  buildDoorMoneyDryKnowledge,
  fixtureGhostResponse,
  runDoorMoneyDeskCycle,
  type DoorMoneyDeskKnowledge
} from "../src/ventures/door-money/run.js";
import { selectDoorMoneyPassages } from "../src/ventures/door-money/select.js";

const NOW = new Date("2026-08-06T13:00:00.000Z");
const DATE = "2026-08-06";
let knowledge: DoorMoneyDeskKnowledge;

beforeAll(async () => {
  knowledge = await buildDoorMoneyDryKnowledge(NOW);
});

function budget(cycleId: string, perTextCallUsd = DEFAULT_BUDGET_LIMITS.perTextCallUsd): ReserveContext {
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
      perTextCallUsd,
      dailyUsd: 1,
      monthlyApiUsd: 25,
      monthlyOperatingUsd: 50
    }
  };
}

async function root(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "door-money-desk-"));
}

function responseText(): string {
  const selection = selectDoorMoneyPassages({
    ventureId: "door-money",
    date: DATE,
    chunks: knowledge.index.chunks,
    performanceWeights: knowledge.performanceWeights
  });
  if (selection.kind !== "selected") throw new Error("Synthetic live test unexpectedly selected nothing");
  return JSON.stringify(fixtureGhostResponse({ date: DATE, selection }));
}

describe("Door Money desk runner", () => {
  it("records a quiet-day NO_ACTION without fetching a provider response", async () => {
    const state = await root();
    const provider = vi.spyOn(AnthropicTextClient.prototype, "generate").mockRejectedValue(
      new Error("provider must not be reached")
    );
    const quietKnowledge: DoorMoneyDeskKnowledge = {
      ...knowledge,
      index: {
        ...knowledge.index,
        chunks: knowledge.index.chunks.map((chunk) => ({
          ...chunk,
          scores: Object.fromEntries(Object.entries(chunk.scores).map(([axis, score]) => [
            axis,
            { ...score, score: 0 }
          ])) as typeof chunk.scores
        }))
      }
    };
    try {
      const result = await runDoorMoneyDeskCycle({
        cycleId: "fixture-quiet-day",
        now: NOW,
        dry: false,
        root: state,
        stage: "VALIDATION",
        knowledge: quietKnowledge
      });
      expect(provider).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        decision: "NO_ACTION",
        status: "live_complete",
        packages: [],
        fixtureReason: null
      });
      const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
        path.join(state, `meetings/${DATE}-dm-desk.json`),
        "utf8"
      )));
      expect(meeting).toMatchObject({
        status: "NO_ACTION",
        decision: { outcome: "NO_ACTION" },
        ledger: { actualCycleUsd: 0 },
        roomTranscript: { gavel: "AUDIT" }
      });
      expect(meeting.decision.summary).toMatch(/honest quiet day/i);
      expect(meeting.participantReasons.find(({ agent }) => agent === "GHOST")?.participated).toBe(false);
    } finally {
      provider.mockRestore();
      await rm(state, { recursive: true, force: true });
    }
  });

  it("reserves before one GHOST call and records the provider-reported spend", async () => {
    const state = await root();
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "synthetic-test-key";
    const provider = vi.spyOn(AnthropicTextClient.prototype, "generate").mockResolvedValue({
      text: responseText(),
      model: "claude-sonnet-5",
      tokensIn: 600,
      tokensOut: 180,
      cachedTokensIn: 0,
      cacheWriteTokensIn: 0,
      toolUses: 0
    });
    try {
      const result = await runDoorMoneyDeskCycle({
        cycleId: "fixture-live-desk",
        now: NOW,
        dry: false,
        root: state,
        stage: "VALIDATION",
        knowledge,
        budgetContext: budget("fixture-live-desk")
      });
      expect(provider).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        decision: "PLAN",
        status: "live_complete",
        fixtureReason: null
      });
      expect(result.packages).toHaveLength(1);

      const ledger = JSON.parse(await readFile(path.join(state, "budget/ledger.json"), "utf8")) as {
        entries: unknown[];
      };
      const entry = BudgetLedgerEntrySchema.parse(ledger.entries[0]);
      expect(entry).toMatchObject({
        cycleId: "fixture-live-desk",
        phase: "dm-desk",
        ventureId: "door-money",
        agent: "GHOST",
        kind: "text"
      });
      const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
        path.join(state, `meetings/${DATE}-dm-desk.json`),
        "utf8"
      )));
      expect(meeting).toMatchObject({
        fixture: false,
        status: "PLAN",
        decision: { outcome: "PLAN" },
        ledger: { actualCycleUsd: entry.usd }
      });
      await expect(readdir(path.join(state, "model-cache"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      provider.mockRestore();
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      await rm(state, { recursive: true, force: true });
    }
  });

  it("writes an honest PAUSED meeting when reservation refuses the call", async () => {
    const state = await root();
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "synthetic-test-key";
    const provider = vi.spyOn(AnthropicTextClient.prototype, "generate").mockRejectedValue(
      new Error("provider must not be reached")
    );
    try {
      const result = await runDoorMoneyDeskCycle({
        cycleId: "fixture-budget-stop",
        now: NOW,
        dry: false,
        root: state,
        stage: "VALIDATION",
        knowledge,
        budgetContext: budget("fixture-budget-stop", 0)
      });
      expect(provider).not.toHaveBeenCalled();
      expect(result).toMatchObject({ decision: "PAUSED", status: "paused", packages: [] });
      const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
        path.join(state, `meetings/${DATE}-dm-desk.json`),
        "utf8"
      )));
      expect(meeting).toMatchObject({ status: "PAUSED", ledger: { actualCycleUsd: 0 } });
      await expect(readFile(path.join(state, "budget/ledger.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      provider.mockRestore();
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      await rm(state, { recursive: true, force: true });
    }
  });

  it("records billed malformed output as FAILED without preserving its body", async () => {
    const state = await root();
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "synthetic-test-key";
    const provider = vi.spyOn(AnthropicTextClient.prototype, "generate").mockResolvedValue({
      text: "not-json-from-the-synthetic-provider",
      model: "claude-sonnet-5",
      tokensIn: 500,
      tokensOut: 20,
      cachedTokensIn: 0,
      cacheWriteTokensIn: 0,
      toolUses: 0
    });
    try {
      const result = await runDoorMoneyDeskCycle({
        cycleId: "fixture-malformed-output",
        now: NOW,
        dry: false,
        root: state,
        stage: "VALIDATION",
        knowledge,
        budgetContext: budget("fixture-malformed-output")
      });
      expect(result).toMatchObject({ decision: "PAUSED", status: "paused", packages: [] });
      const ledgerRaw = await readFile(path.join(state, "budget/ledger.json"), "utf8");
      const meetingRaw = await readFile(path.join(state, `meetings/${DATE}-dm-desk.json`), "utf8");
      const entry = BudgetLedgerEntrySchema.parse((JSON.parse(ledgerRaw) as { entries: unknown[] }).entries[0]);
      const meeting = MeetingRecordSchema.parse(JSON.parse(meetingRaw));
      expect(meeting).toMatchObject({ status: "FAILED", ledger: { actualCycleUsd: entry.usd } });
      expect(ledgerRaw).not.toContain("not-json-from-the-synthetic-provider");
      expect(meetingRaw).not.toContain("not-json-from-the-synthetic-provider");
    } finally {
      provider.mockRestore();
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      await rm(state, { recursive: true, force: true });
    }
  });

  it("drops and counts a billed package whose quote fails the deterministic source gate", async () => {
    const state = await root();
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "synthetic-test-key";
    const raw = JSON.parse(responseText()) as {
      packages: Array<{ sourceRefs: string[]; verbatimQuotes: Array<{ text: string; chunkId: string }> }>;
    };
    raw.packages[0]!.verbatimQuotes = [{
      text: "A fabricated fixture quote that is absent from its synthetic source.",
      chunkId: raw.packages[0]!.sourceRefs[0]!
    }];
    const provider = vi.spyOn(AnthropicTextClient.prototype, "generate").mockResolvedValue({
      text: JSON.stringify(raw),
      model: "claude-sonnet-5",
      tokensIn: 600,
      tokensOut: 180,
      cachedTokensIn: 0,
      cacheWriteTokensIn: 0,
      toolUses: 0
    });
    try {
      const result = await runDoorMoneyDeskCycle({
        cycleId: "fixture-gate-drop",
        now: NOW,
        dry: false,
        root: state,
        stage: "VALIDATION",
        knowledge,
        budgetContext: budget("fixture-gate-drop")
      });
      expect(provider).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        decision: "NO_ACTION",
        status: "live_complete",
        packages: [],
        droppedPackages: 1
      });
      const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
        path.join(state, `meetings/${DATE}-dm-desk.json`),
        "utf8"
      )));
      expect(meeting).toMatchObject({ status: "NO_ACTION", ledger: { actualCycleUsd: expect.any(Number) } });
      expect(meeting.decision.summary).toMatch(/failed deterministic gates and were dropped/i);
      await expect(readdir(path.join(state, "ventures/door-money/recommendations")))
        .rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      provider.mockRestore();
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      await rm(state, { recursive: true, force: true });
    }
  });

  it("stores one draft for an identical date and chunk set across two dry runs", async () => {
    const state = await root();
    try {
      const first = await runDoorMoneyDeskCycle({
        cycleId: "fixture-idempotent-first",
        now: NOW,
        dry: true,
        root: state,
        stage: "VALIDATION"
      });
      const second = await runDoorMoneyDeskCycle({
        cycleId: "fixture-idempotent-second",
        now: NOW,
        dry: true,
        root: state,
        stage: "VALIDATION"
      });
      const names = await readdir(path.join(state, "ventures/door-money/recommendations"));
      expect(names.filter((name) => name.endsWith(".json"))).toHaveLength(1);
      expect(second.packages.map(({ id }) => id)).toEqual(first.packages.map(({ id }) => id));
      expect(second).toMatchObject({ droppedPackages: 0, decision: "PLAN" });
    } finally {
      await rm(state, { recursive: true, force: true });
    }
  });
});
