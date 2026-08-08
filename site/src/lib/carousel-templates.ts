import type { CSSProperties } from "react";

/**
 * The render templates the Design Lab's gallery shows.
 *
 * Eight quiet ones for ordinary editions (01–08) and five loud, large-type ones built for
 * scrolling (09–13). Each is a declaration, not markup: hero geometry, mask, the three headline
 * sizes, the three passage sizes, its own text box and — for the loud five — a three-step rhythm
 * that repeats for as many slides as the passages need, so no two adjacent slides look alike.
 *
 * Everything is drawn at 1080-design scale and multiplied down by `px()`, so a 176px gallery
 * canvas and a 320px detail preview are the same design at two sizes rather than two designs.
 * That is also what lets the gallery be the check: if a template survives a long passage at
 * 176px it survives it at 1080px, because only the multiplier changed.
 *
 * The renderer that produces the actual PNG/SVG lives in `studio/` and is validated against
 * `carousel-template/1`. This module is the design language those renders speak, and the surface
 * the owner clicks through before an agent uses one.
 */

export type CarouselFormatId = "instagram-portrait" | "threads";
export type PassageLengthIndex = 0 | 1 | 2;

/** What a slide does in its template's rhythm. Drives both the render and the strip's label. */
export type RhythmStep = "dark" | "brand" | "wash" | "flip";

export interface CarouselTemplateSpec {
  id: string;
  name: string;
  /** Where the licensed photograph sits, in plain words, for the detail panel. */
  hero: string;
  mask: string;
  /** The template's own background, used on any slide that is neither inverted nor washed. */
  gradient: string;
  /** Headline ceiling for short / medium / long passages, in 1080-design pixels. */
  headline: readonly [number, number, number];
  /** Passage size for short / medium / long, in 1080-design pixels. */
  body: readonly [number, number, number];
  align: "flex-start" | "center" | "flex-end";
  /** Uniform padding step used when the template declares no text box, in 1080-design units. */
  pad: number;
  /** The template's own text box as top/right/bottom/left percentages of the canvas width. */
  textBox?: readonly [string, string, string, string];
  /** The three-step rhythm the loud templates repeat. Absent means every slide is dark. */
  rhythm?: readonly [RhythmStep, RhythmStep, RhythmStep];
  /** A brand glow on the headline, on the dark slides only. */
  glow?: boolean;
  plan: string;
  note: string;
}

