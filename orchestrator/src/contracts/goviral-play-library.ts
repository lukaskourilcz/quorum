import { z } from "zod";
import { DateSchema, EvidenceRefSchema, VentureIdSchema } from "./common.js";
import { RiceImpactSchema } from "./portfolio-rice.js";

/**
 * GoVIRAL's play library: the marketing moves that worked, rated on one scale.
 *
 * A play is a repeatable move — a hook shape, a posting rhythm, a distribution step — not a post.
 * Three things make a stored play worth more than a memory, and each is a field below: the
 * screenshot that shows it actually ran, the benchmark it beat, and a RICE rating that lets a play
 * for a magazine with readers be compared with a play for an account that does not exist yet.
 *
 * The library is written by the owner, not by a room. Nothing in this repository can observe a
 * marketing result — there is no analytics integration, no follower count and no click number — so
 * a play that claimed a measured reach without a citation would be a fabricated metric. The
 * refinements below are what stops that: measured reach needs an evidence ref, an unbenchmarked
 * play cannot claim high confidence, and a benchmark has to state which direction is better before
 * it may claim it beat anything.
 */

export const GOVIRAL_PLAY_CATEGORIES = [
  "hook",
  "format",
  "distribution",
  "search",
  "community",
  "cadence",
  "conversion"
] as const;

/**
 * Confidence is not shared. The portfolio ranking derives it from the share of a venture's KPIs
 * that were actually measured; a play has no KPI set, so it uses Intercom's own three steps —
 * high 100%, medium 80%, low 50% — and nothing between them.
 */
export const RICE_CONFIDENCE_VALUES = [0.5, 0.8, 1] as const;

/**
 * Reach, the one place this library departs from Intercom.
 *
 * Intercom counts people per time period. This portfolio cannot: DNESKAi has readers it does not
 * measure, WebDev Signal's accounts do not exist, and a headcount typed into a JSON file would be
 * an invented number wearing a unit. So reach is a band of the venture's **own** reachable
 * audience per month, which is what makes a score comparable across ventures whose absolute reach
 * differs by orders of magnitude — the question is always "how much of this audience does the play
 * touch", never "how many people".
 *
 * The table is versioned by `reachScale` on the library so a future re-banding cannot silently
 * rescore plays rated under this one.
 */
export const GOVIRAL_REACH_BANDS: Readonly<Record<number, string>> = {
  1: "a handful of the venture's audience — one thread, one reply, one person",
  2: "a named few — a small list, a single community post",
  3: "a tenth or less of the audience, one surface, once",
  4: "roughly a fifth of the audience",
  5: "roughly a third of the audience",
  6: "about half the audience",
  7: "most of the audience, one surface",
  8: "most of the audience, repeated across the month",
  9: "effectively the whole audience",
  10: "the whole audience plus reach beyond it — the play is how new readers arrive"
};

const PlayIdSchema = z.string().regex(/^play-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

export const GoViralPlayReachSchema = z.strictObject({
  band: z.number().int().min(1).max(10),
  /** `measured` requires a citation on the play; `estimate` is the honest default. */
  basis: z.enum(["measured", "estimate"]),
  note: z.string().trim().min(1).max(240)
});

export const GoViralPlayBenchmarkSchema = z.strictObject({
  metric: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(40),
  direction: z.enum(["higher-is-better", "lower-is-better"]),
  baseline: z.number().finite(),
  achieved: z.number().finite(),
  measuredOver: z.string().trim().min(1).max(120),
  sourceRef: EvidenceRefSchema
}).superRefine((benchmark, context) => {
  const beat = benchmark.direction === "higher-is-better"
    ? benchmark.achieved > benchmark.baseline
    : benchmark.achieved < benchmark.baseline;
  if (!beat) {
    context.addIssue({
      code: "custom",
      path: ["achieved"],
      message: "A benchmark records what the play beat; store the loss as a note instead"
    });
  }
});

/**
 * The screenshot is evidence the play ran, and it is admin-only for the same reason the founding
 * decision forbids republishing a scraped post: a capture of somebody else's surface is theirs.
 * `subject` is what stops the library becoming a scrape archive — a capture is either of our own
 * surface or one the owner took and is willing to hold.
 */
export const GoViralPlayScreenshotSchema = z.strictObject({
  path: z.string().regex(/^state\/ventures\/goviral\/plays\/screenshots\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|jpg|webp)$/),
  alt: z.string().trim().min(1).max(240),
  capturedAt: DateSchema,
  subject: z.enum(["own-surface", "owner-supplied"]),
  visibility: z.literal("admin-only")
});

