import { describe, expect, it } from "vitest";
import {
  computeModelEligibility,
  fieldValuesAgree,
  namesAgree,
  normalizeDivision,
  resolveAgreeingDiscrepancies,
  stripDisambiguator,
  supersedesSameProvider
} from "../src/fightaiq/field-agreement.js";
import { currentDivision, parseWikipediaFighterPage } from "../src/fightaiq/wikimedia-backfill.js";
import { readDateOfBirth, readHeightCm } from "../src/fightaiq/wikidata.js";
import { recordBoutCount } from "../src/fightaiq/derived.js";

/**
 * Every case here is one that was actually on a card, wrong, on 3 August 2026 — ninety-two
 * fighters and not one model-eligible, mostly because a fighter was recorded as disagreeing with
 * himself. The values are copied off the live pages, not invented.
 */

describe("when two readings are the same fact", () => {
  it("ignores a Wikipedia disambiguator", () => {
    expect(stripDisambiguator("Robert Whittaker (fighter)")).toBe("Robert Whittaker");
    expect(namesAgree("Sean O'Malley (fighter)", "Sean O'Malley")).toBe(true);
  });

  it("ignores diacritics one source strips and the other keeps", () => {
    expect(namesAgree("Ailín Pérez", "Ailin Perez")).toBe(true);
    expect(namesAgree("Jéssica Andrade", "Jessica Andrade")).toBe(true);
  });

  it("still separates two genuinely different names", () => {
    // A short form and a reordering are questions for a person, not spelling noise.
    expect(namesAgree("Abusupiyan Magomedov", "Abus Magomedov")).toBe(false);
    expect(namesAgree("Alateng Heili", "Heili Alateng")).toBe(false);
  });

  it("reads the promotion's division slug and the encyclopedia's title case as one division", () => {
    expect(fieldValuesAgree("division", "light-heavyweight", "Light Heavyweight")).toBe(true);
    // Not the same division: they have different champions.
    expect(fieldValuesAgree("division", "womens-flyweight", "Flyweight")).toBe(false);
    expect(normalizeDivision("Women's Bantamweight")).toBe("womens-bantamweight");
    expect(normalizeDivision("{{plainlist|\n* [[Middleweight (MMA)|Middleweight]] (2015–present)\n}}")).toBe("middleweight");
    expect(normalizeDivision("* Light Heavyweight")).toBe("light-heavyweight");
    expect(normalizeDivision("Middleweight <be> Light Heavyweight")).toBe("light-heavyweight");
    expect(normalizeDivision("{{plainlist|")).toBe("");
  });

  it("lets a height survive a round trip through inches", () => {
    // Wikipedia states 5 ft 10 in, which is 177.8; Wikidata stores a round 178.
    expect(fieldValuesAgree("heightCm", 177.8, 178)).toBe(true);
    expect(fieldValuesAgree("heightCm", 180.34, 185)).toBe(false);
  });
});

describe("a provider reading its own page again", () => {
  it("supersedes rather than argues", () => {
    expect(supersedesSameProvider(["source:wikipedia:38738224"], "source:wikipedia:38738224")).toBe(true);
    expect(supersedesSameProvider(["source:wikipedia:38738224"], "source:wikidata:Q5081361")).toBe(false);
    expect(supersedesSameProvider([], "source:wikipedia:1")).toBe(false);
  });

  it("closes a discrepancy whose sides now agree", () => {
    const resolved = resolveAgreeingDiscrepancies([
      { field: "name", status: "open" as const, values: [{ value: "Robert Whittaker (fighter)", sourceRef: "a" }, { value: "Robert Whittaker", sourceRef: "b" }] },
      { field: "name", status: "open" as const, values: [{ value: "Abus Magomedov", sourceRef: "a" }, { value: "Abusupiyan Magomedov", sourceRef: "b" }] }
    ]);
    expect(resolved.map((item) => item.status)).toEqual(["resolved", "open"]);
  });
});

