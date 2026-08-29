import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EDITION_RETRY_HOUR,
  EDITION_RETRY_PHASE,
  MEETING_CLOCK
} from "../src/meetings/clock.js";
import { findSlotRecord, slotRecordPath } from "../src/meetings/slot-record.js";
import { ScheduledPhaseSchema } from "../src/types.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");

interface CronEntry {
  path: string;
  schedule: string;
}

interface VercelConfig {
  git: {
    deploymentEnabled: boolean;
  };
  crons: CronEntry[];
}

async function vercelConfig(): Promise<VercelConfig> {
  const raw = await readFile(path.join(repoRoot, "site", "vercel.json"), "utf8");
  return JSON.parse(raw) as VercelConfig;
}

async function vercelCrons(): Promise<CronEntry[]> {
  return (await vercelConfig()).crons;
}

/**
 * The Vercel schedule is a second copy of the meeting clock, in a file Vercel reads and the
 * orchestrator never does. A copy that drifts is the whole risk: a venture whose cadence moves
 * would keep its GitHub cron and lose its punctual one, silently, and the only symptom would be
 * that the slot went back to arriving hours late.
 */
describe("the deployed Vercel schedule matches the meeting clock", () => {
  it("keeps automatic Git deployments disabled", async () => {
    expect((await vercelConfig()).git).toEqual({ deploymentEnabled: false });
  });

  it("carries both daylight-saving variants of every scheduled slot and nothing else", async () => {
    // Every meeting slot, plus one dispatch that is not a meeting: the edition slot's same-day
    // retry. It carries no Prague hour of its own on the clock -- 09:00 belongs to the story
    // meeting -- because it is a second attempt at the 05:00 slot rather than a room of its own.
    const dispatches = [
      ...MEETING_CLOCK,
      { phase: EDITION_RETRY_PHASE, hour: EDITION_RETRY_HOUR }
    ];
    const expected = dispatches.flatMap((slot) => [
      { path: `/api/cron/${slot.phase}`, schedule: `0 ${(slot.hour - 2 + 24) % 24} * * *` },
      { path: `/api/cron/${slot.phase}`, schedule: `0 ${(slot.hour - 1 + 24) % 24} * * *` }
    ]);
    const actual = await vercelCrons();
    const key = (entry: CronEntry) => `${entry.path} ${entry.schedule}`;
    expect([...actual].map(key).sort()).toEqual([...expected].map(key).sort());
    expect(MEETING_CLOCK.length).toBeGreaterThan(0);
    expect(actual).toHaveLength(dispatches.length * 2);
    // The retry must stay off the meeting clock. `resolveScheduledPhase` has to name at most one
    // phase for a Prague hour, so the retry cannot be a slot: it is a second attempt at the day's
    // own slot, dispatched by name. Since the MMA day took the story meeting's hour, the retry
    // hour is simply empty — which satisfies the same invariant more plainly than sharing it did.
    expect(MEETING_CLOCK.filter((slot) => slot.hour === EDITION_RETRY_HOUR).map(({ phase }) => phase))
      .not.toContain(EDITION_RETRY_PHASE);
  });

  it("stays inside Vercel's documented cron limits", async () => {
    const actual = await vercelCrons();
    // 100 per project on every plan.
    expect(actual.length).toBeLessThanOrEqual(100);
    for (const entry of actual) {
      // "Must start with /", 512-character ceiling, and no query string: Vercel documents the
      // dynamic route segment as the way to give two entries different arguments and never
      // sanctions a query string, so the phase travels as a path segment.
      expect(entry.path.startsWith("/")).toBe(true);
      expect(entry.path.length).toBeLessThanOrEqual(512);
      expect(entry.path).not.toContain("?");
      expect(entry.schedule.length).toBeLessThanOrEqual(256);
      // One firing per day per entry. Vercel rejects anything more frequent at deploy time on
      // Hobby, and this repository's deploys are how the site ships — a schedule shape that only
      // deploys on Pro couples the whole site's release to the billing plan.
      expect(entry.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/u);
    }
  });

  it("gives every phase a route segment the route can parse", async () => {
    for (const entry of await vercelCrons()) {
      const phase = entry.path.replace("/api/cron/", "");
      expect(ScheduledPhaseSchema.safeParse(phase).success, entry.path).toBe(true);
    }
  });
});

