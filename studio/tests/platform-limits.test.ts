import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_MAX_SLIDES,
  LINKEDIN_MAX_DOCUMENT_BYTES,
  LINKEDIN_MAX_PAGES,
  deckLimitFailures,
  validateDeckLimits,
  type DeckPlanSlide
} from "../src/index.js";

function deck(count: number, overrides: Partial<DeckPlanSlide> = {}): DeckPlanSlide[] {
  return Array.from({ length: count }, () => ({ format: "instagram-portrait" as const, pngBytes: 120_000, ...overrides }));
}

function byId(slides: readonly DeckPlanSlide[]) {
  return Object.fromEntries(validateDeckLimits(slides).map((check) => [check.id, check]));
}

describe("the platform limits a deck has to clear", () => {
  it("passes a rendered ten-slide deck on one canvas", () => {
    const checks = validateDeckLimits(deck(10));
    expect(checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass"]);
    expect(deckLimitFailures(checks)).toEqual([]);
  });

  it("refuses more slides than Instagram carries, and says how many", () => {
    expect(byId(deck(INSTAGRAM_MAX_SLIDES))["slide-count"]?.status).toBe("pass");
    const over = byId(deck(INSTAGRAM_MAX_SLIDES + 1))["slide-count"];
    expect(over?.status).toBe("fail");
    expect(over?.detail).toBe(`${INSTAGRAM_MAX_SLIDES + 1} slides; Instagram carries at most ${INSTAGRAM_MAX_SLIDES}.`);
    expect(byId([])["slide-count"]?.status).toBe("fail");
  });

  it("refuses a deck that mixes canvases, because Instagram applies one orientation to every item", () => {
    const mixed = [...deck(4), ...deck(2, { format: "instagram-square" })];
    const check = byId(mixed)["single-format"];
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain("mixes instagram-portrait, instagram-square");
    expect(byId(deck(6))["single-format"]?.detail).toBe("Every slide is instagram-portrait.");
  });

  it("estimates the LinkedIn document from the slide count and the rendered bytes", () => {
    const pages = byId(Array.from({ length: LINKEDIN_MAX_PAGES + 1 }, () => ({ format: "instagram-portrait" as const, pngBytes: 1 })));
    expect(pages["linkedin-pages"]?.status).toBe("fail");
    expect(pages["linkedin-pages"]?.detail).toContain(`at most ${LINKEDIN_MAX_PAGES}`);
    expect(byId(deck(20))["linkedin-pages"]?.status).toBe("pass");

    const heavy = byId(deck(10, { pngBytes: Math.ceil(LINKEDIN_MAX_DOCUMENT_BYTES / 10) + 1 }));
    expect(heavy["linkedin-size"]?.status).toBe("fail");
    expect(heavy["linkedin-size"]?.detail).toContain("100.0 MB");
    expect(byId(deck(10, { pngBytes: Math.floor(LINKEDIN_MAX_DOCUMENT_BYTES / 10) }))["linkedin-size"]?.status).toBe("pass");
  });

  it("reports an unrendered deck's size as not measured rather than passing it", () => {
    const unrendered = byId(deck(5, { pngBytes: undefined }));
    expect(unrendered["linkedin-size"]?.status).toBe("not-measured");
    expect(unrendered["linkedin-size"]?.detail).toContain("not measured");
    // One slide without bytes is a deck without a size.
    const partial = byId([...deck(4), { format: "instagram-portrait" }]);
    expect(partial["linkedin-size"]?.status).toBe("not-measured");
    // Not measured is not a refusal; the other checks still pass.
    expect(deckLimitFailures(validateDeckLimits(deck(5, { pngBytes: undefined })))).toEqual([]);
  });
});
