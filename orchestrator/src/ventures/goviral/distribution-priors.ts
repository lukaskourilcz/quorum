import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot as defaultConfigRoot } from "../../paths.js";

/**
 * What GoVIRAL is allowed to assume about a platform, and who said it.
 *
 * The room used to carry its platform craft as prose in `prompts/goviral.md` — "one to two feed
 * posts a day is the ceiling", "fewer hashtags outperform stuffing" — and none of it named a
 * source. Prose like that cannot be corrected, because there is nothing to check it against. So
 * the numbers moved here, where every one of them carries the URL that published it and a
 * `claimKind` saying what kind of statement it is.
 *
 * Three rules hold the file together:
 *
 * - **A claim is only as strong as its kind.** `platform-documented` is the operator publishing
 *   its own mechanism; `industry-estimate` is a marketing blog. They are both allowed in, they
 *   are never allowed to weigh the same, and `house-assumption` marks the ones that are ours to
 *   defend rather than somebody else's to be quoted for.
 * - **An unpublished figure is `null`, never `0`.** AMI Digital published no Czech figure for
 *   Threads, LinkedIn or YouTube. A zero there would say those networks have no Czech audience,
 *   which is a claim nobody made and we would have invented.
 * - **Nothing here is our own measurement.** This repository measures no reach, no impressions
 *   and no followers. A prior is somebody else's reading imported with its provenance, and a room
 *   that presents one as our own result has fabricated a metric.
 *
 * Nothing in this module reads a clock, opens a socket, calls a model or costs a cent.
 */

export const ClaimKindSchema = z.enum([
  "platform-documented",
  "platform-stated",
  "representative-survey",
  "industry-estimate",
  "house-assumption"
]);
export const PlatformPostureSchema = z.enum(["primary", "secondary", "plan-only", "unmeasured", "negligible"]);
export const ReachTrendSchema = z.enum(["recovering", "stable", "declining", "unknown"]);
export const DistributionSignalSchema = z.enum(["send", "save", "watch-time", "reply", "like", "comment"]);

export type ClaimKind = z.infer<typeof ClaimKindSchema>;
export type PlatformPosture = z.infer<typeof PlatformPostureSchema>;
export type DistributionSignal = z.infer<typeof DistributionSignalSchema>;

const UrlSchema = z.string().url().max(400);

/**
 * `evidenceUrl` is nullable and the note is then the only thing standing behind the claim. That is
 * deliberate: the LinkedIn dwell-time rule everybody repeats has no operator source, and citing a
 * blog that repeats it would dress an estimate as evidence.
 */
const ClaimSchema = z.strictObject({
  statement: z.string().trim().min(1).max(400),
  claimKind: ClaimKindSchema,
  evidenceUrl: UrlSchema.nullable(),
  note: z.string().trim().max(600).optional()
}).superRefine((claim, context) => {
  if (claim.evidenceUrl === null && !claim.note) {
    context.addIssue({ code: "custom", path: ["note"], message: "a claim with no URL must say in its note why there is none" });
  }
});

const ReadingSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80),
  label: z.string().trim().min(1).max(160),
  value: z.number().finite(),
  unit: z.enum(["minutes", "percent"]),
  priorValue: z.number().finite().nullable(),
  direction: z.enum(["rising", "declining", "stable", "unknown"]),
  note: z.string().trim().max(400)
});

const AudienceStudySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80),
  title: z.string().trim().min(1).max(160),
  publisher: z.string().trim().min(1).max(120),
  fieldwork: z.string().trim().min(1).max(160),
  sampleSize: z.number().int().positive().max(1_000_000),
  population: z.string().trim().min(1).max(200),
  claimKind: ClaimKindSchema,
  evidenceUrl: UrlSchema,
  corroboratingUrls: z.array(UrlSchema).max(6),
  $note: z.string().trim().max(600).optional(),
  readings: z.array(ReadingSchema).min(1).max(24)
});

const SignalWeightSchema = z.strictObject({
  id: DistributionSignalSchema,
  label: z.string().trim().min(1).max(120),
  weight: z.number().min(0).max(1),
  claimKind: ClaimKindSchema,
  evidenceUrl: UrlSchema.nullable(),
  note: z.string().trim().max(800)
});

const PlatformSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(40),
  label: z.string().trim().min(1).max(60),
  czechRegularUsePercent: z.number().min(0).max(100).nullable(),
  czechReadingNote: z.string().trim().min(1).max(400),
  reachTrend: ReachTrendSchema,
  posture: PlatformPostureSchema,
  postureReason: z.string().trim().min(1).max(600),
  documentedSignals: z.array(DistributionSignalSchema).max(6),
  claims: z.array(ClaimSchema).min(1).max(12)
});

export const PlayRatingComponentNameSchema = z.enum(["czech-audience", "signal-fit", "loop-fit"]);
export type PlayRatingComponentName = z.infer<typeof PlayRatingComponentNameSchema>;

const PlayRatingConfigSchema = z.strictObject({
  weights: z.record(PlayRatingComponentNameSchema, z.number().min(0).max(1)),
  leadScore: z.number().min(0).max(100)
});

export const GoViralDistributionPriorsSchema = z.strictObject({
  schemaVersion: z.literal("goviral-distribution-priors/1"),
  priorsVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  $comment: z.string().optional(),
  $claimKindComment: z.string().optional(),
  $signalComment: z.string().optional(),
  $platformComment: z.string().optional(),
  $playRatingComment: z.string().optional(),
  audienceStudy: AudienceStudySchema,
  signals: z.array(SignalWeightSchema).min(1).max(12),
  /** How far a signal is discounted on a platform that does not document predicting it. */
  undocumentedSignalFactor: z.number().min(0).max(1),
  playRating: PlayRatingConfigSchema,
  platforms: z.array(PlatformSchema).min(1).max(20)
// The key schemas already refuse a malformed entry. These two checks are the ones they cannot
// make: that the signal weights are a distribution rather than a pile of numbers, and that no
// platform or signal is declared twice under the same id.
}).superRefine((priors, context) => {
  const total = priors.signals.reduce((sum, signal) => sum + signal.weight, 0);
  if (Math.abs(total - 1) > 1e-9) {
    context.addIssue({ code: "custom", path: ["signals"], message: "signal weights must sum to exactly 1" });
  }
  const playTotal = PlayRatingComponentNameSchema.options.reduce((sum, name) => sum + priors.playRating.weights[name], 0);
  if (Math.abs(playTotal - 1) > 1e-9) {
    context.addIssue({ code: "custom", path: ["playRating", "weights"], message: "play rating weights must sum to exactly 1" });
  }
  if (new Set(priors.signals.map((signal) => signal.id)).size !== priors.signals.length) {
    context.addIssue({ code: "custom", path: ["signals"], message: "a signal may be weighted once" });
  }
  if (new Set(priors.platforms.map((platform) => platform.id)).size !== priors.platforms.length) {
    context.addIssue({ code: "custom", path: ["platforms"], message: "a platform may be declared once" });
  }
  for (const [index, platform] of priors.platforms.entries()) {
    const undocumented = platform.documentedSignals.filter(
      (signal) => !priors.signals.some((weighted) => weighted.id === signal)
    );
    if (undocumented.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["platforms", index, "documentedSignals"],
        message: `documents a signal this file does not weight: ${undocumented.join(", ")}`
      });
    }
  }
});

export type GoViralDistributionPriors = z.infer<typeof GoViralDistributionPriorsSchema>;
export type DistributionPlatform = z.infer<typeof PlatformSchema>;

export async function loadGoViralDistributionPriors(configRoot = defaultConfigRoot): Promise<GoViralDistributionPriors> {
  return GoViralDistributionPriorsSchema.parse(
    JSON.parse(await readFile(path.join(configRoot, "goviral-distribution-priors.json"), "utf8"))
  );
}

export function distributionPlatform(
  priors: GoViralDistributionPriors,
  platformId: string
): DistributionPlatform | null {
  return priors.platforms.find((platform) => platform.id === platformId) ?? null;
}

/**
 * The Czech audience share a platform brings, on 0-1.
 *
 * `null` when nobody published one. A caller renormalizes it away rather than reading it as a
 * platform with no Czech audience — Threads has readers here and simply has no published figure.
 */
export function czechAudiencePrior(platform: DistributionPlatform): number | null {
  return platform.czechRegularUsePercent === null ? null : platform.czechRegularUsePercent / 100;
}

