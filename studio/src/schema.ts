import { z } from "zod";

export const CarouselFormatSchema = z.enum([
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "threads"
]);

export const TemplateStatusSchema = z.enum(["draft", "live", "deprecated"]);

const UnitSchema = z.number().finite().min(0).max(1);
const TokenNameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);
const SlotNameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

const FrameSchema = z.object({
  x: UnitSchema,
  y: UnitSchema,
  width: UnitSchema.positive(),
  height: UnitSchema.positive()
}).superRefine((frame, context) => {
  if (frame.x + frame.width > 1 || frame.y + frame.height > 1) {
    context.addIssue({ code: "custom", message: "Layer frame must stay inside the canvas" });
  }
});

/*
 * Every field below this line is optional with a default that reproduces the old behaviour.
 *
 * That is the contract's "additive schema evolution" in practice, and it is not a nicety: stored
 * proposals, stored packs and the deck references inside them (`deck-spotlight-10` in
 * state/social/packs/2026-08-06.json) are parsed with safeParse and silently dropped when they
 * fail. A required field would not have surfaced an error, it would have made those documents
 * vanish. So a v1 document parses, and renders to the byte-identical SVG it always did.
 */
const TextLayerSchema = FrameSchema.extend({
  type: z.literal("text"),
  slot: SlotNameSchema,
  colorToken: TokenNameSchema,
  fontToken: z.enum(["headline", "body", "mono"]),
  fontWeight: z.number().int().min(300).max(900),
  minFontSize: z.number().int().min(16).max(160),
  maxFontSize: z.number().int().min(16).max(200),
  maxChars: z.number().int().min(1).max(1_000),
  maxLines: z.number().int().min(1).max(12),
  align: z.enum(["start", "middle", "end"]).default("start"),
  uppercase: z.boolean().default(false),
  /**
   * Letter-spacing, in em.
   *
   * Uppercase Czech mono at 20 px with no tracking is a smear at thumbnail size, and a kicker is
   * read at thumbnail size or not at all. The fitter is told about it too — tracked text is wider
   * per character, and measuring it untracked is how a label runs off the canvas.
   */
  tracking: z.number().finite().min(-0.05).max(0.4).default(0),
  /** A soft shadow in the slide's accent, for text that has to hold over busy ground. */
  glow: z.boolean().default(false)
}).superRefine((layer, context) => {
  if (layer.minFontSize > layer.maxFontSize) {
    context.addIssue({ code: "custom", message: "minFontSize cannot exceed maxFontSize" });
  }
});

const ShapeLayerSchema = FrameSchema.extend({
  type: z.literal("shape"),
  fillToken: TokenNameSchema,
  strokeToken: TokenNameSchema.optional(),
  strokeWidth: z.number().finite().min(0).max(12).default(0),
  radius: z.number().finite().min(0).max(0.5).default(0),
  /**
   * A panel that hugs a named text slot instead of standing at a fixed height.
   *
   * The engine top-anchors text, so a 24-character passage in a frame sized for 240 leaves the
   * panel two-thirds empty — the shape says "this much text" and the text says otherwise. With
   * `padText` the frame is the panel's maximum and the drawn rectangle is the fitted text plus
   * `padding`. The declared frame still has to contain the text, because that is what the
   * contrast check measures against.
   */
  padText: SlotNameSchema.optional(),
  padding: z.number().finite().min(0).max(0.1).default(0.02)
});

const RuleLayerSchema = FrameSchema.extend({
  type: z.literal("rule"),
  colorToken: TokenNameSchema,
  thickness: z.number().finite().min(1).max(20),
  /** A dashed rule. The dash pattern is derived from the thickness, so it scales with the rule. */
  dash: z.boolean().default(false)
});

/**
 * Two token stops and an angle.
 *
 * Two rather than many, because a gradient is a transition and a list of colours is a palette;
 * and because every stop is a colour behind the text above it, so each one has to clear the
 * contrast floor. Both stops at the same offset give a hard edge — which is how a family cuts a
 * diagonal across the frame without a bitmap.
 */
const GradientLayerSchema = FrameSchema.extend({
  type: z.literal("linear-gradient"),
  /** Degrees clockwise from the top of the canvas. */
  angle: z.number().finite().min(0).max(360),
  stops: z.tuple([
    z.object({ colorToken: TokenNameSchema, offset: UnitSchema }),
    z.object({ colorToken: TokenNameSchema, offset: UnitSchema })
  ])
});

