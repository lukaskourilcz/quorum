import { z } from "zod";
import {
  czechAudiencePrior,
  distributionPlatform,
  signalFit,
  DistributionSignalSchema,
  PlayRatingComponentNameSchema,
  type DistributionSignal,
  type GoViralDistributionPriors,
  type PlatformPosture,
  type PlayRatingComponentName
} from "./distribution-priors.js";
import { loopContribution, type GrowthLoop } from "./growth-loops.js";

/**
 * Rate one marketing play against the Czech market and against its venture's growth loop.
 *
 * The room already ranks *signals* — what is rising. This ranks *plays* — what to do about it —
 * and the two are not the same question. A rising topic on X is still a play in front of seven
 * percent of the country, and a brilliant carousel that feeds no stage of a loop is a good
 * afternoon rather than a business.
 *
 * The arithmetic inherits the signal scorer's discipline verbatim, because the reasons were the
 * same both times:
 *
 * - **A component nobody could measure is `null` and is renormalized away, never scored `0`.**
 *   Threads has no published Czech audience figure. Scoring that as zero would rank every Threads
 *   play below every TikTok play on the strength of a number nobody published.
 * - **Every component keeps its raw reading and its weight**, so a score decomposes back into
 *   what produced it and a room can be argued out of one.
 * - **The verdict is not the score.** A play can score well on a surface nothing here may post
 *   to; that is `plan-only`, and collapsing it into a number would hide the fact.
 *
 * Nothing here reads a clock, opens a socket, calls a model or costs a cent. A play that would
 * cost anything is refused rather than priced: money goes to `state/INBOX.md` as HUMAN_APPROVAL
 * and never through a scorer.
 */

export const GoViralPlaySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  ventureId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80),
  title: z.string().trim().min(1).max(200),
  /** A platform id from `config/goviral-distribution-priors.json`. An unknown one fails closed. */
  platform: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(40),
  /** What the play is built to earn. Empty is allowed and reads as "nobody said", not "nothing". */
  intendedSignals: z.array(DistributionSignalSchema).max(6),
  /** Stage ids of the venture's loop this play is meant to turn. */
  loopStageIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80)).max(8),
  /** Zero for every play this system may propose. Anything above it is an owner decision. */
  estimatedCostUsd: z.number().min(0).max(10_000)
});

export type GoViralPlay = z.infer<typeof GoViralPlaySchema>;

export const PlayVerdictSchema = z.enum([
  "unknown-surface",
  "skip",
  "needs-approval",
  "test-first",
  "plan-only",
  "lead",
  "support"
]);
export type PlayVerdict = z.infer<typeof PlayVerdictSchema>;

export interface PlayRatingComponent {
  name: PlayRatingComponentName;
  /** `null` when nothing measured it. Renormalized away rather than scored zero. */
  rawValue: number | null;
  weight: number;
  contribution: number | null;
  note: string;
}

