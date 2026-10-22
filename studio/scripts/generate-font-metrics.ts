/**
 * Read every committed font and write the width table the fitter measures with.
 *
 * Run at authoring time, never at render time. Parsing twenty-five TrueType files on each request
 * would be slow, and — worse — it would put the measurement on a code path where a missing or
 * differently-versioned file changes the answer silently. The output is committed, so the fitter's
 * arithmetic is the same on every machine whether or not it can even open a font.
 *
 *   pnpm -C studio fonts:metrics
 *
 * Layout of the generated table, per face: the advance width of every character the set can set,
 * in thousandths of an em, inverted so that one entry lists every character sharing a width. A
 * grotesque puts most of its lowercase on two or three widths, so the inversion is what keeps
 * twenty-five faces to a few dozen kilobytes instead of a few hundred.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontsDirectory = path.join(root, "fonts");

interface Face {
  /** The directory the file lives in, which is the family slug. */
  slug: string;
  file: string;
  weight: number;
  /** What the file calls itself, which is what a renderer has to ask for. */
  familyName: string;
  /** The typographic family (name id 16) when the file has one: what resvg's fontdb keys on. */
  rasterFamily: string;
  unitsPerEm: number;
  advances: Map<number, number>;
  /** Cap height and x-height in thousandths of an em, and whether they were assumed. */
  capHeight: number;
  xHeight: number;
  verticalAssumed: boolean;
}

function tables(data: Buffer): Map<string, { offset: number; length: number }> {
  const count = data.readUInt16BE(4);
  const found = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    found.set(data.toString("latin1", record, record + 4), {
      offset: data.readUInt32BE(record + 8),
      length: data.readUInt32BE(record + 12)
    });
  }
  return found;
}

/**
 * The family a renderer must name to get this exact face.
 *
 * Google's static instances use legacy naming: `Archivo ExtraBold` in name id 1 with a `Regular`
 * subfamily, and the real family only in the typographic name id 16 — which some families omit
 * altogether. Asking for `font-family="Barlow Condensed" font-weight="800"` therefore finds
 * nothing, silently, and the renderer draws in whatever it falls back to. So the table records
 * what each file actually calls itself and the renderer names that.
 */
function familyNames(data: Buffer, offset: number): { familyName: string; rasterFamily: string } {
  const count = data.readUInt16BE(offset + 2);
  const stringOffset = data.readUInt16BE(offset + 4);
  const byId = new Map<number, string>();
  for (let index = 0; index < count; index += 1) {
    const record = offset + 6 + index * 12;
    const platform = data.readUInt16BE(record);
    const nameId = data.readUInt16BE(record + 6);
    if (nameId !== 1 && nameId !== 16) continue;
    const length = data.readUInt16BE(record + 8);
    const stringStart = offset + stringOffset + data.readUInt16BE(record + 10);
    const raw = data.subarray(stringStart, stringStart + length);
    const value = platform === 3 ? raw.swap16().toString("utf16le") : raw.toString("latin1");
    if (!byId.has(nameId)) byId.set(nameId, value);
  }
  // Measured on 2026-09-27: resvg's fontdb keys a face on name id 16 when the file has one, so
  // `font-family="Inter SemiBold"` finds nothing and draws the fallback face, while `Inter` at 600
  // finds the file. `familyName` keeps the legacy id-1 name every recorded hash was drawn with;
  // `rasterFamily` is the name that resolves, and brands drawn from a kit use it.
  const legacy = byId.get(1) ?? byId.get(16) ?? "";
  return { familyName: legacy, rasterFamily: byId.get(16) ?? legacy };
}

function characterMap(data: Buffer, offset: number): Map<number, number> {
  const count = data.readUInt16BE(offset + 2);
  let best = -1;
  for (let index = 0; index < count; index += 1) {
    const record = offset + 4 + index * 8;
    const platform = data.readUInt16BE(record);
    const encoding = data.readUInt16BE(record + 2);
    const subtable = offset + data.readUInt32BE(record + 4);
    const usable = (platform === 3 && (encoding === 1 || encoding === 10))
      || (platform === 0 && encoding >= 3);
    if (usable) best = subtable;
  }
  const map = new Map<number, number>();
  if (best < 0) return map;
  const format = data.readUInt16BE(best);
  if (format === 4) {
    const segments = data.readUInt16BE(best + 6) / 2;
    const endsAt = best + 14;
    const startsAt = endsAt + segments * 2 + 2;
    const deltasAt = startsAt + segments * 2;
    const rangesAt = deltasAt + segments * 2;
    for (let segment = 0; segment < segments; segment += 1) {
      const end = data.readUInt16BE(endsAt + segment * 2);
      const start = data.readUInt16BE(startsAt + segment * 2);
      const delta = data.readInt16BE(deltasAt + segment * 2);
      const rangeOffset = data.readUInt16BE(rangesAt + segment * 2);
      if (start === 0xffff) continue;
      for (let code = start; code <= end && code !== 0x1_0000; code += 1) {
        let glyph: number;
        if (rangeOffset === 0) {
          glyph = (code + delta) & 0xffff;
        } else {
          const at = rangesAt + segment * 2 + rangeOffset + (code - start) * 2;
          if (at + 1 >= data.length) continue;
          const raw = data.readUInt16BE(at);
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
        }
        if (glyph) map.set(code, glyph);
      }
    }
  } else if (format === 12) {
    const groups = data.readUInt32BE(best + 12);
    for (let group = 0; group < groups; group += 1) {
      const at = best + 16 + group * 12;
      const start = data.readUInt32BE(at);
      const end = data.readUInt32BE(at + 4);
      const glyph = data.readUInt32BE(at + 8);
      for (let code = start; code <= end; code += 1) map.set(code, glyph + (code - start));
    }
  }
  return map;
}

