import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicCalendarSchedule } from "./venture-registry";
import { CALENDAR_SLOTS } from "./calendar-feed-model";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

describe("public project schedule", () => {
  it("matches the live registry exactly, with one row per Prague hour", async () => {
    const schedule = await getPublicCalendarSchedule();
    expect(schedule).toEqual(CALENDAR_SLOTS);
    expect(new Set(schedule.map(({ hour }) => hour)).size).toBe(schedule.length);
    expect(schedule.filter(({ kind }) => ["bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk"].includes(kind)))
      .toEqual([
        { hour: 12, kind: "bh-desk", label: "BOOKSOFHISTORY editorial desk" },
        { hour: 15, kind: "dm-desk", label: "Door Money daily storytelling desk" },
        { hour: 16, kind: "dm-growth", label: "Door Money Thursday growth room" },
        { hour: 18, kind: "ts-desk", label: "Tehdejší svět editorial desk" },
        { hour: 21, kind: "kv-desk", label: "Kvórum daily political desk" }
      ]);
  });

  it("includes meeting and article-production times from the same registry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "public-schedule-"));
    await mkdir(path.join(root, "config"), { recursive: true });
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [{
        meetings: [{ kind: "mag-editorial", label: "Story meeting", cadence: "daily@09:00" }],
        productionJobs: [{ kind: "article-production", cadence: "2x-daily@10:00,18:00" }]
      }]
    }));
    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    const schedule = await getPublicCalendarSchedule();
    expect(schedule.map(({ hour, kind }) => ({ hour, kind }))).toEqual([
      { hour: 6, kind: "venture-morning" },
      { hour: 9, kind: "mag-editorial" },
      { hour: 10, kind: "article-am" },
      { hour: 14, kind: "venture-afternoon" },
      { hour: 18, kind: "article-pm" },
      { hour: 22, kind: "venture-night" }
    ]);
  });
});
