import { readLibrary } from "@boardlessai/carousel-studio";
import { describe, expect, it } from "vitest";
import {
  enabledBrands,
  factSheetFor,
  loadMarketingSharkConfig,
  MarketingSharkConfig,
  scheduledKind
} from "../src/ventures/marketingshark/config.js";
import { weekdayOf } from "../src/ventures/marketingshark/kinds.js";

describe("marketingShark configuration", () => {
  it("ships exactly one brand, devShark, and it is enabled", async () => {
    const config = await loadMarketingSharkConfig();

    expect(config.brands.map((brand) => brand.id)).toEqual(["devshark"]);
    expect(enabledBrands(config).map((brand) => brand.id)).toEqual(["devshark"]);
    expect(config.brands[0]!.tone).toBe("dev");
  });

  it("carries devShark's address as its only product link", async () => {
    // The owner's direction: marketingShark promotes devShark and nothing else. Every carousel,
    // queue item and banner takes its destination from a brand's productUrl, so the set of those
    // is the set of places this venture can send a reader.
    const config = await loadMarketingSharkConfig();
    expect([...new Set(config.brands.map((brand) => brand.productUrl))]).toEqual(["https://devshark.app"]);
    expect(JSON.stringify(config)).not.toMatch(/https?:\/\/(?!devshark\.app\b)[^"\s]*shark/iu);
  });

  it("no longer carries hook copy at all", async () => {
    // The inline sixteen-pattern library is gone: hook copy lives at studio/hooks/quiz.hooks.json,
    // beside the assignment brain that serves every surface. A second copy here would drift, and
    // the one that was here already had — it still shipped `speed-run` ("You have 10 seconds. Go.")
    // against a card with no timer, which the craft rules ban outright.
    const raw = JSON.parse(JSON.stringify(await loadMarketingSharkConfig()));
    expect(raw).not.toHaveProperty("hookLibrary");
  });

  it("rotates the post kind by weekday: quiz Monday and Thursday, then spotlight, challenge and the week's note, no weekend room (#576)", async () => {
    const brand = enabledBrands(await loadMarketingSharkConfig())[0]!;
    expect(brand.rotation).toEqual({
      monday: "quiz",
      tuesday: "feature-spotlight",
      wednesday: "challenge-teaser",
      thursday: "quiz",
      friday: "this-week",
      saturday: null,
      sunday: null
    });
    // The week of 28 September 2026, Monday to Sunday, read as calendar dates.
    const week = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    expect(week.map(weekdayOf)).toEqual(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
    expect(week.map((date) => scheduledKind(brand, date)))
      .toEqual(["quiz", "feature-spotlight", "challenge-teaser", "quiz", "this-week", null, null]);
  });

  it("gives every kind a slide-1 pattern that names only facts code fills", async () => {
    const shipped = JSON.parse(JSON.stringify(await loadMarketingSharkConfig())) as { brands: Array<Record<string, unknown>> };
    const brand = shipped.brands[0] as { postKinds: Record<string, { hookPattern: Record<string, unknown> }> };
    expect(brand.postKinds.quiz!.hookPattern).toEqual({ source: "library" });
    expect(brand.postKinds.announcement!.hookPattern).toEqual({ source: "owner" });
    expect(brand.postKinds["feature-spotlight"]!.hookPattern.en).toBe("Inside {displayName}: {screen}");
    // A pattern that reaches for a slot its kind does not fill is refused: no config edit can make
    // slide 1 claim a price, a date or a count.
    const reaching = structuredClone(brand);
    reaching.postKinds["this-week"]!.hookPattern.en = "This week on {displayName}: {price}";
    expect(MarketingSharkConfig.safeParse({ ...shipped, brands: [reaching] }).success).toBe(false);
  });

  it("refuses a rotation day that names a kind with no configuration", async () => {
    const shipped = JSON.parse(JSON.stringify(await loadMarketingSharkConfig())) as { brands: Array<Record<string, unknown>> };
    const brand = structuredClone(shipped.brands[0]!) as { postKinds: Record<string, unknown>; rotation: Record<string, unknown> };
    delete brand.postKinds["challenge-teaser"];
    expect(MarketingSharkConfig.safeParse({ ...shipped, brands: [brand] }).success).toBe(false);
    brand.rotation.wednesday = "quiz";
    expect(MarketingSharkConfig.safeParse({ ...shipped, brands: [brand] }).success).toBe(true);
    // The announcement is the owner's, never a weekday's.
    brand.rotation.saturday = "announcement";
    expect(MarketingSharkConfig.safeParse({ ...shipped, brands: [brand] }).success).toBe(false);
  });

  it("names only spotlight screens the fact sheet in effect names", async () => {
    const brand = enabledBrands(await loadMarketingSharkConfig())[0]!;
    const facts = factSheetFor(brand, "2026-09-29")!;
    const text = [facts.whatVisitorsCanDo, ...facts.allowedClaims].join("\n").toLowerCase();
    for (const screen of brand.postKinds["feature-spotlight"]!.screens) {
      expect(text, screen.id).toContain(screen.factTerm.toLowerCase());
    }
  });

  it("refuses a second brand, a retired one, or a second devShark", async () => {
    // geoShark left with StudyShark. Its entry coming back, as a new tone or as a copy of devShark,
    // is a config edit reviving a product with no code change to notice it.
    const shipped = JSON.parse(JSON.stringify(await loadMarketingSharkConfig())) as { brands: Array<Record<string, unknown>> };
    const devshark = shipped.brands[0]!;
    const retired = {
      ...devshark,
      id: "geoshark",
      enabled: false,
      displayName: "geoShark",
      productUrl: "https://studyshark-app.vercel.app",
      tone: "geo"
    };

    for (const brands of [[devshark, retired], [retired], [{ ...devshark, tone: "geo" }], [devshark, devshark]]) {
      expect(MarketingSharkConfig.safeParse({ ...shipped, brands }).success).toBe(false);
    }
    expect(MarketingSharkConfig.safeParse(shipped).success).toBe(true);
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
