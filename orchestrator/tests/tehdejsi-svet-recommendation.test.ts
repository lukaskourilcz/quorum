import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { TehdejsiRecommendationSchema } from "../src/contracts/tehdejsi-recommendation.js";
import { AnyVentureRecommendationSchema } from "../src/contracts/venture-recommendation.js";

type Recommendation = ReturnType<typeof TehdejsiRecommendationSchema.parse>;

async function fixture(kind: "valid" | "poison"): Promise<Record<string, unknown>> {
  const source = await readFile(
    path.join(repoRoot, "contracts", "fixtures", `venture-recommendation-tehdejsi.${kind}.json`),
    "utf8"
  );
  return JSON.parse(source) as Record<string, unknown>;
}

const valid = TehdejsiRecommendationSchema.parse(await fixture("valid"));

/** The poison fixture with everything wrong except the one rule under test. */
async function poisonRepairedExcept(keep: "cta" | "review" | "attribution" | "terminology"): Promise<unknown> {
  const record = await fixture("poison") as unknown as Recommendation;
  if (keep !== "cta") record.payload.ctaKind = "none";
  if (keep !== "review") record.humanReviewRequired = true;
  if (keep !== "attribution") record.media[0]!.attribution = "Photo by J. Novak, CC BY-SA 4.0";
  if (keep !== "terminology") record.evidence.terminologyCheck.findings = [];
  // The tier-2 review the repaired record would otherwise be missing on its way out of draft.
  record.humanReviewedAt = "2026-08-16T18:00:00.000Z";
  return record;
}

describe("tehdejsi-story recommendation contract", () => {
  it("accepts the golden fixture through both the narrow schema and the published union", async () => {
    expect(TehdejsiRecommendationSchema.safeParse(await fixture("valid")).success).toBe(true);
    expect(AnyVentureRecommendationSchema.safeParse(await fixture("valid")).success).toBe(true);
  });

  it("rejects the poison fixture", async () => {
    expect(TehdejsiRecommendationSchema.safeParse(await fixture("poison")).success).toBe(false);
  });

  it.each(["cta", "review", "attribution", "terminology"] as const)(
    "fails on the %s rule alone, with every other fault repaired",
    async (rule) => {
      expect(TehdejsiRecommendationSchema.safeParse(await poisonRepairedExcept(rule)).success).toBe(false);
    }
  );

  it("refuses a licensed photo with no attribution and refuses credit on its own render", () => {
    const noAttribution = structuredClone(valid);
    noAttribution.media[1]!.attribution = "";
    expect(TehdejsiRecommendationSchema.safeParse(noAttribution).success).toBe(false);

    const creditedRender = structuredClone(valid);
    creditedRender.media[0]!.attribution = "Photo by nobody";
    expect(TehdejsiRecommendationSchema.safeParse(creditedRender).success).toBe(false);
  });

  it("requires human review exactly at tier 2, in both directions", () => {
    const flaggedTierZero = structuredClone(valid);
    flaggedTierZero.humanReviewRequired = true;
    expect(TehdejsiRecommendationSchema.safeParse(flaggedTierZero).success).toBe(false);

    const unflaggedTierTwo = structuredClone(valid);
    unflaggedTierTwo.evidence.sensitivityTier = 2;
    expect(TehdejsiRecommendationSchema.safeParse(unflaggedTierTwo).success).toBe(false);
  });

  it("refuses a raise recorded against a tier below 2, because that is a lost gate", () => {
    const lostRaise = structuredClone(valid);
    lostRaise.evidence.tierRaisedBy = ["chornobyl"];
    expect(TehdejsiRecommendationSchema.safeParse(lostRaise).success).toBe(false);
  });

  it("keeps a package from being posted in one language only", () => {
    const halfPosted = structuredClone(valid);
    halfPosted.status = "posted";
    halfPosted.owner.postedUrls = { cs: "https://example.com/cs", ua: null };
    expect(TehdejsiRecommendationSchema.safeParse(halfPosted).success).toBe(false);

    const bothPosted = structuredClone(halfPosted);
    bothPosted.owner.postedUrls = { cs: "https://example.com/cs", ua: "https://example.com/ua" };
    expect(TehdejsiRecommendationSchema.safeParse(bothPosted).success).toBe(true);
  });

  it("refuses media that names a slide the package does not have", () => {
    const orphanMedia = structuredClone(valid);
    orphanMedia.media[0]!.slideOrdinal = 9;
    expect(TehdejsiRecommendationSchema.safeParse(orphanMedia).success).toBe(false);
  });

  it("keeps the two languages in one slide, so neither can be written without the other", () => {
    const shape = TehdejsiRecommendationSchema.shape.payload.shape.slides.element.shape;
    expect(Object.keys(shape).sort()).toEqual(["cs", "ordinal", "ua"]);
    const emptyUkrainian = structuredClone(valid);
    emptyUkrainian.payload.slides[1]!.ua = "";
    expect(TehdejsiRecommendationSchema.safeParse(emptyUkrainian).success).toBe(false);
  });

  it("does not let a tehdejsi record pass as a sibling venture's", async () => {
    const wrongVenture = { ...await fixture("valid"), ventureId: "door-money" };
    expect(AnyVentureRecommendationSchema.safeParse(wrongVenture).success).toBe(false);
  });
});
