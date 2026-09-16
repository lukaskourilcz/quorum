import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  CAROUSEL_BRANDS,
  articleSlideSlot,
  familyDeckTemplate,
  renderCarouselSlidePng,
  type CarouselFormat,
  type CarouselPayload,
  type DeckFamily
} from "../src/index.js";

/**
 * One fixed render per family, shared by the golden test and the script that regenerates the
 * goldens, so the two can never disagree about what a golden is.
 *
 * The payload is the one `families.test.ts` renders every family with: seven slides of the same
 * Czech sentence, on the MMA Files brand, with no photograph. The slide is the first body slide,
 * which carries the family's rhythm — its spine, seam, ring or numerals — and the reading type;
 * a cover is mostly the same oversized promise in every family.
 */
export const GOLDEN_FAMILIES = ["apex", "rail", "vista", "fault", "halo", "folio", "press"] as const satisfies readonly DeckFamily[];
export const GOLDEN_FORMAT: CarouselFormat = "instagram-portrait";
export const GOLDEN_SLIDE_COUNT = 7;
export const GOLDEN_SLIDE_INDEX = 1;

/** A channel difference above this is a changed pixel; below it is rasteriser noise. */
export const GOLDEN_CHANNEL_TOLERANCE = 16;
/** The share of changed pixels a family may carry before the composition counts as drifted. */
export const GOLDEN_MAX_CHANGED_FRACTION = 0.005;

const here = path.dirname(fileURLToPath(import.meta.url));
export const GOLDEN_DIRECTORY = path.join(here, "fixtures", "golden");

export function goldenPath(family: (typeof GOLDEN_FAMILIES)[number]): string {
  return path.join(GOLDEN_DIRECTORY, `${family}.png`);
}

export function goldenPayload(): CarouselPayload {
  return {
    locale: "cs",
    strings: Object.fromEntries(Array.from({ length: GOLDEN_SLIDE_COUNT }, (_, index) => [
      articleSlideSlot(index),
      `Věta ${index + 1}: Gamrot vs Salkilld a co ten výsledek znamená pro lehkou váhu.`
    ]))
  };
}

export async function renderGolden(family: (typeof GOLDEN_FAMILIES)[number]): Promise<Buffer> {
  const rendered = await renderCarouselSlidePng({
    template: familyDeckTemplate(family, GOLDEN_SLIDE_COUNT),
    payload: goldenPayload(),
    brand: CAROUSEL_BRANDS["mma-files"],
    format: GOLDEN_FORMAT,
    index: GOLDEN_SLIDE_INDEX
  });
  if (!rendered) throw new Error(`${family} did not render slide ${GOLDEN_SLIDE_INDEX}`);
  return rendered.png;
}

export interface GoldenComparison {
  width: number;
  height: number;
  /** Pixels where any channel differs by more than the tolerance. */
  changed: number;
  total: number;
  fraction: number;
  /** Set when the two images are not even the same size, which is a drift of its own. */
  sizeMismatch: string | null;
}

export async function compareGolden(fresh: Buffer, golden: Buffer): Promise<GoldenComparison> {
  const [left, right] = await Promise.all([
    sharp(fresh).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(golden).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);
  const total = left.info.width * left.info.height;
  if (left.info.width !== right.info.width || left.info.height !== right.info.height || left.info.channels !== right.info.channels) {
    return {
      width: left.info.width,
      height: left.info.height,
      changed: total,
      total,
      fraction: 1,
      sizeMismatch: `fresh ${left.info.width}×${left.info.height}×${left.info.channels}, golden ${right.info.width}×${right.info.height}×${right.info.channels}`
    };
  }
  const channels = left.info.channels;
  let changed = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const offset = pixel * channels;
    for (let channel = 0; channel < channels; channel += 1) {
      if (Math.abs(left.data[offset + channel]! - right.data[offset + channel]!) > GOLDEN_CHANNEL_TOLERANCE) {
        changed += 1;
        break;
      }
    }
  }
  return { width: left.info.width, height: left.info.height, changed, total, fraction: changed / total, sizeMismatch: null };
}
