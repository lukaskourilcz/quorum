import { describe, expect, it } from "vitest";
import {
  APCA_MIN_LC,
  CAROUSEL_BRANDS,
  DECK_FAMILIES,
  FAMILY_REVIEWS,
  FamilyReviewSchema,
  LAYOUT_CHECKLIST_VERSION,
  PLATFORM_LIMITS,
  apcaCheck,
  apcaContrast,
  apcaLc,
  contrastRatio,
  familyComposer,
  familyDeckTemplate,
  goldenTemplateId,
  mayGoLive,
  platformLimitCheck,
  previewFormats,
  ratioName,
  requireSignOff,
  signedOffFamilies,
  textGroundPairs,
  validateTemplateForBrand,
  worstApcaLc
} from "../src/index.js";

/**
 * The layout gate, as one executable checklist.
 *
 * "Every layout is original and reviewed" was a sentence in a document until this file existed.
 * What it holds, per family: the platform will accept it, both readability measures clear their
 * floors at every brand, and a review record exists that is pinned to the version actually
 * composed. A thirty-first family fails `pnpm typecheck` before it reaches here — the
 * `Record<DeckFamily, …>` annotations in `family-review.ts` and `families.ts` are that gate — and
 * fails this suite the moment it renders differently from the manifest it has no entry in.
 *
 * Deliberately not a golden-render test: that is `golden.test.ts`, because rasterising thirty
 * decks is seconds of work and these assertions are microseconds of it.
 */

const brands = Object.values(CAROUSEL_BRANDS);

/** Written down rather than read off the array under test, exactly as `families.test.ts` argues. */
const FAMILY_COUNT = 30;

describe("the layout gate", () => {
  it("holds a review record for every registered family, pinned to the composed version", () => {
    expect(Object.keys(FAMILY_REVIEWS)).toHaveLength(FAMILY_COUNT);
    for (const family of DECK_FAMILIES) {
      const review = FAMILY_REVIEWS[family];
      expect(() => FamilyReviewSchema.parse(review), family).not.toThrow();
      expect(review.family, family).toBe(family);
      expect(review.checklistVersion, family).toBe(LAYOUT_CHECKLIST_VERSION);
      // The version on the record is the version that renders. A composition that bumps its own
      // version without touching its record is a layout reviewed at a version nobody shipped.
      expect(review.templateVersion, family).toBe(familyDeckTemplate(family, 7).version);
      expect(review.composer, family).toBe(familyComposer(family));
      expect(review.composer, family).not.toBe("unregistered");
      expect(review.specimen, family).toBe(`docs/design-lab/families/${family}.html`);
    }
  });

  /*
   * The honest half. No owner has reviewed a layout in this repository, so every record says so,
   * and this assertion is what stops a later session quietly backfilling thirty sign-offs to make
   * a green tick. When the owner does review one, this number moves in the same commit.
   */
  it("records no owner sign-off it cannot evidence, and offers the switch for when one exists", () => {
    expect(signedOffFamilies()).toEqual([]);
    for (const family of DECK_FAMILIES) {
      expect(FAMILY_REVIEWS[family].signOff, family).toBeNull();
      expect(requireSignOff(family).ok, family).toBe(false);
    }
  });

  it("keeps every family inside the platform's own limits, at every canvas it offers", () => {
    for (const family of DECK_FAMILIES) {
      for (const slideCount of [5, 7, 10]) {
        const template = familyDeckTemplate(family, slideCount);
        expect(template.slides.length).toBeLessThanOrEqual(PLATFORM_LIMITS.maxItemsPerConnectorItem);
        for (const format of previewFormats(template)) {
          const check = platformLimitCheck(template, format);
          expect(check.status, `${family}/${slideCount}/${format}: ${check.detail}`).toBe("pass");
        }
      }
    }
  });

  it("names every canvas the studio composes, and refuses one the feed would crop", () => {
    expect(ratioName({ width: 1_080, height: 1_350 })).toBe("4:5");
    expect(ratioName({ width: 1_080, height: 1_080 })).toBe("1:1");
    expect(ratioName({ width: 1_200, height: 1_200 })).toBe("1:1");
    expect(ratioName({ width: 1_080, height: 1_920 })).toBe("9:16");
    // 1.91:1 landscape: a shape Instagram accepts and this studio does not compose.
    expect(ratioName({ width: 1_080, height: 566 })).toBeNull();
  });

  it("fails a template that declares a canvas outside the accepted shapes", () => {
    const template = familyDeckTemplate("rail", 7);
    const bent = {
      ...template,
      formats: { ...template.formats, "instagram-square": { ...template.formats["instagram-square"], height: 1_400 } }
    };
    const check = platformLimitCheck(bent, "instagram-portrait");
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("instagram-square");
  });

  it("clears both readability floors for every family, brand and offered format", () => {
    for (const family of DECK_FAMILIES) {
      const template = familyDeckTemplate(family, 7);
      for (const brand of brands) {
        const apca = apcaCheck(template, brand);
        expect(apca.status, `${family}/${brand.id}: ${apca.detail}`).toBe("pass");
        for (const format of previewFormats(template)) {
          const checks = validateTemplateForBrand(template, brand, format);
          expect(checks.map(({ id }) => id)).toContain("apca");
          expect(checks.map(({ id }) => id)).toContain("platform-limits");
          expect(mayGoLive(checks), `${family}/${brand.id}/${format}`).toBe(true);
        }
      }
    }
  });

  /*
   * The two measures read one list of grounds. Before the extraction they each resolved their own,
   * and two answers to "what is behind this line of type" is one answer too many: the pair that
   * failed would be the pair only the other measure looked at.
   */
  it("measures both floors over the same text and ground pairs", () => {
    const template = familyDeckTemplate("fault", 7);
    const brand = CAROUSEL_BRANDS["door-money"];
    const pairs = textGroundPairs(template, brand);
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair.grounds.length).toBeGreaterThan(0);
      expect(pair.foreground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(pair.minFontSize).toBeGreaterThanOrEqual(16);
      expect(Math.min(...pair.grounds.map((ground) => contrastRatio(pair.foreground, ground)))).toBeGreaterThanOrEqual(4.5);
      expect(Math.min(...pair.grounds.map((ground) => apcaLc(pair.foreground, ground)))).toBeGreaterThanOrEqual(APCA_MIN_LC);
    }
  });
});

