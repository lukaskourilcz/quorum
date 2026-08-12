import { COUNTERSIGNED_MONTHLY_OPERATING_USD } from "../budget.js";
import type { VentureRegistry } from "../contracts/venture-registry.js";
import type { ScheduledPhase } from "../types.js";
import { parseCadenceHour, resolveMeetingClock, resolveScheduledClock } from "../ventures/registry.js";

export type BudgetShape = "A" | "B";

export const BOOKSOFHISTORY_LADDER = {
  trimToOneBelowUsd: 2.75,
  stretchBelowUsd: 2.5,
  dropRoomBelowUsd: 2.25,
  dropGoViralBelowUsd: 2
} as const;

export interface EffectivePortfolioSchedule {
  shape: BudgetShape;
  decisionStatus: "countersigned-shape-a" | "countersigned-shape-b" | "pending";
  fiftyDecisionStatus: "countersigned" | "pending";
  monthlyBudgetUsd: 15 | 18 | 25;
  dailyBudgetUsd: 0.7 | 1;
  monthlyOperatingUsd: 20 | 30;
  ttTranscriptMode: "full" | "minimal" | "paused";
  /**
   * Whether the night may pay to score what the day published.
   *
   * It sits on this ladder rather than beside it, above GoVIRAL: scoring is the most droppable
   * thing the system does, because a day that goes unscored still published, and the daily $1.00
   * pace already carries around $1.74 of reservations. Its own switch still has to be on — this
   * only says whether the budget could afford it if it were.
   */
  contentGateAffordable: boolean;
  /** Paid-research width after BOOKSOFHISTORY's own cheaper rungs have been applied. */
  booksofHistoryResearchCandidates: 0 | 1 | 2;
  /** True when the desk stays on the clock but its research phase must resume later at $0. */
  booksofHistoryStretch: boolean;
  activePhases: ScheduledPhase[];
  envelopeByPhase: Partial<Record<ScheduledPhase, number>>;
}

export function signedOwnerDecision(raw: string): "countersigned" | "pending" {
  if (!/^Status:\s*countersigned\s*$/mi.test(raw)) return "pending";
  return checkedLine(raw, "Signature / explicit approval reference") ? "countersigned" : "pending";
}

function checkedLine(raw: string, label: string): string | null {
  const match = new RegExp(`^${label}:\\s*(.+)$`, "mi").exec(raw)?.[1]?.trim();
  if (!match || /^_+$/.test(match)) return null;
  return match;
}

export function budgetDecisionStatus(raw: string): EffectivePortfolioSchedule["decisionStatus"] {
  if (!/^Status:\s*countersigned\s*$/mi.test(raw)) return "pending";
  const signature = checkedLine(raw, "Signature / explicit approval reference");
  if (!signature) return "pending";
  if (/Selection:\s*\[[xX]\]\s*Shape A\s+\[ \]\s*Shape B/i.test(raw)) return "countersigned-shape-a";
  if (/Selection:\s*\[ \]\s*Shape A\s+\[[xX]\]\s*Shape B/i.test(raw)) return "countersigned-shape-b";
  return "pending";
}