const LogoLayerSchema = FrameSchema.extend({
  type: z.literal("logo"),
  colorToken: TokenNameSchema,
  fontToken: z.enum(["headline", "body", "mono"]).default("headline")
});

const ImageLayerSchema = FrameSchema.extend({
  type: z.literal("image"),
  slot: z.literal("image"),
  optional: z.literal(true),
  fit: z.enum(["cover", "contain"]),
  /** A soft fade to the slide background, so text over the lower edge stays legible. */
  scrim: z.enum(["none", "bottom", "full"]).default("none"),
  /** A circular window, or a polygon in frame fractions. */
  clip: z.union([
    z.literal("circle"),
    z.array(z.tuple([UnitSchema, UnitSchema])).min(3).max(12)
  ]).optional(),
  /**
   * What is done to the photograph before it is embedded.
   *
   * Applied to the hero bytes with sharp, never as an SVG filter, so librsvg only ever sees a
   * finished PNG — the same reason a WebP hero is transcoded rather than handed over. `duotone`
   * multiplies the greyscale by the slide's accent.
   */
  treatment: z.enum(["none", "mono", "duotone"]).default("none"),
  /**
   * A second appearance of the same photograph, small, later in the deck.
   *
   * One slot used twice rather than a second picture, which is why the template check counts
   * distinct image slots and not image layers.
   */
  reprise: z.boolean().default(false)
});

/**
 * A mesh gradient: several wide, blurred colour fields overlapping.
 *
 * Built from blurred radial gradients rather than an image, so it renders offline, deterministically,
 * and at any canvas size. Colours are token names — a template may not invent a colour, and the same
 * mesh reads differently under each venture's palette because it is the venture's own colours.
 */
const MeshLayerSchema = FrameSchema.extend({
  type: z.literal("mesh"),
  blobs: z.array(z.object({
    colorToken: TokenNameSchema,
    /** Centre and radius, as a fraction of the layer frame. */
    cx: z.number().finite().min(-0.5).max(1.5),
    cy: z.number().finite().min(-0.5).max(1.5),
    radius: z.number().finite().min(0.05).max(1.5),
    opacity: z.number().finite().min(0.05).max(1)
  })).min(2).max(6),
  /** Blur radius as a fraction of the shorter canvas edge. */
  softness: z.number().finite().min(0).max(0.3).default(0.08)
});

export const CarouselLayerSchema = z.discriminatedUnion("type", [
  TextLayerSchema,
  ShapeLayerSchema,
  RuleLayerSchema,
  LogoLayerSchema,
  ImageLayerSchema,
  MeshLayerSchema,
  GradientLayerSchema
]);

const SlideVariantSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9-]*$/),
  backgroundToken: TokenNameSchema.optional(),
  accentToken: TokenNameSchema.optional()
});

