import { describe, expect, it } from "vitest";
import {
  enabledBrands,
  evaluateTruthRequirement,
  loadMarketingSharkConfig,
  MarketingSharkConfig,
  patternIsTruthful,
  requirementsForTone,
  type TruthSubject
} from "../src/ventures/marketingshark/config.js";

const subject = (overrides: Partial<TruthSubject> = {}): TruthSubject => ({
  difficulty: 3,
  hasCode: false,
  category: "javascript",
  optionCount: 4,
  englishQuestion: "Why does this work?",
  ...overrides
});

const categoryLists = {
  commonUse: ["javascript", "git"],
  interview: ["dsa"]
};

describe("marketingShark configuration", () => {
  it("ships one enabled brand, geoShark present and off, and a library that cannot starve", async () => {
    const config = await loadMarketingSharkConfig();

    expect(config.brands.map((brand) => brand.id)).toEqual(["devshark", "geoshark"]);
    expect(enabledBrands(config).map((brand) => brand.id)).toEqual(["devshark"]);
    expect(config.brands.find((brand) => brand.id === "geoshark")?.enabled).toBe(false);
    // Phase 2 is one importer run and this one flag. Anything else that had to change would
    // make "a config flip" a claim rather than a fact.
    expect(config.hookLibrary).toHaveLength(16);
    expect(new Set(config.hookLibrary.map((pattern) => pattern.id)).size).toBe(16);
    // Five unconditional patterns, not six. The founding brief's prose said six and its own
    // authoritative JSON shipped five; the JSON is what was signed off, so it shipped as
    // written. The consequence is real and bounded: a run of days whose questions satisfy
    // nothing but `always` exhausts the five inside a ten-day cooldown, and from the sixth such
    // day the deterministic relaxation in the ledger is what keeps two patterns eligible rather
    // than the library size. That path is exercised in marketingshark-ledger.test.ts, so the
    // gap is covered by code rather than by an off-by-one claim.
    expect(config.hookLibrary.filter((pattern) => pattern.truthRequires.includes("always"))).toHaveLength(5);
    for (const pattern of config.hookLibrary) {
      expect(Object.keys(pattern.variants).sort()).toEqual(["dev", "geo"]);
    }
  });

  it("refuses any config that gives geoShark a banner", () => {
    const withBanner = {
      schemaVersion: "marketingshark-config/1",
      meetingPhase: "ms-daily",
      pragueHour: 7,
      abVariants: 2,
      minEligibleBeforeRelax: 2,
      brands: [{
        id: "geoshark",
        enabled: false,
        displayName: "geoShark",
        productUrl: "https://studyshark-app.vercel.app",
        tone: "geo",
        questionBank: { snapshotPath: "x", sourceRepo: "y", sourceSubject: "geography" },
        categoryLists: {},
        slide5: { en: "a", cs: "b" },
        templateMap: { hook: "a", context: "b", reveal: "c", why: "d", footer: "e" },
        hashtags: { instagram: { en: [], cs: [] }, threadsTopic: { en: "a", cs: "b" } },
        banner: true
      }],
      hookLibrary: Array.from({ length: 15 }, (_, index) => ({
        id: `pattern-${index}`,
        cooldownDays: 10,
        truthRequires: ["always"],
        variants: { dev: { en: "a", cs: "b" }, geo: { en: "a", cs: "b" } }
      }))
    };

    const result = MarketingSharkConfig.safeParse(withBanner);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("geoShark never gets a banner");
  });

  it("evaluates every truth predicate, and fails an unknown one closed", () => {
    expect(evaluateTruthRequirement("always", subject(), categoryLists)).toBe(true);
    expect(evaluateTruthRequirement("difficultyAtLeast:3", subject({ difficulty: 3 }), categoryLists)).toBe(true);
    expect(evaluateTruthRequirement("difficultyAtLeast:4", subject({ difficulty: 3 }), categoryLists)).toBe(false);
    expect(evaluateTruthRequirement("optionsAtLeast:4", subject({ optionCount: 3 }), categoryLists)).toBe(false);
    expect(evaluateTruthRequirement("hasCode", subject({ hasCode: true }), categoryLists)).toBe(true);
    expect(evaluateTruthRequirement("categoryIn:commonUse", subject({ category: "git" }), categoryLists)).toBe(true);
    expect(evaluateTruthRequirement("categoryIn:interview", subject({ category: "git" }), categoryLists)).toBe(false);
    expect(evaluateTruthRequirement("categoryIn:missingList", subject(), categoryLists)).toBe(false);
    expect(evaluateTruthRequirement("questionStartsWith:Why", subject(), categoryLists)).toBe(true);
    expect(evaluateTruthRequirement("questionStartsWith:How", subject(), categoryLists)).toBe(false);
    // A typo must never read as "no condition". That direction promotes a mistake into a hook
    // that is allowed to front any question at all.
    expect(evaluateTruthRequirement("difficultyAtLeat:2", subject(), categoryLists)).toBe(false);
    expect(evaluateTruthRequirement("", subject(), categoryLists)).toBe(false);
  });

  it("substitutes the geo tone's only override, and leaves dev alone", async () => {
    const config = await loadMarketingSharkConfig();
    const spotIt = config.hookLibrary.find((pattern) => pattern.id === "spot-it")!;

    expect(requirementsForTone(spotIt, "dev")).toEqual(["hasCode"]);
    expect(requirementsForTone(spotIt, "geo")).toEqual(["optionsAtLeast:4"]);
    // A geography bank has no code, so without the override the geo variant would be
    // permanently ineligible rather than differently conditioned.
    expect(patternIsTruthful(spotIt, "geo", subject({ hasCode: false, optionCount: 4 }), categoryLists)).toBe(true);
    expect(patternIsTruthful(spotIt, "dev", subject({ hasCode: false, optionCount: 4 }), categoryLists)).toBe(false);

    // And it is the only one. A second silent override belongs in a decision record.
    const overridden = config.hookLibrary.filter((pattern) =>
      JSON.stringify(requirementsForTone(pattern, "geo")) !== JSON.stringify(pattern.truthRequires));
    expect(overridden.map((pattern) => pattern.id)).toEqual(["spot-it"]);
  });

  it("keeps every brand's category lists reachable from the patterns that name them", async () => {
    const config = await loadMarketingSharkConfig();
    const named = new Set(config.hookLibrary
      .flatMap((pattern) => pattern.truthRequires)
      .filter((requirement) => requirement.startsWith("categoryIn:"))
      .map((requirement) => requirement.slice("categoryIn:".length)));

    for (const brand of config.brands) {
      for (const listKey of named) {
        expect(Object.keys(brand.categoryLists), `${brand.id} is missing ${listKey}`).toContain(listKey);
        expect(brand.categoryLists[listKey]!.length).toBeGreaterThan(0);
      }
    }
  });
});
