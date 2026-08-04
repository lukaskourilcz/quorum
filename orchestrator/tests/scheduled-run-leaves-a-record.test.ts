import { mkdtempSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// runCycle writes through the module-level `stateRoot`, so the article-slot case below would
// otherwise write a run file into the repository's own state/ for today's date. The temp root is
// created inside the factory because vi.mock is hoisted above every import and cycle.js resolves
// paths.js at import time, before any test body can run.
vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  const root = mkdtempSync(path.join(os.tmpdir(), "scheduled-run-record-"));
  process.env.SCHEDULED_RUN_TEST_STATE_ROOT = root;
  return { ...actual, stateRoot: root };
});

const { runCycle } = await import("../src/cycle.js");
const {
  buildCalendarFeed,
  loadArticleSlotOutcomes,
  LATE_SLOT_REASON,
  pragueSlotInstant,
  SLOT_DELIVERY_GRACE_MS
} = await import("../src/meetings/calendar.js");
const { CRON_DELIVERY_WINDOW_HOURS, MEETING_CLOCK, resolveCronDelivery } = await import("../src/meetings/clock.js");
const {
  CRON_LEAD_HOURS,
  CRON_MINUTE,
  cronHeadStartMinutes,
  cronPayloads,
  cronSlotHour,
  readVentureRegistry
} = await import("../src/ventures/registry.js");
const { repoRoot } = await import("../src/paths.js");

const testStateRoot = process.env.SCHEDULED_RUN_TEST_STATE_ROOT!;

/**
 * The invariant: a scheduled run that resolves to a real phase always leaves exactly one of a
 * meeting record, an article-run record, or a skip with a stated reason. Never nothing.
 *
 * Each case below is one way a run used to end having written none of the three, and each is
 * exercised at the layer that decides it rather than asserted from the workflow log.
 */
