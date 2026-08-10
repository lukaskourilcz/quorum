import {
  BOTTOM,
  LEFT,
  MEASURE,
  TOP,
  bodyTop,
  progress,
  rule,
  shape,
  text,
  type FamilySpec
} from "./family-kit.js";
import type { CarouselLayerInput } from "./schema.js";
import type { DeckFamily } from "./designs.js";

/**
 * Print grammar, and the hand over the top of it.
 *
 * The 2026 surveys read editorial furniture — mastheads, datelines, rules, folios, marginal marks
 * — as the signal an AI-era audience takes for authorship: somebody laid this out. These families
 * borrow that grammar rather than the look of any one publication.
 *
 * The furniture is real furniture and never invented text. A dateline is the venture's own
 * wordmark set small in mono; a folio is the progress mark; a hanging index is a bar in the
 * margin. Every string on a slide comes from the article, because a template that could print its
 * own numerals is a template that can print a statistic nobody wrote.
 */

/** The running head: the venture's mark, set small and in mono, where a page prints its title. */
const dateline = (y: number, colorToken = "muted"): CarouselLayerInput => ({
  type: "logo",
  x: LEFT,
  y,
  width: 0.32,
  height: 0.025,
  colorToken,
  fontToken: "mono"
});

export const PRINT_FAMILIES: Readonly<Record<Extract<DeckFamily, "broadsheet">, FamilySpec>> = {
  /*
   * The inside page, not the front one.
   *
   * `masthead` is a front page and needs a photograph to be one; `dossier` is a bare record with
   * two hairlines. Broadsheet is the page between them — all furniture and no picture: a rule pair
   * under a running head, a measured column that never reaches the right margin, and an index bar
   * hanging in the gutter beside it. What walks with the beat is the column's own measure, which
   * is how a printed page varies from spread to spread without changing its grid.
   */
  broadsheet: {
    description: "An inside page: running head, rule pair, a measured column and an index hanging in its margin.",
    compose: ({ slot, role, beat, phase }) => {
      if (role === "cover") {
        return [
          rule(LEFT, TOP, MEASURE, { thickness: 3, colorToken: "muted" }),
          rule(LEFT, TOP + 0.014, MEASURE, { thickness: 12 }),
          dateline(TOP + 0.032),
          text(slot, LEFT, TOP + 0.085, MEASURE, 0.4, {
            fontWeight: 800,
            maxFontSize: 96,
            minFontSize: 32,
            maxChars: 150,
            maxLines: 5
          }),
          rule(LEFT, BOTTOM - 0.055, MEASURE, { thickness: 2, colorToken: "muted" }),
          progress(phase)
        ];
      }
      // The column narrows and widens on the beat; the index bar in the gutter grows with it.
      const column = 0.6 + beat.step * 0.045;
      return [
        rule(LEFT, TOP, MEASURE, { thickness: 2, colorToken: "muted" }),
        dateline(TOP + 0.016, role === "outro" ? "accent" : "muted"),
        shape(LEFT, TOP + 0.055, 0.01, role === "outro" ? 0.1 : 0.05 + beat.step * 0.022, { fillToken: "accent" }),
        text(slot, LEFT + 0.042, bodyTop(0.15 + beat.step * 0.05), role === "outro" ? MEASURE - 0.042 : column, 0.4, {
          fontToken: "body",
          fontWeight: 400,
          maxFontSize: role === "outro" ? 56 : 48,
          minFontSize: 24,
          maxChars: 230,
          maxLines: 9
        }),
        rule(LEFT, BOTTOM - 0.055, MEASURE, { thickness: role === "outro" ? 8 : 2, colorToken: role === "outro" ? "accent" : "muted" }),
        progress(phase)
      ];
    }
  }
};
