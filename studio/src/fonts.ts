import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_METRICS, type FaceMetrics } from "./font-metrics.generated.js";

/**
 * The typefaces the engine ships with, and the arithmetic it measures them by.
 *
 * Two problems used to live here as one. The brands named system font stacks — `Arial Narrow,
 * Arial, sans-serif` — and no font file existed in the repository, so the render server drew in
 * whatever fontconfig happened to find and the PNG bytes were a property of the machine. And the
 * fitter charged every character a flat 0.56 em, which is about right for Czech sentence case and
 * about a fifth short for all-caps, so an uppercase headline measured as fitting and then drew
 * wider than the canvas.
 *
 * Both are answered the same way: the files are committed, they are handed to the rasteriser
 * explicitly, and their real advance widths are committed beside them. Nothing at render time
 * reads a font, asks the operating system for one, or estimates.
 */

/** Where the .ttf files live, resolved from this module so `dist/` and `src/` both find them. */
export const FONTS_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fonts");

/** Every committed face, as absolute paths, in a stable order. */
export function fontFiles(): string[] {
  return Object.values(FONT_METRICS)
    .map((face) => path.join(FONTS_DIRECTORY, face.file))
    .sort();
}

const familySlugs: Readonly<Record<string, string>> = {
  Archivo: "archivo",
  "Barlow Condensed": "barlow-condensed",
  Barlow: "barlow",
  Petrona: "petrona",
  Karla: "karla",
  Figtree: "figtree",
  Outfit: "outfit",
  "Public Sans": "public-sans",
  "IBM Plex Sans": "ibm-plex-sans",
  "IBM Plex Mono": "ibm-plex-mono"
};

/** The families a brand may name. Anything else is a typo, and the schema will not catch it. */
export const FONT_FAMILIES = Object.keys(familySlugs);

const facesBySlug = (() => {
  const grouped = new Map<string, FaceMetrics[]>();
  for (const [key, face] of Object.entries(FONT_METRICS)) {
    const slug = key.slice(0, key.lastIndexOf("-"));
    grouped.set(slug, [...(grouped.get(slug) ?? []), face]);
  }
  for (const faces of grouped.values()) faces.sort((left, right) => left.weight - right.weight);
  return grouped;
})();

/**
 * The committed face closest to what a layer asked for.
 *
 * A template may name any weight from 300 to 900; a family carries the four or five the design
 * set actually uses. Rounding to the nearest committed weight — the heavier one on a tie — keeps
 * a request for 500 body text as body text, where falling through to a different family would be
 * a silent substitution of exactly the kind this whole task exists to end.
 */
export function resolveFace(family: string, weight: number): FaceMetrics {
  const slug = familySlugs[family];
  const faces = slug ? facesBySlug.get(slug) : undefined;
  if (!faces || faces.length === 0) throw new Error(`No committed font for family ${family}`);
  let best = faces[0]!;
  for (const face of faces) {
    const better = Math.abs(face.weight - weight) < Math.abs(best.weight - weight);
    const tie = Math.abs(face.weight - weight) === Math.abs(best.weight - weight) && face.weight > best.weight;
    if (better || tie) best = face;
  }
  return best;
}

const advanceTables = new Map<FaceMetrics, Map<string, number>>();

function advancesOf(face: FaceMetrics): Map<string, number> {
  const cached = advanceTables.get(face);
  if (cached) return cached;
  const table = new Map<string, number>();
  for (const [width, characters] of Object.entries(face.widths)) {
    for (const character of characters) table.set(character, Number(width) / 1_000);
  }
  advanceTables.set(face, table);
  return table;
}

/**
 * How wide a string sets, in em, before letter-spacing.
 *
 * Per character rather than per grapheme cluster: a combining sequence is measured as its parts,
 * which over-counts a little, and over-counting is the safe direction — it shrinks type that
 * would otherwise have run off the edge.
 */
export function measureEm(face: FaceMetrics, value: string): number {
  const advances = advancesOf(face);
  const fallback = face.fallback / 1_000;
  let total = 0;
  for (const character of value) total += advances.get(character) ?? fallback;
  return total;
}
