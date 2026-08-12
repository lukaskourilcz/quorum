import { z } from "zod";
import { DateSchema, DateTimeSchema, HttpsUrlSchema } from "./common.js";

/**
 * A bilingual feature, recorded as the record it was when it was written.
 *
 * The venture's third sibling under `venture-recommendation/1`. It shares the schemaVersion and
 * the discriminated evidence pattern with BOOKSOFHISTORY and Door Money, and nothing else — the
 * payload is two languages rather than two locales of one text, and the difference is the point
 * of the venture.
 *
 * Two rules are carried here rather than left to the writer:
 *
 * - **A licensed photo without its attribution is not a slide.** The attribution string is
 *   required on the media reference, and the licence it belongs to is named beside it. A
 *   ShareAlike obligation that lives only in a licence file is an obligation that will be
 *   forgotten at render; carried on the reference, it travels onto the card.
 * - **Both languages or neither.** Every slide carries a Czech and a Ukrainian line, and the
 *   counts cannot drift apart, because a package half-written is a package that will be posted
 *   half-written.
 */
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const StatePathSchema = z.string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^state\/[a-zA-Z0-9._/-]+$/)
  .refine((value) => !value.includes(".."), "State paths cannot traverse directories");

/**
 * Evidence is a fact this repository holds, never a pointer into the product.
 *
 * `factIds` name entries in the committed facts file and `factsHash` pins the copy they were
 * read from. Together they are what makes a claim checkable a year later: the hash says which
 * file, the ids say which lines of it. A dossier ref is optional because research is optional.
 */
export const TehdejsiStoryEvidenceSchema = z.strictObject({
  kind: z.literal("tehdejsi-story"),
  /** The content hash of the facts file at the moment of selection. */
  factsHash: z.string().regex(/^[a-f0-9]{64}$/),
  factIds: z.array(SlugSchema).min(1).max(4),
  /** The recorded shortlist this selection came from. */
  shortlistRef: StatePathSchema,
  /** Research dossiers under state/ventures/tehdejsi-svet/dossiers/, when the desk bought any. */
  dossierRefs: z.array(StatePathSchema).max(6),
  /** The tier the gate decided, which is at or above what the facts file declared. */
  sensitivityTier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  /** Topic ids that raised the tier above the declaration. Empty when nothing raised it. */
  tierRaisedBy: z.array(SlugSchema).max(8),
  /** Whether the terminology table was run, and what it said. `null` findings never mean "clean". */
  terminologyCheck: z.strictObject({
    tableVersion: z.literal("tehdejsi-terminology/1"),
    checkedAt: DateTimeSchema,
    findings: z.array(z.strictObject({
      rule: z.string().min(1).max(120),
      language: z.enum(["cs", "uk"]),
      detail: z.string().min(1).max(500)
    })).max(50)
  })
}).superRefine((evidence, context) => {
  if (new Set(evidence.factIds).size !== evidence.factIds.length) {
    context.addIssue({ code: "custom", path: ["factIds"], message: "Evidence fact ids must be unique" });
  }
  // A recorded tier of 2 with an empty raised-by list is the ordinary case: the file declared it.
  // The reverse cannot happen — something raised the tier and the tier is not 2.
  if (evidence.tierRaisedBy.length > 0 && evidence.sensitivityTier !== 2) {
    context.addIssue({
      code: "custom",
      path: ["sensitivityTier"],
      message: "A raised tier is tier 2; a raise recorded against a lower tier is a lost gate"
    });
  }
  if (evidence.terminologyCheck.findings.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["terminologyCheck", "findings"],
      message: "A package with terminology findings is dropped and never becomes a record"
    });
  }
});
export type TehdejsiStoryEvidence = z.infer<typeof TehdejsiStoryEvidenceSchema>;

/**
 * Licensed imagery, with the obligation attached to the thing it constrains.
 *
 * `attribution` is required and non-empty for every licence that is not the venture's own render,
 * because the one failure mode worth designing against is a photograph that renders beautifully
 * and credits nobody.
 */
export const TehdejsiMediaRefSchema = z.strictObject({
  slideOrdinal: z.number().int().min(1).max(10),
  source: z.string().trim().min(1).max(200),
  sourceUrl: HttpsUrlSchema.nullable(),
  licence: z.enum(["cc-by", "cc-by-sa", "public-domain", "own-render"]),
  attribution: z.string().trim().max(300)
}).superRefine((media, context) => {
  if (media.licence !== "own-render" && media.attribution.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["attribution"],
      message: "A licensed photo renders only with its attribution string"
    });
  }
  if (media.licence === "own-render" && media.attribution.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["attribution"],
      message: "The venture's own render credits nobody but the venture"
    });
  }
});

/** One slide, in both languages. Word caps are the gate's job; length caps are the shape's. */
export const TehdejsiSlideSchema = z.strictObject({
  ordinal: z.number().int().min(1).max(10),
  cs: z.string().trim().min(1).max(400),
  ua: z.string().trim().min(1).max(400)
});

