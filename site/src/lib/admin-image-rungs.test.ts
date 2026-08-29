import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminImageRungs } from "./admin-image-rungs";

async function selections(venture: string, records: Array<{ file: string; body: string }>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "image-rungs-"));
  const directory = path.join(root, "state", "ventures", venture, "image-selections");
  await mkdir(directory, { recursive: true });
  for (const record of records) await writeFile(path.join(directory, record.file), record.body);
  return root;
}

function record(date: string, rung: string): string {
  return JSON.stringify({ schemaVersion: "image-selection/1", venture: "caught-up", slug: `${date}-a`, date, rung });
}

describe("admin image rungs", () => {
  it("reports the newest selection and how often the window fell to the plate", async () => {
    const root = await selections("caught-up", [
      { file: "2026-08-26-a.json", body: record("2026-08-26", "search") },
      { file: "2026-08-27-a.json", body: record("2026-08-27", "plate") },
      { file: "2026-08-28-a.json", body: record("2026-08-28", "curated") }
    ]);

    await expect(readAdminImageRungs(["caught-up"], root)).resolves.toEqual({
      "caught-up": {
        date: "2026-08-28", slug: "2026-08-28-a", rung: "curated",
        fellToPlate: false, plateCount: 1, sampled: 3, malformed: 0
      }
    });
  });

  it("flags an article that shipped the drawn plate", async () => {
    const root = await selections("mma-files", [{ file: "2026-08-28-a.json", body: record("2026-08-28", "plate") }]);
    const rungs = await readAdminImageRungs(["mma-files"], root);
    expect(rungs["mma-files"]).toMatchObject({ rung: "plate", fellToPlate: true, plateCount: 1 });
  });

  it("counts a record it cannot read instead of dropping it silently", async () => {
    const root = await selections("caught-up", [
      { file: "2026-08-27-a.json", body: "{ not json" },
      { file: "2026-08-26-a.json", body: JSON.stringify({ date: "2026-08-26", slug: "a", rung: "teleport" }) },
      { file: "2026-08-25-a.json", body: record("2026-08-25", "search") }
    ]);

    await expect(readAdminImageRungs(["caught-up"], root)).resolves.toEqual({
      "caught-up": {
        date: "2026-08-25", slug: "2026-08-25-a", rung: "search",
        fellToPlate: false, plateCount: 0, sampled: 1, malformed: 2
      }
    });
  });

  it("reads a venture that has never recorded a selection as empty, not as a failure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "image-rungs-"));
    await expect(readAdminImageRungs(["kvorum"], root)).resolves.toEqual({
      "kvorum": { date: null, slug: null, rung: null, fellToPlate: false, plateCount: 0, sampled: 0, malformed: 0 }
    });
  });

  it("windows to the ten most recent selections", async () => {
    const files = Array.from({ length: 14 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      // The oldest four are plates and must fall outside the window.
      return { file: `2026-08-${day}-a.json`, body: record(`2026-08-${day}`, index < 4 ? "plate" : "search") };
    });
    const root = await selections("caught-up", files);
    expect(await readAdminImageRungs(["caught-up"], root)).toMatchObject({
      "caught-up": { date: "2026-08-14", sampled: 10, plateCount: 0 }
    });
  });
});
