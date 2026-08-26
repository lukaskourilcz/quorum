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
  monthlyOperatingUsd: 20 | 50;
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

/** Lowest-priority room first. A daily plan removes entries only in this order. */
export const ROOM_DEGRADATION_ORDER = [
  "dm-growth",
  // Kvórum is registered but its live room remains contingent on the separate capacity
  // countersignature, so it yields before every already-funded daily room.
  "kv-desk",
  "dm-desk",
  // Tehdejsi svet yields before BOOKSOFHISTORY even though both drop at the same monthly rung:
  // its desk is daily, so a dropped day costs one feature, while a dropped BOOKSOFHISTORY day
  // stalls a three-day cycle that has already paid for its research.
  "ts-desk",
  "bh-desk",
  "gv-brief",
  "tt-marketing"
] as const satisfies readonly ScheduledPhase[];

export interface DailyEnvelopePlan {
  activeRoomPhases: ScheduledPhase[];
  droppedRoomPhases: ScheduledPhase[];
  reservedUsd: number;
}

function weekdayRoomIsDue(phase: ScheduledPhase, date: string): boolean {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  if (phase === "gv-brief") return weekday === 1;
  if (phase === "dm-growth") return weekday === 4;
  return true;
}

/**
 * Fit declared worst-case room envelopes around the day's non-room reservations.
 *
 * The registry uses daily cron syntax even for GoVIRAL's Monday room and Door Money's Thursday
 * room, because their off-day firings write truthful $0 records. Those off-day records are not
 * paid reservations. If a real weekday still exceeds the signed cap, rooms fall off in the
 * declared degradation order; the ceiling itself never moves.
 */
export function resolveDailyEnvelopePlan(input: {
  date: string;
  rooms: ReadonlyArray<{ phase: ScheduledPhase; envelopeUsd: number }>;
  nonRoomReservationUsd: number;
  dailyBudgetUsd: number;
}): DailyEnvelopePlan {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.date)) throw new Error("Daily envelope date must be YYYY-MM-DD");
  if (Number.isNaN(new Date(`${input.date}T12:00:00.000Z`).getTime())) throw new Error("Daily envelope date must be valid");
  if (!Number.isFinite(input.nonRoomReservationUsd) || input.nonRoomReservationUsd < 0 || !Number.isFinite(input.dailyBudgetUsd) || input.dailyBudgetUsd <= 0) {
    throw new Error("Non-room reservations must be non-negative and the daily budget must be positive");
  }
  if (input.rooms.some(({ envelopeUsd }) => !Number.isFinite(envelopeUsd) || envelopeUsd < 0)) {
    throw new Error("Room envelopes must be non-negative finite numbers");
  }
  const active = input.rooms.filter(({ phase }) => weekdayRoomIsDue(phase, input.date));
  const dropped: ScheduledPhase[] = [];
  let reservedUsd = active.reduce((sum, room) => sum + room.envelopeUsd, input.nonRoomReservationUsd);
  for (const phase of ROOM_DEGRADATION_ORDER) {
    if (reservedUsd <= input.dailyBudgetUsd + Number.EPSILON) break;
    const index = active.findIndex((room) => room.phase === phase);
    if (index < 0) continue;
    const [removed] = active.splice(index, 1);
    reservedUsd -= removed!.envelopeUsd;
    dropped.push(phase);
  }
  return {
    activeRoomPhases: active.map(({ phase }) => phase),
    droppedRoomPhases: dropped,
    reservedUsd: Number(reservedUsd.toFixed(8))
  };
}

export function signedOwnerDecision(raw: string): "countersigned" | "pending" {
  if (!/^Status:\s*countersigned\s*$/mi.test(raw)) return "pending";
  return checkedLine(raw, "Signature / explicit approval reference") ? "countersigned" : "pending";
}