describe("a scheduled slot is never left unexplained", () => {
  it("does not call a slot missed while its run can still arrive", () => {
    // The premise this whole repair started from — "two runs succeeded and wrote nothing" — was
    // false: both had written their records. What was true is that the calendar declared a slot
    // missed the instant its Prague hour passed, and on 4 August GitHub delivered every cron
    // 2h23m to 2h55m late, so every one of the day's meetings was red for over an hour before it
    // arrived and committed.
    const slot = MEETING_CLOCK[0]!;
    const at = pragueSlotInstant("2026-08-04", slot.hour);
    const ninetyMinutesLater = new Date(at.getTime() + 90 * 60_000);

    const feed = buildCalendarFeed({
      weekOf: "2026-08-04",
      records: [],
      skips: [],
      articleSlots: [],
      now: ninetyMinutesLater
    });
    const rendered = feed.slots.find((entry) => entry.at === at.toISOString())!;
    expect(rendered.status).not.toBe("missed");
    expect(rendered.status).toBe("late");
    expect(rendered.decisionOneLiner).toBe(LATE_SLOT_REASON);
  });

  it("still calls a slot missed once no run for it could be recorded any more", () => {
    const slot = MEETING_CLOCK[0]!;
    const at = pragueSlotInstant("2026-08-04", slot.hour);
    const pastTheWindow = new Date(at.getTime() + SLOT_DELIVERY_GRACE_MS + 60_000);
    const feed = buildCalendarFeed({
      weekOf: "2026-08-04",
      records: [],
      skips: [],
      articleSlots: [],
      now: pastTheWindow
    });
    expect(feed.slots.find((entry) => entry.at === at.toISOString())!.status).toBe("missed");
  });

  it("ends the late window exactly where a delivered cron stops naming the slot", () => {
    // The calendar and the resolver must not disagree about when a slot is beyond rescue: one
    // saying "still on its way" while the other has already stopped being able to open the room
    // is how a slot ends the day with nothing written for it. Proved on the real crons, by
    // running the resolver at the two instants either side of the boundary.
    const registry = readVentureRegistry();
    const summer = "2026-08-04";
    /** The instant a cron actually fires: its own minute, in its own hour. */
    const firingInstant = (expression: string): Date => {
      const [minute, hour] = expression.split(" ").map(Number);
      return new Date(`${summer}T${String(hour!).padStart(2, "0")}:${String(minute!).padStart(2, "0")}:00Z`);
    };
    /**
     * The top of the hour a cron belongs to — the instant lateness is counted from.
     *
     * Not the firing. The crons fire CRON_MINUTE ahead of the hour they serve, and it is the hour,
     * not the firing, that sits exactly CRON_LEAD_HOURS before the slot. Anchoring the window here
     * is what makes it land on the calendar's boundary exactly; anchoring it on the firing would
     * put the two a head start apart, which is the disagreement this test exists to forbid.
     */
    const anchorInstant = (expression: string): Date => {
      const [minute, hour] = expression.split(" ").map(Number);
      return new Date(
        `${summer}T${String(cronSlotHour(hour!, minute!)).padStart(2, "0")}:00:00Z`
      );
    };
    for (const slot of MEETING_CLOCK) {
      const cron = cronPayloads(registry).find(
        ({ phase, cron: expression }) =>
          phase === slot.phase &&
          resolveCronDelivery(expression, firingInstant(expression)).outcome === "meeting"
      );
      if (!cron) continue;
      const anchoredAt = anchorInstant(cron.cron);
      const at = pragueSlotInstant(summer, slot.hour);
      // The hour a cron belongs to sits CRON_LEAD_HOURS ahead of the slot, so the calendar's grace
      // and the resolver's window describe the same last instant.
      expect(at.getTime() - anchoredAt.getTime()).toBe(CRON_LEAD_HOURS * 3_600_000);
      // And the firing itself is the head start further ahead again — the five minutes the
      // schedule buys by sitting at CRON_MINUTE of the preceding hour.
      expect(anchoredAt.getTime() - firingInstant(cron.cron).getTime()).toBe(
        cronHeadStartMinutes(CRON_MINUTE) * 60_000
      );

      const lastGoodDelivery = new Date(anchoredAt.getTime() + CRON_DELIVERY_WINDOW_HOURS * 3_600_000);
      expect(lastGoodDelivery.getTime() - at.getTime()).toBe(SLOT_DELIVERY_GRACE_MS);
      expect(resolveCronDelivery(cron.cron, lastGoodDelivery), `${cron.cron} at the window edge`).toMatchObject({
        outcome: "meeting",
        phase: slot.phase
      });
      const justPast = new Date(lastGoodDelivery.getTime() + 60_000);
      expect(resolveCronDelivery(cron.cron, justPast), `${cron.cron} past the window`).toMatchObject({
        outcome: "beyond-window",
        phase: slot.phase
      });
    }
  });

  it("names the slot a cron missed rather than discarding the firing", () => {
    // A firing delivered past the window used to return the same null as the inactive
    // daylight-saving variant of a cron, and both the workflow recorder and skip-cli then
    // refused to write anything for it. The two are told apart now: one has a slot to name and
    // the other has no meeting at all. On 3 August the delivery lag already reached about three
    // hours against a six-hour window.
    const beyond = resolveCronDelivery("0 3 * * *", new Date("2026-08-04T09:30:00Z"));
    expect(beyond).toMatchObject({ outcome: "beyond-window", phase: "morning" });
    // 02:00 UTC is cu-edition's winter firing; in January there is no 05:00 Prague slot an hour
    // ahead of it, so nothing was ever scheduled and nothing is owed a record.
    expect(resolveCronDelivery("0 2 * * *", new Date("2026-01-15T02:00:00Z")).outcome).toBe("no-meeting");
  });

  it("leaves an article-slot record when a gate shuts the slot", async () => {
    // cycle.ts returned `status: "paused", artifacts: []` here and wrote nothing at all: no run
    // file, no meeting record, no skip. main() only prints the result, so the job exited 0 and
    // the slot went red with no reason anywhere. The portfolio rooms were repaired for this exact
    // shape in portfolio/run.ts; the two article slots were missed.
    await mkdir(path.join(testStateRoot, "decisions"), { recursive: true });
    await writeFile(
      path.join(testStateRoot, "decisions", "2026-08-04-budget-fifty.md"),
      "# budget-fifty\n\nStatus: pending\n\nSignature / explicit approval reference: ____\n",
      "utf8"
    );

    const now = new Date("2026-08-04T08:00:00.000Z");
    process.env.MEETING_TRIGGER = "schedule";
    const result = await runCycle({
      phase: "article-am",
      dry: false,
      explainBudget: false,
      explainRouting: false,
      now
    });

    expect(result.status).toBe("paused");
    expect(result.artifacts).not.toHaveLength(0);

    const outcomes = await loadArticleSlotOutcomes(testStateRoot);
    const written = outcomes.find((outcome) => outcome.slot === "am" && outcome.date === "2026-08-04");
    expect(written, "the closed slot wrote a run record").toBeDefined();
    expect(written!.reason).toBe("budget_decision_not_countersigned");

    // And the calendar reads it as an explained slot rather than a red one.
    const at = pragueSlotInstant("2026-08-04", MEETING_CLOCK.find((slot) => slot.phase === "article-am")!.hour);
    const feed = buildCalendarFeed({
      weekOf: "2026-08-04",
      records: [],
      skips: [],
      articleSlots: outcomes,
      now: new Date(at.getTime() + 24 * 3_600_000)
    });
    const rendered = feed.slots.find((entry) => entry.at === at.toISOString())!;
    expect(rendered.status).toBe("skipped");
    expect(rendered.decisionOneLiner).toBe("budget_decision_not_countersigned");
  });

  it("never replaces a slot's real outcome with a gate record", async () => {
    // Re-running a scheduled workflow keeps event_name "schedule", so without this the gate
    // record would overwrite a slot that published hours earlier — a record stating something
    // that did not happen. Nothing on this path runs the pipeline, so it has no outcome to
    // displace a real one with.
    const published = path.join(testStateRoot, "ventures", "mma-files", "runs", "2026-08-06-am.json");
    await mkdir(path.dirname(published), { recursive: true });
    await writeFile(published, JSON.stringify({ schemaVersion: 1, date: "2026-08-06", slot: "am", status: "published" }), "utf8");

    process.env.MEETING_TRIGGER = "schedule";
    const result = await runCycle({
      phase: "article-am",
      dry: false,
      explainBudget: false,
      explainRouting: false,
      now: new Date("2026-08-06T08:00:00.000Z")
    });

    expect(result.artifacts).toHaveLength(0);
    expect(JSON.parse(await readFile(published, "utf8")).status).toBe("published");
  });

  it("writes nothing for a shut article slot that no schedule woke", async () => {
    // The mirror of portfolio/run.ts's rule: a manual or local invocation of a closed slot is not
    // a missed meeting, and writing one into the calendar would be a record of something that
    // did not happen.
    const runsDirectory = path.join(testStateRoot, "ventures", "mma-files", "runs");
    const before = await readdir(runsDirectory).catch(() => [] as string[]);
    const now = new Date("2026-08-05T08:00:00.000Z");
    delete process.env.MEETING_TRIGGER;
    const result = await runCycle({
      phase: "article-pm",
      dry: false,
      explainBudget: false,
      explainRouting: false,
      now
    });
    expect(result.status).toBe("paused");
    expect(result.artifacts).toHaveLength(0);
    expect(await readdir(runsDirectory).catch(() => [] as string[])).toEqual(before);
  });
});

