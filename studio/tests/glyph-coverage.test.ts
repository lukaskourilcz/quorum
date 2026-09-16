import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FONTS_DIRECTORY, FONT_FAMILIES, measureEm, missingCommittedGlyphs, resolveFace } from "../src/fonts.js";
import { FONT_METRICS } from "../src/font-metrics.generated.js";
import { CAROUSEL_BRANDS } from "../src/library.js";
import { familiesOf, lettersFor, publishingLocalesFor, requiredCharacters } from "../src/locales.js";
import type { PublishingLocale } from "../src/schema.js";

/**
 * The alphabets the engine has to be able to set, derived rather than listed.
 *
 * A missing glyph does not fail anything at render time — it draws a notdef box, which is the one
 * rendering failure that looks deliberate. So coverage is asserted here, where a font that cannot
 * set a language one of its brands publishes in is a red test rather than a shipped card with
 * squares in it.
 *
 * This gate used to name two families and one alphabet. Two families is the number that happened
 * to need Cyrillic; thirteen is the number of families the engine ships, and every one of them
 * sets Czech. So the requirement is read off each brand's declared publishing locales instead: a
 * new family, a new brand or a new language extends the gate by itself, and nobody has to remember
 * that this file exists.
 */

/** Every family a brand binds, with every language the brands that bind it publish in. */
const FAMILY_LOCALES = (() => {
  const grouped = new Map<string, Set<PublishingLocale>>();
  for (const brand of Object.values(CAROUSEL_BRANDS)) {
    for (const family of familiesOf(brand)) {
      const locales = grouped.get(family) ?? new Set<PublishingLocale>();
      for (const locale of publishingLocalesFor(brand.id)) locales.add(locale);
      grouped.set(family, locales);
    }
  }
  return grouped;
})();

const BOUND_FAMILIES = [...FAMILY_LOCALES.keys()].sort();

function localesOf(family: string): PublishingLocale[] {
  return [...(FAMILY_LOCALES.get(family) ?? new Set<PublishingLocale>())].sort();
}

/**
 * `Ї ї Є є Ґ ґ І і` are the four pairs that separate Ukrainian from Russian: a font subset
 * labelled "Cyrillic" routinely covers the Russian alphabet and stops right here.
 */
const UKRAINIAN_DISTINCT = "ЇїЄєҐґІі";

/**
 * Read a font's own cmap rather than trusting the generated table.
 *
 * The width table is what the fitter measures with, and a character missing from it falls back to
 * an average width — so a font could be missing a glyph entirely and the fitter would never
 * notice. Reading the file itself is the only check that answers the question actually being
 * asked, which is whether the rasteriser has something to draw.
 */
function codepointsOf(file: string): Set<number> {
  const data = readFileSync(file);
  const tableCount = data.readUInt16BE(4);
  let cmapOffset: number | null = null;
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16;
    if (data.toString("latin1", record, record + 4) === "cmap") cmapOffset = data.readUInt32BE(record + 8);
  }
  if (cmapOffset === null) throw new Error(`${file} carries no cmap table`);

  const subtables = data.readUInt16BE(cmapOffset + 2);
  let best: { offset: number; format: number } | null = null;
  let bestScore = -1;
  for (let index = 0; index < subtables; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platform = data.readUInt16BE(record);
    const encoding = data.readUInt16BE(record + 2);
    const offset = cmapOffset + data.readUInt32BE(record + 4);
    const format = data.readUInt16BE(offset);
    // Format 12 covers the whole of Unicode; format 4 with the Windows BMP encoding is next best.
    const score = format === 12 ? 3 : platform === 3 && encoding === 1 ? 2 : 1;
    if (score > bestScore) { best = { offset, format }; bestScore = score; }
  }
  if (!best) throw new Error(`${file} carries no usable cmap subtable`);

  const covered = new Set<number>();
  if (best.format === 4) {
    const segmentBytes = data.readUInt16BE(best.offset + 6);
    for (let segment = 0; segment < segmentBytes / 2; segment += 1) {
      const end = data.readUInt16BE(best.offset + 14 + segment * 2);
      const start = data.readUInt16BE(best.offset + 16 + segmentBytes + segment * 2);
      if (start === 0xffff) continue;
      for (let code = start; code <= end && code !== 0xffff; code += 1) covered.add(code);
    }
  } else if (best.format === 12) {
    const groups = data.readUInt32BE(best.offset + 12);
    for (let group = 0; group < groups; group += 1) {
      const record = best.offset + 16 + group * 12;
      for (let code = data.readUInt32BE(record); code <= data.readUInt32BE(record + 4); code += 1) covered.add(code);
    }
  }
  return covered;
}

function missing(file: string, alphabet: string): string {
  const covered = codepointsOf(path.join(FONTS_DIRECTORY, file));
  return [...alphabet].filter((character) => !covered.has(character.codePointAt(0)!)).join("");
}

