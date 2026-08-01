import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicCalendarSchedule } from "./venture-registry";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

describe("public project schedule", () => {
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
