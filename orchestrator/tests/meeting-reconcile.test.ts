import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadRoutingConfig, routeBoardroom } from "../src/boardroom/router.js";
import { MeetingSkipSchema } from "../src/contracts/meeting-skip.js";
import { buildCalendarFeed, mondayOfWeek, pragueSlotInstant, PUBLIC_MEETING_CLOCK } from "../src/meetings/calendar.js";
import { MEETING_CLOCK } from "../src/meetings/clock.js";
import {
  NO_RECORD_REASON,
  previousPragueDate,
  reconcileMeetingDay
} from "../src/meetings/reconcile-cli.js";
import { createOfflineCaughtUpMeeting } from "../src/meetings/record.js";
import { CRON_HOUR_CARRY, CRON_MINUTE } from "../src/ventures/registry.js";
import { configRoot, repoRoot } from "../src/paths.js";

/** A finished Prague day, read at health.yml's cron the next morning: 08:15 UTC, 10:15 Prague. */
const DATE = "2026-08-02";
const NOW = new Date("2026-08-03T08:15:00.000Z");

async function emptyRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "meeting-reconcile-"));
}

function skipPath(root: string, phase: string): string {
  return path.join(root, "meetings", "skips", `${DATE}-${phase}.json`);
}

async function exists(file: string): Promise<boolean> {
  return readFile(file, "utf8").then(() => true, () => false);
}

