import { QUIZ_SLIDE_LIMITS } from "@boardlessai/carousel-studio";
import { z } from "zod";
import { HookAssignmentSchema } from "../../contracts/hook-assignment.js";
import { MarketingSharkLocaleSchema, type MarketingSharkLocale } from "./config.js";
import { POST_KIND_ROLES, ROTATION_KINDS } from "./kinds.js";

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
  /**
   * Present only when the rotation scheduled another kind and the room drafted the quiz instead:
   * the kind it wanted and why it could not have it (quorum#576). Absent on a quiz day.
   */
  rotation: z.object({ scheduled: z.enum(ROTATION_KINDS), reason: z.string().min(1).max(300) }).optional(),
  spendUsd: z.number()
});
export type MarketingSharkPackage = z.infer<typeof MarketingSharkPackage>;

const SlideRoleName = z.string().regex(/^[a-z]+$/u).max(20);

/** One slide of a post deck: a kind's role, its template and the words on it. */
export const PostSlideCopySchema = z.object({
  role: SlideRoleName,
  templateId: z.string(),
  headline: z.string().max(QUIZ_SLIDE_LIMITS.headlineChars),
  body: z.string().max(QUIZ_SLIDE_LIMITS.bodyChars).optional(),
  alt: z.string().trim().min(1).max(QUIZ_SLIDE_LIMITS.altChars)
});
export type PostSlideCopy = z.infer<typeof PostSlideCopySchema>;

const PostFrameSchema = RenderedFrameSchema.extend({ role: SlideRoleName });

/** A GoVIRAL trend hook as it was read, or the reason there was none. Recorded, never re-derived. */
const TrendHookRecord = z.object({
  packet: z.object({
    schemaVersion: z.literal("goviral-intelligence-packet/1"),
    topic: z.string().min(1).max(160),
    measuredAt: z.string(),
    expiresAt: z.string(),
    velocity: z.number().min(-100).max(100).nullable(),
    evidenceRefs: z.array(z.string().min(1).max(160)).min(1).max(12)
  }).nullable(),
  reason: z.string().min(1).max(300)
});

/**
 * A feature spotlight, a challenge teaser, the week's note or the owner's launch announcement
 * (quorum#576).
 *
 * The same five slides, frames, captions and queue handoff as the quiz package, so the publisher,
 * the asset gate and the Queue read it the same way. What it carries instead of a question and a
 * hook assignment is the kind, the one subject the post is about and the record of where every
 * code-owned fact on it came from: the fact-sheet block, the challenge snapshot, the week's own
 * packages and GoVIRAL's trend hook, or the owner's copy file.
 */
