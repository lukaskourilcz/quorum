import { budgetLedgerCostCategory, BudgetLedgerKindSchema, type BudgetLedgerEntry } from "../budget.js";
import type { VentureRegistry } from "../contracts/venture-registry.js";
import type {
  CostBreakdown,
  DecisionCost,
  EditionCost,
  EnvelopeVariance
} from "../contracts/cost-report.js";
import { resolveLedgerVentureId } from "../ventures/accounting.js";
import { ventureIdForPhase } from "../ventures/registry.js";

/**
 * The join between money and work.
 *
 * Every paid call in this company is already written to `state/budget/ledger.json` with the
 * `cycleId` of the run that made it, and that same id is the filename of the decision the run
 * produced and of the scorecard that recorded its envelope. So per-decision and per-edition cost
 * is a grouping of files that already exist, not a second meter. Nothing here reads the filesystem,
 * calls a model or looks at a clock: the whole module is a fold over rows the caller supplies.
 *
 * The `image_gate` rows are why the grouping key is `cycleId` and not `phase`. A vision call that
 * scores an edition's candidate thumbnails is written with `phase: "image_gate"` but the edition
 * room's `cycleId`, so grouping by phase would bill the picture to a room nobody opened and leave
 * the edition looking cheaper than it was.
 */

/** The eight-decimal rounding every money path in this repository uses. */
export function roundUsd(value: number): number {
  return Number(value.toFixed(8));
}

export interface CycleCost extends CostBreakdown {
  cycleId: string;
  /** Every phase that billed against this cycle, `image_gate` included. */
  phases: string[];
  ventureIds: string[];
  byAgent: Array<{ agent: string; usd: number; calls: number }>;
  byModel: Array<{ model: string; usd: number; calls: number }>;
}

export function emptyBreakdown(): CostBreakdown {
  return { totalUsd: 0, modelUsd: 0, mediaUsd: 0, calls: 0 };
}

function usable(entry: BudgetLedgerEntry): boolean {
  return typeof entry.usd === "number" && Number.isFinite(entry.usd) && entry.usd >= 0;
}

/**
 * The day a cycle ran, read from its own id rather than from a row's timestamp.
 *
 * `cycleId` is `YYYYMMDDHHMMSS-<phase>`. A cycle that starts at 23:58 UTC bills rows on two
 * calendar days, and the edition it produced belongs to one of them — the one the run is named
 * for. Returns null for an id that does not carry a date, which is how a fixture or a hand-made
 * id stays out of a month rather than landing in the wrong one.
 */
export function cycleDate(cycleId: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})\d{6}-/.exec(cycleId);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

export function cycleMonth(cycleId: string): string | null {
  return cycleDate(cycleId)?.slice(0, 7) ?? null;
}

/** The phase half of a cycle id, which is everything after the timestamp. */
export function cyclePhase(cycleId: string): string | null {
  const match = /^\d{14}-(.+)$/.exec(cycleId);
  return match ? match[1]! : null;
}

function accumulate(
  totals: Map<string, { usd: number; calls: number }>,
  key: string,
  usd: number
): void {
  const current = totals.get(key) ?? { usd: 0, calls: 0 };
  totals.set(key, { usd: current.usd + usd, calls: current.calls + 1 });
}

function rank(totals: Map<string, { usd: number; calls: number }>): Array<{ key: string; usd: number; calls: number }> {
  return [...totals.entries()]
    .map(([key, value]) => ({ key, usd: roundUsd(value.usd), calls: value.calls }))
    // Largest first, then by name, so the same ledger always produces the same file.
    .sort((left, right) => right.usd - left.usd || left.key.localeCompare(right.key));
}

/**
 * Every cycle in the supplied rows, with its spend split into model and media.
 *
 * A row whose `usd` is not a usable number is skipped and counted by the caller rather than
 * guessed at, exactly as `summariseBudgetLedger` already skips one.
 */
