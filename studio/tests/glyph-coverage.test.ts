import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FONTS_DIRECTORY, measureEm, resolveFace } from "../src/fonts.js";
import { FONT_METRICS } from "../src/font-metrics.generated.js";

/**
 * The alphabets the engine has to be able to set.
 *
 * A missing glyph does not fail anything at render time — it draws a notdef box, which is the one
 * rendering failure that looks deliberate. So coverage is asserted here, where a font that cannot
 * set Ukrainian is a red test rather than a shipped card with squares in it.
 *
 * `Ї ї Є є Ґ ґ І і` are called out because they are the four pairs that separate Ukrainian from
 * Russian: a font subset for "Cyrillic" routinely covers the Russian alphabet and stops.
 */
const UKRAINIAN = "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя";
const UKRAINIAN_DISTINCT = "ЇїЄєҐґІі";
const CZECH = "ÁáČčĎďÉéĚěÍíŇňÓóŘřŠšŤťÚúÝýŽžŮů";

/** The venture's two faces. Every other committed family is Latin-only in practice. */
const CYRILLIC_FAMILIES = ["Literata", "Inter"] as const;

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

describe("Cyrillic coverage", () => {
  it.each(CYRILLIC_FAMILIES)("%s ships at least three weights", (family) => {
    expect(facesOf(family).length).toBeGreaterThanOrEqual(3);
  });

  it.each(CYRILLIC_FAMILIES)("%s draws the whole Ukrainian alphabet in every weight", (family) => {
    for (const face of facesOf(family)) {
      expect(missing(face.file, UKRAINIAN), `${face.key} missing`).toBe("");
    }
  });

  it.each(CYRILLIC_FAMILIES)("%s draws the letters that separate Ukrainian from Russian", (family) => {
    // A subset labelled "Cyrillic" routinely covers the Russian alphabet and stops here.
    for (const face of facesOf(family)) {
      expect(missing(face.file, UKRAINIAN_DISTINCT), `${face.key} missing`).toBe("");
    }
  });

  it.each(CYRILLIC_FAMILIES)("%s draws Czech diacritics, since one kit sets both languages", (family) => {
    for (const face of facesOf(family)) {
      expect(missing(face.file, CZECH), `${face.key} missing`).toBe("");
    }
  });

  it.each(CYRILLIC_FAMILIES)("%s measures Cyrillic from the table rather than from the fallback", (family) => {
    const face = resolveFace(family, 400);
    // Coverage in the file is not enough: a character absent from the width table falls back to
    // an average, and a whole alphabet measured at one width would fit wrongly on every card.
    const widths = new Set([...UKRAINIAN].map((character) => measureEm(face, character)));
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
