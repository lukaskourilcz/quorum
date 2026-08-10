import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { materializeFightAiQSources, scheduledEventCard } from "../src/fightaiq/intake.js";
import { BoutRecordSchema, FighterRecordSchema, OddsSnapshotSchema, independentMmaSourceCount } from "../src/contracts/mma.js";
import { atomicWriteJson } from "../src/state.js";
import fighterCard from "../../contracts/fixtures/fighter-record.valid.json" with { type: "json" };

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fightaiq-intake-"));
  roots.push(root);
  return root;
}

const fighters = [
  { id: "red-1", slug: "red-fighter", name: "Red Fighter", record: "12-2-0", division: "Lightweight", stance: "Orthodox", heightCm: 180, reachCm: 184 },
  { id: "blue-1", slug: "blue-fighter", name: "Blue Fighter", record: "10-3-0", division: "Lightweight", stance: "Southpaw", heightCm: 178, reachCm: 181 }
];

const events = [{
  id: "event-1",
  slug: "ufc-example",
  name: "UFC Example",
  venue: "Example Arena",
  startsAt: "2026-08-03T18:00:00Z",
  timeZone: "UTC",
  bouts: [{
    id: "bout-1",
    red: { id: "red-1", slug: "red-fighter", name: "Red Fighter" },
    blue: { id: "blue-1", slug: "blue-fighter", name: "Blue Fighter" },
    division: "Lightweight",
    scheduledRounds: 5 as const,
    status: "announced" as const
  }]
}];