describe("the cycle workflow records every scheduled run that resolves to a phase", () => {
  const workflow = readFile(path.join(repoRoot, ".github", "workflows", "cycle.yml"), "utf8");

  it("fails loudly, with a record, when a live cycle stages no canonical state", async () => {
    // `git diff --cached --quiet` used to exit 0 here. It is the terminal step of the write path,
    // so a cycle whose writes all landed outside the allowlist — or that wrote nothing at all —
    // ended the run green with no commit and no record, and nothing downstream noticed.
    const source = await workflow;
    const step = source.slice(source.indexOf("- name: Commit one atomic runtime cycle"));
    const branch = step.slice(step.indexOf("if git diff --cached --quiet; then"), step.indexOf("git commit -m \"cycle("));
    expect(branch).toContain("skip-cli.ts");
    expect(branch).toContain("wrote no record of this meeting");
    expect(branch).toContain("exit 1");
    // The quiet exit survives for exactly one reason — a dispatch claims no calendar slot, so it
    // has nothing to leave unexplained. Every other way out of this branch records and fails.
    expect(branch.match(/exit 0/gu) ?? []).toHaveLength(1);
    expect(branch).toContain('test "$EVENT_NAME" = "schedule" || exit 0');
  });

  it("checks that every skip recorder's push actually succeeded", async () => {
    // Three failed pushes used to drop the record silently in two of the three recorders. The run
    // then ended red with nothing on the calendar — the "cause is unknown" state NO_RECORD_REASON
    // exists to describe, arrived at by a step that exists to prevent it.
    const source = await workflow;
    const recorders = source.split("- name: ").filter((step) => step.includes("skip-cli.ts"));
    expect(recorders.length).toBeGreaterThanOrEqual(3);
    for (const recorder of recorders) {
      const name = recorder.slice(0, recorder.indexOf("\n"));
      expect(recorder, `${name} pushes without checking`).toContain("pushed=false");
      expect(recorder, `${name} never fails on a lost record`).toMatch(/if test "\$pushed" != "true"; then\n(?:.*\n)*?\s*exit 1/u);
    }
  });

  it("recovers the slot name when the step that resolves it is what failed", async () => {
    // `test -n "$PHASE" || exit 0` meant the run that failed earliest was the one guaranteed to
    // leave no trace. The cron names the slot on its own, so the name is recovered rather than
    // given up on.
    const source = await workflow;
    const step = source.slice(source.indexOf("- name: Say on the calendar why this run did not finish"));
    expect(step).toContain('if test -z "$PHASE"; then');
    expect(step).toContain("clock-cli.ts");
    expect(step).toContain("EVENT_SCHEDULE: ${{ github.event.schedule }}");
  });
});