/**
 * The CTA taxonomy, closed.
 *
 * `none` is a real member and the tier-2 default: a feature about the Holodomor ends without an
 * ask, and an open string would let one back in as prose.
 */
export const TehdejsiCtaKindSchema = z.enum([
  "none",
  "ask-your-parents",
  "tag-a-friend",
  "share-your-photo",
  "read-more",
  "product-link"
]);

const PARTICIPATION_CTAS: ReadonlySet<z.infer<typeof TehdejsiCtaKindSchema>> = new Set([
  "ask-your-parents",
  "tag-a-friend",
  "share-your-photo"
]);

const StatusSchema = z.enum(["draft", "approved", "posted", "archived", "rejected"]);

export const TehdejsiRecommendationSchema = z.strictObject({
  schemaVersion: z.literal("venture-recommendation/1"),
  id: SlugSchema,
  ventureId: z.literal("tehdejsi-svet"),
  date: DateSchema,
  cycleId: z.string().min(1).max(120),
  status: StatusSchema,
  evidence: TehdejsiStoryEvidenceSchema,
  payload: z.strictObject({
    slides: z.array(TehdejsiSlideSchema).min(2).max(10),
    captionCs: z.string().trim().min(1).max(2_200),
    captionUa: z.string().trim().min(1).max(2_200),
    ctaKind: TehdejsiCtaKindSchema
  }),
  media: z.array(TehdejsiMediaRefSchema).max(10),
  /**
   * Blocking. A tier-2 package may be drafted and may not leave without the owner, which is a
   * different thing from failing a gate.
   */
  humanReviewRequired: z.boolean(),
  humanReviewedAt: DateTimeSchema.nullable(),
  designLab: z.strictObject({
    /** Recorded rather than derived, for the same reason every other summary is. */
    summaryPath: StatePathSchema.nullable(),
    readyAt: DateTimeSchema.nullable()
  }),
  owner: z.strictObject({
    postedUrls: z.strictObject({ cs: HttpsUrlSchema.nullable(), ua: HttpsUrlSchema.nullable() }),
    rejectionReason: z.string().trim().min(1).max(1_000).nullable()
  }),
  generatedAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).superRefine((record, context) => {
  const ordinals = record.payload.slides.map((slide) => slide.ordinal);
  if (JSON.stringify(ordinals) !== JSON.stringify(ordinals.map((_, index) => index + 1))) {
    context.addIssue({
      code: "custom",
      path: ["payload", "slides"],
      message: "Slide ordinals must be sequential from 1"
    });
  }
  for (const media of record.media) {
    if (!ordinals.includes(media.slideOrdinal)) {
      context.addIssue({
        code: "custom",
        path: ["media"],
        message: `Media names slide ${media.slideOrdinal}, which this package does not have`
      });
    }
  }

  const tier = record.evidence.sensitivityTier;
  // The tier effects, restated where they cannot be skipped. `gates.ts` decides them for a draft
  // in flight; here they are a property of the stored record, so a hand-edited file is refused
  // by the same rule the runner obeys.
  if (record.humanReviewRequired !== (tier === 2)) {
    context.addIssue({
      code: "custom",
      path: ["humanReviewRequired"],
      message: "Human review is required exactly at tier 2"
    });
  }
  if (tier === 2 && PARTICIPATION_CTAS.has(record.payload.ctaKind)) {
    context.addIssue({
      code: "custom",
      path: ["payload", "ctaKind"],
      message: "A tier-2 feature carries no participation CTA"
    });
  }
  if (record.humanReviewRequired && record.humanReviewedAt === null &&
      record.status !== "draft" && record.status !== "rejected") {
    context.addIssue({
      code: "custom",
      path: ["humanReviewedAt"],
      message: "A tier-2 package leaves draft only after the owner has reviewed it"
    });
  }

  const posted = Object.values(record.owner.postedUrls);
  if (record.status === "posted" && posted.some((url) => url === null)) {
    context.addIssue({
      code: "custom",
      path: ["owner", "postedUrls"],
      message: "A posted feature ran in both languages or it did not run"
    });
  }
  if ((record.status === "draft" || record.status === "rejected") && posted.some((url) => url !== null)) {
    context.addIssue({
      code: "custom",
      path: ["owner", "postedUrls"],
      message: "An unapproved package cannot carry posted URLs"
    });
  }
  if ((record.status === "rejected") !== (record.owner.rejectionReason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["owner", "rejectionReason"],
      message: "A rejection carries its reason, and nothing else does"
    });
  }
  if (["approved", "posted", "archived"].includes(record.status) &&
      (record.designLab.summaryPath === null || record.designLab.readyAt === null)) {
    context.addIssue({
      code: "custom",
      path: ["designLab"],
      message: "Approved visual work requires its recorded Design Lab summary"
    });
  }
  if (Date.parse(record.updatedAt) < Date.parse(record.generatedAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt cannot precede generatedAt" });
  }
});

export type TehdejsiRecommendation = z.infer<typeof TehdejsiRecommendationSchema>;
