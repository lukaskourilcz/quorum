import {
  BrandTokensSchema,
  CarouselTemplateSchema,
  type BrandTokens,
  type CarouselFormat,
  type CarouselLayer,
  type CarouselPayload,
  type CarouselTemplate
} from "./schema.js";

const formats = {
  "instagram-square": { width: 1_080, height: 1_080, safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 } },
  "instagram-portrait": { width: 1_080, height: 1_350, safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 } },
  threads: { width: 1_200, height: 1_200, safeArea: { top: 0.07, right: 0.07, bottom: 0.09, left: 0.07 } }
} as const;

const text = (
  slot: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: Partial<Extract<CarouselLayer, { type: "text" }>> = {}
): CarouselLayer => ({
  type: "text",
  slot,
  x,
  y,
  width,
  height,
  colorToken: "foreground",
  fontToken: "body",
  fontWeight: 500,
  minFontSize: 24,
  maxFontSize: 48,
  maxChars: 180,
  maxLines: 5,
  align: "start",
  uppercase: false,
  ...options
});

const logo = (): CarouselLayer => ({
  type: "logo",
  x: 0.08,
  y: 0.07,
  width: 0.44,
  height: 0.06,
  colorToken: "accent",
  fontToken: "headline"
});

const rule = (x: number, y: number, width: number, colorToken = "accent"): CarouselLayer => ({
  type: "rule",
  x,
  y,
  width,
  height: 0.006,
  colorToken,
  thickness: 4
});

const shape = (
  x: number,
  y: number,
  width: number,
  height: number,
  fillToken = "surface",
  radius = 0.08
): CarouselLayer => ({
  type: "shape",
  x,
  y,
  width,
  height,
  fillToken,
  strokeWidth: 0,
  radius
});

const template = (input: Omit<CarouselTemplate, "schemaVersion" | "version" | "status" | "formats" | "citedObservationRefs"> & {
  citedObservationRefs?: string[];
}): CarouselTemplate => CarouselTemplateSchema.parse({
  schemaVersion: "carousel-template/1",
  version: "1.0.0",
  status: "live",
  formats,
  citedObservationRefs: input.citedObservationRefs ?? [],
  ...input
});