function facesOf(family: string): Array<{ key: string; file: string; weight: number }> {
  const slug = family.toLowerCase().replaceAll(" ", "-");
  return Object.entries(FONT_METRICS)
    .filter(([key]) => key.slice(0, key.lastIndexOf("-")) === slug)
    .map(([key, face]) => ({ key, file: face.file, weight: face.weight }));
}

describe("alphabet coverage", () => {
  it("gates every family the engine ships, because every family is bound by a brand", () => {
    // A family no brand binds would receive no gate at all: there would be no publishing locale
    // to derive a requirement from, and the loop below would silently skip it.
    expect(BOUND_FAMILIES).toEqual([...FONT_FAMILIES].sort());
    expect(BOUND_FAMILIES).toHaveLength(13);
  });

  it("derives Cyrillic for exactly the faces the Ukrainian brand binds", () => {
    // The derivation has to be able to fail. If every family resolved to Latin the suite below
    // would pass on thirteen Latin-only faces and prove nothing about the venture that publishes
    // in Ukrainian; if every family resolved to Cyrillic it would be a list, not a derivation.
    const cyrillic = BOUND_FAMILIES.filter((family) => localesOf(family).includes("uk"));
    expect(cyrillic).toEqual(familiesOf(CAROUSEL_BRANDS["tehdejsi-svet"]).sort());
    expect(localesOf("Anton")).toEqual(["cs"]);
    expect(localesOf("Literata")).toEqual(["cs", "uk"]);
  });

  it.each(BOUND_FAMILIES)("%s ships at least one committed face", (family) => {
    // A family named in `fonts.ts` with no file under `studio/fonts/` resolves to nothing and
    // every assertion below it would loop zero times.
    expect(facesOf(family).length).toBeGreaterThanOrEqual(1);
  });

  it("ships three weights of each Cyrillic identity face", () => {
    // Anton ships one weight and the mono faces ship two; these two carry the bilingual card's
    // whole type hierarchy, so a missing weight there is a silent substitution.
    for (const family of ["Literata", "Inter"]) {
      expect(facesOf(family).length, family).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(BOUND_FAMILIES)("%s draws every character its brands' languages need, in every weight", (family) => {
    const required = requiredCharacters(localesOf(family));
    for (const face of facesOf(family)) {
      expect(missing(face.file, required), `${face.key} missing for ${localesOf(family).join(", ")}`).toBe("");
    }
  });

  it.each(BOUND_FAMILIES)("%s measures every one of those characters rather than charging a fallback", (family) => {
    const required = requiredCharacters(localesOf(family));
    for (const face of facesOf(family)) {
      // Coverage in the file is not enough: a character absent from the width table is charged the
      // fallback average, so a whole alphabet would measure at one flat width and fit wrongly.
      expect(missingCommittedGlyphs(resolveFace(family, face.weight), required), `${face.key} unmeasured`).toEqual([]);
    }
  });

  it.each(BOUND_FAMILIES.filter((family) => localesOf(family).includes("uk")))(
    "%s draws the letters that separate Ukrainian from Russian",
    (family) => {
      for (const face of facesOf(family)) {
        expect(missing(face.file, UKRAINIAN_DISTINCT), `${face.key} missing`).toBe("");
      }
    }
  );
});

describe("Cyrillic measurement", () => {
  const ukrainianFamilies = BOUND_FAMILIES.filter((family) => localesOf(family).includes("uk"));
  /** A face whose whole table is one advance is monospaced, which changes what counts as proof. */
  const proportional = ukrainianFamilies
    .filter((family) => Object.keys(resolveFace(family, 400).widths).length > 1);

  it.each(ukrainianFamilies)("%s has a committed advance for every Cyrillic character", (family) => {
    expect(missingCommittedGlyphs(resolveFace(family, 400), lettersFor("uk"))).toEqual([]);
  });

  it.each(proportional)("%s measures Cyrillic from the table rather than from the fallback", (family) => {
    const face = resolveFace(family, 400);
    // A proportional face proves it by disagreeing with itself: a fallback-only measurement would
    // put the whole alphabet on one width. IBM Plex Mono puts it on one width by design, so the
    // evidence for the mono face is the committed entries above and not this spread.
    const widths = new Set([...lettersFor("uk")].map((character) => measureEm(face, character)));
    expect(widths.size).toBeGreaterThan(5);
    expect(measureEm(face, "і")).toBeLessThan(measureEm(face, "ш"));
  });

  it("measures a Ukrainian line as wider than a single word, not as one flat rate", () => {
    const face = resolveFace("Inter", 400);
    const line = "Кілька хвилин перед сном";
    expect(measureEm(face, line)).toBeGreaterThan(measureEm(face, "Кілька"));
    // A fallback-only measurement would make these equal, since both have the same length.
    expect(measureEm(face, "ІІІІІІ")).not.toBe(measureEm(face, "шшшшшш"));
  });
});
