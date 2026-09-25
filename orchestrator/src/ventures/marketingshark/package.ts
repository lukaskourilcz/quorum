import { QUIZ_SLIDE_LIMITS } from "@boardlessai/carousel-studio";
import { z } from "zod";
import { HookAssignmentSchema } from "../../contracts/hook-assignment.js";
import { MarketingSharkLocaleSchema, type MarketingSharkLocale } from "./config.js";

export const SLIDE_ROLES = ["hook", "context", "reveal", "why", "footer"] as const;
export type SlideRole = (typeof SLIDE_ROLES)[number];

export const SlideCopy = z.object({
  role: z.enum(SLIDE_ROLES),
  templateId: z.string(),
  headline: z.string().max(QUIZ_SLIDE_LIMITS.headlineChars),
  body: z.string().max(QUIZ_SLIDE_LIMITS.bodyChars).optional(),
  /** Required and never empty: every queue item carries it, and Instagram refuses media without it. */
  alt: z.string().trim().min(1).max(QUIZ_SLIDE_LIMITS.altChars)
});
export type SlideCopy = z.infer<typeof SlideCopy>;

export const CarouselCopy = z.object({ slides: z.array(SlideCopy).length(5) });
export type CarouselCopy = z.infer<typeof CarouselCopy>;

/**
 * One value per language: English always, Czech only for a brand that writes it.
 *
 * The room was bilingual by construction and every field was a `{ cs, en }` pair. devShark writes
 * English only now, so Czech is the optional half rather than a required string nobody reads.
 */
function perLocale<T extends z.ZodType>(value: T) {
  return z.object({ en: value, cs: value.optional() });
}

/** A per-language value for one language, or a thrown error naming the language that is missing. */
export function inLocale<T>(values: { en: T; cs?: T | undefined }, locale: MarketingSharkLocale): T {
  const value = values[locale];
  if (value === undefined) throw new Error(`No ${locale} copy was written for this brand`);
  return value;
}

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

/** One hosted frame file: where a channel fetches it, and what its bytes hash to. */
const FrameFile = (extension: "png" | "jpg") => z.object({
  path: z.string().regex(new RegExp(`^/social/[a-z0-9-]+/\\d{4}-\\d{2}-\\d{2}/(?:cs|en)/slide-0[1-5]\\.${extension}$`, "u")),
  sha256: Sha256,
  bytes: z.number().int().positive()
});

/**
 * A slide's frames: the PNG the studio rasterised and the JPEG copy Instagram accepts.
 *
 * Every file's hash is recorded here, beside the SVG hash of the slide the gates passed, so a
 * reviewer, a publisher or a later re-render can prove the bytes on disk are the bytes reviewed.
 */
export const RenderedFrameSchema = z.object({
  locale: MarketingSharkLocaleSchema,
  role: z.enum(SLIDE_ROLES),
  slide: z.number().int().min(1).max(5),
  svgHash: Sha256,
  width: z.literal(1080),
  height: z.literal(1350),
  png: FrameFile("png"),
  jpeg: FrameFile("jpg")
});

