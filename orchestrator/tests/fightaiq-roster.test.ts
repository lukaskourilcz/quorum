import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import boutFixture from "../../contracts/fixtures/bout-record.valid.json" with { type: "json" };
import fighterFixture from "../../contracts/fixtures/fighter-record.valid.json" with { type: "json" };
import { BoutRecordSchema, FighterCardSchema } from "../src/contracts/mma.js";
import { reconcilePredictionResults } from "../src/fightaiq/analysis.js";
import { rebuildDerivedFighterData } from "../src/fightaiq/derived.js";
import { buildBackfillQueue, materializeWikimediaRoster, projectWikimediaCategory, reconcileRosterStatuses, sanitizeSourceText } from "../src/fightaiq/roster.js";
import { enrichWikimediaBackfill, parseWikipediaFighterPage } from "../src/fightaiq/wikimedia-backfill.js";
import { loadBoutRecords, saveBoutRecord, upcomingBoutRecords } from "../src/fightaiq/store.js";
import { configRoot } from "../src/paths.js";
import { atomicWriteJson } from "../src/state.js";

describe("FightAIQ roster and history automation", () => {
  it("sanitizes source labels and projects only article pages", () => {
    expect(sanitizeSourceText("<script>bad()</script>  Alex\u0000 Example {{prompt}}" )).toBe("bad() Alex Example");
    expect(projectWikimediaCategory({ query: { categorymembers: [
      { pageid: 10, ns: 0, title: "Alex Example (fighter)" },
      { pageid: 11, ns: 14, title: "Category:Ignore" },
      { pageid: "bad", ns: 0, title: "Bad" }
    ] } }, "ufc")).toEqual([expect.objectContaining({ slug: "alex-example", pageId: 10, org: "ufc" })]);
  });

  it("writes the same Wikimedia card once for a repeated source payload", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-roster-"));
    const entry = { org: "ufc" as const, name: "Alex Example", slug: "alex-example", wikipediaTitle: "Alex Example", wikipediaUrl: "https://en.wikipedia.org/wiki/Alex_Example", pageId: 10 };
    const now = new Date("2026-08-02T08:00:00.000Z");
    await materializeWikimediaRoster({ root, entries: [entry], retrievedAt: now });
    const target = path.join(root, "mma", "fighters", "ufc:alex-example.json");
    const first = await readFile(target, "utf8");
    await materializeWikimediaRoster({ root, entries: [entry], retrievedAt: now });
    expect(await readFile(target, "utf8")).toBe(first);
    expect(FighterCardSchema.parse(JSON.parse(first))).toMatchObject({ schemaVersion: "fighter-card/1", quality: { evidenceTier: "secondary" } });
  });

  it("parses a bounded Wikipedia profile and provisional fight-history row", () => {
    const parsed = parseWikipediaFighterPage(`
{{Infobox martial artist
| name = Alex Example
| birth_date = {{Birth date and age|1994|5|2}}
| height = {{convert|180|cm|ftin|abbr=on}}
| reach = {{convert|74|in|cm|abbr=on}}
| weight_class = Lightweight
| stance = Southpaw
| team = [[Example Gym]]
| mma_win = 12
| mma_loss = 2
| mma_draw = 1
}}
==Mixed martial arts record==
{{MMA record start}}
|- align="center" bgcolor="#CCFFCC"
|{{yes2}}Win
|12–2–1
|[[Sam Example]]
|TKO (punches)
|[[UFC Example]]
|{{dts|2026|January|10}}
|2
|4:31
|Prague
|}`);
    expect(parsed.fields).toMatchObject({ name: "Alex Example", dateOfBirth: "1994-05-02", heightCm: 180, reachCm: 187.96, division: "Lightweight", stance: "southpaw", record: "12-2-1" });
    expect(parsed.fights).toEqual([expect.objectContaining({ result: "win", opponent: "Sam Example", event: "UFC Example", round: 2, elapsedSeconds: 571 })]);
  });

  it("ignores record tables outside the mixed martial arts section", () => {
    const parsed = parseWikipediaFighterPage(`
==Kickboxing record==
{| class="wikitable"
|-
|Win
|1-0
|[[Wrong Opponent]]
|KO
|[[Wrong Event]]
|{{Start date|2025|1|1}}
|1
|1:00
|}
==Mixed martial arts record==
{{MMA record start}}
|-
|Loss
|2-1
|[[Right Opponent]]
|Decision (unanimous)
|[[Right Event]]
|{{Start date|2025|2|2}}
|3
|5:00
|}
==References==
`);
    expect(parsed.fights).toEqual([expect.objectContaining({ result: "loss", opponent: "Right Opponent", event: "Right Event" })]);
  });

  it("adds an infobox record from method totals when no aggregate is present", () => {
    const parsed = parseWikipediaFighterPage(`
{{Infobox martial artist
| name = Method Totals
| mma_kowin = 8
| mma_subwin = 1
| mma_decwin = 5
| mma_koloss = 1
| mma_subloss = 1
| mma_draw = 1
| stance =
| fighting_out_of = Somewhere
}}
`);
    expect(parsed.fields.record).toBe("14-2-1");
    expect(parsed.fields).not.toHaveProperty("stance");
  });

  it("records roster status transitions only after a complete reviewed crawl", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-roster-status-"));
    const fighter = FighterCardSchema.parse({ ...fighterFixture, identity: { ...fighterFixture.identity, externalIds: { cito: "fighter-1" } } });
    const first = await reconcileRosterStatuses({ root, org: "ufc", fighters: [fighter], seenFighterRefs: new Set<string>(), sourceRef: "source:cito-ufc:fixture:complete-roster", reviewedAt: new Date("2026-08-03T08:00:00.000Z"), externalIdKey: "cito" });
    expect(first).toEqual([`mma/fighters/${fighter.id}.json`]);
    const stored = FighterCardSchema.parse(JSON.parse(await readFile(path.join(root, first[0]!), "utf8")));
    expect(stored.organizationHistory.at(-1)?.status).toBe("former");
    expect(stored.changeLog.at(-1)?.kind).toBe("status-change");
    expect(await reconcileRosterStatuses({ root, org: "ufc", fighters: [stored], seenFighterRefs: new Set<string>(), sourceRef: "source:cito-ufc:fixture:complete-roster", reviewedAt: new Date("2026-08-03T08:00:00.000Z"), externalIdKey: "cito" })).toEqual([]);
  });

  it("closes a discovered bout when a cited post-event history row arrives", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-result-backfill-"));
    const red = FighterCardSchema.parse({ ...fighterFixture, quality: { ...fighterFixture.quality, lastReviewedAt: null } });
    const blue = FighterCardSchema.parse({ ...fighterFixture, id: "ufc:sam-example", slug: "sam-example", canonicalName: "Sam Example", identity: { ...fighterFixture.identity, wikipediaTitle: "Sam Example" }, fields: { ...fighterFixture.fields, name: { ...fighterFixture.fields.name, value: "Sam Example" } } });
    const announced = BoutRecordSchema.parse({ ...boutFixture, status: "announced", statusHistory: [boutFixture.statusHistory[0]], sourceRefs: [boutFixture.sourceRefs[0]], fighters: { red: red.id, blue: blue.id }, result: null, updatedAt: "2026-08-01T08:00:00.000Z" });
    await saveBoutRecord(announced, root);
    const content = `==Mixed martial arts record==\n{{MMA record start}}\n|-\n|Win\n|13-2-0\n|[[Sam Example]]\n|Decision (unanimous)\n|[[Fixture Night]]\n|{{Start date|2026|8|8}}\n|3\n|5:00\n|Prague\n|}`;
    await enrichWikimediaBackfill({
      root,
      fighters: [red, blue],
      bouts: [announced],
      queue: [{ fighterRef: red.id, priority: 1_000, reason: "upcoming-bout", gaps: [] }],
      context: { allowHosts: ["en.wikipedia.org"], now: new Date("2026-08-09T08:00:00.000Z") },
      retrievedAt: new Date("2026-08-09T08:00:00.000Z"),
      resolveImpl: async () => ["203.0.113.10"],
      fetchImpl: async () => new Response(JSON.stringify({ query: { pages: [{ pageid: 123456, title: "Alex Example", revisions: [{ slots: { main: { content } } }] }] } }), { status: 200, headers: { "content-type": "application/json" } })
    });
    const stored = (await loadBoutRecords(path.join(root, "mma", "bouts")))[0]!;
    expect(stored).toMatchObject({ status: "completed", result: { winner: "red", method: "Decision (unanimous)", round: 3, elapsedSeconds: 900 } });
    expect(stored.statusHistory.map((entry) => entry.status)).toEqual(["announced", "completed"]);
    await atomicWriteJson(root, "mma/stats/fixture.json", {
      schemaVersion: "fightaiq-stats/1",
      id: "prediction:fixture",
      boutRef: stored.id,
      eventRef: stored.event.ref,
      fighterRefs: [stored.fighters.red, stored.fighters.blue],
      modelVersion: "mma-1.0.0+aaaaaaaa",
      redWin: 0.7,
      blueWin: 0.3,
      uncertainty: "clear-lean",
      calibrationLabel: "early-model",
      marketUsed: false,
      status: "active",
      outcome: null,
      brierContribution: null,
      sourceRefs: stored.sourceRefs,
      generatedAt: "2026-08-07T08:00:00.000Z",
      scoredAt: null
    });
    await reconcilePredictionResults({ root, bouts: [stored], now: new Date("2026-08-09T09:00:00.000Z") });
    const scored = JSON.parse(await readFile(path.join(root, "mma/stats/fixture.json"), "utf8")) as { status: string; outcome: string; brierContribution: number };
    expect(scored).toMatchObject({ status: "scored", outcome: "red", brierContribution: 0.09 });
    const summary = JSON.parse(await readFile(path.join(root, "mma/evaluation/summary.json"), "utf8")) as { eventsEvaluated: number; predictionsScored: number };
    expect(summary).toMatchObject({ eventsEvaluated: 1, predictionsScored: 1 });
  });

  it("keeps bout status append-only and removes a cancellation from upcoming fights", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-bouts-"));
    const announced = BoutRecordSchema.parse(boutFixture);
    expect((await saveBoutRecord(announced, root)).repeated).toBe(false);
    const cancelled = BoutRecordSchema.parse({
      ...announced,
      status: "cancelled",
      statusHistory: [...announced.statusHistory, { status: "cancelled", at: "2026-08-03T08:00:00.000Z", sourceRefs: announced.sourceRefs, note: "The promotion removed the bout." }],
      changeLog: [...announced.changeLog, { at: "2026-08-03T08:00:00.000Z", kind: "status-change", fields: ["status"], sourceRefs: announced.sourceRefs, note: "Status changed to cancelled." }],
      updatedAt: "2026-08-03T08:00:00.000Z"
    });
    await saveBoutRecord(cancelled, root);
    expect(upcomingBoutRecords([cancelled], new Date("2026-08-03T09:00:00.000Z"))).toEqual([]);
    await expect(saveBoutRecord({ ...cancelled, statusHistory: cancelled.statusHistory.slice(1) }, root)).rejects.toThrow(/status history/i);
  });

  it("prioritizes fighters booked next, then derives repeatable stats and Glicko state", () => {
    const red = FighterCardSchema.parse(fighterFixture);
    const blue = FighterCardSchema.parse({
      ...fighterFixture,
      id: "ufc:sam-example",
      slug: "sam-example",
      canonicalName: "Sam Example",
      fields: { ...fighterFixture.fields, name: { ...fighterFixture.fields.name, value: "Sam Example" } }
    });
    const booked = BoutRecordSchema.parse({ ...boutFixture, fighters: { red: red.id, blue: blue.id } });
    expect(() => BoutRecordSchema.parse({ ...booked, sourceRefs: [booked.sourceRefs[0]], statusHistory: booked.statusHistory.map((entry) => entry.status === "confirmed" ? { ...entry, sourceRefs: [booked.sourceRefs[0]] } : entry) })).toThrow(/two independent/i);
    expect(() => BoutRecordSchema.parse({ ...booked, sourceRefs: ["source:cito-ufc:2026-08-01:event:one", "source:cito-ufc:2026-08-02:event:one"], statusHistory: booked.statusHistory.map((entry) => entry.status === "confirmed" ? { ...entry, sourceRefs: ["source:cito-ufc:2026-08-01:event:one", "source:cito-ufc:2026-08-02:event:one"] } : entry) })).toThrow(/two independent/i);
    const queue = buildBackfillQueue({ fighters: [red, blue], bouts: [booked], now: new Date("2026-08-03T08:00:00.000Z") });
    expect(queue.every((item) => item.reason === "upcoming-bout")).toBe(true);
    const completed = BoutRecordSchema.parse({
      ...booked,
      status: "completed",
      statusHistory: [...booked.statusHistory, { status: "completed", at: booked.event.startsAtUtc, sourceRefs: booked.sourceRefs, note: "Verified result." }],
      result: { winner: "red", method: "TKO", round: 2, elapsedSeconds: 431, sourceRefs: booked.sourceRefs },
      changeLog: [...booked.changeLog, { at: booked.event.startsAtUtc, kind: "status-change", fields: ["status", "result"], sourceRefs: booked.sourceRefs, note: "Result verified." }],
      updatedAt: booked.event.startsAtUtc
    });
    const input = { fighters: [red, blue], bouts: [completed], now: new Date("2026-08-09T08:00:00.000Z") };
    const first = rebuildDerivedFighterData(input);
    const second = rebuildDerivedFighterData(input);
    expect(second).toEqual(first);
    expect(first.find((fighter) => fighter.id === red.id)?.rating.rating).toBeGreaterThan(1500);
    expect(first.find((fighter) => fighter.id === red.id)?.statsProfiles[0]?.values).toMatchObject({ bouts: 1, wins: 1, finishRate: 1, koTkoWins: 1, recentThreeWinRate: 1 });
    expect(first.find((fighter) => fighter.id === red.id)?.discrepancies).toContainEqual(expect.objectContaining({ field: "record", status: "open" }));
  });

  it("contains no paid-only or retired FightAIQ source entry", async () => {
    const raw = (await readFile(path.join(configRoot, "mma-sources.json"), "utf8")).toLowerCase();
    expect(raw).not.toMatch(/oddspapi|tapology|sherdog|octagon-api/);
    expect(raw).toContain("free plan");
  });
});
