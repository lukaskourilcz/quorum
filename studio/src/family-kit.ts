import type { CarouselLayerInput } from "./schema.js";
import { ARTICLE_HERO_SLOT } from "./library.js";

/**
 * The primitives every template family is built from.
 *
 * Extracted when the library grew past ten families and `families.ts` past the 400-line cap
 * (`docs/ENGINEERING.md` rule 8). The composers moved into sibling modules; the safe band, the
 * rhythm and the layer constructors could not move with any one of them, because they are the
 * shared vocabulary that makes two families comparable. A leaf module on purpose — it imports the
 * schema and the hero slot name and nothing else, so no family module can import another through
 * it.
 */

/** The union of all four safe areas: the story's, which is the widest. */
export const TOP = 0.145;
export const BOTTOM = 0.835;
export const LEFT = 0.075;
export const RIGHT = 0.925;
export const MEASURE = RIGHT - LEFT;

/** The height a composition actually has to work in, once every canvas has taken its margin. */
export const SAFE_HEIGHT = BOTTOM - TOP;

/**
 * Where a body passage's frame starts, as a fraction of the safe height.
 *
 * `docs/design-lab/TOKENS.md` calls this the most load-bearing rule in the set, and the reason is
 * mechanical rather than aesthetic: the engine top-anchors text and has no vertical centring, so a
 * 24-character passage in a frame sized for 240 leaves the bottom two-thirds empty. Starting the
 * frame between 0.14 and 0.26 in puts a short passage near the optical centre and still lets a
 * long one grow down into space that exists.
 */
export function bodyTop(fraction: number): number {
  return TOP + SAFE_HEIGHT * Math.min(0.26, Math.max(0.14, fraction));
}

export type Role = "cover" | "body" | "outro";

export interface Beat {
  /** The ground this beat paints. Adjacent beats differ, which is what makes a rhythm. */
  ground: "background" | "surface" | "surface-strong";
  /** Which side of the frame the beat leans to, for families that alternate sides. */
  side: "left" | "right";
  /** 0, 1 or 2: the step within the family's own three-step pattern. */
  step: number;
}

export const RHYTHM: readonly Beat[] = [
  { ground: "background", side: "left", step: 0 },
  { ground: "surface", side: "right", step: 1 },
  { ground: "surface-strong", side: "left", step: 2 },
  { ground: "surface", side: "right", step: 1 }
];

export interface Context {
  slot: string;
  index: number;
  slideCount: number;
  role: Role;
  beat: Beat;
  /**
   * The token this slide's ground actually paints, which is not always the beat's.
   *
   * The cover is forced to `background` and the closing slide to `surface`, so a composer that
   * reads `beat.ground` to decide what colour a panel has to be in order to be *seen* gets the
   * wrong answer on two slides in five. Resolved once, where the slide is built.
   */
  ground: "background" | "surface" | "surface-strong";
  /** 0 on the cover, 1 on the closing slide, walking evenly between. */
  phase: number;
}

export type Composer = (context: Context) => CarouselLayerInput[];

export interface FamilySpec {
  description: string;
  compose: Composer;
}

export const text = (
  slot: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: Partial<Extract<CarouselLayerInput, { type: "text" }>> = {}
): CarouselLayerInput => ({
  type: "text",
  slot,
  x,
  y,
  width,
  height,
  colorToken: "foreground",
  fontToken: "headline",
  fontWeight: 700,
  minFontSize: 28,
  maxFontSize: 60,
  maxChars: 240,
  maxLines: 8,
  align: "start",
  uppercase: false,
  ...options
});

export const rule = (
  x: number,
  y: number,
  width: number,
  options: Partial<Extract<CarouselLayerInput, { type: "rule" }>> = {}
): CarouselLayerInput => ({
  type: "rule",
  x,
  y,
  width,
  height: 0.005,
  colorToken: "accent",
  thickness: 8,
  ...options
});

export const shape = (
  x: number,
  y: number,
  width: number,
  height: number,
  options: Partial<Extract<CarouselLayerInput, { type: "shape" }>> = {}
): CarouselLayerInput => ({
  type: "shape",
  x,
  y,
  width,
  height,
  fillToken: "surface",
  strokeWidth: 0,
  radius: 0,
  ...options
});

export const hero = (
  x: number,
  y: number,
  width: number,
  height: number,
  options: Partial<Extract<CarouselLayerInput, { type: "image" }>> = {}
): CarouselLayerInput => ({
  type: "image",
  slot: ARTICLE_HERO_SLOT,
  optional: true,
  fit: "cover",
  scrim: "bottom",
  x,
  y,
  width,
  height,
  ...options
});

/**
 * The wordmark, always in the same place: bottom-left, inside every canvas's safe area.
 *
 * A constant `y = 0.07` put it squarely under the story's top chrome, which is the one line that
 * kept every deck template out of 9:16. Bottom-left inside the union envelope clears the profile
 * row at the top and the reply bar at the bottom, at every canvas, without a second composition.
 *
 * `fontToken` is a family's one lever over it. A poster and a terminal print the same words, and
 * the difference between them is whether the mark is set in the headline face or the mono one.
 */
export const wordmark = (colorToken = "muted", fontToken: "headline" | "body" | "mono" = "headline"): CarouselLayerInput => ({
  type: "logo",
  x: LEFT,
  y: BOTTOM - 0.03,
  width: 0.3,
  height: 0.028,
  colorToken,
  fontToken
});

/**
 * A progress mark that grows with the deck, so a reader knows where they are.
 *
 * The fill is a parameter because a family may lay the mark over its own accent field, where
 * `muted` measures 1.04:1 and disappears. Shapes are not read by the contrast check, so a mark
 * that vanishes is not a failing template — it is a family that quietly lost its progress mark.
 */
export const progress = (phase: number, fillToken = "muted"): CarouselLayerInput =>
  shape(RIGHT - 0.16, BOTTOM - 0.018, 0.02 + phase * 0.14, 0.008, { fillToken, radius: 0.5 });

/**
 * The two renderings every family ships.
 *
 * B is not a relabelling: it swaps the accent for the secondary *and* inverts the ground, so the
 * A/B pair the queue builds is genuinely two designs. Both are checked — the contrast check walks
 * every variant, not only the default — so an inverted beat cannot ship illegible.
 */
export function variantsFor(beat: Beat): Array<{ id: string; backgroundToken?: string; accentToken?: string }> {
  const inverted = beat.ground === "background" ? "surface-strong" : "background";
  return [{ id: "A" }, { id: "B", accentToken: "secondary", backgroundToken: inverted }];
}
