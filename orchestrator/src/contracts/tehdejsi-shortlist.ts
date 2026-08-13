import { z } from "zod";

/**
 * What the room actually judged, recorded rather than re-derived.
 *
 * The scorer is deterministic, so a later reader could recompute it — and that is exactly the
 * problem. Recomputing with today's scorer would rewrite what a past day decided and make every
 * old selection look like it followed rules that did not exist yet. The breakdown is written
 * beside the rank so a reviewer can see why a fact won on the day it won.
 *
 * Ranks are unique and sequential from 1. A gap or a tie would mean two facts were "first",
 * which is not a ranking.
 */
export const TehdejsiFactorBreakdownSchema = z.object({
  askability: z.number().finite(),
  anniversary: z.number().finite(),
  culturalMoment: z.number().finite(),
  wartimeAwareness: z.number().finite(),
  sourceConfidence: z.number().finite(),
  countryBalance: z.number().finite(),
  tierCost: z.number().finite()
}).strict();

export const TehdejsiShortlistEntrySchema = z.object({
  rank: z.number().int().min(1),
  factId: z.string().min(1),
  score: z.number().finite(),
  factors: TehdejsiFactorBreakdownSchema,
  /** Why this fact cannot be used today, or null when it is eligible. */
  veto: z.enum(["tier-2-review-required", "recently-used"]).nullable()
}).strict();
export type TehdejsiShortlistEntry = z.infer<typeof TehdejsiShortlistEntrySchema>;

export const TehdejsiShortlistSchema = z.object({
  schemaVersion: z.literal("tehdejsi-shortlist/1"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  factsHash: z.string().regex(/^[a-f0-9]{64}$/),
  /** The exact recorded plan whose measured calls affected timing, or null for a neutral run. */
  goViralPlanRef: z.string().regex(/^ventures\/goviral\/plans\/plan-\d{4}-\d{2}-\d{2}-weekly-brief\.json$/).nullable(),
  entries: z.array(TehdejsiShortlistEntrySchema).min(1)
}).strict().superRefine((shortlist, context) => {
  const ranks = shortlist.entries.map((entry) => entry.rank);
  const expected = ranks.map((_, index) => index + 1);
  if (JSON.stringify([...ranks].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
    context.addIssue({ code: "custom", message: "Ranks must be unique and sequential from 1", path: ["entries"] });
  }
  const ids = shortlist.entries.map((entry) => entry.factId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "A fact appears twice in one shortlist", path: ["entries"] });
  }
});
export type TehdejsiShortlist = z.infer<typeof TehdejsiShortlistSchema>;
