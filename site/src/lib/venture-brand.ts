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
  marketingshark: "#a5d8f3",
  booksofhistory: "#c4b5fd",
  "door-money": "#c4b5fd",
  "titty-tuesdays": "#fde68a",
  "carousel-studio": "#d4d4d8"
};

export function ventureBrand(id: string | null | undefined): string {
  return (id && VENTURE_BRAND[id]) || VENTURE_BRAND.global!;
}

/**
 * A brand tint, composited to an opaque colour rather than left as an alpha layer.
 *
 * The design calls for `brand` at 15% behind an active chip, and `#fde68a26` renders exactly
 * right. What it does not do is let anything measure the result: a contrast checker reading a
 * 15%-alpha pale yellow has no idea what is behind it, so it reported white-on-yellow at 1.25:1
 * for a chip that really sits on near-black at about 15:1. Blending here produces the same pixel
 * and a colour that can be checked — which matters, because the contrast gate is the only thing
 * standing between a pale venture hue and an unreadable label.
 */
export function brandTint(brand: string, surface = "#0c0c0f", ratio = 0.15): string {
  const parse = (hex: string) => {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? [...value].map((part) => part + part).join("") : value;
    return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
  };
  const [br, bg, bb] = parse(brand);
  const [sr, sg, sb] = parse(surface);
  const blend = (top: number, bottom: number) => Math.round(top * ratio + bottom * (1 - ratio));
  return `#${[blend(br!, sr!), blend(bg!, sg!), blend(bb!, sb!)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}
