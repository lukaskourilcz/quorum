import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import event from "../../contracts/fixtures/event-card.valid.json" with { type: "json" };
import fighter from "../../contracts/fixtures/fighter-record.valid.json" with { type: "json" };
import { appendTrackRecordPick, fightClock, fightWeekFocus, normalizedSourceUrl, publicBoutMirror, publicEventMirror, publicFighterMirror, saveOddsSnapshot, saveSourceProposal } from "../src/fightaiq/store.js";
import bout from "../../contracts/fixtures/bout-record.valid.json" with { type: "json" };

describe("FightAIQ canonical stores", () => {
  it("defensively reparses public fighters and events", () => {
    expect(publicFighterMirror(fighter).id).toBe("ufc:alex-example");
    expect(publicEventMirror(event).org).toBe("ufc");
    expect(() => publicFighterMirror({ ...fighter, modelEligible: false })).toThrow(/modelEligible/);
  });

  it("removes private disagreement values and internal notes from delivery mirrors", () => {
    const privateFighter = {
      ...fighter,
      fields: { ...fighter.fields, record: { ...fighter.fields.record, status: "disputed", corroborated: false } },
      discrepancies: [{ field: "record", values: [{ value: "12-2-0", sourceRef: "source:a" }, { value: "13-2-0", sourceRef: "source:b" }], status: "open" }],
      modelEligible: false,
      changeLog: fighter.changeLog.map((entry) => ({ ...entry, note: "PRIVATE: reviewer email and internal resolution note" }))
    };
    const mirrored = publicFighterMirror(privateFighter);
    expect(mirrored.discrepancies).toEqual([]);
    expect(JSON.stringify(mirrored)).not.toContain("PRIVATE");
    expect(mirrored.fields.record?.status).toBe("disputed");
    const mirroredBout = publicBoutMirror({ ...bout, changeLog: bout.changeLog.map((entry) => ({ ...entry, note: "PRIVATE bout note" })) });
    expect(JSON.stringify(mirroredBout)).not.toContain("PRIVATE");
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

  it("uses Prague calendar days and orders overlapping fight weeks by proximity then organization", () => {
    const base = publicEventMirror(event);
    const make = (org: "ufc" | "oktagon", day: string) => ({
      ...base,
      id: `${org}:event:fixture-${day}`,
      org,
      startsAtLocal: `${day}T20:00:00+02:00`,
      startsAtUtc: `${day}T18:00:00.000Z`,
      bouts: base.bouts.map((bout, index) => ({ ...bout, id: `${org}-bout-${index}`, red: `${org}:red-example`, blue: `${org}:blue-example` }))
    });
    const focus = fightWeekFocus([make("ufc", "2026-10-25"), make("oktagon", "2026-10-24")] as typeof base[], new Date("2026-10-22T22:30:00.000Z"));
    expect(focus.map((item) => item.org)).toEqual(["oktagon", "ufc"]);
  });

  it("stores one source proposal per normalized URL and never wires a forbidden source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fightaiq-source-proposal-"));
    const proposal = { schemaVersion: "source-proposal/1", author: "SONAR", url: "https://Example.com/data/?b=2&a=1#top", coverage: "Regional event records.", dataOffered: ["results"], accessMethod: "api", tosVerdict: { status: "allowed", rationale: "The documented API permits this use." }, costUsd: 0, overlapNotes: "Adds regional coverage.", corroborationValue: "Independent event-result check.", status: "proposed", checkedAt: "2026-08-01T10:00:00.000Z" };
    expect(normalizedSourceUrl(proposal.url)).toBe("https://example.com/data?a=1&b=2");
    expect((await saveSourceProposal(proposal, root)).repeated).toBe(false);
    expect((await saveSourceProposal(proposal, root)).repeated).toBe(true);
    await expect(saveSourceProposal({ ...proposal, status: "approved" }, root)).rejects.toThrow(/already exists/);
    await expect(saveSourceProposal({ ...proposal, url: "https://forbidden.example/data", status: "wired", tosVerdict: { status: "forbidden", rationale: "The terms prohibit collection." } }, root)).rejects.toThrow(/cannot be wired/);
  });

  it("keeps published picks immutable and rolls up known scores without inventing a closing price", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fightaiq-track-record-"));
    const pick = { id: "pick-1", modelVersion: "mma-1.0.0+1234abcd", org: "ufc", predicted: 0.6, closing: null, result: "loss", clv: null, brierContribution: 0.36, publishedAt: "2026-08-01T10:00:00.000Z" };
    expect((await appendTrackRecordPick(pick, root, new Date("2026-08-02T10:00:00.000Z"))).repeated).toBe(false);
    expect((await appendTrackRecordPick(pick, root, new Date("2026-08-02T10:00:00.000Z"))).repeated).toBe(true);
    await expect(appendTrackRecordPick({ ...pick, result: "win" }, root)).rejects.toThrow(/immutable/);
    const record = JSON.parse(await readFile(path.join(root, "mma/track-record.json"), "utf8"));
    expect(record.rollups).toEqual([{ modelVersion: pick.modelVersion, org: "ufc", picks: 1, brier: 0.36, meanClv: null }]);
  });
});
