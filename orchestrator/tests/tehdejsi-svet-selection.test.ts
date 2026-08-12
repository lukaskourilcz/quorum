import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TehdejsiCycleSchema } from "../src/contracts/tehdejsi-cycle.js";
import type { TehdejsiFact } from "../src/contracts/tehdejsi-facts.js";
import { loadTehdejsiFacts } from "../src/ventures/tehdejsi-svet/facts.js";
import { anniversaryScore, buildShortlist, selectableFactIds } from "../src/ventures/tehdejsi-svet/scorer.js";
import {
  applyTehdejsiCycleDay,
  createTehdejsiCycle,
  readTehdejsiCycle,
  tehdejsiCycleComplete,
  writeTehdejsiCycle
} from "../src/ventures/tehdejsi-svet/state.js";

const HASH = "a".repeat(64);
const temporaryRoots: string[] = [];

async function temporaryState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-state-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fact(overrides: Partial<TehdejsiFact> & { id: string }): TehdejsiFact {
  return {
    kind: "everyday",
    country: "cz",
    place: null,
    yearFrom: 1975,
    yearTo: 1975,
    sensitivityTier: 0,
    shareSafe: true,
    text: "A synthetic fact long enough to satisfy the contract's minimum length rule.",
    sources: [{ title: "Synthetic source", url: null, note: null }],
    verified: null,
    ...overrides
  } as TehdejsiFact;
}

describe("Tehdejsi svet selection", () => {
  it("scores an anniversary by how round it is and ignores the future", () => {
    expect(anniversaryScore(fact({ id: "a", yearFrom: 1976, yearTo: 1976 }), "2026-08-12")).toBe(8);
    expect(anniversaryScore(fact({ id: "b", yearFrom: 2001, yearTo: 2001 }), "2026-08-12")).toBe(6);
    expect(anniversaryScore(fact({ id: "c", yearFrom: 2016, yearTo: 2016 }), "2026-08-12")).toBe(4);
    // A year that has not happened yet is not an anniversary of anything.
    expect(anniversaryScore(fact({ id: "d", yearFrom: 2026, yearTo: 2026 }), "2026-08-12")).toBe(0);
  });

  it("ranks uniquely and breaks ties on id so the same facts always order the same way", () => {
    const facts = [fact({ id: "zebra" }), fact({ id: "alpha" }), fact({ id: "middle" })];
    const first = buildShortlist({ facts, factsHash: HASH, date: "2026-08-12" });
    const second = buildShortlist({ facts: [...facts].reverse(), factsHash: HASH, date: "2026-08-12" });
    expect(first.entries.map((entry) => entry.factId)).toEqual(second.entries.map((entry) => entry.factId));
    expect(first.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it("vetoes a tier-2 fact and a recently used one however well they score", () => {
    const shortlist = buildShortlist({
      facts: [
        fact({ id: "tier-two", sensitivityTier: 2, sources: [
          { title: "One", url: null, note: null },
          { title: "Two", url: null, note: null }
        ] }),
        fact({ id: "used-last-week" }),
        fact({ id: "fresh" })
      ],
      factsHash: HASH,
      date: "2026-08-12",
      recentlyUsedFactIds: ["used-last-week"]
    });
    expect(shortlist.entries.find((entry) => entry.factId === "tier-two")?.veto)
      .toBe("tier-2-review-required");
    expect(shortlist.entries.find((entry) => entry.factId === "used-last-week")?.veto)
      .toBe("recently-used");
    expect(selectableFactIds(shortlist, 2)).toEqual(["fresh"]);
  });

  it("takes none rather than a vetoed fact, because a quiet day is a complete outcome", () => {
    const shortlist = buildShortlist({
      facts: [fact({ id: "only", sensitivityTier: 2, sources: [
        { title: "One", url: null, note: null },
        { title: "Two", url: null, note: null }
      ] })],
      factsHash: HASH,
      date: "2026-08-12"
    });
    expect(selectableFactIds(shortlist)).toEqual([]);
  });

  it("ranks the committed facts against their own hash", async () => {
    const facts = await loadTehdejsiFacts();
    const shortlist = buildShortlist({
      facts: facts.facts,
      factsHash: facts.contentHash,
      date: "2026-08-12"
    });
    expect(shortlist.entries).toHaveLength(facts.facts.length);
    expect(shortlist.factsHash).toBe(facts.contentHash);
    // Chornobyl is tier 2 in the committed file and must never be selectable without review.
    expect(selectableFactIds(shortlist, 5)).not.toContain("ua-1986-chornobyl-spring");
  });
});

describe("Tehdejsi svet cycle", () => {
  const now = new Date("2026-08-12T18:00:00.000Z");

  it("promotes planning to production only with a chosen fact", () => {
    const planned = applyTehdejsiCycleDay({
      cycle: createTehdejsiCycle({ date: "2026-08-12", now }),
      date: "2026-08-12",
      now,
      outcome: { completed: true, chosenFactIds: ["cs-1970s-vecernicek"], shortlistRef: "ref" }
    });
    expect(planned.phase).toBe("production");
    expect(planned.dayStatuses).toEqual({ planning: "completed", production: "active" });
    expect(planned.stretch).toBeNull();
  });

  it("holds the planning day when nothing cleared the bar instead of promoting an empty plan", () => {
    const quiet = applyTehdejsiCycleDay({
      cycle: createTehdejsiCycle({ date: "2026-08-12", now }),
      date: "2026-08-12",
      now,
      outcome: { completed: true, chosenFactIds: [] }
    });
    expect(quiet.phase).toBe("planning");
    expect(quiet.chosenFactIds).toEqual([]);
    expect(quiet.stretch).toMatchObject({ count: 1, reason: "no-candidate", nextAttemptOn: "2026-08-13" });
  });

  it("stretches rather than skipping, and counts each stretch", () => {
    const once = applyTehdejsiCycleDay({
      cycle: createTehdejsiCycle({ date: "2026-08-12", now }),
      date: "2026-08-12",
      now,
      outcome: { completed: false, pressure: "budget-pressure" }
    });
    const twice = applyTehdejsiCycleDay({
      cycle: once, date: "2026-08-13", now, outcome: { completed: false, pressure: "budget-pressure" }
    });
    expect(once.dayStatuses.planning).toBe("active");
    expect(twice.stretch).toMatchObject({ count: 2, nextAttemptOn: "2026-08-14" });
  });

  it("refuses a production phase that never completed planning", () => {
    expect(TehdejsiCycleSchema.safeParse({
      schemaVersion: "tehdejsi-cycle/1",
      startedOn: "2026-08-12",
      phase: "production",
      dayStatuses: { planning: "active", production: "active" },
      chosenFactIds: [],
      shortlistRef: null,
      stretch: null,
      updatedAt: now.toISOString()
    }).success).toBe(false);
  });

  it("round-trips through state and reports completion", async () => {
    const root = await temporaryState();
    const planned = applyTehdejsiCycleDay({
      cycle: createTehdejsiCycle({ date: "2026-08-12", now }),
      date: "2026-08-12",
      now,
      outcome: { completed: true, chosenFactIds: ["cs-1970s-vecernicek"] }
    });
    await writeTehdejsiCycle(root, planned);
    expect(await readTehdejsiCycle(root)).toEqual(planned);
    expect(tehdejsiCycleComplete(planned)).toBe(false);

    const done = applyTehdejsiCycleDay({ cycle: planned, date: "2026-08-13", now, outcome: { completed: true } });
    await writeTehdejsiCycle(root, done);
    expect(tehdejsiCycleComplete(await readTehdejsiCycle(root))).toBe(true);
  });
});