export const SEED_TEMPLATES: readonly CarouselTemplate[] = [
  template({
    id: "quote-card",
    name: "Quote card",
    description: "One sourced line with a restrained attribution and a strong editorial margin.",
    requiredSlots: ["quote", "attribution"],
    slides: [{
      id: "slide-quote",
      backgroundToken: "background",
      variants: [{ id: "A" }, { id: "B", accentToken: "secondary" }],
      layers: [
        logo(),
        text("quote", 0.1, 0.25, 0.76, 0.43, { fontToken: "headline", fontWeight: 800, minFontSize: 34, maxFontSize: 74, maxChars: 190, maxLines: 6 }),
        rule(0.1, 0.75, 0.18),
        text("attribution", 0.1, 0.8, 0.72, 0.08, { colorToken: "muted", fontWeight: 700, minFontSize: 20, maxFontSize: 30, maxChars: 80, maxLines: 2 })
      ]
    }]
  }),
  template({
    id: "listicle-steps",
    name: "Listicle steps",
    description: "A four-step sequence with fixed numbering and room for one specific action per slide.",
    requiredSlots: ["list-title", "step-one", "step-two", "step-three", "step-four"],
    slides: ["one", "two", "three", "four"].map((number, index) => ({
      id: `slide-${number}`,
      backgroundToken: index % 2 === 0 ? "background" : "surface",
      variants: [],
      layers: [
        logo(),
        text("list-title", 0.08, 0.18, 0.76, 0.09, { colorToken: "muted", fontWeight: 700, minFontSize: 20, maxFontSize: 32, maxChars: 72, maxLines: 2, uppercase: true }),
        shape(0.08, 0.39, 0.06, 0.06, index % 2 === 0 ? "accent" : "secondary", 0.5),
        text(`step-${number}`, 0.18, 0.39, 0.68, 0.3, { fontToken: "headline", fontWeight: 800, minFontSize: 34, maxFontSize: 70, maxChars: 150, maxLines: 5 }),
        rule(0.18, 0.76, 0.52)
      ]
    }))
  }),
  template({
    id: "stat-highlight",
    name: "Stat highlight",
    description: "A large verified figure paired with a plain-language explanation and source label.",
    requiredSlots: ["stat", "stat-label", "source"],
    slides: [{
      id: "slide-stat",
      backgroundToken: "background",
      variants: [{ id: "A" }, { id: "B", backgroundToken: "surface" }],
      layers: [
        logo(),
        shape(0.08, 0.23, 0.84, 0.5),
        text("stat", 0.13, 0.3, 0.74, 0.2, { colorToken: "accent", fontToken: "headline", fontWeight: 900, minFontSize: 52, maxFontSize: 120, maxChars: 18, maxLines: 1, align: "middle" }),
        text("stat-label", 0.16, 0.53, 0.68, 0.13, { fontWeight: 700, minFontSize: 24, maxFontSize: 40, maxChars: 100, maxLines: 3, align: "middle" }),
        text("source", 0.1, 0.82, 0.78, 0.07, { colorToken: "muted", fontToken: "mono", minFontSize: 18, maxFontSize: 25, maxChars: 100, maxLines: 2 })
      ]
    }]
  }),
  template({
    id: "before-after",
    name: "Before and after",
    description: "Two consecutive states that explain one concrete change without a decorative split screen.",
    requiredSlots: ["before-label", "before", "after-label", "after"],
    slides: [
      {
        id: "slide-before",
        backgroundToken: "background",
        variants: [],
        layers: [logo(), text("before-label", 0.09, 0.24, 0.5, 0.08, { colorToken: "muted", fontWeight: 800, minFontSize: 20, maxFontSize: 34, maxChars: 32, maxLines: 1, uppercase: true }), text("before", 0.09, 0.4, 0.78, 0.31, { fontToken: "headline", fontWeight: 800, minFontSize: 34, maxFontSize: 72, maxChars: 170, maxLines: 5 }), rule(0.09, 0.8, 0.26, "muted")]
      },
      {
        id: "slide-after",
        backgroundToken: "surface",
        variants: [],
        layers: [logo(), text("after-label", 0.09, 0.24, 0.5, 0.08, { colorToken: "accent", fontWeight: 800, minFontSize: 20, maxFontSize: 34, maxChars: 32, maxLines: 1, uppercase: true }), text("after", 0.09, 0.4, 0.78, 0.31, { fontToken: "headline", fontWeight: 800, minFontSize: 34, maxFontSize: 72, maxChars: 170, maxLines: 5 }), rule(0.09, 0.8, 0.54)]
      }
    ]
  }),
  template({
    id: "headline-three-bullets",
    name: "Headline and three points",
    description: "A compact cover followed by three evidence-sized points on a single reading slide.",
    requiredSlots: ["headline", "bullet-one", "bullet-two", "bullet-three"],
    slides: [
      {
        id: "slide-cover",
        backgroundToken: "background",
        variants: [],
        layers: [logo(), text("headline", 0.09, 0.34, 0.78, 0.33, { fontToken: "headline", fontWeight: 900, minFontSize: 36, maxFontSize: 78, maxChars: 170, maxLines: 5 }), rule(0.09, 0.75, 0.66)]
      },
      {
        id: "slide-points",
        backgroundToken: "surface",
        variants: [],
        layers: [
          logo(),
          text("bullet-one", 0.16, 0.26, 0.7, 0.13, { fontWeight: 700, minFontSize: 24, maxFontSize: 38, maxChars: 100, maxLines: 3 }),
          text("bullet-two", 0.16, 0.48, 0.7, 0.13, { fontWeight: 700, minFontSize: 24, maxFontSize: 38, maxChars: 100, maxLines: 3 }),
          text("bullet-three", 0.16, 0.7, 0.7, 0.13, { fontWeight: 700, minFontSize: 24, maxFontSize: 38, maxChars: 100, maxLines: 3 }),
          rule(0.09, 0.31, 0.04), rule(0.09, 0.53, 0.04), rule(0.09, 0.75, 0.04)
        ]
      }
    ]
  }),
  template({
    id: "timeline",
    name: "Timeline",
    description: "Three dated moments connected by repeated typography instead of an illustrated chronology.",
    requiredSlots: ["timeline-title", "time-one", "event-one", "time-two", "event-two", "time-three", "event-three"],
    slides: ["one", "two", "three"].map((number, index) => ({
      id: `slide-time-${number}`,
      backgroundToken: "background",
      variants: [],
      layers: [
        logo(),
        text("timeline-title", 0.09, 0.2, 0.74, 0.09, { colorToken: "muted", fontWeight: 700, minFontSize: 20, maxFontSize: 32, maxChars: 80, maxLines: 2 }),
        text(`time-${number}`, 0.09, 0.38, 0.24, 0.09, { colorToken: "accent", fontToken: "mono", fontWeight: 800, minFontSize: 24, maxFontSize: 38, maxChars: 18, maxLines: 1 }),
        text(`event-${number}`, 0.09, 0.51, 0.76, 0.26, { fontToken: "headline", fontWeight: 800, minFontSize: 32, maxFontSize: 64, maxChars: 150, maxLines: 5 }),
        rule(0.72, 0.85, 0.05 + index * 0.06, "muted")
      ]
    }))
  }),
  template({
    id: "comparison",
    name: "Comparison",
    description: "Two claims receive equal space, then one short conclusion states the useful distinction.",
    requiredSlots: ["left-title", "left-body", "right-title", "right-body", "comparison-note"],
    slides: [{
      id: "slide-comparison",
      backgroundToken: "background",
      variants: [],
      layers: [
        logo(),
        shape(0.07, 0.23, 0.4, 0.48),
        shape(0.53, 0.23, 0.4, 0.48, "surface-strong"),
        text("left-title", 0.11, 0.29, 0.31, 0.08, { colorToken: "accent", fontWeight: 800, minFontSize: 20, maxFontSize: 32, maxChars: 40, maxLines: 2 }),
        text("left-body", 0.11, 0.41, 0.31, 0.23, { fontWeight: 700, minFontSize: 22, maxFontSize: 38, maxChars: 120, maxLines: 5 }),
        text("right-title", 0.57, 0.29, 0.31, 0.08, { colorToken: "accent", fontWeight: 800, minFontSize: 20, maxFontSize: 32, maxChars: 40, maxLines: 2 }),
        text("right-body", 0.57, 0.41, 0.31, 0.23, { fontWeight: 700, minFontSize: 22, maxFontSize: 38, maxChars: 120, maxLines: 5 }),
        text("comparison-note", 0.1, 0.79, 0.8, 0.1, { colorToken: "muted", minFontSize: 19, maxFontSize: 28, maxChars: 120, maxLines: 3, align: "middle" })
      ]
    }]
  }),
  template({
    id: "cover-cta",
    name: "Cover and closing prompt",
    description: "An editorial cover and a separate closing slide with one bounded next action.",
    requiredSlots: ["cover-title", "cover-dek", "cta", "destination"],
    slides: [
      {
        id: "slide-cover",
        backgroundToken: "background",
        variants: [{ id: "A" }, { id: "B", accentToken: "secondary" }],
        layers: [logo(), text("cover-title", 0.09, 0.29, 0.79, 0.31, { fontToken: "headline", fontWeight: 900, minFontSize: 36, maxFontSize: 78, maxChars: 170, maxLines: 5 }), text("cover-dek", 0.09, 0.69, 0.75, 0.12, { colorToken: "muted", minFontSize: 22, maxFontSize: 34, maxChars: 120, maxLines: 3 }), rule(0.09, 0.86, 0.18)]
      },
      {
        id: "slide-closing",
        backgroundToken: "surface",
        variants: [{ id: "A" }, { id: "B", accentToken: "secondary" }],
        layers: [logo(), text("cta", 0.12, 0.34, 0.76, 0.25, { fontToken: "headline", fontWeight: 900, minFontSize: 36, maxFontSize: 72, maxChars: 130, maxLines: 4, align: "middle" }), text("destination", 0.14, 0.69, 0.72, 0.09, { colorToken: "accent", fontToken: "mono", fontWeight: 700, minFontSize: 18, maxFontSize: 30, maxChars: 100, maxLines: 2, align: "middle" })]
      }
    ]
  }),
  template({
    id: "five-slide-story",
    name: "Five-slide story",
    description: "A cover, three developments and one sober takeaway form a complete reading arc.",
    requiredSlots: ["story-title", "story-one", "story-two", "story-three", "story-takeaway"],
    slides: ["title", "one", "two", "three", "takeaway"].map((part, index) => ({
      id: `slide-story-${part}`,
      backgroundToken: index === 0 || index === 4 ? "surface" : "background",
      variants: [],
      layers: [
        logo(),
        text(part === "title" ? "story-title" : part === "takeaway" ? "story-takeaway" : `story-${part}`, 0.1, 0.34, 0.78, 0.34, { fontToken: "headline", fontWeight: 800, minFontSize: 34, maxFontSize: index === 0 ? 78 : 66, maxChars: 180, maxLines: 6, align: index === 4 ? "middle" : "start" }),
        shape(0.76, 0.83, 0.04 + index * 0.02, 0.025, "muted", 0.5),
        rule(0.1, 0.75, index === 4 ? 0.68 : 0.28)
      ]
    }))
  }),
  template({
    id: "minimal-text-poster",
    name: "Minimal text poster",
    description: "A single short statement uses scale, empty space and one brand punctuation mark.",
    requiredSlots: ["poster-line", "poster-note"],
    slides: [{
      id: "slide-poster",
      backgroundToken: "background",
      variants: [{ id: "A" }, { id: "B", backgroundToken: "surface" }],
      layers: [
        logo(),
        shape(0.82, 0.2, 0.06, 0.06, "accent", 0.5),
        text("poster-line", 0.1, 0.34, 0.74, 0.29, { fontToken: "headline", fontWeight: 900, minFontSize: 42, maxFontSize: 90, maxChars: 100, maxLines: 4 }),
        text("poster-note", 0.1, 0.79, 0.7, 0.08, { colorToken: "muted", fontToken: "mono", minFontSize: 18, maxFontSize: 28, maxChars: 90, maxLines: 2 })
      ]
    }]
  })
] as const;

