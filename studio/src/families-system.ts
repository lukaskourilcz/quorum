import {
  BOTTOM,
  LEFT,
  MEASURE,
  RIGHT,
  TOP,
  bodyTop,
  progress,
  rule,
  shape,
  text,
  wordmark,
  type FamilySpec
} from "./family-kit.js";
import type { CarouselLayerInput } from "./schema.js";
import type { DeckFamily } from "./designs.js";

/**
 * A bracket, drawn as three rectangles.
 *
 * There is no rotation and no path primitive in `carousel-template/1`, and neither should be added
 * for an ornament. A stem and two arms is what a bracket is, and at 46 px tall it reads as one at
 * thumbnail size, which is the size a kicker is read at or not at all.
 */
const bracket = (x: number, y: number, facing: "left" | "right"): CarouselLayerInput[] => {
  const stem = facing === "left" ? x : x + 0.017;
  return [
    shape(stem, y, 0.005, 0.034, { fillToken: "accent" }),
    shape(x, y, 0.022, 0.005, { fillToken: "accent" }),
    shape(x, y + 0.029, 0.022, 0.005, { fillToken: "accent" })
  ];
};

/**
 * Structure as the message.
 *
 * Where the poster families let scale carry a slide and the print families borrow a page's
 * furniture, these build the slide out of blocks, rows and continuity — the composition is a
 * system the reader can see working, and the type sits inside it.
 *
 * All of them are type-only. That is not a shortfall: most editions arrive without a photograph,
 * and a family that cannot compose without one narrows the pool exactly when the pool is needed.
 */

export const SYSTEM_FAMILIES: Readonly<Record<Extract<DeckFamily, "concrete" | "terminal">, FamilySpec>> = {
  /*
   * Neo-brutalism with the volume down.
   *
   * A panel with a hard stroke and zero radius, and a token-coloured duplicate of it sitting a few
   * thousandths behind — the offset-block shadow the style is built on, drawn as an actual second
   * rectangle because there is no shadow primitive and there should not be one. The side the block
   * falls to flips with the beat, so the friction moves as the reader swipes rather than sitting
   * in one corner for ten slides.
   *
   * The stroke is doing structural work, not decorative. Three of the five palettes put their
   * three greys within 3% of each other's luminance, so a panel that relied on its fill to be seen
   * would be invisible on two ventures and obvious on three; an edge is legible on all five.
   *
   * Distinct from `pull`, whose panel is soft-cornered, hugs its text and centres it, and from
   * `memo`, whose sheet is a hairline around reading-weight body type.
   */
  concrete: {
    description: "A hard-edged panel with its own block sitting behind it, and the block changes corners on the beat.",
    compose: ({ slot, role, beat, phase }) => {
      const drop = beat.side === "left" ? 0.012 : -0.012;
      const panelTop = role === "cover" ? TOP + 0.05 : bodyTop(0.095 + beat.step * 0.045) - 0.035;
      const panelHeight = BOTTOM - 0.085 - panelTop;
      // The closing slide inverts the lockup: the block the deck has been casting becomes the
      // panel, and the panel becomes its shadow.
      const closing = role === "outro";
      return [
        // Both rectangles hug the text. The declared frame stays the maximum — it is what the
        // contrast check measured the words against — and the drawn card is the fitted passage
        // plus its padding, so a short slide is a card and not a panel two-thirds empty.
        shape(LEFT + drop, panelTop + 0.012, MEASURE, panelHeight, {
          fillToken: closing ? "surface" : "accent",
          padText: slot,
          padding: 0.045
        }),
        shape(LEFT, panelTop, MEASURE, panelHeight, {
          fillToken: closing ? "accent" : "surface",
          strokeToken: closing ? "background" : "foreground",
          strokeWidth: 6,
          padText: slot,
          padding: 0.045
        }),
        text(slot, LEFT + 0.03, panelTop + 0.035, MEASURE - 0.06, panelHeight - 0.07, {
          colorToken: closing ? "background" : "foreground",
          fontWeight: 900,
          maxFontSize: role === "cover" ? 84 : 60,
          minFontSize: role === "cover" ? 30 : 26,
          maxChars: role === "cover" ? 140 : 230,
          maxLines: role === "cover" ? 5 : 8,
          uppercase: role === "cover"
        }),
        wordmark("muted", "mono"),
        progress(phase)
      ];
    }
  },

  /*
   * Rows, brackets and a cursor.
   *
   * Mono everywhere — the one face all five ventures share — so the family reads as the same
   * instrument in every palette and the colour carries the identity. The header is a bracketed
   * field spanning the measure with the venture's mark set inside it, which is what a bracket
   * means in this register: a field with something in it. A block cursor opens every passage and
   * walks down the frame with the beat, and the footer rule is dashed and grows as the deck runs.
   *
   * Distinct from `dossier`, which is body-font quiet under two hairlines, and from `memo`, which
   * is prose on a sheet. Terminal has no prose posture at all: it has rows.
   */
  terminal: {
    description: "Mono from end to end: a bracketed header field, a block cursor opening each passage, dashed rules.",
    compose: ({ slot, role, beat, phase }) => {
      const top = role === "cover" ? TOP + 0.09 : bodyTop(0.17 + beat.step * 0.045);
      return [
        ...bracket(LEFT, TOP, "left"),
        ...bracket(RIGHT - 0.022, TOP, "right"),
        {
          type: "logo",
          x: LEFT + 0.034,
          y: TOP + 0.006,
          width: 0.3,
          height: 0.022,
          colorToken: role === "outro" ? "accent" : "muted",
          fontToken: "mono"
        },
        rule(LEFT, TOP + 0.052, MEASURE, { thickness: 3, dash: true, colorToken: "muted" }),
        shape(LEFT, top + 0.006, 0.017, 0.026, { fillToken: "accent" }),
        text(slot, LEFT + 0.028, top, RIGHT - LEFT - 0.028, BOTTOM - 0.1 - top, {
          fontToken: "mono",
          fontWeight: role === "cover" ? 700 : 400,
          maxFontSize: role === "cover" ? 64 : 46,
          minFontSize: 24,
          maxChars: role === "cover" ? 140 : 230,
          maxLines: role === "cover" ? 6 : 9
        }),
        rule(LEFT, BOTTOM - 0.075, role === "outro" ? MEASURE : 0.2 + beat.step * 0.16, {
          thickness: 3,
          dash: true,
          colorToken: role === "outro" ? "accent" : "muted"
        }),
        progress(phase)
      ];
    }
  }
};
