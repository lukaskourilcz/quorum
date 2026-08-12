import { z } from "zod";
import { DateSchema, DateTimeSchema } from "./common.js";

/**
 * One plan, written once, before either language exists.
 *
 * The founding decision makes Czech and Ukrainian independent editorial passes over a single
 * canonical brief. That only means anything if the brief is genuinely neutral: a brief already
 * written in Czech turns the Ukrainian pass into a translation with extra steps, which is the
 * exact outcome the anti-mirror rule exists to prevent. So neutrality is checked here rather
 * than trusted.
 *
 * The check is narrow and honest about it. Cyrillic anywhere in the brief is refused outright —
 * it can only mean the plan was drafted in Ukrainian. Czech is not detectable the same way,
 * because a Czech proper noun is exactly what a neutral brief about Vecernicek should contain,
 * and a diacritic ban would refuse the correct brief along with the wrong one. What guards that
 * side is the beat: a slide beat says what the slide must accomplish, and the schema caps it
 * short enough that finished copy does not fit.
 */
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const StatePathSchema = z.string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^state\/[a-zA-Z0-9._/-]+$/)
  .refine((value) => !value.includes(".."), "State paths cannot traverse directories");

const CYRILLIC = /[Ѐ-ӿ]/u;

const NeutralTextSchema = (min: number, max: number) => z.string()
  .trim()
  .min(min)
  .max(max)
  .refine((value) => !CYRILLIC.test(value), "A canonical brief is language-neutral and carries no Cyrillic");

/**
 * A claim, with the facts behind it named before anyone writes a sentence.
 *
 * `factIds` is required and non-empty: a claim that cites nothing cannot be checked, and the
 * production gate has nothing to resolve it against. `singleSourceFraming` marks a claim whose
 * evidence is one source — it may still ship, but only worded as one account rather than as
 * settled fact.
 */
export const TsBriefClaimSchema = z.strictObject({
  claimId: SlugSchema,
  statement: NeutralTextSchema(10, 400),
  factIds: z.array(SlugSchema).min(1).max(4),
  dossierRefs: z.array(StatePathSchema).max(4),
  singleSourceFraming: z.boolean()
});

/** What a slide has to accomplish. Short by design: finished copy does not fit in a beat. */
export const TsSlideBeatSchema = z.strictObject({
  ordinal: z.number().int().min(1).max(10),
  beat: NeutralTextSchema(10, 180),
  /** Claims this slide rests on. Empty for a slide that asks rather than asserts. */
  claimIds: z.array(SlugSchema).max(4)
});

export const TsStoryBriefSchema = z.strictObject({
  schemaVersion: z.literal("ts-story-brief/1"),
  briefId: SlugSchema,
  cycleId: z.string().min(1).max(120),
  date: DateSchema,
  factsHash: z.string().regex(/^[a-f0-9]{64}$/),
  factIds: z.array(SlugSchema).min(1).max(4),
  shortlistRef: StatePathSchema,
  dossierRefs: z.array(StatePathSchema).max(6),
  sensitivityTier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  tierRaisedBy: z.array(SlugSchema).max(8),
  /** The editorial angle, in the working language of the record rather than in either output. */
  angle: NeutralTextSchema(20, 400),
  slideBeats: z.array(TsSlideBeatSchema).min(2).max(10),
  claims: z.array(TsBriefClaimSchema).min(1).max(12),
  ctaKind: z.enum(["none", "ask-your-parents", "tag-a-friend", "share-your-photo", "read-more", "product-link"]),
  contextLineRequired: z.boolean(),
  generatedAt: DateTimeSchema
}).superRefine((brief, context) => {
  const ordinals = brief.slideBeats.map((beat) => beat.ordinal);
  if (JSON.stringify(ordinals) !== JSON.stringify(ordinals.map((_, index) => index + 1))) {
    context.addIssue({ code: "custom", path: ["slideBeats"], message: "Slide beats must be sequential from 1" });
  }
  const claimIds = new Set(brief.claims.map((claim) => claim.claimId));
  if (claimIds.size !== brief.claims.length) {
    context.addIssue({ code: "custom", path: ["claims"], message: "Claim ids must be unique" });
  }
  for (const [index, beat] of brief.slideBeats.entries()) {
    for (const claimId of beat.claimIds) {
      if (!claimIds.has(claimId)) {
        context.addIssue({
          code: "custom",
          path: ["slideBeats", index, "claimIds"],
          message: `Slide ${beat.ordinal} rests on claim ${claimId}, which this brief does not carry`
        });
      }
    }
  }
  // A claim citing a fact the brief did not select is a claim about something the desk never
  // chose to write about, which is how an unrelated fact reaches a package unnoticed.
  for (const [index, claim] of brief.claims.entries()) {
    for (const factId of claim.factIds) {
      if (!brief.factIds.includes(factId)) {
        context.addIssue({
          code: "custom",
          path: ["claims", index, "factIds"],
          message: `Claim ${claim.claimId} cites fact ${factId}, which this brief did not select`
        });
      }
    }
    for (const dossierRef of claim.dossierRefs) {
      if (!brief.dossierRefs.includes(dossierRef)) {
        context.addIssue({
          code: "custom",
          path: ["claims", index, "dossierRefs"],
          message: `Claim ${claim.claimId} cites a dossier this brief did not read`
        });
      }
    }
  }
  if (brief.tierRaisedBy.length > 0 && brief.sensitivityTier !== 2) {
    context.addIssue({
      code: "custom",
      path: ["sensitivityTier"],
      message: "A raised tier is tier 2; a raise recorded against a lower tier is a lost gate"
    });
  }
  if (brief.contextLineRequired !== (brief.sensitivityTier === 1)) {
    context.addIssue({
      code: "custom",
      path: ["contextLineRequired"],
      message: "The honest context line is required exactly at tier 1"
    });
  }
  if (brief.sensitivityTier === 2 &&
      ["ask-your-parents", "tag-a-friend", "share-your-photo"].includes(brief.ctaKind)) {
    context.addIssue({
      code: "custom",
      path: ["ctaKind"],
      message: "A tier-2 brief plans no participation CTA"
    });
  }
});

export type TsStoryBrief = z.infer<typeof TsStoryBriefSchema>;
export type TsBriefClaim = z.infer<typeof TsBriefClaimSchema>;
export type TsSlideBeat = z.infer<typeof TsSlideBeatSchema>;
