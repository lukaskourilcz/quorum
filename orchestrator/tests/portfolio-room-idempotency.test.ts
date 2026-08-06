import { mkdtempSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// runPortfolioCycle writes through the module-level `stateRoot`. The temp root is created inside
// the factory because vi.mock is hoisted above every import and run.js resolves paths.js at
// import time, before any test body can run.
vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  const root = mkdtempSync(path.join(os.tmpdir(), "portfolio-idempotency-"));
  process.env.PORTFOLIO_IDEMPOTENCY_TEST_STATE_ROOT = root;
  return { ...actual, stateRoot: root };
});

const { runPortfolioCycle } = await import("../src/portfolio/run.js");
const { repoRoot } = await import("../src/paths.js");

const testStateRoot = process.env.PORTFOLIO_IDEMPOTENCY_TEST_STATE_ROOT!;

/** 12:34 Prague on 5 August 2026 — the second of that day's six tt-marketing firings. */
const AT = new Date("2026-08-05T10:34:00.000Z");

const REQUIRED_DECISIONS = [
  "2026-08-01-budget-raise.md",
  "2026-08-02-budget-mma.md",
  "2026-08-04-budget-fifty.md",
  "2026-08-02-fightaiq-founding.md"
];

async function seedDecisions(): Promise<void> {
  await mkdir(path.join(testStateRoot, "decisions"), { recursive: true });
  for (const name of REQUIRED_DECISIONS) {
    await copyFile(
      path.join(repoRoot, "state", "decisions", name),
      path.join(testStateRoot, "decisions", name)
    );
  }
}

async function seedRoomRecord(status: string): Promise<void> {
  await mkdir(path.join(testStateRoot, "meetings"), { recursive: true });
  await writeFile(
    path.join(testStateRoot, "meetings", "2026-08-05-tt-marketing.json"),
    JSON.stringify({
      schemaVersion: "meeting-record/2",
      cycleId: "20260805103129-tt-marketing",
      date: "2026-08-05",
      phase: "tt-marketing",
      kind: "tt-marketing",
      fixture: false,
      status,
      stage: "VALIDATION",
      operatingBrief: "The room met once already today.",
      participantReasons: [],
      ledger: {
        estimatedCycleUsd: 0.08,
        actualCycleUsd: 0.012032,
        monthAllInUsd: 2.74,
        monthCapUsd: 30
      },
      decision: {
        outcome: status === "HELD" ? "PLAN" : "PAUSED",
        summary: "The room recorded its plan for the day.",
        evidenceRefs: []
      },
      generatedAt: "2026-08-05T08:31:29.000Z"
    }),
    "utf8"
  );
}

function runRoom() {
  return runPortfolioCycle({
    phase: "tt-marketing",
    cycleId: "20260805123400-tt-marketing",
    dry: false,
    explainBudget: false,
    explainRouting: false,
    now: AT
  });
}

/**
 * Article slots have refused to run twice on one date since launch. Portfolio rooms had no such
 * guard, and the only thing standing between a room and a second bill was runCycle's double-fire
 * check, which applies to a firing that claims a scheduled slot and to nothing else. On
 * 2026-08-05 tt-marketing was billed six times in about sixty-three minutes — $0.0725 against a
 * room that costs about $0.012 — and the sixth record overwrote the first five, so the day looked
 * like one meeting on disk and six on the ledger.
 */
describe("a portfolio room that already met today does not meet again", () => {
  beforeEach(async () => {
    await seedDecisions();
    vi.stubEnv("PORTFOLIO_LIVE_ENABLED", "true");
    // Not "schedule": this is the hole the room fell through. A dispatch that claims no slot
    // walks straight past runCycle's guard and used to reach every seat.
    vi.stubEnv("MEETING_TRIGGER", "workflow_dispatch");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the record it found instead of calling the cast again", async () => {
    await seedRoomRecord("HELD");
    const before = await readFile(
      path.join(testStateRoot, "meetings", "2026-08-05-tt-marketing.json"),
      "utf8"
    );

    const second = await runRoom();

    expect(second.status).toBe("live_complete");
    expect(second.selectedAgents).toEqual([]);
    expect(second.estimatedWorstCaseUsd).toBe(0);
    expect(second.artifacts).toHaveLength(1);
    expect(second.artifacts[0]).toMatch(/meetings\/2026-08-05-tt-marketing\.json$/u);
    expect(
      await readFile(
        path.join(testStateRoot, "meetings", "2026-08-05-tt-marketing.json"),
        "utf8"
      )
    ).toBe(before);
  });

  it("still lets a room meet after a gate had shut it earlier the same day", async () => {
    // The deliberate exception. A PAUSED record is what a closed gate leaves — no agenda due,
    // owner gate off, headroom gone — and every one of those can open later the same day. A room
    // shut at 08:00 must still be able to meet at 20:00 once its agenda arrives.
    await seedRoomRecord("PAUSED");
    vi.stubEnv("PORTFOLIO_LIVE_ENABLED", "");
    vi.stubEnv("MEETING_TRIGGER", "schedule");

    const later = await runRoom();

    expect(later.status).toBe("paused");
    expect(later.artifacts.some((artifact) =>
      /meetings\/2026-08-05-tt-marketing\.json$/u.test(artifact))).toBe(true);
  });
});