export const CAROUSEL_BRANDS: Readonly<Record<BrandTokens["id"], BrandTokens>> = {
  "caught-up": BrandTokensSchema.parse({
    schemaVersion: "carousel-brand/1",
    id: "caught-up",
    name: "DNESKAi",
    logoText: "DNESKAI",
    colors: {
      background: "#09090b",
      surface: "#18181b",
      "surface-strong": "#27272a",
      foreground: "#f4f4f5",
      muted: "#d4d4d8",
      accent: "#fe45e2",
      secondary: "#ff5a00"
    },
    fonts: { headline: "Arial, Helvetica, sans-serif", body: "Arial, Helvetica, sans-serif", mono: "Courier New, monospace" }
  }),
  "mma-files": BrandTokensSchema.parse({
    schemaVersion: "carousel-brand/1",
    id: "mma-files",
    name: "MMA Files",
    logoText: "MMA FILES",
    colors: {
      background: "#111113",
      surface: "#1d1d22",
      "surface-strong": "#29292f",
      foreground: "#f5f1e8",
      muted: "#d5d0c7",
      accent: "#ef6c35",
      secondary: "#f2b84b"
    },
    fonts: { headline: "Arial Narrow, Arial, sans-serif", body: "Arial, Helvetica, sans-serif", mono: "Courier New, monospace" }
  }),
  "titty-tuesdays": BrandTokensSchema.parse({
    schemaVersion: "carousel-brand/1",
    id: "titty-tuesdays",
    name: "Titty Tuesdays",
    logoText: "TITTY TUESDAYS",
    colors: {
      background: "#140b12",
      surface: "#251421",
      "surface-strong": "#382033",
      foreground: "#fff7fb",
      muted: "#f2cfde",
      accent: "#ff6fae",
      secondary: "#ffc45e"
    },
    fonts: { headline: "Arial Black, Arial, sans-serif", body: "Arial, Helvetica, sans-serif", mono: "Courier New, monospace" }
  })
};

