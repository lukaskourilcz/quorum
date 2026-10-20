import { mkdtempSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every write runCycle and the delivery CLI could make goes through the module-level `stateRoot`.
// Pointing it at an empty directory is what lets the cases below prove that nothing was written:
// whatever a paused phase touched would be the only file in it.
vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  const root = mkdtempSync(path.join(os.tmpdir(), "caught-up-pause-"));
  process.env.CAUGHT_UP_PAUSE_TEST_STATE_ROOT = root;
  return { ...actual, stateRoot: root };
});

// Caught Up's status is forced per case rather than read from today's registry, so these cases
// prove what the pause does, not what Settings happens to say this week.
const control = vi.hoisted(() => ({ caughtUp: "paused" as "paused" | "operating" }));
vi.mock("../src/ventures/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ventures/registry.js")>();
  return {
    ...actual,
    loadVentureRegistry: async (...args: Parameters<typeof actual.loadVentureRegistry>) => {
      const registry = await actual.loadVentureRegistry(...args);
      return {
        ...registry,
        ventures: registry.ventures.map((venture) => venture.id === "caught-up"
          ? { ...venture, status: control.caughtUp }
          : venture)
      };
    }
  };
});

// The two readers the delivery commands would otherwise reach. A call to either while the venture
// is paused is the failure these cases exist to catch.
const queue = vi.hoisted(() => ({ released: 0, selected: 0 }));
vi.mock("../src/edition/review-release.js", () => ({
  releaseReviewedArticles: async () => {
    queue.released += 1;
    return [];
  }
}));
vi.mock("../src/delivery/outbox.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/delivery/outbox.js")>();
  return {
    ...actual,
    oldestPendingDelivery: async () => {
      queue.selected += 1;
      return null;
    }
  };
});

const { runCycle } = await import("../src/cycle.js");
const { main: delivery } = await import("../src/delivery/cli.js");

const testStateRoot = process.env.CAUGHT_UP_PAUSE_TEST_STATE_ROOT!;

/** Every file under the test state root, relative to it. */
async function written(): Promise<string[]> {
  const entries = await readdir(testStateRoot, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(testStateRoot, path.join(entry.parentPath, entry.name)))
    .sort();
}

let fetched: string[] = [];

beforeEach(() => {
  control.caughtUp = "paused";
  queue.released = 0;
  queue.selected = 0;
  fetched = [];
  // Any provider, source or GitHub call would leave its URL here.
  vi.stubGlobal("fetch", async (url: string | URL) => {
    fetched.push(String(url));
    throw new Error("A paused Caught Up phase must not reach the network");
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await rm(testStateRoot, { recursive: true, force: true });
});

/**
 * quorum#602: the owner paused DNESKAi article production on 2026-10-20. The registry pause is
 * the one switch, and these cases hold it to what the owner was promised: no model call, no
 * reservation and no record under `state/edition` for the day or either of its rooms.
 */
describe("a paused Caught Up", () => {
  it.each(["cu-day", "cu-edition", "cu-product"] as const)(
    "ends a live %s before any model work, at zero dollars and with nothing written",
    async (phase) => {
      // A scheduled firing at the slot's own hour: the strongest claim a run can make to open.
      vi.stubEnv("MEETING_TRIGGER", "schedule");
      const result = await runCycle({
        phase,
        dry: false,
        explainBudget: false,
        explainRouting: false,
        now: new Date("2026-10-21T03:00:00.000Z")
      });
      expect(result).toMatchObject({
        status: "paused",
        decision: "PAUSED",
        estimatedWorstCaseUsd: 0,
        selectedAgents: [],
        skippedAgents: [],
        artifacts: []
      });
      expect(fetched).toEqual([]);
      // No budget ledger row or reservation, no meeting record, nothing under edition/.
      expect(await written()).toEqual([]);
    }
  );

  it("releases no approved article and drafts no recipe post", async () => {
    await delivery(["--", "reviewed"]);
    expect(queue.released).toBe(0);
    expect(fetched).toEqual([]);
    expect(await written()).toEqual([]);
  });

  it("selects no package for the magazine and says so to the workflow", async () => {
    const output = path.join(os.tmpdir(), `caught-up-pause-output-${process.pid}`);
    await writeFile(output, "");
    try {
      await delivery(["--", "next", "--github-output", output]);
      expect(queue.selected).toBe(0);
      expect(await readFile(output, "utf8")).toBe("has_package=false\n");
      expect(await written()).toEqual([]);
    } finally {
      await rm(output, { force: true });
    }
  });

  it("reads the queue again the moment the owner resumes it", async () => {
    // The guard is the pause and nothing else: an operating Caught Up reaches the outbox.
    control.caughtUp = "operating";
    await delivery(["--", "next"]);
    expect(queue.selected).toBe(1);
  });
});
