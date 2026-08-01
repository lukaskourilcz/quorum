import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import event from "../../contracts/fixtures/event-card.valid.json" with { type: "json" };
import fighter from "../../contracts/fixtures/fighter-record.valid.json" with { type: "json" };
import { fightClock, publicEventMirror, publicFighterMirror, saveOddsSnapshot } from "../src/fightaiq/store.js";

describe("FightAIQ canonical stores", () => {
  it("defensively reparses public fighters and events", () => {
    expect(publicFighterMirror(fighter).id).toBe("ufc:alex-example");
    expect(publicEventMirror(event).org).toBe("ufc");
    expect(() => publicFighterMirror({ ...fighter, modelEligible: false })).toThrow(/modelEligible/);
  });

  it("writes owner odds idempotently and rejects a changed duplicate", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fightaiq-odds-"));
    const snapshot = { schemaVersion: "odds-snapshot/1", boutRef: "bout-1", phase: "t3", source: "owner-entry", market: "moneyline", prices: [{ pick: "Red", decimal: 1.8 }, { pick: "Blue", decimal: 2.1 }], capturedAt: "2026-08-01T10:00:00Z" };
    const first = await saveOddsSnapshot(snapshot, root);
    expect(first.repeated).toBe(false);
    expect((await saveOddsSnapshot(snapshot, root)).repeated).toBe(true);
    expect(JSON.parse(await readFile(path.join(root, first.path), "utf8"))).toEqual(snapshot);
    await expect(saveOddsSnapshot({ ...snapshot, prices: [{ pick: "Red", decimal: 1.7 }, { pick: "Blue", decimal: 2.2 }] }, root)).rejects.toThrow(/already exists/);
  });

  it("uses the same plain T-clock labels as the scheduler", () => {
    expect(fightClock(publicEventMirror(event), new Date("2026-08-05T18:00:00Z"))).toMatchObject({ state: "three-days-out" });
    expect(fightClock(publicEventMirror(event), new Date("2026-08-08T17:00:00Z"))).toMatchObject({ state: "fight-week" });
    expect(fightClock(publicEventMirror(event), new Date("2026-08-09T18:00:00Z"))).toMatchObject({ state: "results-in" });
  });
});
