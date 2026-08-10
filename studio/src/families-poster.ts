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
import type { DeckFamily } from "./designs.js";

/**
 * Type as the whole image.
 *
 * The families here draw on the one finding every 2026 typography survey agreed on — that
 * typography-led minimalism is what a feed rewards, and that the hierarchy is the decoration.
 * They differ from each other in *which* typographic axis carries the composition: scale
 * (`billboard`), the grid and the void around it (`zurich`).
 *
 * A face is never named. `fontToken` resolves through the brand, so a family that expressed a
 * trend by asking for a condensed grotesque would be a family that only works for two of the five
 * ventures. What is portable is scale, weight, case, tracking and where the block sits.
 */

export const POSTER_FAMILIES: Readonly<Record<Extract<DeckFamily, "billboard" | "zurich">, FamilySpec>> = {
  /*
   * Scale is the composition, and nothing else is.
   *
   * No band, no panel, no inversion — the three moves `slab` makes. The cover is one line given
   * the whole safe band and a 200 px ceiling, set at 900 with the tracking pulled in, so a short
   * hook is set enormous and a long one steps down to fill the same block. The only other marks
   * are one heavy rule and the wordmark in mono, tucked in the corner the way a poster credits
   * its printer.
   */
  billboard: {
    description: "Poster type at the size the words allow: one block filling the band, one rule, nothing else.",
    compose: ({ slot, role, beat, phase }) => {
      if (role === "cover") {
        return [
          text(slot, LEFT, TOP + 0.015, MEASURE, 0.5, {
            fontWeight: 900,
            maxFontSize: 200,
            minFontSize: 36,
            maxChars: 120,
            maxLines: 5,
            uppercase: true,
            tracking: -0.03
          }),
          rule(LEFT, BOTTOM - 0.077, MEASURE, { thickness: 16 }),
          wordmark("muted", "mono"),
          progress(phase)
        ];
      }
      if (role === "outro") {
        return [
          rule(LEFT, TOP + 0.01, MEASURE, { thickness: 16 }),
          text(slot, LEFT, TOP + 0.075, MEASURE, 0.46, {
            fontWeight: 900,
            maxFontSize: 150,
            minFontSize: 32,
            maxChars: 140,
            maxLines: 5,
            uppercase: true,
            tracking: -0.03
          }),
          wordmark("accent", "mono"),
          progress(phase)
        ];
      }
      return [
        // The rule is the poster's top edge and the only thing that moves: it lengthens with the
        // beat while the ceiling comes down, so a reader swiping sees the block breathe rather
        // than the same slab with new words.
        rule(LEFT, TOP + 0.01, 0.1 + beat.step * 0.14, { thickness: 16 }),
        text(slot, LEFT, bodyTop(0.16 + beat.step * 0.05), MEASURE, 0.44, {
          fontWeight: 900,
          maxFontSize: 132 - beat.step * 18,
          minFontSize: 30,
          maxChars: 210,
          maxLines: 6,
          tracking: -0.02
        }),
        wordmark("muted", "mono"),
        progress(phase)
      ];
    }
  },

  /*
   * The grid, and the void it leaves.
   *
   * Twelve columns across the measure, flush left, ragged right, and two of those columns kept
   * empty on the right at every beat — the emptiness is the composition, not what is left over
   * from it. The type block steps in one column at a time and the divider under it starts where
   * the type starts, so the alignment states the grid instead of a drawn one. One accent block,
   * on a column, moving against the type. That is the whole ornament.
   *
   * Distinct from `terrace`, which fills the frame with three stepping bands: here the empty
   * columns do as much work as the full ones, and the family is at its best when the passage is
   * short enough to leave them empty.
   */
  zurich: {
    description: "A twelve-column grid worked flush left, where what is left empty does as much as what is set.",
    compose: ({ slot, role, beat, phase }) => {
      const column = MEASURE / 12;
      const indent = role === "body" ? beat.step * 2 * column : 0;
      const divider = 0.7;
      const top = role === "cover" ? TOP + 0.07 : bodyTop(0.14 + beat.step * 0.06);
      return [
        // The one ornament, on a column, walking against the type block.
        shape(LEFT + (role === "body" ? 10 - beat.step : 10) * column, TOP, column, 0.05 + beat.step * 0.014, {
          fillToken: "accent"
        }),
        text(slot, LEFT + indent, top, MEASURE - indent - (role === "outro" ? 0 : column), divider - top - 0.03, {
          fontWeight: role === "cover" ? 800 : 700,
          maxFontSize: role === "cover" ? 92 : 62,
          minFontSize: role === "cover" ? 30 : 26,
          maxChars: role === "cover" ? 150 : 200,
          maxLines: role === "cover" ? 6 : 8
        }),
        rule(LEFT + indent, divider, MEASURE - indent, {
          thickness: role === "outro" ? 10 : 4,
          colorToken: role === "outro" ? "accent" : "muted"
        }),
        wordmark(),
        progress(phase)
      ];
    }
  }
};