export const CAROUSEL_TEMPLATES: readonly CarouselTemplateSpec[] = [
  {
    id: "broadsheet",
    name: "Broadsheet",
    hero: "full-bleed, bottom 38% free",
    mask: "none, bottom scrim",
    gradient: "linear-gradient(180deg, rgba(9,9,11,0) 38%, rgba(9,9,11,.86) 72%, #09090b)",
    headline: [54, 44, 36],
    body: [26, 25, 23],
    align: "flex-end",
    pad: 7,
    plan: "1 hero + 2–4 passages + 1 source",
    note: "The default. The headline sits in the scrim, so a long one eats into the image instead of the text column."
  },
  {
    id: "column",
    name: "Column",
    hero: "left half, full height",
    mask: "none, hard 46% split",
    gradient: "linear-gradient(90deg, #0e0e11 0 46%, #121216 46%)",
    headline: [44, 38, 32],
    body: [25, 24, 22],
    align: "center",
    pad: 6,
    textBox: ["9%", "9%", "9%", "52%"],
    plan: "1 split hero + 3–5 passages",
    note: "For passages with a number in them: the right column keeps a stable measure at any length."
  },
  {
    id: "ticket",
    name: "Ticket",
    hero: "top strip 30%",
    mask: "dashed brand tear line",
    gradient: "linear-gradient(180deg, #121216, #0b0b0d)",
    headline: [46, 40, 34],
    body: [25, 23, 22],
    align: "flex-start",
    pad: 7,
    textBox: ["42%", "9%", "9%", "9%"],
    plan: "1 stub + 2–3 passages + 1 result",
    note: "Reads as a record, not a poster. Good for decisions and results."
  },
  {
    id: "spotlight",
    name: "Spotlight",
    hero: "centred circle 58%",
    mask: "circle + 4px brand ring",
    gradient: "radial-gradient(90% 60% at 50% 24%, rgba(255,255,255,.1), #0b0b0d 62%)",
    headline: [42, 36, 30],
    body: [24, 23, 21],
    align: "flex-end",
    pad: 8,
    textBox: ["70%", "9%", "9%", "9%"],
    plan: "1 portrait + 2–4 passages",
    note: "Portraits and single-subject profiles. The circle keeps a licensed photo unambiguous."
  },
  {
    id: "diagonal",
    name: "Diagonal",
    hero: "top, cut on the diagonal",
    mask: "polygon(0 0, 100% 0, 100% 74%, 0 100%)",
    gradient: "linear-gradient(160deg, rgba(9,9,11,.1), #0b0b0d 58%)",
    headline: [50, 42, 34],
    body: [26, 24, 22],
    align: "flex-end",
    pad: 7,
    plan: "1 cut hero + 2–4 passages",
    note: "The cut gives a long headline somewhere to go without shrinking the type twice."
  },
  {
    id: "frame",
    name: "Frame",
    hero: "inset 7% with a 4px brand rule",
    mask: "inset frame",
    gradient: "linear-gradient(180deg, #101013, #0b0b0d)",
    headline: [40, 34, 30],
    body: [24, 23, 21],
    align: "flex-end",
    pad: 8,
    textBox: ["66%", "12%", "12%", "12%"],
    plan: "1 framed hero + 3–5 passages",
    note: "The quietest one. Use it when the passage is the story and the image is only context."
  },
  {
    id: "stack",
    name: "Stack",
    hero: "none — three offset brand bands",
    mask: "offset bands",
    gradient: "linear-gradient(180deg, #0e0e11, #09090b)",
    headline: [56, 46, 38],
    body: [26, 25, 23],
    align: "flex-start",
    pad: 7,
    textBox: ["12%", "9%", "58%", "9%"],
    plan: "3–6 passages, no image needed",
    note: "For articles that arrive without a licensed photo. Nothing is invented to fill the frame."
  },
  {
    id: "duotone",
    name: "Duotone",
    hero: "full-bleed, brand multiply at 34%",
    mask: "none",
    gradient: "linear-gradient(180deg, rgba(9,9,11,.25), rgba(9,9,11,.9))",
    headline: [52, 44, 36],
    body: [26, 24, 22],
    align: "flex-end",
    pad: 7,
    plan: "1 duotone hero + 2–4 passages",
    note: "The loudest of the quiet eight. One per week at most, or the feed stops reading as a record."
  },
  {
    id: "statement",
    name: "Statement",
    hero: "none — type only",
    mask: "none",
    gradient: "linear-gradient(180deg, #0e0e11, #09090b)",
    headline: [96, 78, 62],
    body: [28, 26, 24],
    align: "center",
    pad: 7,
    rhythm: ["dark", "brand", "dark"],
    plan: "3–6 statement slides",
    note: "One sentence per slide at poster size. Slide two lands on the brand colour with dark type, so scrolling flips light and dark."
  },
  {
    id: "quote",
    name: "Quote",
    hero: "small circle, slide 1 only",
    mask: "circle",
    gradient: "linear-gradient(160deg, #121216, #09090b 70%)",
    headline: [84, 68, 54],
    body: [26, 25, 23],
    align: "flex-end",
    pad: 7,
    textBox: ["36%", "9%", "9%", "9%"],
    rhythm: ["dark", "wash", "brand"],
    plan: "1 quote + 2–4 passages",
    note: "For something a named person said. The wash slide sits between dark and inverted so the turn is gradual."
  },
  {
    id: "countdown",
    name: "Countdown",
    hero: "none — the number is the image",
    mask: "stepped brand wash",
    gradient: "linear-gradient(180deg, #101013, #09090b)",
    headline: [110, 92, 74],
    body: [26, 24, 22],
    align: "center",
    pad: 6,
    rhythm: ["wash", "dark", "brand"],
    plan: "1 figure + 2–4 passages",
    note: "Numbers first: a record, a percentage, a card position. The wash opens the set, so the figure lands on colour."
  },
  {
    id: "flipbook",
    name: "Flipbook",
    hero: "top, then bottom, then none",
    mask: "flip",
    gradient: "linear-gradient(180deg, rgba(9,9,11,.15), #0b0b0d 72%)",
    headline: [72, 60, 50],
    body: [26, 25, 23],
    align: "flex-end",
    pad: 7,
    rhythm: ["flip", "flip", "brand"],
    plan: "2 mirrored heroes + 2–3 passages",
    note: "The image jumps top to bottom between slides, so a swipe has somewhere to travel. The last slide inverts and carries the source."
  },
  {
    id: "neon",
    name: "Neon",
    hero: "full-bleed, slide 1 only",
    mask: "none, brand glow on the headline",
    gradient: "radial-gradient(120% 70% at 50% 110%, rgba(255,255,255,.08), #09090b 64%)",
    headline: [88, 72, 58],
    body: [26, 24, 22],
    align: "flex-end",
    pad: 7,
    rhythm: ["dark", "brand", "dark"],
    glow: true,
    plan: "1 hero + 3–5 passages",
    note: "Brand glow on near-black, alternating with a solid brand slide. Reserved for results and finals — it cannot be read as neutral."
  }
];