/**
 * Every character the brands can set.
 *
 * The Cyrillic block is here for the venture that publishes in Ukrainian. Coverage in the font
 * file is not enough on its own: a character absent from this set gets no entry in the width
 * table, so the fitter charges it the fallback average and a whole alphabet measures at one flat
 * width. That is a card that fits in the arithmetic and overflows on the page.
 *
 * Widening the set costs the Latin-only families nothing. A code their cmap does not carry
 * produces no entry, and the `average` below is taken over the Latin alphabet either way, so
 * their committed tables come back byte for byte identical.
 */
function characterSet(): number[] {
  const codes = new Set<number>();
  for (let code = 0x20; code <= 0x7e; code += 1) codes.add(code);
  for (let code = 0xa0; code <= 0xff; code += 1) codes.add(code);
  for (let code = 0x100; code <= 0x17f; code += 1) codes.add(code);
  for (let code = 0x400; code <= 0x4ff; code += 1) codes.add(code);
  // Ukrainian sets its apostrophe as a modifier letter; the typographic one is already below.
  for (const extra of ["–", "—", "‘", "’", "“", "”", "…", "·", "×", "€", "→", "ʼ", "«", "»", "„"]) {
    codes.add(extra.codePointAt(0)!);
  }
  return [...codes].sort((left, right) => left - right);
}

/**
 * The face's cap height and x-height in thousandths of an em.
 *
 * OS/2 version 2 and later carry both (`sxHeight` at byte 86, `sCapHeight` at byte 88). A face
 * without them is measured from its outlines: the yMax of the H and x glyphs in `glyf`. A face
 * with neither is assumed at 700 and 500 and says so on stderr and in the generated table. On the
 * committed set every face takes the table path.
 */
function verticalMetrics(
  data: Buffer,
  found: Map<string, { offset: number; length: number }>,
  glyphs: Map<number, number>,
  unitsPerEm: number,
  label: string
): { capHeight: number; xHeight: number; assumed: boolean } {
  const os2 = found.get("OS/2")!;
  const version = data.readUInt16BE(os2.offset);
  const fromTable = (offset: number) => (version >= 2 ? data.readInt16BE(os2.offset + offset) : 0);
  const fromGlyph = (character: string) => {
    const glyph = glyphs.get(character.codePointAt(0)!);
    const loca = found.get("loca");
    const glyf = found.get("glyf");
    const head = found.get("head")!;
    if (glyph === undefined || !loca || !glyf) return 0;
    const long = data.readInt16BE(head.offset + 50) === 1;
    const start = long ? data.readUInt32BE(loca.offset + glyph * 4) : data.readUInt16BE(loca.offset + glyph * 2) * 2;
    const end = long ? data.readUInt32BE(loca.offset + (glyph + 1) * 4) : data.readUInt16BE(loca.offset + (glyph + 1) * 2) * 2;
    return end > start ? data.readInt16BE(glyf.offset + start + 8) : 0;
  };
  let assumed = false;
  const pick = (table: number, glyph: number, fallback: number, name: string) => {
    if (table > 0) return Math.round((table / unitsPerEm) * 1_000);
    if (glyph > 0) return Math.round((glyph / unitsPerEm) * 1_000);
    process.stderr.write(`${label}: no OS/2 ${name} and no glyph bounds, assuming ${fallback}\n`);
    assumed = true;
    return fallback;
  };
  const capHeight = pick(fromTable(88), fromGlyph("H"), 700, "sCapHeight");
  const xHeight = pick(fromTable(86), fromGlyph("x"), 500, "sxHeight");
  return { capHeight, xHeight, assumed };
}

