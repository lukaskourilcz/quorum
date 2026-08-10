import {
  BOTTOM,
  LEFT,
  MEASURE,
  TOP,
  bodyTop,
  progress,
  shape,
  text,
  wordmark,
  type FamilySpec
} from "./family-kit.js";
import type { DeckFamily } from "./designs.js";

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

export const SYSTEM_FAMILIES: Readonly<Record<Extract<DeckFamily, "concrete">, FamilySpec>> = {
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
  }
};
