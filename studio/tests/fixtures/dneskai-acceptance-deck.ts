import { syntheticPhoto, type DneskaiImageInput, type DneskaiSlideInput } from "../../src/index.js";

/*
 * The issue's acceptance deck (quorum#603): one payload with four assets and their focal points,
 * seven 1080 × 1350 slides — cover photo, two figures, split, statement, figure, sources.
 *
 * Written once as plain data, with each image naming one of the four assets by index, so the same
 * deck renders here and in a separate process that only has the files (tests/portable.test.ts).
 */

type SlideSpec = Omit<DneskaiSlideInput, "images"> & {
  images?: Array<Omit<DneskaiImageInput, "bytes"> & { asset: number }>;
};

const at = (index: number) => ({ index, count: 7 });

export const ACCEPTANCE_DECK: readonly SlideSpec[] = [
  { type: "cover-photo", position: at(0), kicker: "Model · 20. 10. 2026", headline: "Smyšlený model, který si pustíte doma, a co z toho plyne", credit: "Foto: smyšlený zdroj", images: [{ slot: "image-1", asset: 0, crop: { focal: { x: 0.7, y: 0.4 } } }] },
  { type: "figure", position: at(1), headline: "Graf v rámu, nad ním titulek", body: "Popis pod grafem.", credit: "Graf: smyšlený zdroj", images: [{ slot: "image-1", asset: 1, crop: { focal: { x: 0.5, y: 0.5 } } }] },
  { type: "figure", position: at(2), headline: "Výřez fotky podle focal pointu", body: "Druhý obrázek, oříznutý na rám.", credit: "Foto: smyšlený zdroj", images: [{ slot: "image-1", asset: 2, crop: { focal: { x: 0.3, y: 0.6 }, zoom: 1.4, fit: "cover" } }] },
  { type: "split", position: at(3), kicker: "Detail", headline: "Text vlevo, dva obrázky vpravo", body: "Vysvětlení v levém sloupci.", credit: "Foto: smyšlený zdroj", images: [{ slot: "image-1", asset: 3, crop: { focal: { x: 0.4, y: 0.5 } } }, { slot: "image-2", asset: 2, crop: { focal: { x: 0.6, y: 0.2 }, fit: "cover" } }] },
  { type: "statement", position: at(4), headline: "Jeden výrok na modré ploše.", body: "Tichá poznámka pod ním." },
  { type: "figure", position: at(5), headline: "Návrat k prvnímu obrázku, jinak oříznutému", body: "Tentýž asset, jiný rám.", credit: "Foto: smyšlený zdroj", images: [{ slot: "image-1", asset: 0, crop: { focal: { x: 0.2, y: 0.5 }, fit: "cover" } }] },
  { type: "sources", position: at(6), sources: ["Smyšlený blog: Smyšlený model (20. 10. 2026)", "Obrázky: smyšlený zdroj"], images: [0, 1, 2, 3].map((asset) => ({ slot: `image-${asset + 1}`, asset })) }
];

/** The templates the deck resolves to, in order. */
export const ACCEPTANCE_TEMPLATES = [
  "dneskai-cover-photo", "dneskai-figure", "dneskai-figure", "dneskai-split-pair", "dneskai-statement", "dneskai-figure", "dneskai-sources-4"
] as const;

/** Four assets, larger than their frames, so every crop really cuts and resamples. */
export async function acceptanceAssets(): Promise<Buffer[]> {
  return Promise.all([
    syntheticPhoto(1_600, 1_200, 11),
    syntheticPhoto(1_400, 800, 12),
    syntheticPhoto(1_200, 1_200, 13),
    syntheticPhoto(900, 700, 14)
  ]);
}

/** The deck with each image's bytes in place. */
export function materializeDeck(assets: readonly Buffer[]): DneskaiSlideInput[] {
  return ACCEPTANCE_DECK.map(({ images, ...slide }) => ({
    ...slide,
    ...(images ? { images: images.map(({ asset, ...image }) => ({ ...image, bytes: assets[asset]! })) } : {})
  }));
}

export async function acceptanceDeck(): Promise<DneskaiSlideInput[]> {
  return materializeDeck(await acceptanceAssets());
}
