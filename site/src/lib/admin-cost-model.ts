/**
 * The Admin's view of `cost-report/1`, re-declared as plain types and parsed defensively.
 *
 * The site does not import the orchestrator's zod contracts — `money-records.ts` re-declares its
 * snapshot the same way — so the boundary is a hand-written parse that drops anything it cannot
 * recognise and never throws. It also caps every list, because a malformed or enormous report
 * must not be able to render a page of ten thousand rows.
 *
 * The rule the whole file exists for: `billed` is `null` until the owner creates an Anthropic
 * admin key, and `null` renders as "unavailable", never as `$0.00`. A confident zero beside a
 * real metered figure is a number nobody can act on.
 */

export interface AdminCostBreakdown {
  totalUsd: number;
  modelUsd: number;
  mediaUsd: number;
  calls: number;
}

export interface AdminEditionCost {
  date: string;
  ventureId: string;
  articleUrl: string | null;
  status: string;
  cost: AdminCostBreakdown | null;
  note: string | null;
}

export interface AdminDecisionCost {
  cycleId: string;
  phase: string;
  ventureId: string;
  outcome: string;
  cost: AdminCostBreakdown | null;
}

export interface AdminEnvelopeRow {
  phase: string;
  ventureId: string;
  cycles: number;
  meteredUsd: number;
  comparable: {
    cycles: number;
    envelopeUsd: number;
    meteredUsd: number;
    varianceUsd: number;
    overspentCycles: number;
  } | null;
}

export interface AdminCostSnapshot {
  generatedAt: string;
  month: string;
  total: AdminCostBreakdown;
  editions: AdminEditionCost[];
  decisions: AdminDecisionCost[];
  envelopes: AdminEnvelopeRow[];
  billedUsd: number | null;
  reconciliation: {
    status: "unavailable" | "reconciled" | "mismatch";
    differenceUsd: number | null;
    note: string;
  };
  unreadable: { decisions: number; deliveries: number; envelopes: number; ledgerRows: number };
  /** Rows the report held but this view dropped, so a cap is visible rather than silent. */
  truncated: { editions: number; decisions: number; envelopes: number };
}

const MAX_EDITIONS = 60;
const MAX_DECISIONS = 120;
const MAX_ENVELOPES = 40;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function signed(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function breakdown(value: unknown): AdminCostBreakdown | null {
  const entry = record(value);
  if (!entry) return null;
  const totalUsd = amount(entry.totalUsd);
  const modelUsd = amount(entry.modelUsd);
  const mediaUsd = amount(entry.mediaUsd);
  if (totalUsd === null || modelUsd === null || mediaUsd === null) return null;
  return { totalUsd, modelUsd, mediaUsd, calls: count(entry.calls) };
}

function edition(value: unknown): AdminEditionCost | null {
  const entry = record(value);
  const date = text(entry?.date);
  const status = text(entry?.status);
  if (!entry || !date || !status) return null;
  return {
    date,
    ventureId: text(entry.ventureId) ?? "global",
    articleUrl: text(entry.articleUrl),
    status,
    // Absent stays absent: a delivery whose cost could not be attributed renders as unavailable.
    cost: entry.cost === null ? null : breakdown(entry.cost),
    note: text(entry.note)
  };
}

function decision(value: unknown): AdminDecisionCost | null {
  const entry = record(value);
  const cycleId = text(entry?.cycleId);
  const phase = text(entry?.phase);
  const outcome = text(entry?.outcome);
  if (!entry || !cycleId || !phase || !outcome) return null;
  return {
    cycleId,
    phase,
    ventureId: text(entry.ventureId) ?? "global",
    outcome,
    cost: entry.cost === null ? null : breakdown(entry.cost)
  };
}

function envelope(value: unknown): AdminEnvelopeRow | null {
  const entry = record(value);
  const phase = text(entry?.phase);
  const meteredUsd = amount(entry?.meteredUsd);
  if (!entry || !phase || meteredUsd === null) return null;
  const comparable = record(entry.comparable);
  const envelopeUsd = amount(comparable?.envelopeUsd);
  const comparableMeteredUsd = amount(comparable?.meteredUsd);
  const varianceUsd = signed(comparable?.varianceUsd);
  return {
    phase,
    ventureId: text(entry.ventureId) ?? "global",
    cycles: count(entry.cycles),
    meteredUsd,
    comparable: comparable && envelopeUsd !== null && comparableMeteredUsd !== null && varianceUsd !== null
      ? {
        cycles: count(comparable.cycles),
        envelopeUsd,
        meteredUsd: comparableMeteredUsd,
        varianceUsd,
        overspentCycles: count(comparable.overspentCycles)
      }
      : null
  };
}

function bounded<T>(values: unknown, parse: (value: unknown) => T | null, limit: number): { rows: T[]; truncated: number } {
  if (!Array.isArray(values)) return { rows: [], truncated: 0 };
  const parsed = values.map(parse).filter((entry): entry is T => entry !== null);
  return { rows: parsed.slice(0, limit), truncated: Math.max(0, parsed.length - limit) };
}

export function parseAdminCostSnapshot(value: unknown): AdminCostSnapshot | null {
  const report = record(value);
  const metered = record(report?.metered);
  const reconciliation = record(report?.reconciliation);
  if (!report || report.schemaVersion !== "cost-report/1" || !metered || !reconciliation) return null;

  const generatedAt = text(report.generatedAt);
  const month = text(report.month);
  const total = breakdown(metered.total);
  const status = reconciliation.status;
  if (!generatedAt || !month || !/^\d{4}-\d{2}$/.test(month) || !total) return null;
  if (status !== "unavailable" && status !== "reconciled" && status !== "mismatch") return null;

  const billed = record(report.billed);
  const billedUsd = report.billed === null ? null : amount(billed?.totalUsd);
  const unreadable = record(report.unreadable) ?? {};
  const editions = bounded(metered.editions, edition, MAX_EDITIONS);
  const decisions = bounded(metered.decisions, decision, MAX_DECISIONS);
  const envelopes = bounded(metered.envelopes, envelope, MAX_ENVELOPES);

  return {
    generatedAt,
    month,
    total,
    editions: editions.rows,
    decisions: decisions.rows,
    envelopes: envelopes.rows,
    // A report that claims a resolved status without a readable billed figure is not trusted with
    // either: the panel falls back to "unavailable" rather than showing half a reconciliation.
    billedUsd,
    reconciliation: {
      status: billedUsd === null ? "unavailable" : status,
      differenceUsd: billedUsd === null ? null : signed(reconciliation.differenceUsd),
      note: text(reconciliation.note) ?? "No billing figure is recorded for this month."
    },
    unreadable: {
      decisions: count(unreadable.decisions),
      deliveries: count(unreadable.deliveries),
      envelopes: count(unreadable.envelopes),
      ledgerRows: count(unreadable.ledgerRows)
    },
    truncated: {
      editions: editions.truncated,
      decisions: decisions.truncated,
      envelopes: envelopes.truncated
    }
  };
}
