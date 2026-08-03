import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BoutRecordSchema } from "../src/contracts/mma.js";
import { applyEventResults } from "../src/fightaiq/results.js";
import boutFixture from "../../contracts/fixtures/bout-record.valid.json" with { type: "json" };

const RETRIEVED = new Date("2026-08-09T08:00:00.000Z");

function announced(overrides: Record<string, unknown> = {}) {
  return BoutRecordSchema.parse({
    ...boutFixture,
    status: "announced",
    statusHistory: [{ status: "announced", at: "2026-08-01T00:00:00.000Z", sourceRefs: boutFixture.sourceRefs, note: "On the announced card." }],
    result: null,
    ...overrides
  });
}

describe("writing a result onto an announced bout", () => {
  it("completes the bout and keeps the log append-only", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-results-"));
    const bout = announced();
    const [red, blue] = [bout.fighters.red.split(":").at(-1)!, bout.fighters.blue.split(":").at(-1)!];
    const outcome = await applyEventResults({
      root,
      bouts: [bout],
      cards: [{
        org: bout.org,
        name: "Fixture Night",
        startsAtUtc: bout.event.startsAtUtc,
        sourceTitle: "List of UFC events",
        results: [{ division: "Lightweight", red: red.replaceAll("-", " "), blue: blue.replaceAll("-", " "), winner: "red", method: "TKO (punches)", round: 2, elapsedSeconds: 431 }]
      }],
      retrievedAt: RETRIEVED
    });

    expect(outcome.applied).toEqual([{ boutRef: bout.id, winner: "red", method: "TKO (punches)" }]);
    const stored = BoutRecordSchema.parse(JSON.parse(await readFile(path.join(root, outcome.paths[0]!), "utf8")));
    expect(stored.status).toBe("completed");
    expect(stored.result).toMatchObject({ winner: "red", round: 2, elapsedSeconds: 431 });
    // The prior entries are still there, in front of the new one.
    expect(stored.statusHistory.slice(0, bout.statusHistory.length)).toEqual(bout.statusHistory);
    expect(stored.changeLog.slice(0, bout.changeLog.length)).toEqual(bout.changeLog);
  });

  it("puts the winner on the side our record has them, not the side the template does", async () => {
    // Wikipedia writes the winner on the left. Our red and blue come from the announced card and
    // need not be in that order, so copying "red" across would hand the win to the wrong fighter.
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-results-side-"));
    const bout = announced();
    const [red, blue] = [bout.fighters.red.split(":").at(-1)!, bout.fighters.blue.split(":").at(-1)!];
    const outcome = await applyEventResults({
      root,
      bouts: [bout],
      cards: [{
        org: bout.org,
        name: "Fixture Night",
        startsAtUtc: bout.event.startsAtUtc,
        sourceTitle: "List of UFC events",
        // Blue is named first, so blue is the winner.
        results: [{ division: "Lightweight", red: blue.replaceAll("-", " "), blue: red.replaceAll("-", " "), winner: "red", method: "Submission", round: 1, elapsedSeconds: 90 }]
      }],
      retrievedAt: RETRIEVED
    });
    expect(outcome.applied[0]?.winner).toBe("blue");
  });

  it("names a result with no bout on file instead of minting one", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-results-unmatched-"));
    const outcome = await applyEventResults({
      root,
      bouts: [],
      cards: [{
        org: "ufc",
        name: "Fixture Night",
        startsAtUtc: "2026-08-08T00:00:00.000Z",
        sourceTitle: "List of UFC events",
        results: [{ division: "Lightweight", red: "Someone Untracked", blue: "Someone Else", winner: "red", method: null, round: null, elapsedSeconds: null }]
      }],
      retrievedAt: RETRIEVED
    });
    expect(outcome.applied).toEqual([]);
    expect(outcome.paths).toEqual([]);
    expect(outcome.unmatched).toEqual(["Fixture Night: Someone Untracked vs Someone Else"]);
  });

  it("leaves a bout that is already completed alone", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-results-terminal-"));
    const completed = BoutRecordSchema.parse({
      ...boutFixture,
      status: "completed",
      statusHistory: [...boutFixture.statusHistory, { status: "completed", at: boutFixture.event.startsAtUtc, sourceRefs: boutFixture.sourceRefs, note: "Verified result." }],
      result: { winner: "red", method: "KO", round: 1, elapsedSeconds: 60, sourceRefs: boutFixture.sourceRefs }
    });
    const [red, blue] = [completed.fighters.red.split(":").at(-1)!, completed.fighters.blue.split(":").at(-1)!];
    const outcome = await applyEventResults({
      root,
      bouts: [completed],
      cards: [{
        org: completed.org,
        name: "Fixture Night",
        startsAtUtc: completed.event.startsAtUtc,
        sourceTitle: "List of UFC events",
        // A later reading that disagrees must not silently rewrite a settled result.
        results: [{ division: "Lightweight", red: blue.replaceAll("-", " "), blue: red.replaceAll("-", " "), winner: "red", method: "Decision", round: 3, elapsedSeconds: 900 }]
      }],
      retrievedAt: RETRIEVED
    });
    expect(outcome.applied).toEqual([]);
    expect(outcome.unmatched).toHaveLength(1);
  });
});