/**
 * The double-fire guard's one piece of knowledge. Both schedules exist during the transition, so
 * a slot can be fired for twice; the run that arrives second has to see the first one's record.
 */
describe("the slot record a second firing looks for", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "slot-record-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function write(relative: string): Promise<void> {
    await mkdir(path.join(root, path.dirname(relative)), { recursive: true });
    await writeFile(path.join(root, relative), "{}\n");
  }

  // Not a table of names copied from the implementation: each of these is the path the runtime
  // actually writes, so a change to either side breaks this.
  it.each([
    ["morning", "standups/2026-08-04-morning.json"],
    ["afternoon", "standups/2026-08-04-afternoon.json"],
    ["night", "standups/2026-08-04-night.json"],
    ["cu-edition", "meetings/2026-08-04-cu-edition.json"],
    ["mag-desk", "meetings/2026-08-04-mag-desk.json"],
    ["article-am", "ventures/mma-files/runs/2026-08-04-am.json"],
    ["article-pm", "ventures/mma-files/runs/2026-08-04-pm.json"]
  ])("finds the %s record where the runtime writes it", async (phase, relative) => {
    const parsed = ScheduledPhaseSchema.parse(phase);
    // 2026-08-04T08:00:00Z is 10:00 in Prague, so the Prague day is unambiguous.
    const at = new Date("2026-08-04T08:00:00.000Z");
    expect(slotRecordPath(parsed, "2026-08-04")).toBe(relative);
    expect(await findSlotRecord(root, parsed, at)).toBeNull();
    await write(relative);
    expect(await findSlotRecord(root, parsed, at)).toBe(relative);
  });

  it("reads the Prague day and not the UTC day", async () => {
    // 22:30 UTC on 4 August is 00:30 on 5 August in Prague, which is the day the night slot's
    // record is filed under. Reading UTC here would look for the wrong file every summer night.
    const at = new Date("2026-08-04T22:30:00.000Z");
    await write("standups/2026-08-04-night.json");
    expect(await findSlotRecord(root, "night", at)).toBeNull();
    await write("standups/2026-08-05-night.json");
    expect(await findSlotRecord(root, "night", at)).toBe("standups/2026-08-05-night.json");
  });

  it("ignores a skip, because a skip is a slot that cost nothing and can still be held", async () => {
    const at = new Date("2026-08-04T08:00:00.000Z");
    await write("meetings/skips/2026-08-04-studio.json");
    expect(await findSlotRecord(root, "studio", at)).toBeNull();
  });

  it("covers every phase the schedule can fire for", () => {
    for (const slot of MEETING_CLOCK) {
      expect(slotRecordPath(slot.phase, "2026-08-04")).toMatch(/^[a-z]/u);
    }
  });

  /**
   * cycle.yml's second look — `git cat-file -e origin/<branch>:<path>` — needs the path even when
   * this checkout does not have the file, because a queued run's checkout can predate the commit
   * that carries it. Dropping `path` from the not-recorded answer would not fail anything: the
   * branch-tip check would simply stop finding records and the guard would quietly lose its only
   * defence against a stale checkout.
   */
  it("names the path it looked for even when the record is absent", async () => {
    const cli = path.join(repoRoot, "orchestrator", "src", "meetings", "slot-record-cli.ts");
    const run = (phase: string) =>
      new Promise<string>((resolve, reject) => {
        execFile(
          process.execPath,
          ["--import", "tsx", cli, "--phase", phase, "--at", "1999-01-04T08:00:00.000Z"],
          { cwd: path.join(repoRoot, "orchestrator") },
          (error, stdout) => (error ? reject(error) : resolve(stdout.trim()))
        );
      });
    // A date this repository can never hold a record for. Dated on the day it was written,
    // this asserted "studio has no record for 2026-08-04" — and the studio room recorded one
    // that afternoon, so the test failed on the merge that carried it in. A fixture that reads
    // live state has to pick an instant live state cannot reach.
    const absent = JSON.parse(await run("studio")) as { recorded: boolean; path?: string };
    expect(absent.recorded).toBe(false);
    expect(absent.path).toBe("state/meetings/1999-01-04-studio.json");
  });
});