export function resolveEffectivePortfolioSchedule(input: {
  registry: VentureRegistry;
  budgetDecisionRaw: string;
  budgetMmaRaw?: string;
  budgetFiftyRaw?: string;
  fightAiQFoundingRaw?: string;
  monthlyApiHeadroomUsd: number;
}): EffectivePortfolioSchedule {
  if (!Number.isFinite(input.monthlyApiHeadroomUsd) || input.monthlyApiHeadroomUsd < 0) {
    throw new Error("Monthly API headroom must be a non-negative finite number");
  }
  const decisionStatus = budgetDecisionStatus(input.budgetDecisionRaw);
  const fiftyDecisionStatus = signedOwnerDecision(input.budgetFiftyRaw ?? "");
  const mmaDecisionStatus = signedOwnerDecision(input.budgetMmaRaw ?? "");
  const fightAiQFoundingStatus = signedOwnerDecision(input.fightAiQFoundingRaw ?? "");
  const shape: BudgetShape = decisionStatus === "countersigned-shape-a" ? "A" : "B";
  // budget-2026-08d unlocks the full scheduled clock and is still the signal the runtime
  // reads. budget-2026-08e supersedes it on amounts only: $30 all-in, $25 model share, $1.00
  // daily pace. The flag is named for what it selects, not for the superseded figure.
  const fullScheduleShape = fiftyDecisionStatus === "countersigned";
  const active = new Set((fullScheduleShape ? resolveScheduledClock(input.registry) : resolveMeetingClock(input.registry)).map((slot) => slot.phase));
  const envelopeByPhase: Partial<Record<ScheduledPhase, number>> = {};
  for (const venture of input.registry.ventures) {
    for (const meeting of venture.meetings) {
      envelopeByPhase[meeting.kind as ScheduledPhase] = meeting.envelopeUsd;
    }
    for (const job of venture.productionJobs ?? []) {
      if (job.kind === "article-production") {
        envelopeByPhase["article-am"] = job.envelopeUsd;
        envelopeByPhase["article-pm"] = job.envelopeUsd;
      }
    }
  }
  if (shape === "B") {
    envelopeByPhase["tt-marketing"] = 0.06;
  }
  if (!fullScheduleShape) {
    active.delete("mag-editorial");
    active.delete("mag-desk");
    active.delete("article-am");
    active.delete("article-pm");
  }
  if (fightAiQFoundingStatus !== "countersigned") {
    active.delete("mma-intake");
    active.delete("mma-analysis");
  } else if (!fullScheduleShape && mmaDecisionStatus !== "countersigned") {
    active.delete("mma-analysis");
    envelopeByPhase["mma-intake"] = 0.05;
  }
  let ttTranscriptMode: EffectivePortfolioSchedule["ttTranscriptMode"] = "full";
  // The content gate goes first of everything, because it is the only rung whose loss costs
  // nothing that was promised to anybody: an unscored day still published its article.
  const contentGateAffordable = input.monthlyApiHeadroomUsd >= 3;
  // BOOKSOFHISTORY degrades inside its own research funnel before its room disappears: first
  // research one candidate rather than two, then spend $0 and stretch the current phase, then
  // drop the desk. All three rungs sit before GoVIRAL's existing drop point. The Door Money
  // sibling phases named by the commission are not in this registry yet, so no foreign phase is
  // guessed here; the founding record preserves the required insertion order for when they land.
  const booksofHistoryResearchCandidates: 0 | 1 | 2 =
    input.monthlyApiHeadroomUsd < BOOKSOFHISTORY_LADDER.stretchBelowUsd
      ? 0
      : input.monthlyApiHeadroomUsd < BOOKSOFHISTORY_LADDER.trimToOneBelowUsd
        ? 1
        : 2;
  const booksofHistoryStretch = input.monthlyApiHeadroomUsd < BOOKSOFHISTORY_LADDER.stretchBelowUsd;
  if (input.monthlyApiHeadroomUsd < BOOKSOFHISTORY_LADDER.dropRoomBelowUsd) {
    active.delete("bh-desk");
  }
  // GoVIRAL takes the rungs the incubator vacated, and takes them first among the rooms: it is
  // the newest, it meets once a week, and a missed Monday costs a brief rather than a
  // publication. Everything below it on this ladder is either a reader-facing promise or the
  // company's own decision room.
  if (input.monthlyApiHeadroomUsd < BOOKSOFHISTORY_LADDER.dropGoViralBelowUsd) {
    active.delete("gv-brief");
  }
  if (input.monthlyApiHeadroomUsd < 1.5) {
    ttTranscriptMode = "minimal";
  }
  if (input.monthlyApiHeadroomUsd < 0.5) {
    active.delete("tt-marketing");
    ttTranscriptMode = "paused";
  }
  return {
    shape,
    decisionStatus,
    fiftyDecisionStatus,
    monthlyBudgetUsd: fullScheduleShape ? 25 : shape === "A" ? 18 : 15,
    dailyBudgetUsd: fullScheduleShape ? 1 : shape === "A" ? 1 : 0.7,
    monthlyOperatingUsd: fullScheduleShape ? COUNTERSIGNED_MONTHLY_OPERATING_USD : 20,
    ttTranscriptMode,
    contentGateAffordable,
    booksofHistoryResearchCandidates,
    booksofHistoryStretch,
    activePhases: (fullScheduleShape ? resolveScheduledClock(input.registry) : resolveMeetingClock(input.registry))
      .map((slot) => slot.phase)
      .filter((phase) => active.has(phase)),
    envelopeByPhase
  };
}

export function assertCollisionFreeRegistry(registry: VentureRegistry): void {
  const slots = resolveMeetingClock(registry);
  for (let index = 1; index < slots.length; index += 1) {
    if ((slots[index]!.hour - slots[index - 1]!.hour) * 60 < 60) {
      throw new Error(`${slots[index - 1]!.label} collides with ${slots[index]!.label}`);
    }
  }
  for (const venture of registry.ventures) {
    for (const meeting of venture.meetings) parseCadenceHour(meeting.cadence);
  }
}

export function phaseEnabled(
  schedule: EffectivePortfolioSchedule,
  phase: ScheduledPhase
): boolean {
  return schedule.activePhases.includes(phase);
}
