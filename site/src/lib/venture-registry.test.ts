import { readFile } from "node:fs/promises";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOwnerOnlyMeetingKinds,
  getOwnerOnlyVentureIds,
  getPublicCalendarSchedule,
  getPublicRoomSchedule
} from "./venture-registry";
import { CALENDAR_SLOTS, ROOM_SLOTS } from "./calendar-feed-model";
import { resolveCronSlots } from "./cron-slots";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

const repoRoot = () => process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

async function liveRegistry() {
  return JSON.parse(await readFile(path.join(repoRoot(), "config", "ventures.json"), "utf8")) as {
    ventures: Array<{
      status?: string;
      visibility: string;
      day?: { kind: string; steps: string[] };
      meetings: Array<{ kind: string }>;
      productionJobs?: Array<{ kind: string }>;
    }>;
  };
}

describe("public project schedule", () => {
  it("matches the live registry exactly, minus the ventures the owner paused", async () => {
    /*
     * CALENDAR_SLOTS is the static mirror of the full clock; the live schedule is that mirror
     * with every paused venture's rooms removed, because a paused venture's rooms will not sit.
     * The expected set is computed from the registry itself so this holds whichever way the
     * owner's Settings switches point on the day the suite runs.
     */
    const registry = await liveRegistry();
    const pausedKinds = new Set(registry.ventures
      .filter((venture) => venture.status === "paused")
      .flatMap((venture) => [
        ...(venture.day ? [venture.day.kind] : []),
        ...venture.meetings.map(({ kind }) => kind),
        ...(venture.productionJobs ?? []).flatMap(({ kind }) => kind === "article-production" ? ["article-am", "article-pm"] : [kind])
      ]));
    const schedule = await getPublicCalendarSchedule();
    expect(schedule.map(({ hour, kind, label }) => ({ hour, kind, label })))
      .toEqual(CALENDAR_SLOTS.filter(({ kind }) => !pausedKinds.has(kind)));
    expect(new Set(schedule.map(({ hour }) => hour)).size).toBe(schedule.length);
  });

  /*
   * The calendar and the dispatcher read the same registry through two derivations, and this is
   * where they are held to the same answer. `resolveCronSlots` schedules a paused venture's day
   * anyway — the cron still fires and the engine records a no-op — while the calendar refuses to
   * promise a room that will not sit, so the comparison is made after the same filter.
   *
   * Without this, the two drifted silently for a whole clock revision: the dispatcher moved to
   * venture days while the public calendar kept printing the eighteen-row clock that had been
   * retired, complete with an afternoon and a night company meeting nobody was holding.
   */
  it("agrees with the cron dispatcher about which hours have a slot", async () => {
    const registry = await liveRegistry();
    const publicVentures = new Set(registry.ventures
      .filter((venture) => venture.visibility === "public" && venture.status !== "paused")
      .flatMap((venture) => [
        ...(venture.day ? [venture.day.kind] : []),
        ...venture.meetings.map(({ kind }) => kind),
        ...(venture.productionJobs ?? []).map(({ kind }) => kind === "article-production" ? "article-am" : kind)
      ]));
    const dispatched = resolveCronSlots(registry)
      .filter((slot) => slot.phase === "morning" || publicVentures.has(slot.phase))
      .map((slot) => slot.hour);
    expect((await getPublicCalendarSchedule()).map(({ hour }) => hour)).toEqual(dispatched);
  });

  it("reads the same clock as rooms for the plan, each at the hour it now sits", async () => {
    const registry = await liveRegistry();
    const pausedRooms = new Set(registry.ventures
      .filter((venture) => venture.status === "paused")
      .flatMap((venture) => [
        ...venture.meetings.map(({ kind }) => kind),
        ...(venture.productionJobs ?? []).flatMap(({ kind }) => kind === "article-production" ? ["article-am", "article-pm"] : [kind])
      ]));
    const rooms = await getPublicRoomSchedule();
    expect(rooms.map(({ hour, kind, label }) => ({ hour, kind, label })))
      .toEqual(ROOM_SLOTS.filter(({ kind }) => !pausedRooms.has(kind)));
    // Every room the calendar's days stand for is still here: consolidating the clock was never
    // meant to remove a room, and the plan's journeys run between rooms.
    const dayKinds = new Set(registry.ventures.flatMap((venture) => venture.day?.steps ?? []));
    const scheduled = new Set((await getPublicCalendarSchedule()).map(({ kind }) => kind));
    for (const kind of rooms.map(({ kind }) => kind)) {
      expect(dayKinds.has(kind) || scheduled.has(kind), `${kind} is either a day's room or its own slot`).toBe(true);
    }
  });

  it("puts a venture's day on the clock and its rooms inside it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "public-schedule-day-"));
    await mkdir(path.join(root, "config"), { recursive: true });
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [{
        id: "magazine",
        status: "operating",
        visibility: "public",
        day: {
          kind: "mma-day",
          label: "Magazine daily desk",
          cadence: "daily@08:00",
          // A day dispatches rooms across ventures: the data check below belongs to `analytics`.
          steps: ["mma-intake", "mag-editorial", "article-am"]
        },
        meetings: [{ kind: "mag-editorial", label: "Story meeting", cadence: "daily@09:00", cast: ["QUILL"] }],
        productionJobs: [{ kind: "article-production", cadence: "daily@10:00" }]
      }, {
        id: "analytics",
        status: "operating",
        visibility: "public",
        meetings: [{ kind: "mma-intake", label: "Data check", cadence: "daily@08:00", cast: ["FORGE"] }]
      }]
    }));
    const schedule = await getPublicCalendarSchedule(root);
    expect(schedule.map(({ hour, kind }) => ({ hour, kind }))).toEqual([
      { hour: 6, kind: "venture-morning" },
      { hour: 8, kind: "mma-day" }
    ]);
    // The rooms lost their hours, not their identities: nothing else on the clock names them.
    expect(JSON.stringify(schedule)).not.toContain("Story meeting");
    expect(JSON.stringify(schedule)).not.toContain("Data check");
  });

  it("drops a paused venture's rooms and keeps everyone else's", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "public-schedule-paused-"));
    await mkdir(path.join(root, "config"), { recursive: true });
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [{
        id: "magazine",
        status: "operating",
        visibility: "public",
        meetings: [{ kind: "mag-editorial", label: "Story meeting", cadence: "daily@09:00" }]
      }, {
        id: "shelved",
        status: "paused",
        visibility: "public",
        day: { kind: "dm-day", label: "Paused day", cadence: "daily@15:00", steps: ["dm-desk"] },
        meetings: [{ kind: "dm-desk", label: "Paused desk", cadence: "daily@15:00" }]
      }]
    }));
    const schedule = await getPublicCalendarSchedule(root);
    expect(schedule.map(({ hour, kind }) => ({ hour, kind }))).toEqual([
      { hour: 6, kind: "venture-morning" },
      { hour: 9, kind: "mag-editorial" }
    ]);
    expect(JSON.stringify(schedule)).not.toContain("Paused desk");
    expect(JSON.stringify(schedule)).not.toContain("Paused day");
  });

  it("includes meeting and article-production times from the same registry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "public-schedule-"));
    await mkdir(path.join(root, "config"), { recursive: true });
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [{
        id: "magazine",
        visibility: "public",
        meetings: [{ kind: "mag-editorial", label: "Story meeting", cadence: "daily@09:00" }],
        productionJobs: [{ kind: "article-production", cadence: "2x-daily@10:00,18:00" }]
      }, {
        id: "personal-growth",
        visibility: "owner-only",
        meetings: [{ kind: "pg-desk", label: "Private desk", cadence: "daily@23:00", cast: ["GUIDE"] }]
      }]
    }));
    const schedule = await getPublicCalendarSchedule(root);
    expect(schedule.map(({ hour, kind }) => ({ hour, kind }))).toEqual([
      { hour: 6, kind: "venture-morning" },
      { hour: 9, kind: "mag-editorial" },
      { hour: 10, kind: "article-am" },
      { hour: 18, kind: "article-pm" }
    ]);
    expect(await getOwnerOnlyVentureIds(root)).toEqual(new Set(["personal-growth"]));
    expect(await getOwnerOnlyMeetingKinds(root)).toEqual(new Set(["pg-desk"]));
    expect(JSON.stringify(schedule)).not.toContain("Private desk");
  });
});
