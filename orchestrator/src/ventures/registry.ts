import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  VentureRegistrySchema,
  type VentureRegistry
} from "../contracts/venture-registry.js";
import {
  FoundingAgentSchema,
  ScheduledPhaseSchema,
  type RunnablePhase,
  type ScheduledPhase
} from "../types.js";
import { configRoot } from "../paths.js";

export const PORTFOLIO_BOARD_SLOTS = [
  { phase: "morning", hour: 6, label: "Venture morning" },
  { phase: "afternoon", hour: 14, label: "Venture afternoon" },
  { phase: "night", hour: 22, label: "Venture night" }
] as const;

export interface ResolvedMeetingSlot {
  phase: ScheduledPhase;
  hour: number;
  label: string;
  ventureId: string | null;
}

export type VentureMeetingDefinition = VentureRegistry["ventures"][number]["meetings"][number];

export function parseCadenceHour(cadence: string): number {
  const match = /^daily@(\d{2}):00$/.exec(cadence);
  if (!match) throw new Error(`Unsupported venture cadence: ${cadence}`);
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 5 || hour > 23) {
    throw new Error(`Venture cadence hour is outside 05:00 to 23:00: ${cadence}`);
  }
  return hour;
}

export function parseVentureRegistry(value: unknown): VentureRegistry {
  return VentureRegistrySchema.parse(value);
}

export function readVentureRegistry(
  filePath = path.join(configRoot, "ventures.json")
): VentureRegistry {
  return parseVentureRegistry(JSON.parse(readFileSync(filePath, "utf8")));
}

export async function loadVentureRegistry(
  filePath = path.join(configRoot, "ventures.json")
): Promise<VentureRegistry> {
  return parseVentureRegistry(JSON.parse(await readFile(filePath, "utf8")));
}

export function publicVentures(registry: VentureRegistry): VentureRegistry["ventures"] {
  return registry.ventures.filter((venture) => venture.visibility === "public");
}

/**
 * Which venture each runnable phase works for, where that venture can be paused at all.
 *
 * The owner's pause switch stops a venture's engine at one chokepoint: `runCycle` looks the
 * phase up here and, when the registry says the owner paused that venture, the live run ends
 * before any agenda, agent or provider is touched. Dry runs stay open on purpose — a dry run is
 * a $0 fixture rehearsal into `tmp/dry-run`, which is how the suite proves room mechanics
 * without depending on today's operational state.
 *
 * Absent phases are absent deliberately, not forgotten: the council shifts and `founding` are
 * company-wide; `studio` is the Design Lab and `gv-brief` is GoVIRAL, both shared machinery the
 * portfolio consumes; `mma-intake` and `mma-analysis` are FightAIQ, MMA Files' data supplier.
 * None of those can be paused from Settings, so no phase of theirs resolves to a venture here.
 */
export const PHASE_VENTURES: Readonly<Partial<Record<RunnablePhase, string>>> = {
  "cu-edition": "caught-up",
  "cu-product": "caught-up",
  "tt-marketing": "titty-tuesdays",
  "ms-daily": "marketingshark",
  "bh-desk": "booksofhistory",
  "dm-desk": "door-money",
  "dm-growth": "door-money",
  "ts-desk": "tehdejsi-svet",
  "kv-desk": "kvorum",
  "pg-desk": "personal-growth",
  "mag-editorial": "mma-files",
  "mag-desk": "mma-files",
  "article-am": "mma-files",
  "article-pm": "mma-files"
};

/** The venture the owner paused that owns this phase, or null when the phase may run. */
export function pausedVentureForPhase(registry: VentureRegistry, phase: RunnablePhase): string | null {
  const ventureId = PHASE_VENTURES[phase];
  if (!ventureId) return null;
  const venture = registry.ventures.find((candidate) => candidate.id === ventureId);
  return venture?.status === "paused" ? ventureId : null;
}