const SlideSchema = z.object({
  id: z.string().regex(/^slide-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  backgroundToken: TokenNameSchema,
  layers: z.array(CarouselLayerSchema).min(1).max(24),
  variants: z.array(SlideVariantSchema).max(4).default([])
});

const FormatSpecSchema = z.object({
  width: z.number().int().min(320).max(4_096),
  height: z.number().int().min(320).max(4_096),
  safeArea: z.object({
    top: UnitSchema.max(0.25),
    right: UnitSchema.max(0.25),
    bottom: UnitSchema.max(0.25),
    left: UnitSchema.max(0.25)
  })
});

export const CarouselTemplateSchema = z.object({
  schemaVersion: z.literal("carousel-template/1"),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: TemplateStatusSchema,
  description: z.string().trim().min(10).max(240),
  citedObservationRefs: z.array(z.string().trim().min(1).max(240)).max(12),
  formats: z.object({
    "instagram-square": FormatSpecSchema,
    "instagram-portrait": FormatSpecSchema,
    /*
     * The story canvas carries a default, and that is deliberate rather than lax.
     *
     * A template proposed and stored before this format existed has only three canvases, and the
     * site reads stored proposals with `safeParse` and silently drops whatever fails — so making
     * this required would not have surfaced an error, it would have made those templates vanish
     * from the gallery. Defaulting parses them unchanged and hands them the story canvas, which
     * is what "extend the contract, do not break its readers" means here.
     */
    "instagram-story": FormatSpecSchema.default({
      width: 1_080,
      height: 1_920,
      safeArea: { top: 0.14, right: 0.07, bottom: 0.16, left: 0.07 }
    }),
    threads: FormatSpecSchema
  }),
  requiredSlots: z.array(SlotNameSchema).min(1).max(30),
  slides: z.array(SlideSchema).min(1).max(10)
}).superRefine((template, context) => {
  const slideIds = template.slides.map((slide) => slide.id);
  if (new Set(slideIds).size !== slideIds.length) {
    context.addIssue({ code: "custom", message: "Slide ids must be unique", path: ["slides"] });
  }
  const slots = new Set(template.requiredSlots);
  const referencedSlots = new Set<string>();
  // Distinct slots, not layers. A photograph returning small on the outro is the same picture
  // used twice — one slot, two layers — and counting layers made that impossible to express.
  const imageSlots = new Set<string>();
  template.slides.forEach((slide, slideIndex) => {
    const textSlotsHere = new Set(slide.layers.flatMap((layer) => layer.type === "text" ? [layer.slot] : []));
    slide.layers.forEach((layer, layerIndex) => {
      if (layer.type === "text") referencedSlots.add(layer.slot);
      if (layer.type === "image") imageSlots.add(layer.slot);
      if (layer.type === "text" && !slots.has(layer.slot)) {
        context.addIssue({
          code: "custom",
          message: `Text slot ${layer.slot} is missing from requiredSlots`,
          path: ["slides", slideIndex, "layers", layerIndex, "slot"]
        });
      }
      // A panel that hugs a slot that is not on this slide has nothing to hug, and would draw at
      // its declared frame instead — a silently wrong panel rather than a rejected template.
      if (layer.type === "shape" && layer.padText !== undefined && !textSlotsHere.has(layer.padText)) {
        context.addIssue({
          code: "custom",
          message: `Panel hugs text slot ${layer.padText}, which this slide does not carry`,
          path: ["slides", slideIndex, "layers", layerIndex, "padText"]
        });
      }
    });
  });
  if (imageSlots.size > 1) {
    context.addIssue({ code: "custom", message: "A template may contain at most one optional image slot", path: ["slides"] });
  }
  for (const slot of slots) {
    if (!referencedSlots.has(slot)) {
      context.addIssue({ code: "custom", message: `Required slot ${slot} is unused`, path: ["requiredSlots"] });
    }
  }
});

export const BrandTokensSchema = z.object({
  schemaVersion: z.literal("carousel-brand/1"),
  id: z.enum(["caught-up", "mma-files", "titty-tuesdays", "devshark", "geoshark"]),
  name: z.string().trim().min(2).max(80),
  logoText: z.string().trim().min(2).max(40),
  colors: z.record(TokenNameSchema, z.string().regex(/^#[0-9a-f]{6}$/i)),
  fonts: z.object({
    headline: z.string().trim().min(2).max(100),
    body: z.string().trim().min(2).max(100),
    mono: z.string().trim().min(2).max(100)
  })
});

// Strict at the final render boundary: metadata from upstream records must be selected into
// strings deliberately. In particular, an admin-only BOOKSOFHISTORY coverRef cannot hitch a ride
// into a payload and become artwork merely because a caller spread a seed record here.
export const CarouselPayloadSchema = z.strictObject({
  locale: z.enum(["en", "cs"]),
  strings: z.record(SlotNameSchema, z.string().max(2_000)),
  variant: z.string().regex(/^[A-Z][A-Z0-9-]*$/).optional()
});

export const TemplateReferenceSchema = z.object({
  template_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  content: CarouselPayloadSchema
});

export type CarouselFormat = z.infer<typeof CarouselFormatSchema>;
export type CarouselLayer = z.infer<typeof CarouselLayerSchema>;
/**
 * A layer as an author writes one, before defaults are filled in.
 *
 * Every capability added to this schema is optional with a default, so the parsed type gains a
 * required field for each. Generators build the *input* shape and let the parse complete it,
 * which is what keeps adding a capability from being a rewrite of every template in the library.
 */
export type CarouselLayerInput = z.input<typeof CarouselLayerSchema>;
export type CarouselTemplate = z.infer<typeof CarouselTemplateSchema>;
/** A template as an author writes one: every defaulted capability may be left out. */
export type CarouselTemplateInput = z.input<typeof CarouselTemplateSchema>;
export type BrandTokens = z.infer<typeof BrandTokensSchema>;
export type CarouselPayload = z.infer<typeof CarouselPayloadSchema>;
export type TemplateReference = z.infer<typeof TemplateReferenceSchema>;