function readFace(slug: string, file: string): Face {
  const data = readFileSync(path.join(fontsDirectory, slug, file));
  const found = tables(data);
  const head = found.get("head")!;
  const hhea = found.get("hhea")!;
  const hmtx = found.get("hmtx")!;
  const os2 = found.get("OS/2")!;
  const unitsPerEm = data.readUInt16BE(head.offset + 18);
  const longMetrics = data.readUInt16BE(hhea.offset + 34);
  const weight = data.readUInt16BE(os2.offset + 4);
  const glyphs = characterMap(data, found.get("cmap")!.offset);
  const advanceOf = (glyph: number) => {
    const index = Math.min(glyph, longMetrics - 1);
    return data.readUInt16BE(hmtx.offset + index * 4);
  };
  const advances = new Map<number, number>();
  for (const code of characterSet()) {
    const glyph = glyphs.get(code);
    if (glyph === undefined) continue;
    advances.set(code, Math.round((advanceOf(glyph) / unitsPerEm) * 1_000));
  }
  const vertical = verticalMetrics(data, found, glyphs, unitsPerEm, `${slug}/${file}`);
  return {
    slug,
    file,
    weight,
    ...familyNames(data, found.get("name")!.offset),
    unitsPerEm,
    advances,
    capHeight: vertical.capHeight,
    xHeight: vertical.xHeight,
    verticalAssumed: vertical.assumed
  };
}

const faces = readdirSync(fontsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => readdirSync(path.join(fontsDirectory, entry.name))
    .filter((file) => file.endsWith(".ttf"))
    .sort()
    .map((file) => readFace(entry.name, file)))
  .sort((left, right) => `${left.slug}-${left.weight}`.localeCompare(`${right.slug}-${right.weight}`));

if (faces.length === 0) throw new Error("No fonts found under studio/fonts");

const lines: string[] = [
  "/*",
  " * Generated by `pnpm -C studio fonts:metrics`. Do not edit by hand.",
  " *",
  " * One entry per committed face. `widths` maps an advance in thousandths of an em to every",
  " * character that has it, which is compact because a typeface reuses a handful of widths across",
  " * its lowercase. `fallback` is the advance charged to a character the face does not carry.",
  " */",
  "export interface FaceMetrics {",
  "  /** The family name the file itself reports, which is the name a renderer has to ask for. */",
  "  readonly familyName: string;",
  "  /** The name resvg resolves this exact face by (name id 16 when present). */",
  "  readonly rasterFamily: string;",
  "  readonly weight: number;",
  "  readonly file: string;",
  "  /** The mean advance of a letter in this face, which is what capacity questions need. */",
  "  readonly average: number;",
  "  /** What an unmapped character is charged. */",
  "  readonly fallback: number;",
  "  /** The cap height in thousandths of an em: OS/2 sCapHeight over unitsPerEm, else the H glyph's yMax from glyf, else 700 (assumed). */",
  "  readonly capHeight: number;",
  "  /** The x-height in thousandths of an em: OS/2 sxHeight over unitsPerEm, else the x glyph's yMax from glyf, else 500 (assumed). */",
  "  readonly xHeight: number;",
  "  readonly widths: Readonly<Record<string, string>>;",
  "}",
  "",
  "export const FONT_METRICS: Readonly<Record<string, FaceMetrics>> = {"
];

for (const face of faces) {
  const byWidth = new Map<number, string[]>();
  for (const [code, width] of [...face.advances].sort((left, right) => left[0] - right[0])) {
    const list = byWidth.get(width) ?? [];
    list.push(String.fromCodePoint(code));
    byWidth.set(width, list);
  }
  /*
   * The mean advance of a letter, not the commonest one.
   *
   * The commonest advance is the mode over every character the face carries, and a face carries
   * far more rare accented forms than it does letters anyone sets — Karla's mode is 0.28 em,
   * which is a diacritic, not a letter. The overflow check asks "could this many characters fit",
   * and the honest answer to that is an average over the alphabet.
   */
  const letters = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ "]
    .map((character) => face.advances.get(character.codePointAt(0)!))
    .filter((advance): advance is number => advance !== undefined);
  const average = Math.round(letters.reduce((total, advance) => total + advance, 0) / Math.max(1, letters.length));
  const unknown = face.advances.get("?".codePointAt(0)!) ?? average;
  const widths = [...byWidth.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([width, characters]) => `      "${width}": ${JSON.stringify(characters.join(""))}`)
    .join(",\n");
  lines.push(`  "${face.slug}-${face.weight}": {`);
  lines.push(`    familyName: ${JSON.stringify(face.familyName)},`);
  lines.push(`    rasterFamily: ${JSON.stringify(face.rasterFamily)},`);
  lines.push(`    weight: ${face.weight},`);
  lines.push(`    file: ${JSON.stringify(`${face.slug}/${face.file}`)},`);
  lines.push(`    average: ${average},`);
  lines.push(`    fallback: ${unknown},`);
  if (face.verticalAssumed) lines.push("    // capHeight and xHeight assumed: no OS/2 v2 table and no glyf outline for H and x");
  lines.push(`    capHeight: ${face.capHeight},`);
  lines.push(`    xHeight: ${face.xHeight},`);
  lines.push("    widths: {");
  lines.push(widths);
  lines.push("    }");
  lines.push("  },");
}

lines.push("};");
lines.push("");

const target = path.join(root, "src", "font-metrics.generated.ts");
writeFileSync(target, lines.join("\n"), "utf8");
console.log(`${faces.length} faces → ${path.relative(root, target)}`);
