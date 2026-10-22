import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MASTER_CANVAS } from "../src/canvas.js";
import { DneskaiGoldenSchema, dneskaiGoldenCases, type DneskaiGolden } from "../src/dneskai-golden.js";
import { GOLDEN_DIRECTORY } from "../src/golden.js";
import { syntheticPhoto } from "../src/index.js";
import { renderDneskaiSlide, type DneskaiSlideInput } from "../src/dneskai-slide.js";
import { acceptanceDeck } from "../tests/fixtures/dneskai-acceptance-deck.js";

/**
 * The spotlight kit's golden renders: the acceptance deck and the editorial golden cases, each
 * rendered with `kit: "spotlight"`, and one cover with its second photograph as the ringed inset,
 * the composition only this kit draws. Run `tsx scripts/dneskai-spotlight-golden.ts` to rewrite
 * golden/dneskai-spotlight.json after a deliberate change to the kit; the test compares against it.
 */
export const SPOTLIGHT_GOLDEN_PATH = path.join(GOLDEN_DIRECTORY, "dneskai-spotlight.json");

export async function spotlightGoldenCases(): Promise<Array<{ name: string; input: DneskaiSlideInput }>> {
  const deck = (await acceptanceDeck()).map((input, index) => ({ name: `acceptance-${index + 1}-${input.type}`, input: { ...input, kit: "spotlight" as const } }));
  const cases = (await dneskaiGoldenCases()).map(({ name, input }) => ({ name, input: { ...input, kit: "spotlight" as const } }));
  const [main, face] = await Promise.all([syntheticPhoto(1_600, 1_200, 61), syntheticPhoto(800, 800, 62)]);
  const inset: DneskaiSlideInput = {
    kit: "spotlight",
    type: "cover-photo",
    position: { index: 0, count: 5 },
    headline: "Laboratoř Z ukázala Model X před rokem a dnes: srovnání je smyšlený příklad",
    images: [{ slot: "image-1", bytes: main }, { slot: "image-2", bytes: face }]
  };
  return [...deck, ...cases, { name: "spotlight-cover-inset", input: inset }];
}

export async function buildSpotlightGolden(updatedAt: string): Promise<DneskaiGolden> {
  const entries: DneskaiGolden["entries"] = [];
  for (const { name, input } of await spotlightGoldenCases()) {
    const result = await renderDneskaiSlide(input);
    if (result.status !== "rendered" || !result.pngHash || !result.template) throw new Error(`Golden case ${name} was refused: ${result.problems.map((p) => p.message).join("; ")}`);
    entries.push({ name, templateId: result.template.id, version: result.template.version, pngHash: result.pngHash });
  }
  return DneskaiGoldenSchema.parse({ schemaVersion: "dneskai-photo-golden/1", canvas: { width: MASTER_CANVAS.width, height: MASTER_CANVAS.height }, updatedAt, entries });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const golden = await buildSpotlightGolden(process.argv[2] ?? new Date().toISOString().slice(0, 10));
  writeFileSync(SPOTLIGHT_GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`);
  process.stdout.write(`${golden.entries.length} entries, ${SPOTLIGHT_GOLDEN_PATH}\n`);
}
