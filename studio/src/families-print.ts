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
  wordmark,
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

export const PRINT_FAMILIES: Readonly<Record<Extract<DeckFamily, "broadsheet" | "marginalia">, FamilySpec>> = {
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
  },

  /*
   * A marker over clean type, and a hand in the margin.
   *
   * The mechanic already exists: a `shape` with `padText` hugs a text slot, so the highlight is
   * the fitted passage plus its padding rather than a band standing over a short line. Marked
   * beats set the passage in the ground colour on an accent swipe; the beat between them takes the
   * marker away and leaves a dashed stroke leading into the passage instead. Highlight, note,
   * highlight — a reader swiping sees somebody working through the piece.
   *
   * Every stroke is fixed per beat. "Imperfect by design" is a look, not a licence: a random
   * offset would make the same deck render differently on a replay, and byte-identical replay is
   * what the receipt beside a delivery is worth anything for.
   */
  marginalia: {
    description: "Clean type with a marker over it: a highlight that hugs the passage, and a hand working the margin.",
    compose: ({ slot, role, beat, phase }) => {
      // The cover is always marked — the swipe over the title is the hook — and the closing slide
      // never is, so the deck opens loud and lands quiet.
      const marked = role === "cover" || (role === "body" && beat.step !== 1);
      const top = role === "cover" ? TOP + 0.075 : bodyTop(0.16 + beat.step * 0.05);
      const height = BOTTOM - 0.105 - top;
      return [
        // The margin tick, walking down the gutter with the beat. Graphite rather than marker:
        // beside an accent swipe an accent tick reads as part of the block, and the point of the
        // mark is that a second hand made it.
        shape(LEFT - 0.046, top + 0.01 + beat.step * 0.05, 0.018, 0.04, { fillToken: "muted" }),
        ...(marked
          ? [shape(LEFT - 0.02, top - 0.028, MEASURE + 0.03, height + 0.056, {
              fillToken: "accent",
              padText: slot,
              padding: 0.04
            })]
          : [rule(LEFT, top - 0.03, 0.1 + beat.step * 0.06, { thickness: 7, dash: true })]),
        text(slot, LEFT, top, MEASURE, height, {
          colorToken: marked ? "background" : "foreground",
          fontWeight: role === "cover" ? 800 : 700,
          maxFontSize: role === "cover" ? 78 : 56,
          minFontSize: 26,
          maxChars: role === "cover" ? 150 : 230,
          maxLines: role === "cover" ? 5 : 8
        }),
        wordmark(role === "outro" ? "accent" : "muted"),
        progress(phase)
      ];
    }
  }
};