export const MarketingSharkPackage = z.object({
  /** `marketingshark-<date>-<brand>`, the release id every queue item built from it carries. */
  id: z.string().regex(/^marketingshark-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/u),
  schemaVersion: z.literal("marketingshark-package/2"),
  date: z.string(),
  brandId: z.string(),
  /** The languages this package was written in; the queue and the renderer read nothing else. */
  locales: z.array(MarketingSharkLocaleSchema).min(1),
  question: z.object({ id: z.string(), category: z.string(), difficulty: z.number() }),
  hooks: z.object({
    a: z.object({ patternId: z.string(), en: z.string(), cs: z.string().optional() }),
    b: z.object({ patternId: z.string(), en: z.string(), cs: z.string().optional() })
  }),
  /**
   * What the studio decided about slide 1, and the set it was allowed to decide within.
   *
   * The package carries it rather than only the ledger because this is what a reviewer needs in
   * front of the copy: which hook, which gates licensed it, what else was available, and — when an
   * agent swapped it — that the swap stayed inside the recorded set.
   */
  hookAssignment: HookAssignmentSchema,
  carousels: perLocale(CarouselCopy),
  descriptions: z.object({
    instagram: perLocale(z.string().max(2200)),
    threads: perLocale(z.string().max(500)),
    /**
     * LinkedIn's own caption, never another channel's text. English only: the one LinkedIn Page is
     * devShark's, and devShark writes English. 3,000 is LinkedIn's limit including the hashtags.
     */
    linkedin: z.object({ en: z.string().min(1).max(3000) })
  }),
  hashtags: z.object({
    instagram: perLocale(z.array(z.string()).min(3).max(5)),
    threads: perLocale(z.array(z.string()).length(1)),
    linkedin: z.object({ en: z.array(z.string()).max(3) })
  }),
  render: z.object({
    engineVersion: z.string(),
    format: z.literal("instagram-portrait"),
    summaryPaths: z.array(z.string()),
    frames: z.array(RenderedFrameSchema).min(5)
  }),
  status: z.literal("draft"),
  /**
   * SPLIT-compatible and permanently unmeasured.
   *
   * SPLIT is retired and METRICS_INGESTION_ENABLED is false, so the two hook variants are
   * recorded in the shape a split test would want and never compared. `measured` is a literal
   * false rather than a boolean: a package cannot claim a measurement exists.
   */
  abRecord: z.object({ measured: z.literal(false), note: z.string() }),
  spendUsd: z.number()
});
export type MarketingSharkPackage = z.infer<typeof MarketingSharkPackage>;

/**
 * What CHUM returns. The package is assembled from this plus everything code already knows --
 * template ids, spend, render paths, status -- so the model never states a fact about the run.
 */
/**
 * Five slides carrying the five roles, in the order the renderer assumes.
 *
 * `renderCarousel` picks each slide's template with `SLIDE_ROLES[index]`, by position, and never
 * reads the `role` the model wrote. The schema only checked the count and that each role was one
 * of the legal five, so a reply with `why` twice and no `footer` parsed cleanly and then rendered
 * the fourth slide's copy through the footer's template — the brand's slide-5 line silently
 * replaced by an explanation, with nothing anywhere reporting a problem. Requiring the canonical
 * order makes the renderer's positional assumption true instead of hoped for, and turns a silent
 * mislabel into a `model-output-invalid` the retry can act on.
 */
const slideDeck = () => z.object({
  slides: z.array(z.object({
    role: z.enum(SLIDE_ROLES),
    headline: z.string(),
    body: z.string().optional(),
    alt: z.string()
  })).length(5).refine(
    (slides) => slides.every((slide, index) => slide.role === SLIDE_ROLES[index]),
    { message: `slides must carry the roles ${SLIDE_ROLES.join(", ")} in that order` }
  )
});

export const ChumOutput = z.object({
  // Czech is optional in the shape and required by the gates for a brand that writes it, so a
  // missing language is a violation the retry can name rather than a parse failure it cannot.
  carousels: perLocale(slideDeck()),
  descriptions: z.object({
    instagram: perLocale(z.string()),
    threads: perLocale(z.string()),
    linkedin: z.object({ en: z.string() })
  }),
  hashtags: z.object({
    instagram: perLocale(z.array(z.string())),
    threads: perLocale(z.array(z.string())),
    linkedin: z.object({ en: z.array(z.string()) })
  })
  // `hookB` used to be here: CHUM wrote the alternate hook line as free text. Both hook lines now
  // come from the central library, so there is no field left through which a model can author hook
  // copy at all.
});
export type ChumOutput = z.infer<typeof ChumOutput>;

export function packageId(date: string, brandId: string): string {
  return `marketingshark-${date}-${brandId}`;
}

export function packagePath(date: string, brandId: string): string {
  return `ventures/marketingshark/packages/${date}/${brandId}/package.json`;
}
