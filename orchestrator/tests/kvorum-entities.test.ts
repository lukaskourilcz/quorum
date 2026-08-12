import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KvorumEntityLexiconSchema } from "../src/contracts/kvorum-entities.js";
import { configRoot, repoRoot } from "../src/paths.js";
import { loadKvorumEntityLexicon } from "../src/ventures/kvorum/entities.js";

describe("Kvórum entity lexicon", () => {
  it("loads the dated owner-controlled political context", async () => {
    const lexicon = await loadKvorumEntityLexicon();
    expect(lexicon).toMatchObject({
      schemaVersion: "kvorum-entities/1",
      asOf: "2026-08-12",
      governance: {
        ownerEditable: true,
        deskMutation: "proposal-only",
        proposalPath: "state/ventures/kvorum/entity-proposals"
      },
      matching: {
        locale: "cs-CZ",
        caseFold: true,
        diacriticFold: true,
        wholeWords: true
      }
    });

    const government = lexicon.entities
      .filter((entity) => entity.roles.includes("government-member"))
      .map((entity) => entity.canonicalName);
    expect(government).toEqual([
      "Andrej Babiš",
      "Karel Havlíček",
      "Petr Macinka",
      "Alena Schillerová",
      "Jaromír Zůna",
      "Lubomír Metnar",
      "Aleš Juchelka",
      "Zuzana Mrázová",
      "Adam Vojtěch",
      "Robert Plaga",
      "Jeroným Tejc",
      "Ivan Bednárik",
      "Martin Šebestyán",
      "Igor Červený",
      "Oto Klempíř",
      "Boris Šťastný"
    ]);

    const partyLeaders = lexicon.entities
      .filter((entity) => entity.roles.includes("party-leader"))
      .map((entity) => entity.canonicalName);
    expect(partyLeaders).toEqual([
      "Andrej Babiš",
      "Petr Macinka",
      "Tomio Okamura",
      "Martin Kupka",
      "Vít Rakušan",
      "Zdeněk Hřib",
      "Marek Výborný",
      "Matěj Ondřej Havel"
    ]);
  });

  it("includes every designed standing topic with aliases and a ranking weight", async () => {
    const lexicon = await loadKvorumEntityLexicon();
    const topics = new Map(
      lexicon.entities
        .filter((entity) => entity.kind === "topic")
        .map((entity) => [entity.id, entity])
    );
    for (const id of [
      "public-media-funding",
      "ukraine-aid",
      "agrofert-conflict",
      "municipal-elections-2026",
      "senate-elections-2026"
    ]) {
      expect(topics.get(id)?.aliases.length, `${id} aliases`).toBeGreaterThan(0);
      expect(topics.get(id)?.weight, `${id} weight`).toBeGreaterThan(0);
    }
  });

  it("keeps the published fixture and live config under the same contract", async () => {
    const fixture = JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/kvorum-entities.valid.json"),
      "utf8"
    )) as unknown;
    const live = JSON.parse(await readFile(
      path.join(configRoot, "kvorum-entities.json"),
      "utf8"
    )) as unknown;
    expect(KvorumEntityLexiconSchema.safeParse(fixture).success).toBe(true);
    expect(KvorumEntityLexiconSchema.safeParse(live).success).toBe(true);
  });

  it("rejects normalized alias collisions across entities", async () => {
    const fixture = JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/kvorum-entities.valid.json"),
      "utf8"
    )) as { entities: Array<{ aliases: string[] }> };
    fixture.entities[1]!.aliases = ["PREMIÉR BABIŠ"];
    expect(KvorumEntityLexiconSchema.safeParse(fixture).success).toBe(false);
  });
});
