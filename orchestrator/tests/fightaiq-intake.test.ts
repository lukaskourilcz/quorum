import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { materializeFightAiQSources } from "../src/fightaiq/intake.js";
import { FighterRecordSchema, OddsSnapshotSchema } from "../src/contracts/mma.js";
import { atomicWriteJson } from "../src/state.js";

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
    expect(paths).toContain("ventures/fightaiq/fighters/ufc/red-fighter.json");
    expect(paths).toContain("ventures/fightaiq/events/ufc/ufc-example.json");
    expect(paths.filter((item) => item.startsWith("ventures/fightaiq/odds/"))).toHaveLength(1);
    expect(paths.join("\n")).not.toMatch(/ksw/iu);

    const fighter = FighterRecordSchema.parse(JSON.parse(await readFile(path.join(root, "ventures/fightaiq/fighters/ufc/red-fighter.json"), "utf8")));
    expect(fighter).toMatchObject({ modelEligible: false, completeness: 1, corroboration: 0 });
    expect(fighter.fields.name).toMatchObject({ status: "provisional", corroborated: false });
    const oddsPath = paths.find((item) => item.startsWith("ventures/fightaiq/odds/"));
    expect(oddsPath).toBeTruthy();
    const snapshot = OddsSnapshotSchema.parse(JSON.parse(await readFile(path.join(root, oddsPath!), "utf8")));
    expect(snapshot).toMatchObject({
      phase: "t3",
      source: "odds-api",
      prices: [{ pick: "Red Fighter", decimal: 1.7 }, { pick: "Blue Fighter", decimal: 2.2 }]
    });
  });

  it("does not downgrade a manually verified field", async () => {
    const root = await fixtureRoot();
    const retrievedAt = "2026-07-31T18:00:00.000Z";
    const verified = (value: string) => ({ value, sourceRefs: ["source:a", "source:b"], retrievedAt, status: "verified", corroborated: true });
    await atomicWriteJson(root, "ventures/fightaiq/fighters/ufc/red-fighter.json", {
      schemaVersion: "fighter-record/1",
      id: "ufc:red-fighter",
      slug: "red-fighter",
      org: "ufc",
      fields: { name: verified("Reviewed Name"), division: verified("lightweight"), record: verified("12-2-0") },
      criticalFields: ["name", "division", "record"],
      discrepancies: [],
      completeness: 0.5,
      corroboration: 0.5,
      modelEligible: true,
      modelVersion: "mma-1.0.0+1234abcd",
      updatedAt: retrievedAt
    });
    await materializeFightAiQSources({ root, retrievedAt: new Date("2026-08-01T18:00:00Z"), citoFighters: [fighters[0]!], citoEvents: [], odds: [] });
    const fighter = FighterRecordSchema.parse(JSON.parse(await readFile(path.join(root, "ventures/fightaiq/fighters/ufc/red-fighter.json"), "utf8")));
    expect(fighter.fields.name?.value).toBe("Reviewed Name");
    expect(fighter.modelEligible).toBe(true);
  });
});
