import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

import { readAdminCaughtUp } from "./admin-caught-up";

/** A repository root holding only the files a test names. */
async function root(files: Record<string, unknown>): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "boardless-caught-up-"));
  for (const [relative, value] of Object.entries(files)) {
    const absolute = path.join(directory, "state", relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, typeof value === "string" ? value : JSON.stringify(value));
  }
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", directory);
  return directory;
}

describe("DNESKAi engine strip", () => {
  it("reads each row from the contract that row is actually written in", async () => {
    await root({
      "edition/deliveries/2026-08-07.json": { date: "2026-08-07", status: "delivered", editionStatus: "no_edition" },
      "edition/deliveries/2026-08-08.json": {
        date: "2026-08-08",
        status: "delivered",
        editionStatus: "edition",
        articleUrl: "https://caughtup-ai.vercel.app/articles/2026-08-08-openai-astra-kyberneticky-prach"
      },
      // No `date` field at all — the append receipt stamps `recordedAt`.
      "ventures/caught-up/datasets/2026-08-08-ai-lessons.json": {
        schemaVersion: "dataset-append/1",
        dataset: "ai-lessons",
        recordedAt: "2026-08-08T01:28:05.344Z"
      }
    });

    const snapshot = await readAdminCaughtUp("2026-08-09");
    expect(snapshot.engine.lastEdition).toEqual({
      date: "2026-08-08",
      slug: "2026-08-08-openai-astra-kyberneticky-prach"
    });
    expect(snapshot.engine.lastDatasetAppend).toEqual({ date: "2026-08-08", dataset: "ai-lessons" });
    // The streams directory does not exist until a sync writes one.
    expect(snapshot.engine.lastStreamSync).toBeNull();
  });

  it("keeps an edition whose delivery predates the recorded URL, with no slug", async () => {
    await root({
      "edition/deliveries/2026-08-06.json": { date: "2026-08-06", status: "delivered", editionStatus: "edition" }
    });
    expect((await readAdminCaughtUp("2026-08-09")).engine.lastEdition).toEqual({ date: "2026-08-06", slug: null });
  });

  it("reads a stream receipt once one is written", async () => {
    await root({
      "ventures/caught-up/streams/2026-08-09-podcasts.json": {
        schemaVersion: "stream-sync/1",
        stream: "podcasts",
        date: "2026-08-09",
        added: ["a", "b", "c"]
      }
    });
    expect((await readAdminCaughtUp("2026-08-09")).engine.lastStreamSync)
      .toEqual({ date: "2026-08-09", stream: "podcasts", added: 3 });
  });

  it("survives a malformed record instead of failing the workspace", async () => {
    await root({
      "edition/deliveries/2026-08-08.json": "{ not json",
      "ventures/caught-up/events/events.json": "{ not json",
      "ventures/caught-up/datasets/2026-08-08-ai-facts.json": { dataset: "ai-facts", recordedAt: "nonsense" }
    });
    const snapshot = await readAdminCaughtUp("2026-08-09");
    expect(snapshot.engine).toEqual({ lastEdition: null, lastStreamSync: null, lastDatasetAppend: null });
    expect(snapshot.events).toEqual([]);
    expect(snapshot.eventStore).toBe("unreadable");
  });
});

describe("the events store on a first run", () => {
  it("tells a never-written file apart from an emptied one", async () => {
    await root({});
    expect((await readAdminCaughtUp("2026-08-09")).eventStore).toBe("missing");

    await root({
      "ventures/caught-up/events/events.json": {
        schemaVersion: "boardless-events/1",
        updated: "2026-08-09",
        events: []
      }
    });
    expect((await readAdminCaughtUp("2026-08-09")).eventStore).toBe("present");
  });
});

describe("the configured repository root", () => {
  it("reads every record from BOARDLESSAI_REPO_ROOT, not from the working directory", async () => {
    // The loader used to resolve `process.cwd()/..` unconditionally, so a deployment or a test
    // that pointed the root elsewhere got an empty panel and no error at all.
    await root({
      "ventures/caught-up/events/events.json": {
        schemaVersion: "boardless-events/1",
        updated: "2026-08-09",
        events: [{ id: "test-event", scope: "cz", title: "Test event", starts: "2026-09-01", online: false, url: "https://example.test" }]
      },
      "edition/deliveries/2026-08-09.json": {
        date: "2026-08-09",
        editionStatus: "edition",
        articleUrl: "https://caughtup-ai.vercel.app/articles/ranni-prehled"
      },
      "ventures/caught-up/streams/2026-08-09-events.json": { date: "2026-08-09", stream: "events", added: ["a", "b"] },
      "ventures/caught-up/datasets/2026-08-09-community.json": { dataset: "community", recordedAt: "2026-08-09T01:00:00.000Z" }
    });

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
