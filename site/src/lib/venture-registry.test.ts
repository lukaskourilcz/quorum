import { readFile } from "node:fs/promises";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOwnerOnlyMeetingKinds,
  getOwnerOnlyVentureIds,
  getPublicCalendarSchedule
} from "./venture-registry";
import { CALENDAR_SLOTS } from "./calendar-feed-model";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

describe("public project schedule", () => {
  it("matches the live registry exactly, minus the ventures the owner paused", async () => {
    /*
     * CALENDAR_SLOTS is the static mirror of the full clock; the live schedule is that mirror
     * with every paused venture's rooms removed, because a paused venture's rooms will not sit.
     * The expected set is computed from the registry itself so this holds whichever way the
     * owner's Settings switches point on the day the suite runs.
     */
    const registry = JSON.parse(await readFile(
      path.join(process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), ".."), "config", "ventures.json"),
      "utf8"
    )) as { ventures: Array<{ status?: string; meetings: Array<{ kind: string }>; productionJobs?: Array<{ kind: string }> }> };
    const pausedKinds = new Set(registry.ventures
      .filter((venture) => venture.status === "paused")
      .flatMap((venture) => [
        ...venture.meetings.map(({ kind }) => kind),
        ...(venture.productionJobs ?? []).flatMap(({ kind }) => kind === "article-production" ? ["article-am", "article-pm"] : [kind])
      ]));
    const schedule = await getPublicCalendarSchedule();
    expect(schedule.map(({ hour, kind, label }) => ({ hour, kind, label })))
      .toEqual(CALENDAR_SLOTS.filter(({ kind }) => !pausedKinds.has(kind)));
    expect(new Set(schedule.map(({ hour }) => hour)).size).toBe(schedule.length);
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
        meetings: [{ kind: "dm-desk", label: "Paused desk", cadence: "daily@15:00" }]
      }]
    }));
    const schedule = await getPublicCalendarSchedule(root);
    expect(schedule.map(({ hour, kind }) => ({ hour, kind }))).toEqual([
      { hour: 6, kind: "venture-morning" },
      { hour: 9, kind: "mag-editorial" },
      { hour: 14, kind: "venture-afternoon" },
      { hour: 22, kind: "venture-night" }
    ]);
    expect(JSON.stringify(schedule)).not.toContain("Paused desk");
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
      { hour: 14, kind: "venture-afternoon" },
      { hour: 18, kind: "article-pm" },
      { hour: 22, kind: "venture-night" }
    ]);
    expect(await getOwnerOnlyVentureIds(root)).toEqual(new Set(["personal-growth"]));
    expect(await getOwnerOnlyMeetingKinds(root)).toEqual(new Set(["pg-desk"]));
    expect(JSON.stringify(schedule)).not.toContain("Private desk");
  });
});