export interface PlayRating {
  playId: string;
  ventureId: string;
  platform: string;
  posture: PlatformPosture | null;
  components: readonly PlayRatingComponent[];
  /** 0-100 over the components that were measured, or `null` when none of them were. */
  score: number | null;
  verdict: PlayVerdict;
  notes: readonly string[];
  spendApprovalRequired: boolean;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

/**
 * Which verdict wins when several apply.
 *
 * `skip` outranks `needs-approval` on purpose: telling the owner that a play on a seven-percent
 * network also needs a spend decision invites them to make that decision. The cheaper answer is
 * that the network is not worth the play.
 */
function decideVerdict(input: {
  posture: PlatformPosture;
  score: number | null;
  leadScore: number;
  costUsd: number;
}): PlayVerdict {
  if (input.posture === "negligible") return "skip";
  if (input.costUsd > 0) return "needs-approval";
  if (input.posture === "unmeasured") return "test-first";
  if (input.posture === "plan-only") return "plan-only";
  if (input.score === null) return "support";
  return input.score >= input.leadScore ? "lead" : "support";
}

export function rateGoViralPlay(input: {
  play: GoViralPlay;
  priors: GoViralDistributionPriors;
  loop: GrowthLoop | null;
}): PlayRating {
  const { play, priors, loop } = input;
  const platform = distributionPlatform(priors, play.platform);
  const notes: string[] = [];

  // Fail closed on a surface this file has never heard of. Guessing a prior for it would be
  // exactly the invented metric every rule in this venture exists to prevent.
  if (!platform) {
    return {
      playId: play.id,
      ventureId: play.ventureId,
      platform: play.platform,
      posture: null,
      components: [],
      score: null,
      verdict: "unknown-surface",
      notes: [`${play.platform} is not in config/goviral-distribution-priors.json, so nothing is known about its audience or its ranking. Add it there with its sources before rating a play for it.`],
      spendApprovalRequired: play.estimatedCostUsd > 0
    };
  }

  const audience = czechAudiencePrior(platform);
  const fit = signalFit(priors, platform, play.intendedSignals);
  const contribution = loop ? loopContribution(loop, play.loopStageIds) : null;

  if (audience === null) notes.push(`${platform.label}: ${platform.czechReadingNote}`);
  if (fit === null) notes.push("The play names no signal it is built to earn, so signal fit could not be measured. Say whether it is written for a send, a save, a reply or a like.");
  if (!loop) notes.push(`No growth loop is recorded for ${play.ventureId}; see unrecordedVentures in config/goviral-growth-loops.json for why.`);
  if (contribution && contribution.blockedStages.length > 0) {
    notes.push(`Aimed at ${contribution.blockedStages.join(", ")}, which do not run. Those stages earn the play nothing until the owner unblocks them.`);
  }
  if (contribution && contribution.unknownStages.length > 0) {
    notes.push(`Names stages this loop does not have: ${contribution.unknownStages.join(", ")}.`);
  }
  if (contribution?.closesLoop) notes.push("Turns the stage that feeds the loop back to its start.");
  if (platform.reachTrend === "declining") {
    notes.push(`${platform.label} is on a measured decline; plan for a smaller audience next year, not the same one.`);
  }
  if (play.estimatedCostUsd > 0) {
    notes.push(`This play would cost $${play.estimatedCostUsd.toFixed(2)}. Nothing here may spend: record it in state/INBOX.md as HUMAN_APPROVAL and leave it unrun until the owner decides.`);
  }

  const raw: Record<PlayRatingComponentName, { value: number | null; note: string }> = {
    "czech-audience": {
      value: audience,
      note: audience === null ? platform.czechReadingNote : `${platform.czechRegularUsePercent}% of Czech internet users, trend ${platform.reachTrend}.`
    },
    "signal-fit": {
      value: fit,
      note: fit === null
        ? "No intended signal declared."
        : `Declared ${play.intendedSignals.join(", ") || "nothing"}; ${platform.label} documents ${platform.documentedSignals.join(", ") || "none of them"}.`
    },
    "loop-fit": {
      value: contribution?.fit ?? null,
      note: contribution
        ? `Turns ${contribution.touchedStages.length} of ${contribution.liveStages} live stage${contribution.liveStages === 1 ? "" : "s"}.`
        : "No loop recorded for this venture."
    }
  };

  const components: PlayRatingComponent[] = PlayRatingComponentNameSchema.options.map((name) => ({
    name,
    rawValue: raw[name].value === null ? null : round(raw[name].value),
    weight: priors.playRating.weights[name],
    contribution: raw[name].value === null ? null : round(raw[name].value * priors.playRating.weights[name]),
    note: raw[name].note
  }));

  // Renormalize over the components that were measured. A silent component is an absence, and an
  // absence must not drag a score down the way a measured zero would. The sum runs on the raw
  // readings rather than the rounded contributions: rounding first and dividing afterwards turned
  // a single 47 % component into a score of 47.143.
  const measuredNames = PlayRatingComponentNameSchema.options.filter((name) => raw[name].value !== null);
  const measuredWeight = measuredNames.reduce((sum, name) => sum + priors.playRating.weights[name], 0);
  const score = measuredWeight === 0
    ? null
    : round((measuredNames.reduce((sum, name) => sum + (raw[name].value ?? 0) * priors.playRating.weights[name], 0) / measuredWeight) * 100);

  return {
    playId: play.id,
    ventureId: play.ventureId,
    platform: platform.id,
    posture: platform.posture,
    components,
    score,
    verdict: decideVerdict({
      posture: platform.posture,
      score,
      leadScore: priors.playRating.leadScore,
      costUsd: play.estimatedCostUsd
    }),
    notes,
    spendApprovalRequired: play.estimatedCostUsd > 0
  };
}

/** Best first, and an unscored play last rather than treated as a zero. */
export function rankPlayRatings(ratings: readonly PlayRating[]): readonly PlayRating[] {
  return [...ratings].sort((left, right) => {
    if (left.score === right.score) return left.playId.localeCompare(right.playId, "en");
    if (left.score === null) return 1;
    if (right.score === null) return -1;
    return right.score - left.score;
  });
}
