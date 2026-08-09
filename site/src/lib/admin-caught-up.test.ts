import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAdminCaughtUp } from "./admin-caught-up";

const originalRoot = process.env.BOARDLESSAI_REPO_ROOT;

afterEach(() => {
  if (originalRoot === undefined) delete process.env.BOARDLESSAI_REPO_ROOT;
  else process.env.BOARDLESSAI_REPO_ROOT = originalRoot;
});

describe("DNESKAi admin state", () => {
  it("reads every state record from BOARDLESSAI_REPO_ROOT", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "caught-up-admin-"));
    await Promise.all([
      mkdir(path.join(root, "state", "ventures", "caught-up", "events"), { recursive: true }),
      mkdir(path.join(root, "state", "edition", "deliveries"), { recursive: true }),
      mkdir(path.join(root, "state", "ventures", "caught-up", "streams"), { recursive: true }),
      mkdir(path.join(root, "state", "ventures", "caught-up", "datasets"), { recursive: true })
    ]);
    await Promise.all([
      writeFile(path.join(root, "state", "ventures", "caught-up", "events", "events.json"), JSON.stringify({
        schemaVersion: "boardless-events/1",
        updated: "2026-08-09",
        events: [{ id: "test-event", scope: "cz", title: "Test event", starts: "2026-09-01", online: false, url: "https://example.test" }]
      })),
      writeFile(path.join(root, "state", "edition", "deliveries", "2026-08-09.json"), JSON.stringify({ date: "2026-08-09", slug: "ranni-prehled" })),
      writeFile(path.join(root, "state", "ventures", "caught-up", "streams", "2026-08-09.json"), JSON.stringify({ date: "2026-08-09", stream: "events", added: ["a", "b"] })),
      writeFile(path.join(root, "state", "ventures", "caught-up", "datasets", "2026-08-09.json"), JSON.stringify({ date: "2026-08-09", dataset: "community" }))
    ]);
    process.env.BOARDLESSAI_REPO_ROOT = root;

    await expect(readAdminCaughtUp("2026-08-09")).resolves.toMatchObject({
      today: "2026-08-09",
      events: [{ id: "test-event" }],
      engine: {
        lastEdition: { date: "2026-08-09", slug: "ranni-prehled" },
        lastStreamSync: { date: "2026-08-09", stream: "events", added: 2 },
        lastDatasetAppend: { date: "2026-08-09", dataset: "community" }
      }
    });
  });
});