/** A real cu-edition record for the reconciled day, written where loadMeetingRecords finds it. */
async function seedEditionRecord(root: string): Promise<string> {
  const routing = await loadRoutingConfig(path.join(configRoot, "agent-routing.json"));
  const now = new Date(`${DATE}T03:00:00.000Z`);
  const record = await createOfflineCaughtUpMeeting({
    cycleId: `20260802-cu-edition`,
    phase: "cu-edition",
    stage: "VALIDATION",
    room: routeBoardroom(routing, {
      roomId: "ROOM-CU-EDITION",
      topicType: "edition",
      objective: "Select a story or NO_EDITION",
      evidenceRefs: [],
      decisionNeeded: "EDITION",
      riskTags: [],
      budgetImpactUsd: 0.08,
      preset: "edition-room",
      now
    }),
    now,
    estimatedCycleUsd: 0.08
  });
  const file = path.join(root, "meetings", `${DATE}-cu-edition.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return file;
}

describe("a day with no record of its slots still gets one", () => {
  it("accounts for every slot when nothing anywhere reported them", async () => {
    // Every recorder in cycle.yml is a step inside the run it describes, so a run stopped before
    // those steps — or one whose commit never landed — left no record at all and the calendar
    // showed the slot red as "missed" with nothing saying why.
    const root = await emptyRoot();
    const result = await reconcileMeetingDay(root, DATE, NOW);
    expect(PUBLIC_MEETING_CLOCK.length).toBeGreaterThan(0);
    expect(result.recorded).toHaveLength(MEETING_CLOCK.length);
    for (const definition of MEETING_CLOCK) {
      const skip = MeetingSkipSchema.parse(
        JSON.parse(await readFile(skipPath(root, definition.phase), "utf8"))
      );
      expect(skip.date).toBe(DATE);
      expect(skip.reason).toBe(NO_RECORD_REASON);
      // The reason is published on the calendar, so it must not name a cause the repository
      // cannot establish: nothing here distinguishes an undelivered cron from a cancelled run.
      expect(skip.reason).not.toMatch(/never started|cancel|GitHub/iu);
    }
  });

  it("accounts for the private desk the public calendar cannot show", async () => {
    /*
     * This used to assert the opposite, and that assertion was the defect.
     *
     * `PUBLIC_MEETING_CLOCK` exists so an owner-only venture never appears on the public calendar,
     * and the reconciler walked it — which made the one desk nobody can see the one desk nobody
     * accounts for. `pg-desk` was countersigned on 26 August and by the 29th had produced no
     * meeting record and no skip record at all, so nothing anywhere said whether it had ever run.
     *
     * Off the public calendar and unaccounted for are different things, and only the first was
     * ever intended.
     */
    const root = await emptyRoot();
    await reconcileMeetingDay(root, DATE, NOW);

    const skip = MeetingSkipSchema.parse(JSON.parse(await readFile(skipPath(root, "pg-desk"), "utf8")));
    expect(skip).toMatchObject({ date: DATE, phase: "pg-desk", reason: NO_RECORD_REASON });

    // And it still cannot reach the public calendar: the feed walks the public clock, so a skip
    // on disk for a private phase has no slot to attach to.
    const feed = buildCalendarFeed({
      weekOf: mondayOfWeek(DATE),
      records: [],
      skips: [skip],
      now: NOW
    });
    expect(feed.slots.some((slot) => JSON.stringify(slot).includes("pg-desk"))).toBe(false);
    expect(PUBLIC_MEETING_CLOCK.some((definition) => definition.phase === "pg-desk")).toBe(false);
  });

  it("writes nothing on a second pass over the same day", async () => {
    const root = await emptyRoot();
    await reconcileMeetingDay(root, DATE, NOW);
    // The morning is the company's one meeting now; the night is retired from the clock and the
    // reconciler only accounts for slots the clock keeps.
    const before = await readFile(skipPath(root, "morning"), "utf8");
    const second = await reconcileMeetingDay(root, DATE, new Date("2026-08-03T09:00:00.000Z"));
    expect(second.recorded).toEqual([]);
    // Byte-identical, so a daily reconciler cannot keep rewriting decidedAt on a settled day.
    expect(await readFile(skipPath(root, "morning"), "utf8")).toBe(before);
  });

  it("leaves a held meeting, a published article slot and an existing skip alone", async () => {
    const root = await emptyRoot();
    const recordFile = await seedEditionRecord(root);
    const recordBefore = await readFile(recordFile, "utf8");
    await mkdir(path.join(root, "ventures", "mma-files", "runs"), { recursive: true });
    await writeFile(
      path.join(root, "ventures", "mma-files", "runs", `${DATE}-am.json`),
      JSON.stringify({ date: DATE, slot: "am", status: "published" }),
      "utf8"
    );
    await mkdir(path.join(root, "meetings", "skips"), { recursive: true });
    const existing = {
      schemaVersion: "meeting-skip/1",
      date: DATE,
      phase: "mma-analysis",
      reason: "The countersign-aware budget shape disabled this phase.",
      decidedAt: `${DATE}T11:02:00.000Z`
    };
    await writeFile(skipPath(root, "mma-analysis"), JSON.stringify(existing), "utf8");

    const result = await reconcileMeetingDay(root, DATE, NOW);

    // Every slot on the clock but the two this case already accounted for. Three artifacts, two
    // slots: the edition record settles DNESKAi's day, while the published article and the
    // analysis skip both belong to the MMA Files day and settle the one row between them.
    expect(result.recorded).toHaveLength(MEETING_CLOCK.length - 2);
    expect(await readFile(recordFile, "utf8")).toBe(recordBefore);
    expect(await exists(skipPath(root, "cu-edition"))).toBe(false);
    expect(await exists(skipPath(root, "article-am"))).toBe(false);
    expect(JSON.parse(await readFile(skipPath(root, "mma-analysis"), "utf8")).reason)
      .toBe(existing.reason);
  });

  it("refuses a day that is not over, so a late cron is never written off", async () => {
    // Crons fire an hour ahead of their slot and GitHub queues them late by anything from
    // minutes to hours, so a slot earlier today may still be on its way.
    const root = await emptyRoot();
    await expect(reconcileMeetingDay(root, "2026-08-03", NOW)).rejects.toThrow(/finished Prague day/);
    await expect(reconcileMeetingDay(root, "2026-08-09", NOW)).rejects.toThrow(/finished Prague day/);
  });

  it("never writes off a slot whose run could still arrive", async () => {
    // The filter reads "!== missed", and "late" is now a status of its own, so a slot still inside
    // its delivery window is left alone rather than told "no record of this slot exists" — which
    // would be false by the time anybody read it. Asserted rather than assumed: this is the one
    // place where the calendar's new status decides whether a claim gets written to disk.
    const root = await emptyRoot();
    const lastSlot = PUBLIC_MEETING_CLOCK.reduce((latest, slot) => slot.hour > latest.hour ? slot : latest);
    // The night shift sits at 22:00 Prague and its window closes at 03:00 the next morning, so
    // 01:00 is past midnight — a finished Prague day, which the guard lets through — while the
    // slot is still inside its window. Only the status stops it here.
    const soonAfterMidnight = new Date(pragueSlotInstant(DATE, lastSlot.hour).getTime() + 3 * 60 * 60_000);
    const early = await reconcileMeetingDay(root, DATE, soonAfterMidnight);
    expect(early.recorded).not.toContain(`state/meetings/skips/${DATE}-${lastSlot.phase}.json`);
    expect(await exists(skipPath(root, lastSlot.phase))).toBe(false);

    // health.yml runs at 08:15 Prague, by which point every slot of the finished day is hours
    // past its window, so the same slot is reconciled on the pass that actually happens.
    const atHealthCheck = await reconcileMeetingDay(root, DATE, NOW);
    expect(atHealthCheck.recorded).toContain(`state/meetings/skips/${DATE}-${lastSlot.phase}.json`);
  });

  it("reads yesterday off the Prague calendar, not off UTC", async () => {
    expect(previousPragueDate(NOW)).toBe(DATE);
    // 22:30 UTC is already the next day in Prague, and the day to reconcile moves with it.
    expect(previousPragueDate(new Date("2026-08-03T22:30:00.000Z"))).toBe("2026-08-03");
  });
});

describe("something actually runs the reconciler every day", () => {
  it("wires the daily job into health.yml with a writable commit and no extra gate", async () => {
    const source = await readFile(
      path.join(repoRoot, ".github", "workflows", "health.yml"),
      "utf8"
    );
    const workflow = parse(source) as {
      jobs: Record<string, {
        if?: string;
        permissions?: Record<string, string>;
        steps: Array<{ name?: string; run?: string }>;
      }>;
    };
    // One daily cron carries this job. GitHub reads it in UTC — the `timezone` key beside it is
    // not honoured, so the job lands around 09:55 Prague in summer and 08:55 in winter, both
    // well after the last slot of the day it reconciles. Tracked in docs/NEEDED.md.
    // The minute is CRON_MINUTE and the hour is one below the hour this job belongs to, the same
    // arrangement every scheduled workflow uses; ci-policy.test.ts is what holds all of them to it.
    expect(source).toContain(`- cron: "${CRON_MINUTE} ${8 - CRON_HOUR_CARRY} * * *"`);
    const job = workflow.jobs.reconcile;
    expect(job, "health.yml must carry the reconcile job").toBeDefined();
    // The health check itself is gated on HEALTH_CHECK_ENABLED and a production URL secret;
    // yesterday's meetings must be accounted for whether or not the site is being polled.
    expect(job!.if).toBeUndefined();
    expect(job!.permissions?.contents).toBe("write");
    const script = job!.steps.map((step) => step.run ?? "").join("\n");
    expect(script).toContain("meetings:reconcile");
    expect(script).toContain("git add -A -- state/meetings/skips");
    expect(script).toContain("git rebase --autostash");
  });

  it("exposes the reconciler as the npm script the workflow calls", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(repoRoot, "orchestrator", "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    expect(manifest.scripts["meetings:reconcile"]).toBe("tsx src/meetings/reconcile-cli.ts");
  });
});