export const CAROUSEL_FORMATS: ReadonlyArray<{ id: CarouselFormatId; label: string; ratio: number }> = [
  { id: "instagram-portrait", label: "Instagram 4:5", ratio: 1.25 },
  { id: "threads", label: "Threads 1:1", ratio: 1 }
];

export const PASSAGE_LENGTHS: ReadonlyArray<{ label: string; note: string }> = [
  { label: "Short", note: "≤ 90 characters" },
  { label: "Medium", note: "90–190 characters" },
  { label: "Long", note: "190+ characters" }
];

/**
 * Step the declared size down by character count.
 *
 * The table's scale is a ceiling, not a fixed size, and this is the only thing that decides the
 * actual one — there is no manual slider, because the same passage has to render the same way
 * every time it is rendered. The quiet eight already declare small enough ceilings that they need
 * no stepping; the loud five would otherwise put a 200-character passage off the canvas.
 */
export function fitHeadline(base: number, characters: number): number {
  if (base <= 70) return base;
  if (characters <= 60) return base;
  if (characters <= 120) return base * 0.7;
  if (characters <= 200) return base * 0.5;
  return base * 0.38;
}

export interface SlideStyle {
  canvas: CSSProperties;
  hero: CSSProperties;
  tint: CSSProperties;
  scrim: CSSProperties;
  kicker: CSSProperties;
  title: CSSProperties;
  body: CSSProperties;
  bar: CSSProperties;
  /** What this slide is doing, for the strip's label under the preview. */
  step: string;
}

export interface SlideStyleInput {
  template: CarouselTemplateSpec;
  /** Rendered canvas width in CSS pixels. Everything else is derived from it. */
  width: number;
  format: CarouselFormatId;
  length: PassageLengthIndex;
  brand: string;
  slide: number;
  /** Character count of this slide's headline, which picks the type size. */
  characters: number;
}

/**
 * One slide, fully styled.
 *
 * A direct port of the prototype's `tplStyle`, kept as one function on purpose: the hero
 * geometry, the text box and the invert all read the same `showHero`/`step` pair, and splitting
 * them apart is how the text box and the hero drift out of agreement. That drift is exactly the
 * bug the text-box table exists to prevent — type landing on the photograph.
 */
