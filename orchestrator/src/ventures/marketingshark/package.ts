import { z } from "zod";
import { HookAssignmentSchema } from "../../contracts/hook-assignment.js";

export const SLIDE_ROLES = ["hook", "context", "reveal", "why", "footer"] as const;
export type SlideRole = (typeof SLIDE_ROLES)[number];

export const SlideCopy = z.object({
  role: z.enum(SLIDE_ROLES),
  templateId: z.string(),
  headline: z.string().max(120),
  body: z.string().max(600).optional(),
  alt: z.string().max(200)
});
export type SlideCopy = z.infer<typeof SlideCopy>;

export const CarouselCopy = z.object({ slides: z.array(SlideCopy).length(5) });
export type CarouselCopy = z.infer<typeof CarouselCopy>;

export const MarketingSharkPackage = z.object({
  schemaVersion: z.literal("marketingshark-package/1"),
  date: z.string(),
  brandId: z.string(),
  question: z.object({ id: z.string(), category: z.string(), difficulty: z.number() }),
  hooks: z.object({
    a: z.object({ patternId: z.string(), en: z.string(), cs: z.string() }),
    b: z.object({ patternId: z.string(), en: z.string(), cs: z.string() })
  }),
  /**
   * What the studio decided about slide 1, and the set it was allowed to decide within.
   *
   * The package carries it rather than only the ledger because this is what a reviewer needs in
   * front of the copy: which hook, which gates licensed it, what else was available, and — when an
   * agent swapped it — that the swap stayed inside the recorded set.
   */
  hookAssignment: HookAssignmentSchema,
  carousels: z.object({ cs: CarouselCopy, en: CarouselCopy }),
  descriptions: z.object({
    instagram: z.object({ cs: z.string().max(2200), en: z.string().max(2200) }),
    threads: z.object({ cs: z.string().max(500), en: z.string().max(500) })
  }),
  hashtags: z.object({
    instagram: z.object({ cs: z.array(z.string()).min(3).max(5), en: z.array(z.string()).min(3).max(5) }),
    threads: z.object({ cs: z.array(z.string()).length(1), en: z.array(z.string()).length(1) })
  }),
  render: z.object({ engineVersion: z.string(), summaryPaths: z.array(z.string()) }),
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
  carousels: z.object({
    cs: slideDeck(),
    en: slideDeck()
  }),
  descriptions: z.object({
    instagram: z.object({ cs: z.string(), en: z.string() }),
    threads: z.object({ cs: z.string(), en: z.string() })
  }),
  hashtags: z.object({
    instagram: z.object({ cs: z.array(z.string()), en: z.array(z.string()) }),
    threads: z.object({ cs: z.array(z.string()), en: z.array(z.string()) })
  })
  // `hookB` used to be here: CHUM wrote the alternate hook line as free text. Both hook lines now
  // come from the central library, so there is no field left through which a model can author hook
  // copy at all.
});
export type ChumOutput = z.infer<typeof ChumOutput>;

export function packagePath(date: string, brandId: string): string {
  return `ventures/marketingshark/packages/${date}/${brandId}/package.json`;
}