export function resolveMeetingClock(
  registry: VentureRegistry
): ResolvedMeetingSlot[] {
  const ventureSlots = registry.ventures.flatMap((venture) =>
    venture.meetings.map((meeting) => ({
      phase: ScheduledPhaseSchema.parse(meeting.kind),
      hour: parseCadenceHour(meeting.cadence),
      label: meeting.label,
      ventureId: venture.id
    }))
  );
  return [
    ...PORTFOLIO_BOARD_SLOTS.map((slot) => ({ ...slot, ventureId: null })),
    ...ventureSlots
  ].sort((left, right) => left.hour - right.hour);
}

export function resolveProductionClock(registry: VentureRegistry): ResolvedMeetingSlot[] {
  return registry.ventures.flatMap((venture) => (venture.productionJobs ?? []).flatMap((job) => {
    if (job.kind === "article-production") {
      // One article a day is the contract now. The evening slot was killed every single day
      // since launch -- there was never a second subject that cleared the repeat rule -- so the
      // schedule says one rather than promising two and reporting a kill.
      const daily = /^daily@(\d{2}):00$/.exec(job.cadence);
      if (daily) return [
        { phase: ScheduledPhaseSchema.parse("article-am"), hour: Number(daily[1]), label: "MMA Files daily article", ventureId: venture.id }
      ];
      const twice = /^2x-daily@(\d{2}):00,(\d{2}):00$/.exec(job.cadence);
      if (twice) return [
        { phase: ScheduledPhaseSchema.parse("article-am"), hour: Number(twice[1]), label: "MMA Files morning article", ventureId: venture.id },
        { phase: ScheduledPhaseSchema.parse("article-pm"), hour: Number(twice[2]), label: "MMA Files evening article", ventureId: venture.id }
      ];
    }
    throw new Error(`Unsupported production cadence: ${job.kind} ${job.cadence}`);
  })).sort((left, right) => left.hour - right.hour);
}

export function resolveScheduledClock(registry: VentureRegistry): ResolvedMeetingSlot[] {
  return [...resolveMeetingClock(registry), ...resolveProductionClock(registry)].sort((left, right) => left.hour - right.hour);
}

/**
 * The idea ledger a venture writes into, or null when the id belongs to no venture.
 *
 * Null rather than a throw: the caller is recording what a model named, and a model naming a
 * venture that does not exist is a refused proposal, not a broken run.
 */
export function ventureNamespace(registry: VentureRegistry, ventureId: string): string | null {
  return registry.ventures.find((venture) => venture.id === ventureId)?.ledgerNamespace ?? null;
}

export function getVentureMeetingDefinition(
  registry: VentureRegistry,
  kind: string
): { ventureId: string; meeting: VentureMeetingDefinition } {
  for (const venture of registry.ventures) {
    const meeting = venture.meetings.find((candidate) => candidate.kind === kind);
    if (meeting) return { ventureId: venture.id, meeting };
  }
  throw new Error(`No venture meeting is registered for ${kind}`);
}

export function composeMeetingRouteDefinition(
  registry: VentureRegistry,
  kind: string,
  mode: "dry" | "live"
) {
  const { ventureId, meeting } = getVentureMeetingDefinition(registry, kind);
  const venture = registry.ventures.find((candidate) => candidate.id === ventureId)!;
  return {
    ventureId,
    envelopeUsd: meeting.envelopeUsd,
    topicType: meeting.packet.topicType,
    objective: meeting.packet.objectives[mode],
    decisionNeeded: meeting.packet.decisionNeeded,
    preset: meeting.packet.preset,
    preSteps: venture.taste && venture.meetings[0]?.kind === meeting.kind ? ["palate"] as const : [] as const,
    requiredParticipants: meeting.cast.map((agent) => FoundingAgentSchema.parse(agent))
  };
}

