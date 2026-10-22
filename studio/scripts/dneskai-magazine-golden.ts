import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MASTER_CANVAS } from "../src/canvas.js";
import { DneskaiGoldenSchema, dneskaiGoldenCases, type DneskaiGolden } from "../src/dneskai-golden.js";
import { GOLDEN_DIRECTORY } from "../src/golden.js";
import { renderDneskaiSlide, type DneskaiSlideInput } from "../src/dneskai-slide.js";
import { acceptanceDeck } from "../tests/fixtures/dneskai-acceptance-deck.js";

/**
 * The magazine kit's golden renders: the acceptance deck and the editorial golden cases, each
 * rendered with `kit: "magazine"`. Run `tsx scripts/dneskai-magazine-golden.ts` to rewrite
 * golden/dneskai-magazine.json after a deliberate change to the kit; the test compares against it.
 */
export const MAGAZINE_GOLDEN_PATH = path.join(GOLDEN_DIRECTORY, "dneskai-magazine.json");

export async function magazineGoldenCases(): Promise<Array<{ name: string; input: DneskaiSlideInput }>> {
  const deck = (await acceptanceDeck()).map((input, index) => ({ name: `acceptance-${index + 1}-${input.type}`, input: { ...input, kit: "magazine" as const } }));
  const cases = (await dneskaiGoldenCases()).map(({ name, input }) => ({ name, input: { ...input, kit: "magazine" as const } }));
  return [...deck, ...cases];
}

export async function buildMagazineGolden(updatedAt: string): Promise<DneskaiGolden> {
  const entries: DneskaiGolden["entries"] = [];
  for (const { name, input } of await magazineGoldenCases()) {
    const result = await renderDneskaiSlide(input);
    if (result.status !== "rendered" || !result.pngHash || !result.template) throw new Error(`Golden case ${name} was refused: ${result.problems.map((p) => p.message).join("; ")}`);
    entries.push({ name, templateId: result.template.id, version: result.template.version, pngHash: result.pngHash });
  }
  return DneskaiGoldenSchema.parse({ schemaVersion: "dneskai-photo-golden/1", canvas: { width: MASTER_CANVAS.width, height: MASTER_CANVAS.height }, updatedAt, entries });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const golden = await buildMagazineGolden(process.argv[2] ?? new Date().toISOString().slice(0, 10));
  writeFileSync(MAGAZINE_GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`);
  process.stdout.write(`${golden.entries.length} entries, ${MAGAZINE_GOLDEN_PATH}\n`);
}
