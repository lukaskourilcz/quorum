import { readLibrary } from "@boardlessai/carousel-studio";
import { describe, expect, it } from "vitest";
import {
  enabledBrands,
  loadMarketingSharkConfig,
  MarketingSharkConfig
} from "../src/ventures/marketingshark/config.js";

describe("marketingShark configuration", () => {
  it("ships one enabled brand and geoShark present and off", async () => {
    const config = await loadMarketingSharkConfig();

    expect(config.brands.map((brand) => brand.id)).toEqual(["devshark", "geoshark"]);
    expect(enabledBrands(config).map((brand) => brand.id)).toEqual(["devshark"]);
    expect(config.brands.find((brand) => brand.id === "geoshark")?.enabled).toBe(false);
  });

  it("no longer carries hook copy at all", async () => {
    // The inline sixteen-pattern library is gone: hook copy lives at studio/hooks/quiz.hooks.json,
    // beside the assignment brain that serves every surface. A second copy here would drift, and
    // the one that was here already had — it still shipped `speed-run` ("You have 10 seconds. Go.")
    // against a card with no timer, which the craft rules ban outright.
    const raw = JSON.parse(JSON.stringify(await loadMarketingSharkConfig()));
    expect(raw).not.toHaveProperty("hookLibrary");
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
      }]
    };

    const result = MarketingSharkConfig.safeParse(withBanner);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("geoShark never gets a banner");
  });

  it("keeps every brand's category lists reachable from the gates that name them", async () => {
    // The one thing that still has to agree across the seam: a `categoryIn:X` gate in the central
    // library resolves against the per-brand lists here, so a list the library names and a brand
    // does not have would silently make that gate unsatisfiable for that brand.
    const config = await loadMarketingSharkConfig();
    const library = await readLibrary("quiz");
    const named = new Set(library.hooks
      .flatMap((hook) => hook.truthRequires)
      .filter((predicate) => predicate.kind === "categoryIn")
      .map((predicate) => (predicate as { list: string }).list));

    expect(named.size).toBeGreaterThan(0);
    for (const brand of config.brands) {
      for (const listKey of named) {
        expect(Object.keys(brand.categoryLists), `${brand.id} is missing ${listKey}`).toContain(listKey);
        expect(brand.categoryLists[listKey]!.length).toBeGreaterThan(0);
      }
    }
  });
});