/**
 * How many hours before its Prague slot each cron is scheduled.
 *
 * A lead is a translation, not a correction. It moves every delivery earlier by the same fixed
 * amount, so it shifts where the middle of the distribution sits and leaves the spread exactly as
 * wide as it was. GitHub's queue is the spread: the same crons were delivered 13 to 54 minutes
 * late on 2 August, up to 3h20m on 3 August, and 2h23m to 2h55m on 4 August — a range of about
 * three hours, redrawn daily by load this repository has no part in. No value of this constant
 * makes a run land on its slot, and no value of it narrows that range by a minute.
 *
 * Which is why it stays at one. Covering 4 August's worst delivery would take a four-hour lead,
 * and that price is paid on every punctual day rather than on the late ones: the 06:00 Prague
 * morning board would be scheduled to fire at 02:00 Prague, four hours before the hour its own
 * name claims, and a fast queue would duly run it there. An hour absorbs the whole of a
 * 2 August-shaped delay and keeps the cost of being early to a size the schedule can carry.
 * CRON_MINUTE now adds five minutes to that cost rather than subtracting from it: the cron fires
 * at :55 of the hour before the one it belongs to, so a punctual firing is 1h05m before its slot.
 * That is the whole price of the head start, and it is paid in Prague wall-clock terms: the
 * 06:00 morning board's summer cron is `55 2 * * *` UTC, which is 04:55 in Prague — an hour and
 * five minutes before the hour the meeting's own name claims.
 *
 * What makes a late meeting a meeting rather than a loss is therefore not this constant but
 * CRON_DELIVERY_WINDOW_HOURS in meetings/clock.ts: the fired cron names its room for six hours,
 * and the calendar holds the slot open for the same span rather than calling it missed the
 * instant its hour passes. Widening that window is the lever that survives a queue that moves
 * again, because it acts on the spread; this lead only decides where inside the span a punctual
 * run lands.
 *
 * resolveCronDelivery adds this same lead back when it maps a fired cron to its meeting, so the
 * two can never disagree about which room a cron belongs to.
 */
export const CRON_LEAD_HOURS = 1;

/**
 * The minute every scheduled workflow in this repository fires on.
 *
 * GitHub delivers scheduled workflows from a shared queue and documents that high load times
 * include the start of every hour. Every cron here used to sit on minute 0 — the most contended
 * minute on the platform — which is a delay this repository was volunteering for on top of
 * whatever the queue was already doing. 55 clears that pile-up and the three others at 15, 30
 * and 45, and it buys five minutes of head start: the job is already queued when the hour it
 * belongs to begins.
 *
 * The honest cost, against the 17 this briefly used: 55 is a multiple of five, so it shares its
 * minute with every-5 and every-10 step schedule, which 17 did not. That is a smaller crowd than
 * minute 0's by a wide margin, and the head start is what the trade buys.
 *
 * One value across every workflow, so the arrangement stays uniform and readable. It cannot move
 * which meeting a cron names — cronSlotHour is the only thing that decides that.
 */
export const CRON_MINUTE = 55;

/**
 * The minute at or past which a cron belongs to the hour AFTER the one it fires in.
 *
 * The hour a cron fires in stopped being the hour it belongs to the moment CRON_MINUTE moved into
 * the second half of the hour: `55 2 * * *` fires at 02:55 and is reaching for 03:00, not for the
 * hour it is leaving. Without this rule resolveCronDelivery reads the literal 2 and hands every
 * firing the meeting one slot earlier — and silently, because cronPayloads writes the cron from
 * the same registry the resolver reads back, so both sides move together and every test still
 * agrees with itself.
 *
 * The rule is written once, here, and both directions are derived from it: cronSlotHour maps a
 * firing forward to its hour, cronPayloads subtracts CRON_HOUR_CARRY to write the cron. Scattering
 * `+ 1` at each call site is what makes a schedule drift a slot at a time.
 *
 * The midpoint is the boundary because a cron in the second half of an hour is reaching for the
 * hour it is about to enter. 30 is itself a forbidden firing minute — it is one of the four
 * contention points — so no cron this repository deploys can sit exactly on the boundary and make
 * the rule's tie-breaking direction load-bearing.
 */
export const CRON_HOUR_CARRY_MINUTE = 30;

/** How many hours ahead of its firing hour a cron on CRON_MINUTE belongs: 1 today, 0 before. */
export const CRON_HOUR_CARRY = CRON_MINUTE >= CRON_HOUR_CARRY_MINUTE ? 1 : 0;