export function costByCycle(
  entries: readonly BudgetLedgerEntry[],
  registry?: VentureRegistry
): Map<string, CycleCost> {
  const byCycle = new Map<string, CycleCost>();
  const agents = new Map<string, Map<string, { usd: number; calls: number }>>();
  const models = new Map<string, Map<string, { usd: number; calls: number }>>();

  for (const entry of entries) {
    if (!usable(entry)) continue;
    const cycleId = typeof entry.cycleId === "string" ? entry.cycleId : "";
    if (!cycleId) continue;
    const existing = byCycle.get(cycleId) ?? {
      cycleId,
      ...emptyBreakdown(),
      phases: [],
      ventureIds: [],
      byAgent: [],
      byModel: []
    };
    // An unparseable kind is billed as model spend rather than dropped: the money left the
    // account either way, and losing it from the total is the one error this file must not make.
    const parsedKind = BudgetLedgerKindSchema.safeParse(entry.kind);
    const category = parsedKind.success ? budgetLedgerCostCategory(parsedKind.data) : "model";
    existing.totalUsd += entry.usd;
    if (category === "media") existing.mediaUsd += entry.usd;
    else existing.modelUsd += entry.usd;
    existing.calls += 1;
    if (entry.phase && !existing.phases.includes(entry.phase)) existing.phases.push(entry.phase);
    const ventureId = registry ? resolveLedgerVentureId(entry, registry) : entry.ventureId ?? "global";
    if (!existing.ventureIds.includes(ventureId)) existing.ventureIds.push(ventureId);
    byCycle.set(cycleId, existing);

    if (!agents.has(cycleId)) agents.set(cycleId, new Map());
    if (!models.has(cycleId)) models.set(cycleId, new Map());
    accumulate(agents.get(cycleId)!, entry.agent, entry.usd);
    accumulate(models.get(cycleId)!, entry.model, entry.usd);
  }

  for (const cycle of byCycle.values()) {
    cycle.totalUsd = roundUsd(cycle.totalUsd);
    cycle.modelUsd = roundUsd(cycle.modelUsd);
    cycle.mediaUsd = roundUsd(cycle.mediaUsd);
    cycle.phases.sort();
    cycle.ventureIds.sort();
    cycle.byAgent = rank(agents.get(cycle.cycleId) ?? new Map())
      .map(({ key, usd, calls }) => ({ agent: key, usd, calls }));
    cycle.byModel = rank(models.get(cycle.cycleId) ?? new Map())
      .map(({ key, usd, calls }) => ({ model: key, usd, calls }));
  }
  return byCycle;
}

export function breakdownOf(cycle: CycleCost | undefined): CostBreakdown | null {
  return cycle
    ? { totalUsd: cycle.totalUsd, modelUsd: cycle.modelUsd, mediaUsd: cycle.mediaUsd, calls: cycle.calls }
    : null;
}

export function sumBreakdowns(breakdowns: readonly CostBreakdown[]): CostBreakdown {
  const total = breakdowns.reduce<CostBreakdown>(
    (carry, entry) => ({
      totalUsd: carry.totalUsd + entry.totalUsd,
      modelUsd: carry.modelUsd + entry.modelUsd,
      mediaUsd: carry.mediaUsd + entry.mediaUsd,
      calls: carry.calls + entry.calls
    }),
    emptyBreakdown()
  );
  return {
    totalUsd: roundUsd(total.totalUsd),
    modelUsd: roundUsd(total.modelUsd),
    mediaUsd: roundUsd(total.mediaUsd),
    calls: total.calls
  };
}

/** The shape a decision record carries, narrowed to the fields this join needs. */
export interface DecisionRecordInput {
  cycleId: string;
  phase: string;
  outcome: string;
  generatedAt: string;
}

export function decisionCosts(
  decisions: readonly DecisionRecordInput[],
  byCycle: ReadonlyMap<string, CycleCost>,
  registry: VentureRegistry
): DecisionCost[] {
  return decisions
    .map((decision) => {
      const cycle = byCycle.get(decision.cycleId);
      return {
        cycleId: decision.cycleId,
        phase: decision.phase,
        // The registry, not the ledger: a room that decided without spending has no row to read a
        // venture off, and calling every free decision "global" would move Caught Up's cheapest
        // outcomes onto the company's books.
        ventureId: cycle?.ventureIds[0] ?? ventureIdForPhase(registry, decision.phase),
        outcome: decision.outcome,
        decidedAt: decision.generatedAt,
        // A room that decided without spending is a real and cheap outcome — a skipped edition
        // costs nothing and still decides. That is $0, not an absence.
        cost: breakdownOf(cycle) ?? emptyBreakdown(),
        note: cycle ? null : "No ledger row carries this cycle id; the room decided without billing a call."
      } satisfies DecisionCost;
    })
    .sort((left, right) => right.cycleId.localeCompare(left.cycleId));
}

/** A delivery record, narrowed to what the join needs. */
export interface DeliveryRecordInput {
  date: string;
  status: string;
  articleUrl?: string | null;
  packageHash?: string | null;
}

/**
 * Deliveries joined to every cycle of their room that ran that day.
 *
 * The obvious join was the meeting record: `state/meetings/<date>-cu-edition.json` carries both a
 * date and a `cycleId`, so a delivery could reach the ledger through it. It is wrong, and the
 * committed records say so. 2026-09-13 has two `cu-edition` cycles — the 03:00 run that wrote the
 * edition and billed $0.18, and the 07:00 backstop that found the day settled and billed nothing.
 * One file holds one `cycleId`, and the one it kept was the free retry. Through that bridge, the
 * three most recent editions all read $0.00.
 *
 * So the join is the day itself, over the ledger's own ids: a `cycleId` carries its date, every
 * cycle of the room that ran that day counts, and a retry that cost nothing adds nothing.
 */
