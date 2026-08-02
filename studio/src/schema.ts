import { z } from "zod";

export const CarouselFormatSchema = z.enum([
  "instagram-square",
  "instagram-portrait",
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
  uppercase: z.boolean().default(false)
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
  radius: z.number().finite().min(0).max(0.5).default(0)
});

const RuleLayerSchema = FrameSchema.extend({
  type: z.literal("rule"),
  colorToken: TokenNameSchema,
  thickness: z.number().finite().min(1).max(20)
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
  fit: z.enum(["cover", "contain"])
});

export const CarouselLayerSchema = z.discriminatedUnion("type", [
  TextLayerSchema,
  ShapeLayerSchema,
  RuleLayerSchema,
  LogoLayerSchema,
  ImageLayerSchema
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
  let imageSlots = 0;
  template.slides.forEach((slide, slideIndex) => {
    slide.layers.forEach((layer, layerIndex) => {
      if (layer.type === "text") referencedSlots.add(layer.slot);
      if (layer.type === "image") imageSlots += 1;
      if (layer.type === "text" && !slots.has(layer.slot)) {
        context.addIssue({
          code: "custom",
          message: `Text slot ${layer.slot} is missing from requiredSlots`,
          path: ["slides", slideIndex, "layers", layerIndex, "slot"]
        });
      }
    });
  });
  if (imageSlots > 1) {
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
  id: z.enum(["caught-up", "mma-files", "titty-tuesdays"]),
  name: z.string().trim().min(2).max(80),
  logoText: z.string().trim().min(2).max(40),
  colors: z.record(TokenNameSchema, z.string().regex(/^#[0-9a-f]{6}$/i)),
  fonts: z.object({
    headline: z.string().trim().min(2).max(100),
    body: z.string().trim().min(2).max(100),
    mono: z.string().trim().min(2).max(100)
  })
});

export const CarouselPayloadSchema = z.object({
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
export type CarouselTemplate = z.infer<typeof CarouselTemplateSchema>;
export type BrandTokens = z.infer<typeof BrandTokensSchema>;
export type CarouselPayload = z.infer<typeof CarouselPayloadSchema>;
export type TemplateReference = z.infer<typeof TemplateReferenceSchema>;
