import { mkdtempSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  const root = mkdtempSync(path.join(os.tmpdir(), "mma-analysis-gate-"));
  process.env.MMA_ANALYSIS_GATE_TEST_STATE_ROOT = root;
  return { ...actual, stateRoot: root };
});

const { runPortfolioCycle } = await import("../src/portfolio/run.js");
const { repoRoot } = await import("../src/paths.js");

const testStateRoot = process.env.MMA_ANALYSIS_GATE_TEST_STATE_ROOT!;

/** 19:00 Prague on 6 August 2026 — the model check's own hour. */
const AT = new Date("2026-08-06T17:00:00.000Z");

async function seedDecisions(): Promise<void> {
  await mkdir(path.join(testStateRoot, "decisions"), { recursive: true });
  for (const name of [
    "2026-08-01-budget-raise.md",
    "2026-08-02-budget-mma.md",
    "2026-08-04-budget-fifty.md",
    "2026-08-02-fightaiq-founding.md"
  ]) {
    await copyFile(
      path.join(repoRoot, "state", "decisions", name),
      path.join(testStateRoot, "decisions", name)
    );
  }
}

function runRoom() {
  return runPortfolioCycle({
    phase: "mma-analysis",
    cycleId: "20260806190000-mma-analysis",
    dry: false,
    explainBudget: false,
    explainRouting: false,
    now: AT
  });
}

async function meetingRecord() {
  return JSON.parse(await readFile(
    path.join(testStateRoot, "meetings", "2026-08-06-mma-analysis.json"),
    "utf8"
  )) as {
    status: string;
    operatingBrief: string;
    participantReasons: Array<{ agent: string; reason: string; participated: boolean }>;
  };
}

/**
 * The 19:00 room reads the newest versioned model run. None has ever been produced: no bout
 * reaches `confirmed` without a second independent odds source, and THE_ODDS_API_KEY is not
 * installed. Every sitting so far could only restate the free deterministic refresh back to
 * itself at full cast price, so the room now waits for something to read and says so plainly.
 */
describe("the fight-model review waits for a model run", () => {
  beforeEach(async () => {
    await seedDecisions();
    vi.stubEnv("PORTFOLIO_LIVE_ENABLED", "true");
    vi.stubEnv("MEETING_TRIGGER", "schedule");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records a $0 pause naming what it is waiting for", async () => {
    const result = await runRoom();

    expect(result.decision).toBe("PAUSED");
    expect(result.selectedAgents).toEqual([]);
    expect(result.estimatedWorstCaseUsd).toBe(0);

    const record = await meetingRecord();
    expect(record.status).toBe("PAUSED");
    expect(record.operatingBrief).toBe(
      "No model run exists to review yet — waiting for the odds data key."
    );
    expect(record.participantReasons.length).toBeGreaterThan(0);
    for (const seat of record.participantReasons) {
      expect(seat.participated).toBe(false);
      expect(seat.reason).toContain("no model run to review yet");
    }
  });

  it("stops waiting as soon as one model run exists", async () => {
    // The gate is the presence of a run, not a hard-coded "FightAIQ is blocked". The day the odds
    // key lands and the first run is written, the room is back on its agenda with no code change.
    await mkdir(path.join(testStateRoot, "mma", "model-runs"), { recursive: true });
    await writeFile(
      path.join(testStateRoot, "mma", "model-runs", "2026-08-06-ufc-330.json"),
      JSON.stringify({ schemaVersion: "model-run/1", date: "2026-08-06" }),
      "utf8"
    );

    const result = await runRoom();

    // Agenda-gated as before: no agenda is due in this state root, so it shuts for that reason
    // instead — which is the point. What it no longer does is shut for want of a model run.
    expect(result.decision).toBe("PAUSED");
    expect((await meetingRecord()).operatingBrief).toBe(
      "Nothing was queued for this meeting to decide, so it did not meet and nothing was spent."
    );
  });
});