const fixtures: Record<string, Record<string, string>> = {
  "quote-card": { quote: "The strongest claim is the one the source can carry.", attribution: "AUDIT · fixture room" },
  "listicle-steps": { "list-title": "Four checks before a story ships", "step-one": "Name the new fact.", "step-two": "Open the primary source.", "step-three": "State the uncertainty.", "step-four": "Link the full record." },
  "stat-highlight": { stat: "10/10", "stat-label": "seed layouts passed the deterministic checks", source: "Carousel Studio fixture · 2026-08-02" },
  "before-after": { "before-label": "Before", before: "Three renderers produced three visual languages.", "after-label": "After", after: "One template contract serves every brand skin." },
  "headline-three-bullets": { headline: "A carousel should earn every slide", "bullet-one": "One fact per frame", "bullet-two": "Readable at phone size", "bullet-three": "A source stays close" },
  timeline: { "timeline-title": "From observation to live template", "time-one": "09:10", "event-one": "MOTIF records a cited layout pattern.", "time-two": "10:25", "event-two": "EASEL writes an original DSL proposal.", "time-three": "13:00", "event-three": "Checks pass and the version goes live." },
  comparison: { "left-title": "FREEFORM", "left-body": "A new visual spec for every post.", "right-title": "TEMPLATE", "right-body": "One checked layout with brand tokens.", "comparison-note": "The template path is cheaper to review and reproduce." },
  "cover-cta": { "cover-title": "One layout, three distinct brands", "cover-dek": "Tokens change the voice. The reading order stays dependable.", cta: "Read the sourced story", destination: "boardless-ai.vercel.app" },
  "five-slide-story": { "story-title": "Why the studio lives inside the pipeline", "story-one": "The content packet selects a live template.", "story-two": "Brand tokens skin the layout at render time.", "story-three": "The same bytes can be reproduced from saved inputs.", "story-takeaway": "No image model and no extra service are required." },
  "minimal-text-poster": { "poster-line": "DESIGN THE SYSTEM ONCE.", "poster-note": "Original layout · deterministic render" }
};

