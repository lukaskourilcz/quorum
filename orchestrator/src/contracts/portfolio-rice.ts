import { z } from "zod";
import { DateTimeSchema, VentureIdSchema, openObject } from "./common.js";

/**
 * Reach x Impact x Confidence / Effort for the venture portfolio, recorded and never enforced.
 *
 * Two halves with opposite provenance, which is why they are two schemas. The input file is what
 * the owner types: Reach and Impact are judgements no code in this repository may invent, and
 * `METRICS_INGESTION_ENABLED=false` means there is no audience number to derive Reach from
 * either. The ranking is what the scorer derives: Effort from the registry's declared room
 * envelopes and Confidence from the share of a venture's quarterly KPIs that were actually
 * measured. A row is scored only when all four exist; otherwise it names what is missing.
 */

/** Intercom's impact ladder: minimal, low, medium, high, massive. */
export const RICE_IMPACT_STEPS = [0.25, 0.5, 1, 2, 3] as const;

export const RiceImpactSchema = z.union([
  z.literal(0.25),
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
  z.literal(3)
]);

export const RiceSubjectKindSchema = z.enum(["venture", "experiment"]);

export const RicePostureSchema = z.enum(["information-only", "owner-enforced"]);

export const RiceSubjectInputSchema = openObject({
  id: VentureIdSchema,
  kind: RiceSubjectKindSchema,
  label: z.string().min(1).max(120),
  /**
   * How many people the subject reaches per quarter.
   *
   * `null` is the correct entry until the owner supplies a figure. Nothing here may substitute a
   * guess: a rate with no denominator and a count nobody measured are absences, and an invented
   * Reach would make every score downstream a fabricated metric.
   */
  reach: z.number().finite().nonnegative().nullable(),
  impact: RiceImpactSchema.nullable(),
  /** Where the owner's two numbers came from, or why they are still absent. */
  source: z.string().min(1).max(400)
});

export const PortfolioRiceInputSchema = openObject({
  schemaVersion: z.literal("portfolio-rice/1"),
  updatedAt: z.iso.date(),
  posture: RicePostureSchema,
  /**
   * Whether the owner has asked the ranking to decide anything. It never does so on its own:
   * `resolveRiceEnforcement` additionally requires a countersigned decision record, and no room,
   * schedule or budget path in this repository reads the result either way.
   */
  rankingEnforced: z.boolean(),
  decisionRef: z.string().min(1).max(200),
  subjects: z.array(RiceSubjectInputSchema).min(1).max(60)
}).superRefine((file, context) => {
  const ids = file.subjects.map((subject) => subject.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Subject ids must be unique", path: ["subjects"] });
  }
  if (file.rankingEnforced && file.posture !== "owner-enforced") {
    context.addIssue({
      code: "custom",
      message: "An enforced ranking must declare posture owner-enforced",
      path: ["rankingEnforced"]
    });
  }
});

export const RiceRowStatusSchema = z.enum(["scored", "unavailable"]);

export const RiceMissingInputSchema = z.enum(["reach", "impact", "confidence", "effort"]);

export const RiceEffortComponentSchema = openObject({
  phase: z.string().min(1).max(60),
  envelopeUsd: z.number().finite().nonnegative(),
  runsPerMonth: z.number().finite().nonnegative()
});

export const RiceRowSchema = openObject({
  id: VentureIdSchema,
  kind: RiceSubjectKindSchema,
  label: z.string().min(1).max(120),
  reach: z.number().finite().nonnegative().nullable(),
  impact: RiceImpactSchema.nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  /** The denominator, so a reader can tell 0.0 from "nothing was measured". */
  confidenceBasis: openObject({
    measuredKpis: z.number().int().nonnegative(),
    totalKpis: z.number().int().nonnegative()
  }),
  effortUsdPerMonth: z.number().finite().nonnegative(),
  effortBasis: z.array(RiceEffortComponentSchema).max(20),
  score: z.number().finite().nonnegative().nullable(),
  status: RiceRowStatusSchema,
  missingInputs: z.array(RiceMissingInputSchema).max(4),
  source: z.string().min(1).max(400)
}).superRefine((row, context) => {
  const scored = row.status === "scored";
  if (scored !== (row.score !== null)) {
    context.addIssue({ code: "custom", message: "A scored row has a score and an unavailable row has none", path: ["score"] });
  }
  if (scored !== (row.missingInputs.length === 0)) {
    context.addIssue({ code: "custom", message: "An unavailable row names at least one missing input", path: ["missingInputs"] });
  }
  if (new Set(row.missingInputs).size !== row.missingInputs.length) {
    context.addIssue({ code: "custom", message: "Missing inputs must be unique", path: ["missingInputs"] });
  }
});

export const PortfolioRiceRankingSchema = openObject({
  schemaVersion: z.literal("portfolio-rice-ranking/1"),
  quarterId: z.string().regex(/^\d{4}-Q[1-4]$/),
  generatedAt: DateTimeSchema,
  method: z.literal("reach x impact x confidence / effort-usd-per-month"),
  posture: RicePostureSchema,
  enforcement: RicePostureSchema,
  /** Why the ranking decides nothing. Empty only when the owner has both switched and signed. */
  enforcementHeldBecause: z.array(z.string().min(1).max(200)).max(4),
  rows: z.array(RiceRowSchema).max(60),
  /** `ROOM_DEGRADATION_ORDER`, lowest-priority room first, exactly as the schedule enforces it. */
  declaredDegradationOrder: z.array(z.string().min(1).max(60)).max(20),
  /** The same order collapsed to the ventures those rooms belong to. */
  declaredVentureOrder: z.array(VentureIdSchema).max(20),
  /**
   * Whether the scores put those ventures in the order the schedule already drops them in.
   *
   * `null` when the comparison cannot be made because at least one of those ventures is
   * unscored. A disagreement is evidence for an owner decision, never a change to the order.
   */
  agreesWithDeclaredOrder: z.boolean().nullable(),
  comparison: openObject({
    comparableVentures: z.array(VentureIdSchema).max(20),
    scoredAscending: z.array(VentureIdSchema).max(20),
    unavailableVentures: z.array(VentureIdSchema).max(20)
  })
}).superRefine((ranking, context) => {
  if (ranking.enforcement === "owner-enforced" && ranking.enforcementHeldBecause.length > 0) {
    context.addIssue({ code: "custom", message: "An enforced ranking names no hold", path: ["enforcementHeldBecause"] });
  }
  if (ranking.enforcement === "information-only" && ranking.enforcementHeldBecause.length === 0) {
    context.addIssue({ code: "custom", message: "A held ranking says what holds it", path: ["enforcementHeldBecause"] });
  }
});

export type RiceImpact = z.infer<typeof RiceImpactSchema>;
export type RiceSubjectKind = z.infer<typeof RiceSubjectKindSchema>;
export type RicePosture = z.infer<typeof RicePostureSchema>;
export type RiceSubjectInput = z.infer<typeof RiceSubjectInputSchema>;
export type PortfolioRiceInput = z.infer<typeof PortfolioRiceInputSchema>;
export type RiceRow = z.infer<typeof RiceRowSchema>;
export type RiceMissingInput = z.infer<typeof RiceMissingInputSchema>;
export type PortfolioRiceRanking = z.infer<typeof PortfolioRiceRankingSchema>;
