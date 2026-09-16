import { describe, expect, it } from "vitest";
import {
  MAX_SLIDE_WORDS,
  PROMOTION_BRIEF_COUNT,
  PROMOTION_SLIDE_COUNT,
  buildEditionPromotionDeck,
  reviewDeck,
  wordCount
} from "../src/index.js";

const CTA = "Nové vydání každý den — dneskai.example.";

/** A day off the desk: three why-it-matters points, four what-changed, four Briefs. */
function edition(overrides: Partial<Parameters<typeof buildEditionPromotionDeck>[0]> = {}) {
  return buildEditionPromotionDeck({
    title: "Spam se vrátil, tentokrát s agenty",
    coverLine: "Průzkum: 61 % voličů je proti datovým centrům pro AI",
    whyItMatters: [
      "Agentní AI generuje spam, který obchází tradiční filtry.",
      "Průzkum s 61% odporem je dosud nejtvrdší číslo o veřejné náladě.",
      "Huangova rétorika přichází ve chvíli, kdy Kongres hledá pozici."
    ],
    whatChanged: [
      "ILands je první zdokumentovaný případ agentního spamu ve velkém měřítku.",
      "Průzkum NYT/Siena ukázal 61% odpor voličů k výstavbě datových center.",
      "Google vydal modely Gemini 3.8 Live a Live Extended Thinking.",
      "Apple oznámil kryptografické ověřování fotografií Reference Image."
    ],
    briefTitles: [
      "Cloudflare: crawleři AI musí být zodpovědní",
      "TypeSafe AI: model, který hraje Doom",
      "Llama.cpp vydal build b10991",
      "Boox Palma 3 přichází s podporou stylusu"
    ],
    cta: CTA,
    ...overrides
  });
}

describe("the DNESKAi promotion deck is five fixed beats", () => {
  it("opens on the lead and closes on the single call to action", () => {
    const deck = edition();

    expect(deck.built).toBe(true);
    if (!deck.built) return;
    expect(deck.slides).toHaveLength(PROMOTION_SLIDE_COUNT);
    expect(deck.slides.map((slide) => slide.kind)).toEqual(["cover", "hook", "body", "body", "outro"]);
    // The cover line is written for a feed; the title is written for a page of prose.
    expect(deck.slides[0]!.text).toContain("61 %");
    expect(deck.slides.at(-1)!.text).toBe(CTA);
    // Exactly one ask, and it is the last slide. Nothing before it points anywhere.
    expect(deck.slides.filter((slide) => slide.text.includes("dneskai.example"))).toHaveLength(1);
  });

  it("falls back to the title when the desk wrote no cover line", () => {
    const deck = edition({ coverLine: undefined });

    expect(deck.built).toBe(true);
    if (!deck.built) return;
    expect(deck.slides[0]!.text).toBe("Spam se vrátil, tentokrát s agenty");
  });

  it("passes the studio's own deck review", () => {
    const deck = edition();

    expect(deck.built).toBe(true);
    if (!deck.built) return;
    const review = reviewDeck(deck.slides);
    expect(review.problems).toEqual([]);
    expect(review.publishable).toBe(true);
  });

  it("keeps every slide inside the thirty-word cap", () => {
    const deck = edition();

    expect(deck.built).toBe(true);
    if (!deck.built) return;
    for (const slide of deck.slides) expect(wordCount(slide.text)).toBeLessThanOrEqual(MAX_SLIDE_WORDS);
  });
});

describe("what did not fit is reported rather than dropped", () => {
  it("counts the editor's points against the ones the slide carries", () => {
    const deck = edition();

    expect(deck.built).toBe(true);
    if (!deck.built) return;
    expect(deck.beats.whyItMatters.available).toBe(3);
    expect(deck.beats.whatChanged.available).toBe(4);
    // Four Briefs in the edition, two on the slide, and the record says both numbers.
    expect(deck.beats.briefs.available).toBe(4);
    expect(deck.beats.briefs.carried).toBe(PROMOTION_BRIEF_COUNT);
    for (const beat of Object.values(deck.beats)) {
      expect(beat.carried).toBeGreaterThanOrEqual(1);
      expect(beat.carried).toBeLessThanOrEqual(beat.available);
    }
  });

  it("carries the whole beat when the whole beat fits", () => {
    const deck = edition({
      whyItMatters: ["Krátký bod.", "Druhý krátký bod."],
      whatChanged: ["Jediná změna."]
    });

    expect(deck.built).toBe(true);
    if (!deck.built) return;
    expect(deck.beats.whyItMatters).toMatchObject({ carried: 2, available: 2 });
    expect(deck.beats.whatChanged).toMatchObject({ carried: 1, available: 1 });
  });

  it("keeps the editor's order, never a sample of the middle", () => {
    const deck = edition({ whatChanged: ["První změna.", "Druhá změna.", "Třetí změna."] });

    expect(deck.built).toBe(true);
    if (!deck.built) return;
    expect(deck.slides[2]!.text.indexOf("První")).toBeLessThan(deck.slides[2]!.text.indexOf("Druhá"));
  });
});

describe("a deck that cannot be built honestly is refused", () => {
  it("refuses an edition with no Briefs rather than padding the fourth slide", () => {
    const deck = edition({ briefTitles: [] });

    expect(deck.built).toBe(false);
    if (deck.built) return;
    expect(deck.reason).toContain("no Briefs");
  });

  it("refuses an edition with no why-it-matters point", () => {
    const deck = edition({ whyItMatters: ["   "] });

    expect(deck.built).toBe(false);
    if (deck.built) return;
    expect(deck.reason).toContain("why-it-matters");
  });

  it("refuses a call to action too long for the slide, rather than cutting it in half", () => {
    const deck = edition({ cta: `${"slovo ".repeat(MAX_SLIDE_WORDS + 5)}.` });

    expect(deck.built).toBe(false);
    if (deck.built) return;
    expect(deck.reason).toContain("call to action");
  });

  it("refuses an empty call to action", () => {
    const deck = edition({ cta: "  " });

    expect(deck.built).toBe(false);
    if (deck.built) return;
    expect(deck.reason).toContain("no call to action");
  });
});

describe("the same edition renders the same deck", () => {
  it("is deterministic: no clock, no die", () => {
    expect(edition()).toEqual(edition());
  });
});