describe("APCA lightness contrast", () => {
  it("is polarity-sensitive, which is the whole reason it is here", () => {
    const darkOnLight = apcaContrast("#000000", "#ffffff");
    const lightOnDark = apcaContrast("#ffffff", "#000000");
    expect(darkOnLight).toBeGreaterThan(0);
    expect(lightOnDark).toBeLessThan(0);
    // The same two colours, swapped, are the same WCAG ratio and two different APCA readings.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#000000"), 10);
    expect(Math.abs(darkOnLight)).not.toBeCloseTo(Math.abs(lightOnDark), 1);
  });

  it("reports nothing for a pair with no difference", () => {
    expect(apcaLc("#2b2b2b", "#2b2b2b")).toBe(0);
  });

  /*
   * A floor the library clears by a mile is a floor that never fires. This pins the other half of
   * the claim in `contrast-apca.ts`: the worst pair in the shared library sits just above Lc 40 —
   * measured at 41.2 when the floor was set — so the check is load-bearing rather than decorative.
   * The upper bound is what fails if somebody raises the floor without doing the design work.
   */
  it("sits close enough to its floor to be worth checking", () => {
    const worst = Math.min(...DECK_FAMILIES.flatMap((family) => {
      const template = familyDeckTemplate(family, 7);
      return brands.map((brand) => worstApcaLc(template, brand));
    }));
    expect(worst).toBeGreaterThanOrEqual(APCA_MIN_LC);
    expect(worst).toBeLessThan(45);
  });

  it("catches a pair the luminance ratio flatters", () => {
    // Door Money's worst real pairing: over 4.5:1 by WCAG, and the weakest reading in the library.
    expect(contrastRatio("#ff4d3d", "#24191c")).toBeGreaterThan(4.5);
    expect(apcaLc("#ff4d3d", "#24191c")).toBeLessThan(45);
    expect(apcaLc("#ff4d3d", "#24191c")).toBeGreaterThanOrEqual(APCA_MIN_LC);
  });

  it("fails a template whose text drops below the floor", () => {
    const template = familyDeckTemplate("quiet", 7);
    const brand = CAROUSEL_BRANDS["mma-files"];
    // A ground one step from the foreground: still a real hex, nowhere near readable.
    const muddied = {
      ...brand,
      colors: { ...brand.colors, background: brand.colors["foreground"] ?? "#ffffff" }
    };
    expect(apcaCheck(template, muddied).status).toBe("fail");
  });
});

describe("the golden render's identity", () => {
  it("names the deck every baseline is taken from", () => {
    for (const family of DECK_FAMILIES) {
      expect(goldenTemplateId(family)).toBe(`deck-${family}-7`);
    }
  });
});
