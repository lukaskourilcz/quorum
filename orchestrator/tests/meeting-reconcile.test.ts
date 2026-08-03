import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadRoutingConfig, routeBoardroom } from "../src/boardroom/router.js";
import { MeetingSkipSchema } from "../src/contracts/meeting-skip.js";
import { MEETING_CLOCK } from "../src/meetings/clock.js";
import {
  NO_RECORD_REASON,
  previousPragueDate,
  reconcileMeetingDay
} from "../src/meetings/reconcile-cli.js";
import { createOfflineCaughtUpMeeting } from "../src/meetings/record.js";
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
  it("accounts for all fifteen slots when nothing anywhere reported them", async () => {
    // Every recorder in cycle.yml is a step inside the run it describes, so a run stopped before
    // those steps — or one whose commit never landed — left no record at all and the calendar
    // showed the slot red as "missed" with nothing saying why.
    const root = await emptyRoot();
    const result = await reconcileMeetingDay(root, DATE, NOW);
    expect(MEETING_CLOCK).toHaveLength(15);
    expect(result.recorded).toHaveLength(15);
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

  it("writes nothing on a second pass over the same day", async () => {
    const root = await emptyRoot();
    await reconcileMeetingDay(root, DATE, NOW);
    const before = await readFile(skipPath(root, "night"), "utf8");
    const second = await reconcileMeetingDay(root, DATE, new Date("2026-08-03T09:00:00.000Z"));
    expect(second.recorded).toEqual([]);
    // Byte-identical, so a daily reconciler cannot keep rewriting decidedAt on a settled day.
    expect(await readFile(skipPath(root, "night"), "utf8")).toBe(before);
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
      phase: "studio",
      reason: "The countersign-aware budget shape disabled this phase.",
      decidedAt: `${DATE}T11:02:00.000Z`
    };
    await writeFile(skipPath(root, "studio"), JSON.stringify(existing), "utf8");

    const result = await reconcileMeetingDay(root, DATE, NOW);

    expect(result.recorded).toHaveLength(12);
    expect(await readFile(recordFile, "utf8")).toBe(recordBefore);
    expect(await exists(skipPath(root, "cu-edition"))).toBe(false);
    expect(await exists(skipPath(root, "article-am"))).toBe(false);
    expect(JSON.parse(await readFile(skipPath(root, "studio"), "utf8")).reason)
      .toBe(existing.reason);
  });

  it("refuses a day that is not over, so a late cron is never written off", async () => {
    // Crons fire an hour ahead of their slot and GitHub queues them late by anything from
    // minutes to hours, so a slot earlier today may still be on its way.
    const root = await emptyRoot();
    await expect(reconcileMeetingDay(root, "2026-08-03", NOW)).rejects.toThrow(/finished Prague day/);
    await expect(reconcileMeetingDay(root, "2026-08-09", NOW)).rejects.toThrow(/finished Prague day/);
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
    // not honoured, so the job lands around 10:15 Prague in summer and 09:15 in winter, both
    // well after the last slot of the day it reconciles. Tracked in NEEDS_YOUR_HELP_NOW.md.
    expect(source).toContain('- cron: "15 8 * * *"');
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
