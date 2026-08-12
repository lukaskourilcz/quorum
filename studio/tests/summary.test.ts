import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_SLIDE_WORDS,
  MAX_SUMMARY_PASSAGES,
  MIN_SUMMARY_PASSAGES,
  buildCarouselSummary,
  passageLength,
  reviewCarouselSummary,
  summaryKicker
} from "../src/index.js";

/** A Czech body with the two things the splitter has historically got wrong. */
const BODY = [
  "Adam Bartoš přichází na Oktagon 62 s nejlepší obranou takedownů v divizi.",
  "Ve svých posledních třech zápasech ubránil 86 procent pokusů, což potvrzuje oficiální karta i naše vlastní historie.",
  "Zápas se konal 14. září 2024 a skončil na body.",
  "Grasso vs. Shevchenko 2 byl jiný případ, protože tam rozhodla submise.",
  "Zbývá jedna otevřená otázka: druhý zdroj pro jeden z výsledků zatím chybí."
].join(" ");

describe("buildCarouselSummary", () => {
  const summary = buildCarouselSummary({
    venture: "mma-files",
    slug: "profil-adam-bartos",
    date: "2026-08-06",
    title: "Adam Bartoš přichází na Oktagon 62 s nejlepší obranou takedownů v divizi",
    dek: "Bilance 26-4-1 a jedno znovuzískání titulu.",
    bodyMdx: BODY,
    sources: [{ kind: "internal", label: "BoardlessAI verified record" }],
    hasHero: true,
    heroCredit: "Photo: Oktagon MMA"
  });

  it("carries the desk's own words and adds none of its own", () => {
    expect(summary.headline).toContain("Adam Bartoš");
    expect(summary.standfirst).toContain("26-4-1");
    for (const passage of summary.passages) {
      expect(BODY).toContain(passage.slice(0, 24));
    }
  });

  it("never puts more words on a slide than a slide holds", () => {
    for (const passage of summary.passages) {
      expect(passage.trim().split(/\s+/u).length).toBeLessThanOrEqual(MAX_SLIDE_WORDS);
    }
  });

  it("does not split a Czech ordinal or an abbreviation into its own passage", () => {
    // "14. září 2024" and "Grasso vs. Shevchenko" are the two cases a naive period split breaks,
    // and both produce a passage starting mid-sentence in lower case when it happens.
    for (const passage of summary.passages) {
      expect(passage).not.toMatch(/^(?:září|Shevchenko)/u);
    }
  });

  it("is deterministic: the same article always yields the same summary", () => {
    const again = buildCarouselSummary({
      venture: "mma-files",
      slug: "profil-adam-bartos",
      date: "2026-08-06",
      title: "Adam Bartoš přichází na Oktagon 62 s nejlepší obranou takedownů v divizi",
      dek: "Bilance 26-4-1 a jedno znovuzískání titulu.",
      bodyMdx: BODY,
      sources: [{ kind: "internal", label: "BoardlessAI verified record" }],
      hasHero: true,
      heroCredit: "Photo: Oktagon MMA"
    });
    expect(again).toEqual(summary);
  });

  it("stays inside the passage ceiling however long the article is", () => {
    const long = buildCarouselSummary({
      venture: "mma-files",
      slug: "dlouhy",
      date: "2026-08-06",
      title: "Titulek",
      dek: "Perex.",
      bodyMdx: Array.from({ length: 60 }, (_, index) => `Věta číslo ${index + 1} je krátká.`).join(" ")
    });
    expect(long.passages.length).toBeLessThanOrEqual(MAX_SUMMARY_PASSAGES);
  });

  it("carries no repository path into the sources", () => {
    expect(JSON.stringify(summary.sources)).not.toContain("state/");
    expect(JSON.stringify(summary.sources)).not.toContain(".json");
  });

  it("prints the kicker in the language the magazine publishes", () => {
    expect(summaryKicker("mma-files", "2026-08-06")).toBe("MMA Files · 6. srp");
    expect(summaryKicker("caught-up", "2026-01-31")).toBe("DNESKAi · 31. led");
    expect(summaryKicker("door-money", "2026-08-06")).toBe("Door Money · Aug 6");
  });

  it("records Door Money in English without adding or translating source copy", () => {
    const english = buildCarouselSummary({
      venture: "door-money",
      slug: "synthetic-road-note",
      date: "2026-08-06",
      title: "A synthetic road note about a difficult load-in",
      dek: "Three invented details show how the carousel contract carries English copy.",
      points: [
        "The fictional crew reached the venue before sunrise.",
        "A made-up loading plan kept every case in order.",
        "The synthetic example ends without describing any real person or event."
      ]
    });
    expect(english.locale).toBe("en");
    expect(english.kicker).toBe("Door Money · Aug 6");
    expect(english.closing).toBe("The rest of the story lives in Door Money.");
    expect(buildCarouselSummary({
      venture: "door-money",
      slug: "synthetic-road-note",
      date: "2026-08-06",
      title: "A synthetic road note about a difficult load-in",
      dek: "Three invented details show how the carousel contract carries English copy.",
      points: [
        "The fictional crew reached the venue before sunrise.",
        "A made-up loading plan kept every case in order.",
        "The synthetic example ends without describing any real person or event."
      ]
    })).toEqual(english);
  });

  it("represents a single-image recommendation as one poster record, not a padded carousel", () => {
    const poster = buildCarouselSummary({
      venture: "door-money",
      slug: "synthetic-poster",
      date: "2026-08-06",
      deckMode: "single-image",
      title: "A synthetic poster line",
      dek: "An invented note keeps the fixture independent of the book.",
      points: ["This must not become a hidden second slide."]
    });
    expect(poster).toMatchObject({ locale: "en", deckMode: "single-image", passages: [] });
    expect(reviewCarouselSummary(poster)).toEqual({ renderable: true, problems: [] });
  });

  it("keeps both existing ventures byte-identical", () => {
    const caughtUp = buildCarouselSummary({
      venture: "caught-up",
      slug: "synteticky-prehled",
      date: "2026-01-31",
      title: "Syntetický přehled dne",
      dek: "Tři ověřené body v krátkém souhrnu.",
      points: [
        "První syntetický bod zůstává přesně u zdroje.",
        "Druhý syntetický bod přidává kontext bez domněnky.",
        "Třetí syntetický bod uzavírá ověřený přehled."
      ],
      hasHero: false
    });
    const encoded = [summary, caughtUp].map((value) => JSON.stringify(value));
    expect(encoded.map((value) => Buffer.byteLength(value))).toEqual([925, 523]);
    expect(encoded.map((value) => createHash("sha256").update(value).digest("hex"))).toEqual([
      "ebe877a9018a306e92427b84864a2992fe634cc111eb9af65aeb18884c074e8c",
      "def292d80c07d454f1b54fb4588d93ddcb24a421337ff3d1c44345d91b309a24"
    ]);
  });
});

describe("reviewCarouselSummary", () => {
  it("refuses a summary with too little to say rather than padding it", () => {
    const thin = buildCarouselSummary({
      venture: "caught-up",
      slug: "kratke",
      date: "2026-08-06",
      title: "Titulek",
      dek: "Perex.",
      points: ["Jedna věta."]
    });
    expect(thin.passages.length).toBeLessThan(MIN_SUMMARY_PASSAGES);
    const review = reviewCarouselSummary(thin);
    expect(review.renderable).toBe(false);
    expect(review.problems.join(" ")).toContain("at least");
  });

  it("will not let a hero travel without its credit", () => {
    const summary = buildCarouselSummary({
      venture: "mma-files",
      slug: "bez-kreditu",
      date: "2026-08-06",
      title: "Titulek",
      dek: "Perex.",
      bodyMdx: BODY,
      hasHero: true,
      heroCredit: null
    });
    expect(reviewCarouselSummary(summary).problems.join(" ")).toContain("credit");
  });
});

describe("passageLength", () => {
  it("bands text by the three declared steps", () => {
    expect(passageLength("a".repeat(80))).toBe("short");
    expect(passageLength("a".repeat(150))).toBe("medium");
    expect(passageLength("a".repeat(400))).toBe("long");
  });
});
