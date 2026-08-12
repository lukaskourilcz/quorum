import { z } from "zod";

/**
 * The two-day cycle: plan on day A, produce on day B.
 *
 * The desk sits daily but a feature takes two sittings, so the cycle — not the calendar — is
 * what says which work today is. Three rules are in the shape rather than in the runner:
 *
 * - A day is never `skipped`. A sitting that could not finish leaves its day `active` and
 *   records why it stretched, so a missed evening resumes the phase it was on instead of
 *   quietly losing the plan it had already paid for.
 * - `chosenFactIds` belongs to the planning day. Production reads it and never re-selects,
 *   because a second selection would mean the Czech and Ukrainian packages could be written
 *   about different facts.
 * - `stretch` carries a reason and a next attempt. A stretch with neither is a stall dressed
 *   up as a decision.
 */
export const TehdejsiDayStatusSchema = z.enum(["pending", "active", "completed"]);

export const TehdejsiStretchSchema = z.object({
  count: z.number().int().min(1),
  reason: z.enum(["budget-pressure", "review-required", "no-candidate"]),
  nextAttemptOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).strict();

export const TehdejsiCycleSchema = z.object({
  schemaVersion: z.literal("tehdejsi-cycle/1"),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phase: z.enum(["planning", "production"]),
  dayStatuses: z.object({
    planning: TehdejsiDayStatusSchema,
    production: TehdejsiDayStatusSchema
  }).strict(),
  /** The facts the planning day chose. Empty until planning completes; frozen afterwards. */
  chosenFactIds: z.array(z.string().min(1)).max(2),
  shortlistRef: z.string().min(1).nullable(),
  stretch: TehdejsiStretchSchema.nullable(),
  updatedAt: z.iso.datetime({ offset: true })
}).strict().superRefine((cycle, context) => {
  if (cycle.phase === "production" && cycle.dayStatuses.planning !== "completed") {
    context.addIssue({
      code: "custom",
      message: "Production cannot be active before planning completed",
      path: ["phase"]
    });
  }
  if (cycle.dayStatuses.planning === "completed" && cycle.chosenFactIds.length === 0) {
    context.addIssue({
      code: "custom",
      message: "A completed planning day must have chosen at least one fact",
      path: ["chosenFactIds"]
    });
  }
  if (new Set(cycle.chosenFactIds).size !== cycle.chosenFactIds.length) {
    context.addIssue({ code: "custom", message: "Duplicate chosen fact", path: ["chosenFactIds"] });
  }
});
export type TehdejsiCycle = z.infer<typeof TehdejsiCycleSchema>;
