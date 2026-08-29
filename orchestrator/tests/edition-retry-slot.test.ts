import { mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITION_RETRY_HOUR, EDITION_RETRY_PHASE, MEETING_CLOCK } from "../src/meetings/clock.js";
import { repoRoot } from "../src/paths.js";

vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  const root = mkdtempSync(path.join(os.tmpdir(), "edition-retry-"));
  process.env.EDITION_RETRY_TEST_STATE_ROOT = root;
  return { ...actual, stateRoot: root };
});

const { runCycle } = await import("../src/cycle.js");

const testStateRoot = process.env.EDITION_RETRY_TEST_STATE_ROOT!;

/** 09:00 Prague on 4 August 2026 (CEST), the retry hour. */
const AT_RETRY = new Date("2026-08-04T07:00:00.000Z");

async function seedRecordFor(date: string): Promise<void> {
  await mkdir(path.join(testStateRoot, "meetings"), { recursive: true });
  await writeFile(
    path.join(testStateRoot, "meetings", `${date}-cu-edition.json`),
    JSON.stringify({ status: "NO_EDITION", date }),
    "utf8"
  );
}

async function seedDelivery(date: string): Promise<void> {
  await mkdir(path.join(testStateRoot, "edition", "deliveries"), { recursive: true });
  await writeFile(
    path.join(testStateRoot, "edition", "deliveries", `${date}.json`),
    JSON.stringify({ status: "delivered", editionStatus: "edition", tags: ["ai-agenti"] }),
    "utf8"
  );
}

function runEdition(now: Date) {
  return runCycle({
    phase: "cu-edition",
    dry: false,
    explainBudget: false,
    explainRouting: false,
    now
  });
}

/**
 * Every delivered edition except 6 August needed a second run, and every second run that ran
 * succeeded: the first attempt lost to a source gate, a reserve refusal or a transient provider
 * failure, all of which pass an hour later. The retry is what gives the day that second attempt.
 */
describe("the edition slot's same-day retry", () => {
  beforeEach(() => {
    vi.stubEnv("MEETING_TRIGGER", "schedule");
    vi.stubEnv("CAUGHT_UP_LIVE_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is not a meeting slot, because the story meeting owns that Prague hour", () => {
    // The story meeting used to own this hour; it is a step of the MMA Files day now and the hour
    // is empty. Either way the invariant is the same and is what this protects:
    // `resolveScheduledPhase` names at most one phase per Prague hour, and the retry is never it —
    // the retry is a second attempt at the 05:00 slot, dispatched by name rather than by the clock.
    expect(MEETING_CLOCK.filter((slot) => slot.hour === EDITION_RETRY_HOUR).map(({ phase }) => phase))
      .not.toContain(EDITION_RETRY_PHASE);
    expect(MEETING_CLOCK.filter((slot) => slot.hour === EDITION_RETRY_HOUR).length).toBeLessThanOrEqual(1);
  });

  it("gets past the double-fire guard and lets the delivery receipt decide", async () => {
    // The 05:00 firing always leaves meetings/<date>-cu-edition.json, whatever it decided, and
    // the guard reads exactly that file -- so without the exemption the retry would return
    // already_recorded before reading anything about the day. What decides instead is whether an
    // edition was actually delivered, and on a morning that published, the retry costs $0.
    await seedRecordFor("2026-08-04");
    await seedDelivery("2026-08-04");

    const result = await runEdition(AT_RETRY);

    expect(result.status).toBe("preflight_complete");
    expect(result.decision).toBe("NO_ACTION");
    expect(result.selectedAgents).toEqual([]);
    expect(result.artifacts).toEqual(["state/edition/deliveries/2026-08-04.json"]);
  });

  it("still stops a second firing at the slot's own hour", async () => {
    // The exemption is for the retry hour and nothing else. Two schedules reaching for the 05:00
    // slot is the case the guard exists for and is unchanged.
    await seedRecordFor("2026-08-06");

    const result = await runEdition(new Date("2026-08-06T03:00:00.000Z"));

    expect(result.status).toBe("already_recorded");
  });
});

/**
 * The retry's healthy outcome is writing nothing, and the workflow's "a scheduled slot that
 * wrote nothing is a defect" rule did not know that. On a morning that had already published it
 * filed a skip record over the published edition — telling the calendar the room was called off
 * — and failed the run. That is every good day.
 */
describe("the retry that finds the morning already published", () => {
  it("is exempt from the no-write failure and files no skip", async () => {
    const workflow = await readFile(path.join(repoRoot, ".github/workflows/cycle.yml"), "utf8");
    const commitStep = workflow.slice(workflow.indexOf("Cycle produced no canonical state change."));
    const exemption = commitStep.indexOf('if test "$EDITION_RETRY" = "true"');
    const skipWriter = commitStep.indexOf("src/meetings/skip-cli.ts");
    const failure = commitStep.indexOf("exit 1");

    expect(exemption).toBeGreaterThan(-1);
    // Both the skip record and the failure are downstream of the exemption, so neither is reached.
    expect(skipWriter).toBeGreaterThan(exemption);
    expect(failure).toBeGreaterThan(exemption);
    // The flag has to come from the mode step, not be re-derived from the clock a second time.
    expect(workflow).toContain('EDITION_RETRY: ${{ steps.mode.outputs.edition_retry }}');
    expect(workflow).toContain('echo "edition_retry=$edition_retry" >> "$GITHUB_OUTPUT"');
  });
});