const czechFixtureOverrides: Partial<Record<string, Record<string, string>>> = {
  "quote-card": { quote: "Nejsilnější tvrzení unese zdroj, ne efektní formulace.", attribution: "AUDIT · testovací meeting" },
  "headline-three-bullets": { headline: "Carousel musí obhájit každý slide", "bullet-one": "Jeden fakt na obrazovku", "bullet-two": "Čitelné i na telefonu", "bullet-three": "Zdroj zůstává nablízku" },
  "minimal-text-poster": { "poster-line": "NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ SLOVO SE VEJDE.", "poster-note": "Česká diakritika · automatické zmenšení" }
};

export function templateByReference(templateId: string, version: string): CarouselTemplate | null {
  return SEED_TEMPLATES.find((template) => template.id === templateId && template.version === version) ?? null;
}

export function liveTemplateByReference(templateId: string, version: string): CarouselTemplate {
  const template = templateByReference(templateId, version);
  if (!template) throw new Error(`Unknown carousel template ${templateId}@${version}`);
  if (template.status !== "live") throw new Error(`Carousel template ${templateId}@${version} is ${template.status}, not live`);
  return template;
}

export function fixturePayload(template: CarouselTemplate, locale: "en" | "cs" = "en", variant?: string): CarouselPayload {
  const base = fixtures[template.id];
  if (!base) throw new Error(`No fixture payload for ${template.id}`);
  return {
    locale,
    strings: { ...base, ...(locale === "cs" ? czechFixtureOverrides[template.id] : {}) },
    ...(variant ? { variant } : {})
  };
}

export function previewFormats(): CarouselFormat[] {
  return ["instagram-square", "instagram-portrait", "threads"];
}