/** The UTC hour a cron belongs to, which is not always the UTC hour it fires in. */
export function cronSlotHour(fireHour: number, fireMinute: number): number {
  return (fireHour + (fireMinute >= CRON_HOUR_CARRY_MINUTE ? 1 : 0)) % 24;
}

/**
 * Minutes from a cron's firing to the top of the hour it belongs to.
 *
 * Positive when the cron fires ahead of its hour, which is the head start CRON_MINUTE buys;
 * negative when it fires inside it, which is what a minute below the carry boundary does. It is
 * the offset resolveCronDelivery removes so that lateness is always counted from the hour, never
 * from wherever inside or before it the firing happens to sit.
 */
export function cronHeadStartMinutes(fireMinute: number): number {
  return (fireMinute >= CRON_HOUR_CARRY_MINUTE ? 60 : 0) - fireMinute;
}

export function cronPayloads(registry: VentureRegistry): Array<{
  cron: string;
  phase: ScheduledPhase;
}> {
  return resolveScheduledClock(registry).flatMap((slot) => [
    // Prague is UTC+2 under CEST and UTC+1 under CET; the lead comes off both. CRON_HOUR_CARRY
    // comes off as well, because firing at CRON_MINUTE means firing in the hour before the one
    // the meeting belongs to — the inverse of what cronSlotHour does when the firing comes back.
    {
      cron: `${CRON_MINUTE} ${(slot.hour - 2 - CRON_LEAD_HOURS - CRON_HOUR_CARRY + 48) % 24} * * *`,
      phase: slot.phase
    },
    {
      cron: `${CRON_MINUTE} ${(slot.hour - 1 - CRON_LEAD_HOURS - CRON_HOUR_CARRY + 48) % 24} * * *`,
      phase: slot.phase
    }
  ]);
}

/**
 * One entry per UTC hour a meeting can fire at, never a multi-hour expression.
 *
 * Studio's two daylight-saving variants used to be folded into "0 11,12 * * *". GitHub reports
 * the whole expression back as github.event.schedule, so a run triggered by that cron could not
 * say which of the two hours had fired, and 12:00 UTC is also the summer firing of the
 * afternoon company meeting. Keeping the hours apart is what lets the fired cron name its
 * meeting outright, which is how a queued run still holds the right one.
 *
 * This is now the Vercel side only. The GitHub side is three backstop sweeps — see
 * meetings/sweep.ts and deployedCronExpressions below.
 */
export function scheduledCronExpressions(registry: VentureRegistry): string[] {
  return [...new Set(cronPayloads(registry).map(({ cron }) => cron))];
}

/**
 * The UTC hours the three backstop sweeps fire at.
 *
 * Here rather than beside the sweep itself because a cron is the registry's business and
 * meetings/sweep.ts imports this module: the other direction is a cycle.
 */
export const BACKSTOP_SWEEP_HOURS = [3, 11, 19] as const;

/**
 * What cycle.yml actually deploys as `on.schedule`.
 *
 * The per-slot crons were the backup path being billed like a primary. Measured over
 * 5-6 August: a Vercel dispatch arrives on the slot's own hour and does 5.8 minutes of real
 * work, a GitHub cron arrives hours late and spends 0.9 minutes exiting a guard — about 600
 * billable minutes a month to duplicate a path that had already run. Three sweeps replace them,
 * each looking for a slot today that has no record and can still be opened.
 */
export function deployedCronExpressions(): string[] {
  return BACKSTOP_SWEEP_HOURS.map((hour) => `${CRON_MINUTE} ${hour} * * *`);
}

export function ventureIdForPhase(
  registry: VentureRegistry,
  phase: string
): string | "global" {
  for (const venture of registry.ventures) {
    if (venture.meetings.some((meeting) => meeting.kind === phase)) return venture.id;
    if ((phase === "article-am" || phase === "article-pm") && venture.productionJobs?.some((job) => job.kind === "article-production")) return venture.id;
  }
  return "global";
}
