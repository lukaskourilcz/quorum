import { mkdtempSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// runCycle writes through the module-level `stateRoot`, and the case below deliberately drives a
// live phase to the point where it records a closed slot. The temp root is created inside the
// factory because vi.mock is hoisted above every import and cycle.js resolves paths.js at import
// time, before any test body can run.
vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  const root = mkdtempSync(path.join(os.tmpdir(), "double-fire-"));
  process.env.DOUBLE_FIRE_TEST_STATE_ROOT = root;
  return { ...actual, stateRoot: root };
});

const { runCycle } = await import("../src/cycle.js");

const testStateRoot = process.env.DOUBLE_FIRE_TEST_STATE_ROOT!;

/** 10:00 Prague on 4 August 2026, which is the article-am slot's own hour. */
const AT = new Date("2026-08-04T08:00:00.000Z");

async function seedDecision(): Promise<void> {
  await mkdir(path.join(testStateRoot, "decisions"), { recursive: true });
  await writeFile(
    path.join(testStateRoot, "decisions", "2026-08-04-budget-fifty.md"),
    "# Budget\n\nStatus: pending\n"
  );
}

function runArticleSlot() {
  return runCycle({
    phase: "article-am",
    dry: false,
    explainBudget: false,
    explainRouting: false,
    now: AT
  });
}

/**
 * Two schedules now reach for every slot: GitHub's crons, which have been delivered 2h23m to
 * 2h55m late, and the Vercel cron that dispatches the same workflow punctually. Through the
 * transition both exist, so a slot can be fired for twice — two paid councils, two records, a day
 * that reads as if the meeting happened twice.
 *
 * The dispatcher cannot prevent it: the Vercel route cannot see whether a run is in flight, and
 * GitHub's queue does not know what it already delivered. The run can, because the slot's record
 * is a file named by the Prague date and the phase. This is that guard, exercised end to end
 * rather than asserted from the workflow log: the same phase is run twice and the second run has
 * to be a clean no-op.
 */
describe("a slot that already has today's record is not held again", () => {
  beforeEach(async () => {
    await seedDecision();
    vi.stubEnv("MEETING_TRIGGER", "schedule");
    vi.stubEnv("PORTFOLIO_LIVE_ENABLED", "");
    vi.stubEnv("MMA_FILES_LIVE_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs the first firing and makes the second one a no-op", async () => {
    // The first firing behaves exactly as it did before this guard existed: a shut gate, a
    // recorded reason, and a run file the calendar can read.
    const first = await runArticleSlot();
    expect(first.status).toBe("paused");
    // The temp state root makes the artifact path repo-relative to somewhere under /tmp, so
    // the assertion is on the record it names rather than on the prefix that names the runner.
    expect(first.artifacts).toHaveLength(1);
    expect(first.artifacts[0]).toMatch(/ventures\/mma-files\/runs\/2026-08-04-am\.json$/u);
    const recorded = await readFile(
      path.join(testStateRoot, "ventures", "mma-files", "runs", "2026-08-04-am.json"),
      "utf8"
    );

    // The second firing is the one this guard exists for. It must not run, must not fail, and
    // must leave the first firing's record exactly as it found it.
    const second = await runArticleSlot();
    expect(second.status).toBe("already_recorded");
    expect(second.decision).toBe("NO_ACTION");
    expect(second.estimatedWorstCaseUsd).toBe(0);
    expect(second.selectedAgents).toEqual([]);
    expect(second.artifacts).toEqual([]);
    expect(second.alreadyRecordedAt).toMatch(/ventures\/mma-files\/runs\/2026-08-04-am\.json$/u);
    expect(
      await readFile(
        path.join(testStateRoot, "ventures", "mma-files", "runs", "2026-08-04-am.json"),
        "utf8"
      )
    ).toBe(recorded);
    expect(await readdir(path.join(testStateRoot, "ventures", "mma-files", "runs"))).toEqual([
      "2026-08-04-am.json"
    ]);
  });

  it("does not block the owner, who is asking for the run on purpose", async () => {
    await runArticleSlot();
    // MEETING_TRIGGER is how a run says it is claiming a scheduled slot. A manual dispatch
    // claims none, and the owner re-running a phase deliberately must still get the run they
    // asked for — the guard is against two schedules colliding, not against the owner.
    vi.stubEnv("MEETING_TRIGGER", "workflow_dispatch");
    expect((await runArticleSlot()).status).not.toBe("already_recorded");
  });

  it("does not block a different slot on the same day", async () => {
    await runArticleSlot();
    const other = await runCycle({
      phase: "article-pm",
      dry: false,
      explainBudget: false,
      explainRouting: false,
      now: AT
    });
    expect(other.status).toBe("paused");
    expect(other.artifacts[0]).toMatch(/ventures\/mma-files\/runs\/2026-08-04-pm\.json$/u);
  });

  it("does not block the same slot on the next Prague day", async () => {
    await runArticleSlot();
    const tomorrow = await runCycle({
      phase: "article-am",
      dry: false,
      explainBudget: false,
      explainRouting: false,
      now: new Date("2026-08-05T08:00:00.000Z")
    });
    expect(tomorrow.status).toBe("paused");
    expect(tomorrow.artifacts[0]).toMatch(/ventures\/mma-files\/runs\/2026-08-05-am\.json$/u);
  });

  it("leaves a dry run alone, which writes no canonical record to collide with", async () => {
    await runArticleSlot();
    const dry = await runCycle({
      phase: "article-am",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: AT
    });
    expect(dry.status).not.toBe("already_recorded");
  });
});