export const GoViralPlaySchema = z.strictObject({
  id: PlayIdSchema,
  title: z.string().trim().min(1).max(160),
  category: z.enum(GOVIRAL_PLAY_CATEGORIES),
  /** The venture the play belongs to, or null when it is portfolio-wide craft. */
  ventureId: VentureIdSchema.nullable(),
  summary: z.string().trim().min(1).max(600),
  /** Printed beside the title the way Marketing Examples prints it, so the owner can pick by time. */
  readTimeMinutes: z.number().int().min(1).max(30),
  reach: GoViralPlayReachSchema,
  /**
   * Intercom's impact ladder, shared with the portfolio ranking rather than copied: two files
   * holding the same five numbers are two files that will disagree the first time one is revisited.
   * https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/
   */
  impact: RiceImpactSchema,
  confidence: z.union([z.literal(0.5), z.literal(0.8), z.literal(1)]),
  /** Intercom counts person-months. One person runs this portfolio and no play here takes a month. */
  effortPersonWeeks: z.number().finite().positive().max(52),
  benchmark: GoViralPlayBenchmarkSchema.nullable(),
  screenshot: GoViralPlayScreenshotSchema.nullable(),
  evidenceRefs: z.array(EvidenceRefSchema).max(12),
  recordedAt: DateSchema
}).superRefine((play, context) => {
  if (play.reach.basis === "measured" && play.evidenceRefs.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["evidenceRefs"],
      message: "A measured reach band requires the reading it was measured from"
    });
  }
  // The rating and the proof move together. Without a benchmark there is nothing behind the
  // number but an opinion, and Intercom's own scale has a value for that: 50%.
  if (play.benchmark === null && play.confidence > 0.5) {
    context.addIssue({
      code: "custom",
      path: ["confidence"],
      message: "A play with no benchmark cannot claim more than 50% confidence"
    });
  }
  if (new Set(play.evidenceRefs).size !== play.evidenceRefs.length) {
    context.addIssue({ code: "custom", path: ["evidenceRefs"], message: "Evidence references must be unique" });
  }
});

export const GoViralPlayLibrarySchema = z.strictObject({
  schemaVersion: z.literal("goviral-play-library/1"),
  ventureId: z.literal("goviral"),
  /** Pins which band table the stored bands were assigned under. */
  reachScale: z.literal("reach-band/1"),
  updatedAt: DateSchema,
  plays: z.array(GoViralPlaySchema).max(200)
}).superRefine((library, context) => {
  const ids = library.plays.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["plays"], message: "Play ids must be unique" });
  }
});

export type GoViralPlay = z.infer<typeof GoViralPlaySchema>;
export type GoViralPlayLibrary = z.infer<typeof GoViralPlayLibrarySchema>;
export type GoViralPlayBenchmark = z.infer<typeof GoViralPlayBenchmarkSchema>;

/**
 * RICE, with reach as a band: (band × impact × confidence) ÷ effort in person-weeks.
 *
 * Rounded to one decimal because the inputs are a ten-step band and a five-step impact scale;
 * printing more digits than the inputs carry reads as precision the rating does not have.
 */
export function riceScore(play: Pick<GoViralPlay, "reach" | "impact" | "confidence" | "effortPersonWeeks">): number {
  return Math.round((play.reach.band * play.impact * play.confidence / play.effortPersonWeeks) * 10) / 10;
}