/**
 * How well a play's intended signals match what the platform documents predicting.
 *
 * A signal the platform documents counts at its full weight. A signal it does not counts at
 * `undocumentedSignalFactor`, because a play built on an undocumented mechanic is not worthless —
 * it is just an assumption, and an assumption should not rank beside a published mechanic. The
 * result is normalized over the weights the play actually declared, so a focused two-signal play
 * is not punished for being focused.
 *
 * `null` when the play declared no signal at all, which is an absence and not a zero.
 */
export function signalFit(
  priors: GoViralDistributionPriors,
  platform: DistributionPlatform,
  intendedSignals: readonly DistributionSignal[]
): number | null {
  const declared = [...new Set(intendedSignals)];
  if (declared.length === 0) return null;
  let earned = 0;
  let available = 0;
  for (const signal of declared) {
    const weighted = priors.signals.find((candidate) => candidate.id === signal);
    if (!weighted) continue;
    available += weighted.weight;
    earned += weighted.weight * (platform.documentedSignals.includes(signal) ? 1 : priors.undocumentedSignalFactor);
  }
  return available === 0 ? null : earned / available;
}

/** The signals this file rates highest, strongest first. What a play should be built to earn. */
export function rankedSignals(priors: GoViralDistributionPriors): readonly DistributionSignal[] {
  return [...priors.signals]
    .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id, "en"))
    .map((signal) => signal.id);
}

/**
 * The priors as one deterministic block.
 *
 * The room reads the numbers from here rather than from its prompt, so a corrected figure is a
 * config edit instead of a prompt rewrite that four seats then quote differently for a month.
 *
 * `packet` is what the meeting gets and it is short on purpose: the gv-brief envelope is $0.06
 * and the packet is capped at eighteen thousand characters it already shares with the scout
 * snapshot, the owner profile and the idea index. The full rendering — every claim with its kind
 * and its URL — is for a human reading the file, and it is the one that makes the separation
 * between what Meta documents and what the industry claims legible in one place.
 */
export function renderDistributionPriorsBrief(
  priors: GoViralDistributionPriors,
  options: { detail?: "packet" | "full" } = {}
): string {
  const study = priors.audienceStudy;
  const headline = study.readings
    .map((reading) => `${reading.label} — ${reading.value}${reading.unit === "percent" ? " %" : " minutes"}`)
    .join("; ");
  const platforms = priors.platforms
    .map((platform) => {
      const share = platform.czechRegularUsePercent === null
        ? "no published Czech figure"
        : `${platform.czechRegularUsePercent}% of Czech internet users`;
      const documented = platform.documentedSignals.length > 0
        ? `documents ${platform.documentedSignals.join(", ")}`
        : "no documented ranking signals on file";
      return `- ${platform.label} — ${share}, trend ${platform.reachTrend}, posture ${platform.posture}. ${platform.postureReason} (${documented}.)`;
    })
    .join("\n");
  const blocks = [
    `Czech distribution priors, verified ${priors.verifiedAt}. These are somebody else's published readings, not our measurements. Never restate one as a result of ours, and never state a reach, impression or follower number, because this repository measures none.`,
    `${study.title} — ${study.publisher}, ${study.fieldwork}, n=${study.sampleSize}, ${study.population}: ${headline}. ${study.evidenceUrl}`,
    `Rate a play by what it is built to earn, strongest first: ${rankedSignals(priors).join(" > ")}. Sends, replies and time spent are mechanics Meta documents; the save is an industry reading and must be named as one.`,
    "Platforms:",
    platforms
  ];
  if (options.detail !== "full") return blocks.join("\n\n");
  const readings = study.readings
    .map((reading) => `- ${reading.label}: ${reading.value} ${reading.unit}${reading.priorValue === null ? "" : ` (was ${reading.priorValue})`}. ${reading.note}`)
    .join("\n");
  const claims = priors.platforms
    .flatMap((platform) => platform.claims.map((claim) => `- [${claim.claimKind}] ${platform.label}: ${claim.statement}${claim.evidenceUrl ? ` (${claim.evidenceUrl})` : " (no source URL — see the note in config)"}`))
    .join("\n");
  return [...blocks, "Every reading in the study:", readings, "Every platform claim with its kind:", claims].join("\n\n");
}
