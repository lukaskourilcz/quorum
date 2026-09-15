import { LEFT, MEASURE, TOP, drawnIndex, hero, pagerDots, rule, shape, text, type Composer, type FamilySpec } from "./family-kit.js";

// Original compositions informed by the Canva carousel catalog's photo-feature and
// typography categories. No template assets or third-party compositions are embedded.
const mast = () => [
  { type: "logo" as const, x: LEFT, y: TOP, width: 0.52, height: 0.026, colorToken: "foreground", fontToken: "mono" as const },
  rule(LEFT, TOP + 0.055, MEASURE, { thickness: 2, colorToken: "muted" })
];

const folio: Composer = ({ slot, index, slideCount, role, beat, ground }) => {
  const footer = pagerDots(index, slideCount, ground);
  if (role === "cover") return [
    ...mast(),
    text(slot, LEFT, 0.24, MEASURE, 0.25, {
      fontWeight: 900, minFontSize: 32, maxFontSize: 112, maxChars: 140, maxLines: 5, tracking: -0.025
    }),
    shape(LEFT, 0.535, MEASURE, 0.225, { fillToken: "surface-strong" }),
    hero(LEFT, 0.535, MEASURE, 0.225, { scrim: "none" }),
    rule(LEFT, 0.77, 0.1, { thickness: 8 }),
    ...footer
  ];
  if (role === "outro") return [
    ...mast(),
    rule(LEFT, 0.29, 0.15, { thickness: 10 }),
    text(slot, LEFT, 0.36, MEASURE, 0.34, { fontWeight: 800, minFontSize: 32, maxFontSize: 106, maxLines: 6 }),
    ...footer
  ];
  return [
    ...mast(),
    ...drawnIndex(index + 1, LEFT, 0.24, 0.06, 0.105, 0.014, "accent"),
    ...(beat.step === 1 ? [hero(0.72, 0.235, 0.205, 0.135, { treatment: "mono", scrim: "none" })] : []),
    text(slot, LEFT, 0.4, MEASURE, 0.355, { fontWeight: 700, minFontSize: 30, maxFontSize: 82, maxLines: 8 }),
    ...footer
  ];
};

const press: Composer = ({ slot, index, slideCount, role, beat, ground }) => {
  const footer = pagerDots(index, slideCount, ground);
  if (role === "cover") return [
    shape(0, 0, 1, 0.47, { fillToken: "surface-strong" }),
    hero(0, 0, 1, 0.47, { treatment: "mono", scrim: "none" }),
    // The masthead has an opaque ground, so photo luminance cannot erase the brand.
    shape(LEFT - 0.015, TOP - 0.013, 0.59, 0.058, { fillToken: "background" }),
    { type: "logo", x: LEFT, y: TOP, width: 0.55, height: 0.028, colorToken: "foreground", fontToken: "mono" },
    rule(LEFT, 0.495, 0.2, { thickness: 12 }),
    text(slot, LEFT, 0.54, MEASURE, 0.25, {
      fontWeight: 900, minFontSize: 32, maxFontSize: 124, maxChars: 140, maxLines: 5, uppercase: true, tracking: -0.02
    }),
    ...footer
  ];
  if (role === "outro") return [
    ...mast(),
    shape(LEFT, 0.27, 0.014, 0.45, { fillToken: "accent" }),
    text(slot, LEFT + 0.055, 0.32, MEASURE - 0.055, 0.39, { fontWeight: 900, minFontSize: 30, maxFontSize: 106, maxLines: 7 }),
    ...footer
  ];
  return [
    ...mast(),
    ...drawnIndex(index + 1, LEFT, 0.255, 0.075, 0.13, 0.018, "accent"),
    rule(LEFT, 0.435, beat.step === 1 ? MEASURE : 0.2, { thickness: 3, colorToken: "muted" }),
    text(slot, LEFT, 0.48, MEASURE, 0.285, {
      fontWeight: beat.step === 1 ? 700 : 900, minFontSize: 28, maxFontSize: 92, maxLines: 8
    }),
    ...footer
  ];
};

export const EDITORIAL_FAMILIES: Readonly<Record<"folio" | "press", FamilySpec>> = {
  folio: { description: "Editorial folio: precise masthead, generous headline and a framed photograph; numbered reading pages.", compose: folio },
  press: { description: "Sports press: monochrome image band, compact display headline and strong numbered body pages.", compose: press }
};
