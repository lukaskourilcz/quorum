/**
 * The venture hue, as a literal colour.
 *
 * These are the same hues the public calendar spends on its project stripes (`projectDetails` in
 * `week-board.tsx`), written as hex rather than as the `color-mix()` the board uses, because both
 * the admin rail and the carousel canvases compose them into `brand + "26"` alpha suffixes and
 * `color-mix()` does not concatenate.
 *
 * Ember is the company's own colour and belongs to the global workspace alone. A venture view
 * never shows it, so switching workspaces changes exactly one colour on screen.
 */
export const VENTURE_BRAND: Record<string, string> = {
  global: "#ff5a00",
  company: "#ff5a00",
  "caught-up": "#fe45e2",
  "mma-files": "#f7a8ea",
  fightaiq: "#fecaca",
  goviral: "#bbf7d0",
  "titty-tuesdays": "#fde68a",
  "carousel-studio": "#d4d4d8"
};

export function ventureBrand(id: string | null | undefined): string {
  return (id && VENTURE_BRAND[id]) || VENTURE_BRAND.global!;
}
