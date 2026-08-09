import { z } from "zod";

/**
 * A period's operating record, written once when the period closes.
 *
 * Recorded, not derived — the same rule the Design Lab summary and the image verdicts follow. A
 * report derived at read time would show a reader today's arithmetic over yesterday's records, and
 * would quietly change whenever a source file changed. This is written the morning after the
 * period ends and never rewritten, except by the retro room patching the one field it owns.
 *
 * Every count that could not be measured is `null`, never `0`: a week with no autonomy snapshot
 * did not have a veto rate of zero, it had no veto rate at all, and the difference is the whole
 * point of writing this down.
 */
export const OpsReportSchema = z.object({
  schemaVersion: z.literal("ops-report/1"),
  period: z.enum(["weekly", "monthly"]),
  /** `2026-W32` for a week, `2026-08` for a month. */
  periodKey: z.string().regex(/^\d{4}-(?:W\d{2}|\d{2})$/),
  generatedAt: z.string().datetime(),
  meetings: z.object({
    scheduled: z.number().int().nonnegative(),
    held: z.number().int().nonnegative(),
    skipped: z.array(z.object({
      date: z.string().date(),
      phase: z.string().min(1).max(80),
      reason: z.string().min(1).max(400)
    })),
    /** Days inside the period with no calendar file at all. Named, never counted as zero. */
    missingDays: z.array(z.string().date())
  }),
  spend: z.object({
    periodUsd: z.number().nonnegative(),
    mtdUsd: z.number().nonnegative(),
    capUsd: z.number().positive(),
    byVenture: z.record(z.string(), z.number().nonnegative())
  }),
  content: z.object({
    published: z.array(z.object({
      ventureId: z.string().min(1).max(80),
      count: z.number().int().nonnegative()
    })),
    /** null when the content gate wrote nothing for this period — off, or never reached. */
    scores: z.object({
      avg: z.number(),
      worst: z.number(),
      best: z.number()
    }).nullable()
  }),
  /** null when no autonomy snapshot covered the period. */
  quality: z.object({
    vetoRate: z.number().nullable(),
    firstPassRate: z.number().nullable(),
    retryRate: z.number().nullable()
  }).nullable(),
  incidents: z.array(z.object({
    kind: z.string().min(1).max(80),
    date: z.string().date(),
    note: z.string().min(1).max(400)
  })),
  fixTasks: z.object({
    opened: z.number().int().nonnegative(),
    closed: z.number().int().nonnegative()
  }),
  perVenture: z.array(z.object({
    ventureId: z.string().min(1).max(80),
    verdictSummary: z.string().min(1).max(280),
    outputs: z.number().int().nonnegative(),
    spendUsd: z.number().nonnegative()
  })),
  /**
   * The judgement layer over the deterministic numbers above, written by the Monday retro room
   * and by nothing else. Null until that room runs, and null forever if it never does — the
   * report is complete without it.
   */
  narrative: z.string().max(2_000).nullable()
});

export type OpsReport = z.infer<typeof OpsReportSchema>;

export function opsReportPath(period: OpsReport["period"], periodKey: string): string {
  return `reports/${period}/${periodKey}.json`;
}