export const PostPackageSchema = z.object({
  id: z.string().regex(/^marketingshark-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/u),
  schemaVersion: z.literal("marketingshark-package/2"),
  kind: z.enum(["feature-spotlight", "challenge-teaser", "this-week", "announcement"]),
  date: z.string(),
  brandId: z.string(),
  /** The kinds beyond the quiz are written in English only. */
  locales: z.tuple([z.literal("en")]),
  /** What the post is about, as an evidence ref and the words slide 1 names it by. */
  subject: z.object({ ref: z.string().min(1).max(160), label: z.string().min(1).max(160) }),
  /** Slide 1's source: the kind's pattern, filled, or the owner's own line. */
  hook: z.object({ patternId: z.string().min(1), en: z.string().min(1).max(QUIZ_SLIDE_LIMITS.hookChars) }),
  carousels: z.object({ en: z.object({ slides: z.array(PostSlideCopySchema).length(5) }) }),
  descriptions: z.object({
    instagram: z.object({ en: z.string().max(2200) }),
    threads: z.object({ en: z.string().max(500) }),
    linkedin: z.object({ en: z.string().min(1).max(3000) })
  }),
  hashtags: z.object({
    instagram: z.object({ en: z.array(z.string()).min(3).max(5) }),
    threads: z.object({ en: z.array(z.string()).length(1) }),
    linkedin: z.object({ en: z.array(z.string()).max(3) })
  }),
  spotlight: z.object({
    screen: z.object({ id: z.string(), name: z.string(), factTerm: z.string() }),
    factSheetEffectiveFrom: z.string()
  }).optional(),
  challenge: z.object({
    id: z.string(),
    track: z.string(),
    title: z.string(),
    difficulty: z.string(),
    snapshotContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceCommit: z.string()
  }).optional(),
  week: z.object({
    /** The Monday of the week the note covers. */
    weekOf: z.string(),
    items: z.array(z.object({ date: z.string(), kind: z.string(), packageRef: z.string(), line: z.string() })).min(1).max(4),
    theme: z.object({ label: z.string().min(1).max(18), category: z.string().nullable(), from: z.enum(["trend", "week", "fallback"]) }),
    pick: z.object({ date: z.string(), packageRef: z.string() }),
    trend: TrendHookRecord
  }).optional(),
  announcement: z.object({ copyRef: z.string().regex(/^state\/ventures\/marketingshark\/announcements\/[a-z0-9./-]+\.json$/u) }).optional(),
  rotation: z.object({ weekday: z.string(), scheduled: z.enum(ROTATION_KINDS).nullable() }),
  render: z.object({
    engineVersion: z.string(),
    format: z.literal("instagram-portrait"),
    summaryPaths: z.array(z.string()),
    frames: z.array(PostFrameSchema).min(5)
  }),
  status: z.literal("draft"),
  spendUsd: z.number()
}).superRefine((built, context) => {
  const roles = built.carousels.en.slides.map((slide) => slide.role);
  if (roles.join(",") !== POST_KIND_ROLES[built.kind].join(",")) {
    context.addIssue({ code: "custom", message: `a ${built.kind} carries the slides ${POST_KIND_ROLES[built.kind].join(", ")} in that order`, path: ["carousels", "en", "slides"] });
  }
  // Exactly the provenance block the kind needs, and no other kind's.
  const blocks = { "feature-spotlight": built.spotlight, "challenge-teaser": built.challenge, "this-week": built.week, announcement: built.announcement } as const;
  for (const [kind, block] of Object.entries(blocks)) {
    if ((kind === built.kind) !== (block !== undefined)) {
      context.addIssue({ code: "custom", message: `a ${built.kind} records ${kind === built.kind ? "its" : `no ${kind}`} provenance`, path: [kind] });
    }
  }
});
export type PostPackage = z.infer<typeof PostPackageSchema>;

/** Any package the room commits: the quiz carousel, or one of the other kinds. */
export const AnyMarketingSharkPackage = z.union([MarketingSharkPackage, PostPackageSchema]);
export type AnyMarketingSharkPackage = z.infer<typeof AnyMarketingSharkPackage>;

export function isPostPackage(built: AnyMarketingSharkPackage): built is PostPackage {
  return "kind" in built;
}

/**
 * What CHUM returns for a kind beyond the quiz: only the slides it writes, and the captions.
 *
 * Code owns the rest of the deck, so the reply has no field through which slide 1, the footer, a
 * challenge's prompt or the week's recap could be rewritten. The owner's announcement copy file is
 * the same shape with all five slides.
 */
export const PostWriterOutput = z.object({
  slides: z.array(z.object({
    role: z.string(),
    headline: z.string().optional(),
    body: z.string().optional(),
    alt: z.string()
  })).min(1).max(5),
  descriptions: z.object({
    instagram: z.object({ en: z.string() }),
    threads: z.object({ en: z.string() }),
    linkedin: z.object({ en: z.string() })
  }),
  hashtags: z.object({
    instagram: z.object({ en: z.array(z.string()) }),
    threads: z.object({ en: z.array(z.string()) }),
    linkedin: z.object({ en: z.array(z.string()) })
  })
});
export type PostWriterOutput = z.infer<typeof PostWriterOutput>;

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