export function slideStyle(input: SlideStyleInput): SlideStyle {
  const { template, width, format, length, brand, slide, characters } = input;
  const px = (value: number) => `${((value * width) / 1080).toFixed(2)}px`;
  const rhythm = template.rhythm ?? (["dark", "dark", "dark"] as const);
  const step = rhythm[slide % rhythm.length]!;
  const invert = step === "brand";
  const wash = step === "wash";
  const flip = step === "flip";
  // Slide 1 always carries the hero; Flipbook's slide 2 carries the mirrored one and nothing else does.
  const showHero = slide === 0 || (flip && slide === 1);
  const foreground = invert ? "#09090b" : "#f4f4f5";
  const bodyForeground = invert ? "rgba(9, 9, 11, .74)" : "#d4d4d8";
  const kickerForeground = invert ? "rgba(9, 9, 11, .6)" : brand;

  const stripe = `repeating-linear-gradient(135deg, #26262b, #26262b ${px(10)}, #17171a ${px(10)}, #17171a ${px(20)})`;
  let hero: CSSProperties = { position: "absolute", background: stripe, pointerEvents: "none" };
  if (template.id === "broadsheet") hero = { ...hero, inset: "0 0 38% 0" };
  else if (template.id === "column") hero = { ...hero, inset: "0 54% 0 0" };
  else if (template.id === "ticket") hero = { ...hero, inset: "0 0 70% 0", borderBottom: `${px(3)} dashed ${brand}` };
  else if (template.id === "spotlight") hero = { ...hero, left: "21%", top: "6%", width: "58%", aspectRatio: "1 / 1", borderRadius: "50%", border: `${px(4)} solid ${brand}` };
  else if (template.id === "diagonal") hero = { ...hero, inset: "0 0 30% 0", clipPath: "polygon(0 0, 100% 0, 100% 74%, 0 100%)" };
  else if (template.id === "frame") hero = { ...hero, inset: "7% 7% 42% 7%", border: `${px(4)} solid ${brand}` };
  else if (template.id === "stack") {
    hero = {
      ...hero,
      inset: "auto 8% 24% 8%",
      height: "28%",
      background: brand,
      opacity: 0.3,
      borderRadius: px(10),
      boxShadow: `${px(16)} ${px(-18)} 0 0 ${brand}44, ${px(32)} ${px(-36)} 0 0 ${brand}26`
    };
  } else if (template.id === "duotone") hero = { ...hero, inset: 0, filter: "grayscale(1)" };
  else if (template.id === "quote") hero = { ...hero, left: "7%", top: "7%", width: "26%", aspectRatio: "1 / 1", borderRadius: "50%", border: `${px(4)} solid ${brand}` };
  else if (template.id === "flipbook") hero = { ...hero, ...(slide === 1 ? { inset: "56% 0 0 0" } : { inset: "0 0 44% 0" }) };
  else if (template.id === "neon") hero = { ...hero, inset: "0 0 46% 0", opacity: 0.7 };
  else if (template.id === "statement" || template.id === "countdown") hero = { display: "none" };
  // Stack's bands are the design rather than a photograph, so they stay on every slide.
  if (!showHero && template.id !== "stack") hero = { display: "none" };

  // The text box follows the hero: on a passage slide the frame is free, so the box resets to a
  // uniform inset. That reset is what makes a passage slide read differently from the hero slide.
  const uniform = template.align === "center" ? "12%" : "9%";
  let box: readonly string[] = (showHero || template.id === "stack") && template.textBox
    ? template.textBox
    : [uniform, uniform, uniform, uniform];
  let justify: CSSProperties["justifyContent"] = template.align;
  if (flip && slide === 1) {
    box = ["9%", "9%", "52%", "9%"];
    justify = "flex-start";
  }

  const centred = template.align === "center" || template.id === "spotlight" || template.id === "ticket";

  return {
    canvas: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      justifyContent: justify,
      gap: px(14),
      overflow: "hidden",
      flexShrink: 0,
      width: `${width}px`,
      height: `${width * (CAROUSEL_FORMATS.find((entry) => entry.id === format)?.ratio ?? 1.25)}px`,
      borderRadius: px(18),
      background: invert ? brand : wash ? `linear-gradient(180deg, ${brand}3d, #0b0b0d 76%)` : template.gradient,
      backgroundColor: invert ? brand : "#0b0b0d",
      padding: box.join(" "),
      boxSizing: "border-box"
    },
    hero,
    tint: template.id === "duotone" && showHero
      ? { position: "absolute", inset: 0, background: brand, opacity: 0.34, mixBlendMode: "multiply", pointerEvents: "none" }
      : { display: "none" },
    scrim: showHero && !invert
      ? { position: "absolute", inset: 0, background: template.gradient, pointerEvents: "none" }
      : { display: "none" },
    step: invert ? "inverted" : wash ? "brand wash" : flip ? (slide === 1 ? "mirrored" : "hero") : slide === 0 ? "hero" : "passage",
    kicker: {
      position: "relative",
      fontFamily: "var(--font-ibm-plex-mono), monospace",
      fontSize: px(20),
      letterSpacing: ".16em",
      textTransform: "uppercase",
      color: kickerForeground
    },
    title: {
      position: "relative",
      margin: 0,
      // Slides after the first carry a passage rather than the headline, so they drop to 0.78×.
      fontSize: px(fitHeadline(template.headline[length], characters) * (slide === 0 ? 1 : 0.78)),
      fontWeight: 600,
      lineHeight: 1.06,
      letterSpacing: "-.03em",
      color: foreground,
      textShadow: template.glow && !invert ? `0 0 ${px(46)} ${brand}80` : "none",
      textAlign: centred ? "center" : "left"
    },
    body: {
      position: "relative",
      margin: 0,
      fontSize: px(template.body[length]),
      lineHeight: 1.42,
      color: bodyForeground,
      textAlign: centred ? "center" : "left"
    },
    bar: {
      position: "relative",
      height: px(8),
      width: px(120),
      borderRadius: px(8),
      background: invert ? "#09090b" : brand
    }
  };
}

/** The rhythm as the detail panel prints it: `dark → inverted → dark`. */
export function rhythmLabel(template: CarouselTemplateSpec): string {
  const names: Record<RhythmStep, string> = {
    dark: "dark",
    brand: "inverted",
    wash: "brand wash",
    flip: "flip"
  };
  return (template.rhythm ?? (["dark", "dark", "dark"] as const)).map((step) => names[step]).join(" → ");
}