describe("the infobox, read as it is written", () => {
  it("takes the weight class the fighter competes in now", () => {
    // Taking the first line filed the lightweight champion as a bantamweight.
    expect(currentDivision("[[Bantamweight (MMA)|Bantamweight]] (2018)<br />[[Featherweight (MMA)|Featherweight]] (2020–2025)<br />[[Lightweight (MMA)|Lightweight]] (2025–present)"))
      .toBe("lightweight");
    // <br> without the slash is just as common.
    expect(currentDivision("[[Lightweight (MMA)|Lightweight]] (2010–2025)<br>[[Welterweight (MMA)|Welterweight]] (2025–present)"))
      .toBe("welterweight");
    expect(currentDivision("[[Middleweight (MMA)|Middleweight]]")).toBe("middleweight");
    expect(currentDivision("[[Middleweight (MMA)|Middleweight]]<be>[[Light Heavyweight (MMA)|Light Heavyweight]]"))
      .toBe("light-heavyweight");
  });

  it("reads a value that continues onto the next lines", () => {
    // Valentina Shevchenko's weight class wraps; stopping at the newline kept only the division
    // she left in 2005.
    const wikitext = [
      "{{Infobox martial artist",
      "| name = Valentina Shevchenko",
      "| weight_class = [[Bantamweight (MMA)|Bantamweight]] (2003-2005,",
      "2015-2016)<br />[[Flyweight (MMA)|Flyweight]] (2017-present)",
      "| height = {{height|ft=5|in=5}}",
      "}}"
    ].join("\n");
    const fields = parseWikipediaFighterPage(wikitext).fields;
    expect(fields.division).toBe("flyweight");
    expect(fields.heightCm).toBe(165.1);
  });

  it("reads feet and inches together instead of the inches alone", () => {
    // "5 ft 10 in" came out as 25.4 centimetres, and sat on the card as a fact.
    expect(parseWikipediaFighterPage("| height = 5 ft 10 in").fields.heightCm).toBe(177.8);
    expect(parseWikipediaFighterPage("| height = 5 ft 11 in").fields.heightCm).toBe(180.34);
    expect(parseWikipediaFighterPage("| height = {{height|m=1.93}}").fields.heightCm).toBe(193);
    // A reach really is stated in bare inches.
    expect(parseWikipediaFighterPage("| reach = 74 in").fields.reachCm).toBe(187.96);
  });
});

describe("a stated record against the bouts on file", () => {
  it("counts the bouts a record accounts for", () => {
    expect(recordBoutCount("24-6-0 (1 NC)")).toBe(31);
    expect(recordBoutCount("17-1-0")).toBe(18);
    expect(recordBoutCount("not a record")).toBeNull();
    expect(recordBoutCount(null)).toBeNull();
  });
});

describe("the model-eligibility rule", () => {
  const verified = (refs: string[]) => ({ sourceRefs: refs, corroborated: true, status: "verified" });

  it("wants two independent providers on every critical field", () => {
    const fields = {
      name: verified(["source:wikipedia:1", "source:wikidata:Q1"]),
      division: verified(["source:wikipedia:1", "source:cito-ufc:x"])
    };
    expect(computeModelEligibility(["name", "division"], fields, [])).toBe(true);
    // Two readings of the same provider are one provider.
    expect(computeModelEligibility(["name"], { name: verified(["source:wikipedia:1", "source:wikipedia:2"]) }, [])).toBe(false);
  });

  it("refuses a field with an open discrepancy", () => {
    const fields = { name: verified(["source:wikipedia:1", "source:wikidata:Q1"]) };
    expect(computeModelEligibility(["name"], fields, [{ field: "name", status: "open" }])).toBe(false);
    expect(computeModelEligibility(["name"], fields, [{ field: "name", status: "resolved" }])).toBe(true);
  });
});

describe("what Wikidata actually returns", () => {
  it("reads a day-precision birth date and refuses a coarser one", () => {
    expect(readDateOfBirth([{ mainsnak: { datavalue: { value: { time: "+1988-07-09T00:00:00Z", precision: 11 } } } }])).toBe("1988-07-09");
    // Precision 9 is a year; a day invented from it would be a fabricated fact.
    expect(readDateOfBirth([{ mainsnak: { datavalue: { value: { time: "+1988-01-01T00:00:00Z", precision: 9 } } } }])).toBeNull();
    expect(readDateOfBirth(undefined)).toBeNull();
  });

  it("converts by the unit on the claim, not by the size of the number", () => {
    // Belal Muhammad is stored in centimetres and Ilia Topuria in metres.
    expect(readHeightCm([{ mainsnak: { datavalue: { value: { amount: "+178", unit: "http://www.wikidata.org/entity/Q174728" } } } }])).toBe(178);
    expect(readHeightCm([{ mainsnak: { datavalue: { value: { amount: "+1.73", unit: "http://www.wikidata.org/entity/Q11573" } } } }])).toBe(173);
    // An unknown unit is a value we cannot place, so it is not a height.
    expect(readHeightCm([{ mainsnak: { datavalue: { value: { amount: "+178", unit: "http://www.wikidata.org/entity/Q99999" } } } }])).toBeNull();
  });

  it("prefers the claim the maintainers marked preferred", () => {
    expect(readHeightCm([
      { rank: "normal", mainsnak: { datavalue: { value: { amount: "+170", unit: "http://www.wikidata.org/entity/Q174728" } } } },
      { rank: "preferred", mainsnak: { datavalue: { value: { amount: "+185", unit: "http://www.wikidata.org/entity/Q174728" } } } }
    ])).toBe(185);
  });
});