export function kvorumBudgetCapacityDecision(raw: string): "countersigned" | "pending" {
  if (signedOwnerDecision(raw) !== "countersigned") return "pending";
  const match = /^Freed worst-day capacity USD:\s*\$?([0-9]+(?:\.[0-9]+)?)\s*$/mi.exec(raw);
  const freedUsd = Number(match?.[1]);
  return Number.isFinite(freedUsd) && freedUsd >= 0.08 ? "countersigned" : "pending";
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
  kvorumFoundingRaw?: string;
  kvorumBudgetCapacityRaw?: string;
  monthlyApiHeadroomUsd: number;
}): EffectivePortfolioSchedule {
  if (!Number.isFinite(input.monthlyApiHeadroomUsd) || input.monthlyApiHeadroomUsd < 0) {
    throw new Error("Monthly API headroom must be a non-negative finite number");
  }
  const decisionStatus = budgetDecisionStatus(input.budgetDecisionRaw);
  const fiftyDecisionStatus = signedOwnerDecision(input.budgetFiftyRaw ?? "");
  const mmaDecisionStatus = signedOwnerDecision(input.budgetMmaRaw ?? "");
  const fightAiQFoundingStatus = signedOwnerDecision(input.fightAiQFoundingRaw ?? "");
  const kvorumFoundingStatus = signedOwnerDecision(input.kvorumFoundingRaw ?? "");
  const kvorumBudgetCapacityStatus = kvorumBudgetCapacityDecision(input.kvorumBudgetCapacityRaw ?? "");
  const shape: BudgetShape = decisionStatus === "countersigned-shape-a" ? "A" : "B";
  // budget-2026-08d unlocks the full scheduled clock and is still the signal the runtime
  // reads. budget-2026-08f supersedes the later $30 all-in amount with $50 while preserving the
  // $25 model share and $1.00 daily pace. The flag is named for the clock it selects.
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
  // Registration proves the room shape; it does not make the room payable. The live clock is
  // already reserved to $0.98 of its signed $1.00 pace, so Kvórum needs both the founding
  // countersignature and a separate owner record that identifies at least $0.08 of capacity.
  if (kvorumFoundingStatus !== "countersigned" || kvorumBudgetCapacityStatus !== "countersigned") {
    active.delete("kv-desk");
  }
  let ttTranscriptMode: EffectivePortfolioSchedule["ttTranscriptMode"] = "full";
  // The content gate goes first of everything, because it is the only rung whose loss costs
  // nothing that was promised to anybody: an unscored day still published its article.
  const contentGateAffordable = input.monthlyApiHeadroomUsd >= 3;
  // BOOKSOFHISTORY degrades inside its own research funnel before its room disappears: first
  // research one candidate rather than two, then spend $0 and stretch the current phase, then
  // drop the desk. Door Money's two cheaper room rungs share this top of the ladder; every one
  // of these degradations still happens before GoVIRAL's existing drop point.
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
  // Tehdejsi svet drops on the same rung as the BOOKSOFHISTORY room. It is a daily audience
  // promise rather than a reader-facing publication, so it outranks the weekly internal brief
  // and never outranks a magazine.
  if (input.monthlyApiHeadroomUsd < BOOKSOFHISTORY_LADDER.dropRoomBelowUsd) {
    active.delete("ts-desk");
  }
  // Door Money takes the first two room rungs. Neither room publishes or reaches out, and a
  // missed sitting costs only an unpromised draft. The weekly growth room falls first, then the
  // daily desk, both before GoVIRAL's Monday brief.
  if (input.monthlyApiHeadroomUsd < 2.75) {
    active.delete("dm-growth");
  }
  if (input.monthlyApiHeadroomUsd < 2.5) {
    active.delete("dm-desk");
  }
  // GoVIRAL takes the rungs the incubator vacated, and takes them first among the rooms that
  // survive this far: it meets once a week, and a missed Monday costs a brief rather than a
  // publication. Everything below it on this ladder is either a reader-facing promise or the
  // company's own decision room.
  if (input.monthlyApiHeadroomUsd < BOOKSOFHISTORY_LADDER.dropGoViralBelowUsd) {
    active.delete("gv-brief");
  }
  // Kvórum is a daily audience promise, so it survives GoVIRAL's weekly internal brief. It
  // still drops before the reader-facing magazine rooms and their article slot.
  if (input.monthlyApiHeadroomUsd < 1.5) {
    active.delete("kv-desk");
    ttTranscriptMode = "minimal";
  }
  if (input.monthlyApiHeadroomUsd < 1) {
    active.delete("mag-editorial");
    active.delete("mag-desk");
    active.delete("article-am");
    active.delete("article-pm");
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