export function editionCosts(
  deliveries: readonly DeliveryRecordInput[],
  byCycle: ReadonlyMap<string, CycleCost>,
  registry: VentureRegistry,
  phase = "cu-edition"
): EditionCost[] {
  const byDate = new Map<string, CycleCost[]>();
  for (const cycle of byCycle.values()) {
    if (cyclePhase(cycle.cycleId) !== phase) continue;
    const date = cycleDate(cycle.cycleId);
    if (!date) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), cycle]);
  }

  return deliveries
    .map((delivery) => {
      const cycles = (byDate.get(delivery.date) ?? [])
        .sort((left, right) => left.cycleId.localeCompare(right.cycleId));
      return {
        date: delivery.date,
        ventureId: ventureIdForPhase(registry, phase),
        phase,
        cycleIds: cycles.map((cycle) => cycle.cycleId),
        status: delivery.status,
        articleUrl: delivery.articleUrl ?? null,
        packageHash: delivery.packageHash ?? null,
        // Null, not zero, when no cycle of that room ran that day: nothing was measured, so
        // nothing is known. An edition delivered from an earlier day's package is the real case.
        cost: cycles.length ? sumBreakdowns(cycles.map((cycle) => breakdownOf(cycle)!)) : null,
        note: cycles.length
          ? null
          : `No ${phase} cycle billed a call on ${delivery.date}; this edition's cost is not recorded.`
      } satisfies EditionCost;
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

/** The envelope a cycle's scorecard says was reserved for it. */
export interface RecordedEnvelopeInput {
  cycleId: string;
  estimatedWorstCaseUsd: number;
}

/**
 * Each room's month against the envelope its own records declared.
 *
 * The registry's `meetings[].envelopeUsd` is not that envelope for every room, and using it would
 * publish a fiction. A `cu-edition` cycle runs the room *and* the edition production, so
 * `orchestrator/src/cycle/caught-up.ts` reserves `min(envelopeUsd, caughtUpMeetingUsd) +
 * editionProductionUsd` — $0.58, not the registry's $0.08 — and writes that figure into the
 * cycle's scorecard as `estimatedWorstCaseUsd`. Compared against the bare $0.08 the room looked
 * like it blew its envelope nine times in ten. It did not; it spent inside a larger envelope the
 * registry alone does not describe.
 *
 * So the comparison reads what was recorded at the time of the run. A cycle with no scorecard has
 * no envelope and is counted separately rather than compared against a guess.
 */
export function envelopeVariance(
  byCycle: ReadonlyMap<string, CycleCost>,
  envelopes: readonly RecordedEnvelopeInput[],
  registry: VentureRegistry,
  month: string
): EnvelopeVariance[] {
  const recorded = new Map(envelopes.map((entry) => [entry.cycleId, entry.estimatedWorstCaseUsd]));
  const rooms = new Map<string, {
    cycles: number;
    meteredUsd: number;
    withEnvelope: number;
    envelopeUsd: number;
    comparableUsd: number;
    overspent: number;
  }>();

  for (const cycle of byCycle.values()) {
    if (cycleMonth(cycle.cycleId) !== month) continue;
    const phase = cyclePhase(cycle.cycleId);
    if (!phase) continue;
    const room = rooms.get(phase) ?? {
      cycles: 0,
      meteredUsd: 0,
      withEnvelope: 0,
      envelopeUsd: 0,
      comparableUsd: 0,
      overspent: 0
    };
    room.cycles += 1;
    room.meteredUsd += cycle.totalUsd;
    const envelopeUsd = recorded.get(cycle.cycleId);
    if (typeof envelopeUsd === "number" && Number.isFinite(envelopeUsd)) {
      room.withEnvelope += 1;
      room.envelopeUsd += envelopeUsd;
      room.comparableUsd += cycle.totalUsd;
      if (cycle.totalUsd > envelopeUsd) room.overspent += 1;
    }
    rooms.set(phase, room);
  }

  return [...rooms.entries()]
    .map(([phase, room]) => {
      const envelopeUsd = roundUsd(room.envelopeUsd);
      const comparableUsd = roundUsd(room.comparableUsd);
      return {
        phase,
        ventureId: ventureIdForPhase(registry, phase),
        cycles: room.cycles,
        meteredUsd: roundUsd(room.meteredUsd),
        comparable: room.withEnvelope
          ? {
            cycles: room.withEnvelope,
            envelopeUsd,
            meteredUsd: comparableUsd,
            // Positive means the room spent past what its recorded envelopes allowed.
            varianceUsd: roundUsd(comparableUsd - envelopeUsd),
            overspentCycles: room.overspent
          }
          : null
      } satisfies EnvelopeVariance;
    })
    .sort((left, right) => right.meteredUsd - left.meteredUsd || left.phase.localeCompare(right.phase));
}