describe("FightAIQ intake normalization", () => {
  it("counts one Odds API provider even when several offer ids list the bout", () => {
    expect(independentMmaSourceCount([
      "source:the-odds-api:offer-one",
      "source:the-odds-api:offer-two"
    ])).toBe(1);
    expect(independentMmaSourceCount([
      "source:wikipedia:2026-08-09:UFC 330",
      "source:the-odds-api:offer-one",
      "source:the-odds-api:offer-two"
    ])).toBe(2);
  });

  it("writes an Oktagon card with canonical divisions and no MediaWiki fragments", async () => {
    const root = await fixtureRoot();
    const card = scheduledEventCard({
      org: "oktagon",
      name: "Oktagon 93: Roušal vs. Mågård",
      startsAtUtc: "2026-09-12T00:00:00.000Z",
      venue: "Winning Group Arena",
      sourceTitle: "2026 in Oktagon MMA",
      retrievedAt: "2026-08-09T12:00:00.000Z",
      bouts: [
        { division: "* Featherweight", red: "Radek Roušal", blue: "Jonas Mågård", scheduledRounds: 5 },
        { division: "Middleweight <be> Light Heavyweight", red: "Vojtech Garba", blue: "Robert Lau", scheduledRounds: 3 },
        { division: "{{plainlist|", red: "Bad Red", blue: "Bad Blue", scheduledRounds: 3 }
      ]
    });
    expect(card).toBeTruthy();
    expect(card?.bouts.map((bout) => bout.division)).toEqual(["featherweight", "light-heavyweight"]);

    const paths = await materializeFightAiQSources({
      root,
      retrievedAt: new Date("2026-08-09T12:00:00.000Z"),
      citoFighters: [],
      citoEvents: [],
      odds: [],
      scheduledCards: card ? [card] : []
    });
    expect(paths).toContain("mma/events/oktagon/oktagon-93-rousal-vs-magard.json");
    const stored = await readFile(path.join(root, "mma/events/oktagon/oktagon-93-rousal-vs-magard.json"), "utf8");
    expect(stored).not.toMatch(/plainlist|<be>|\*/iu);
  });

  it("keeps one-source fighters provisional and publishes only exactly matched odds", async () => {
    const root = await fixtureRoot();
    const paths = await materializeFightAiQSources({
      root,
      retrievedAt: new Date("2026-08-01T18:00:00Z"),
      citoFighters: fighters,
      citoEvents: events,
      odds: [
        { id: "odds-1", commenceTime: "2026-08-03T18:00:00Z", red: "Blue Fighter", blue: "Red Fighter", bookmakers: [{ name: "Fixture Book", redDecimal: 2.2, blueDecimal: 1.7 }] },
        { id: "odds-2", commenceTime: "2026-08-03T18:00:00Z", red: "Unknown One", blue: "Unknown Two", bookmakers: [{ name: "Fixture Book", redDecimal: 1.9, blueDecimal: 1.9 }] }
      ]
    });
    expect(paths).toContain("mma/fighters/ufc:red-fighter.json");
    expect(paths).toContain("mma/events/ufc/ufc-example.json");
    expect(paths).toContain("mma/bouts/ufc/ufc-ufc-example-bout-bout-1.json");
    expect(paths.filter((item) => item.startsWith("mma/odds/"))).toHaveLength(1);
    expect(paths.join("\n")).not.toMatch(/outside-scope/iu);

    const fighter = FighterRecordSchema.parse(JSON.parse(await readFile(path.join(root, "mma/fighters/ufc:red-fighter.json"), "utf8")));
    expect(fighter).toMatchObject({ modelEligible: false, completeness: 1, corroboration: 0 });
    expect(fighter.fields.name).toMatchObject({ status: "provisional", corroborated: false });
    const oddsPath = paths.find((item) => item.startsWith("mma/odds/"));
    expect(oddsPath).toBeTruthy();
    const snapshot = OddsSnapshotSchema.parse(JSON.parse(await readFile(path.join(root, oddsPath!), "utf8")));
    expect(snapshot).toMatchObject({
      phase: "t3",
      source: "odds-api",
      prices: [{ pick: "Red Fighter", decimal: 1.7 }, { pick: "Blue Fighter", decimal: 2.2 }]
    });
    const bout = BoutRecordSchema.parse(JSON.parse(await readFile(path.join(root, "mma/bouts/ufc/ufc-ufc-example-bout-bout-1.json"), "utf8")));
    expect(bout).toMatchObject({ status: "confirmed", sourceRefs: expect.arrayContaining(["source:the-odds-api:odds-1"]) });
    expect(new Set(bout.sourceRefs).size).toBe(2);
  });

  it("does not downgrade a manually verified field", async () => {
    const root = await fixtureRoot();
    const retrievedAt = "2026-07-31T18:00:00.000Z";
    const verified = (value: string) => ({ value, sourceRefs: ["source:a", "source:b"], retrievedAt, status: "verified", corroborated: true });
    await atomicWriteJson(root, "mma/fighters/ufc:red-fighter.json", {
      ...fighterCard,
      schemaVersion: "fighter-card/1",
      id: "ufc:red-fighter",
      slug: "red-fighter",
      org: "ufc",
      canonicalName: "Reviewed Name",
      fields: { name: verified("Reviewed Name"), division: verified("lightweight"), record: verified("12-2-0") },
      criticalFields: ["name", "division", "record"],
      discrepancies: [],
      completeness: 0.5,
      corroboration: 0.5,
      modelEligible: true,
      modelVersion: "mma-1.0.0+1234abcd",
      updatedAt: retrievedAt,
      rating: { ...fighterCard.rating, updatedAt: retrievedAt },
      quality: { ...fighterCard.quality, gaps: [] },
      changeLog: [{ at: retrievedAt, kind: "owner-review", fields: ["name", "division", "record"], sourceRefs: ["source:a", "source:b"], note: "Reviewed fixture." }]
    });
    await materializeFightAiQSources({ root, retrievedAt: new Date("2026-08-01T18:00:00Z"), citoFighters: [fighters[0]!], citoEvents: [], odds: [] });
    const fighter = FighterRecordSchema.parse(JSON.parse(await readFile(path.join(root, "mma/fighters/ufc:red-fighter.json"), "utf8")));
    expect(fighter.fields.name?.value).toBe("Reviewed Name");
    expect(fighter.modelEligible).toBe(true);
  });
});
