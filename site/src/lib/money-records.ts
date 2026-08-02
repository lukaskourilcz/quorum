import { readFile } from "node:fs/promises";
import path from "node:path";

export type KpiStatus = "on-track" | "at-risk" | "off-track" | "unavailable";
export type KpiUnit = "count" | "ratio" | "usd" | "score" | "boolean";
export type MonetizationStatus = "locked" | "ready" | "proposed" | "active";

export interface PublicKpiStatus {
  id: string;
  venture: string;
  name: string;
  unit: KpiUnit;
  actual: number | null;
  target: number;
  direction: "at-least" | "at-most";
  critical: boolean;
  status: KpiStatus;
  paceTarget: number | null;
  attainmentRatio: number | null;
  rampActive: boolean;
  reason: string | null;
}

export interface PublicMonetizationMethod {
  id: string;
  venture: string;
  method: string;
  status: MonetizationStatus;
  activationKpi: string;
  readiness: { met: boolean; unavailable: boolean; detail: string };
  proposal: null | { summary: string; channels: string[]; ownerChecklist: string[]; constraints: string[] };
  ownerGateRequired: true;
  note: string;
}

export interface PublicMoneySnapshot {
  schemaVersion: "money-public/1";
  generatedAt: string;
  quarter: {
    id: string;
    start: string;
    end: string;
    daysRemaining: number;
    statuses: PublicKpiStatus[];
  };
  monetization: PublicMonetizationMethod[];
  costs: {
    currency: "USD";
    api: { month: string; monthlyUsd: number; cumulativeUsd: number };
    fixed: {
      monthlyUsd: number;
      cumulativeUsd: number;
      byCategory: Array<{ category: string; monthlyUsd: number; cumulativeUsd: number }>;
    };
    totalMonthlyBurnUsd: number;
    cumulativeSpendUsd: number;
  };
  revenue: { recognizedUsd: number };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function nullableAmount(value: unknown): number | null | undefined {
  return value === null ? null : amount(value) ?? undefined;
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim()) ? [...value] : null;
}

function parseKpi(value: unknown): PublicKpiStatus | null {
  const entry = record(value);
  if (!entry) return null;
  const id = text(entry.id);
  const venture = text(entry.venture);
  const name = text(entry.name);
  const unit = ["count", "ratio", "usd", "score", "boolean"].includes(String(entry.unit)) ? entry.unit as KpiUnit : null;
  const actual = nullableAmount(entry.actual);
  const target = amount(entry.target);
  const direction = entry.direction === "at-least" || entry.direction === "at-most" ? entry.direction : null;
  const status = ["on-track", "at-risk", "off-track", "unavailable"].includes(String(entry.status)) ? entry.status as KpiStatus : null;
  const paceTarget = nullableAmount(entry.paceTarget);
  const attainmentRatio = nullableAmount(entry.attainmentRatio);
  const reason = entry.reason === null ? null : text(entry.reason);
  if (!id || !venture || !name || !unit || actual === undefined || target === null || !direction || typeof entry.critical !== "boolean" || !status || paceTarget === undefined || attainmentRatio === undefined || typeof entry.rampActive !== "boolean" || reason === undefined) return null;
  if (status === "unavailable" && actual !== null) return null;
  return { id, venture, name, unit, actual, target, direction, critical: entry.critical, status, paceTarget, attainmentRatio, rampActive: entry.rampActive, reason };
}

function parseProposal(value: unknown): PublicMonetizationMethod["proposal"] | undefined {
  if (value === null) return null;
  const proposal = record(value);
  if (!proposal) return undefined;
  const summary = text(proposal.summary);
  const channels = stringList(proposal.channels);
  const ownerChecklist = stringList(proposal.ownerChecklist);
  const constraints = stringList(proposal.constraints);
  return summary && channels && ownerChecklist && constraints ? { summary, channels, ownerChecklist, constraints } : undefined;
}

function parseMonetization(value: unknown): PublicMonetizationMethod | null {
  const entry = record(value);
  const readiness = record(entry?.readiness);
  if (!entry || !readiness) return null;
  const id = text(entry.id);
  const venture = text(entry.venture);
  const method = text(entry.method);
  const activationKpi = text(entry.activationKpi);
  const note = text(entry.note);
  const detail = text(readiness.detail);
  const status = ["locked", "ready", "proposed", "active"].includes(String(entry.status)) ? entry.status as MonetizationStatus : null;
  const proposal = parseProposal(entry.proposal);
  if (!id || !venture || !method || !activationKpi || !note || !detail || !status || typeof readiness.met !== "boolean" || typeof readiness.unavailable !== "boolean" || proposal === undefined || entry.ownerGateRequired !== true) return null;
  return { id, venture, method, status, activationKpi, readiness: { met: readiness.met, unavailable: readiness.unavailable, detail }, proposal, ownerGateRequired: true, note };
}

function parseCategory(value: unknown): PublicMoneySnapshot["costs"]["fixed"]["byCategory"][number] | null {
  const entry = record(value);
  if (!entry) return null;
  const category = text(entry.category);
  const monthlyUsd = amount(entry.monthlyUsd);
  const cumulativeUsd = amount(entry.cumulativeUsd);
  return category && monthlyUsd !== null && cumulativeUsd !== null ? { category, monthlyUsd, cumulativeUsd } : null;
}

export function parsePublicMoneySnapshot(value: unknown): PublicMoneySnapshot | null {
  const snapshot = record(value);
  const quarter = record(snapshot?.quarter);
  const costs = record(snapshot?.costs);
  const api = record(costs?.api);
  const fixed = record(costs?.fixed);
  const revenue = record(snapshot?.revenue);
  if (!snapshot || snapshot.schemaVersion !== "money-public/1" || !quarter || !costs || !api || !fixed || !revenue) return null;
  const generatedAt = text(snapshot.generatedAt);
  const quarterId = text(quarter.id);
  const start = isoDate(quarter.start);
  const end = isoDate(quarter.end);
  const daysRemaining = amount(quarter.daysRemaining);
  if (!generatedAt || Number.isNaN(new Date(generatedAt).getTime()) || !quarterId || !/^\d{4}-Q[1-4]$/.test(quarterId) || !start || !end || start > end || daysRemaining === null || !Number.isInteger(daysRemaining) || daysRemaining > 90 || !Array.isArray(quarter.statuses) || !Array.isArray(snapshot.monetization) || !Array.isArray(fixed.byCategory)) return null;
  const statuses = quarter.statuses.map(parseKpi);
  const monetization = snapshot.monetization.map(parseMonetization);
  const byCategory = fixed.byCategory.map(parseCategory);
  if (statuses.some((entry) => !entry) || monetization.some((entry) => !entry) || byCategory.some((entry) => !entry)) return null;
  const month = text(api.month);
  const monthlyApiUsd = amount(api.monthlyUsd);
  const cumulativeApiUsd = amount(api.cumulativeUsd);
  const fixedMonthlyUsd = amount(fixed.monthlyUsd);
  const fixedCumulativeUsd = amount(fixed.cumulativeUsd);
  const totalMonthlyBurnUsd = amount(costs.totalMonthlyBurnUsd);
  const cumulativeSpendUsd = amount(costs.cumulativeSpendUsd);
  const recognizedUsd = amount(revenue.recognizedUsd);
  if (costs.currency !== "USD" || !month || !/^\d{4}-\d{2}$/.test(month) || [monthlyApiUsd, cumulativeApiUsd, fixedMonthlyUsd, fixedCumulativeUsd, totalMonthlyBurnUsd, cumulativeSpendUsd, recognizedUsd].some((entry) => entry === null)) return null;
  return {
    schemaVersion: "money-public/1",
    generatedAt,
    quarter: { id: quarterId, start, end, daysRemaining, statuses: statuses as PublicKpiStatus[] },
    monetization: monetization as PublicMonetizationMethod[],
    costs: {
      currency: "USD",
      api: { month, monthlyUsd: monthlyApiUsd!, cumulativeUsd: cumulativeApiUsd! },
      fixed: { monthlyUsd: fixedMonthlyUsd!, cumulativeUsd: fixedCumulativeUsd!, byCategory: byCategory as PublicMoneySnapshot["costs"]["fixed"]["byCategory"] },
      totalMonthlyBurnUsd: totalMonthlyBurnUsd!,
      cumulativeSpendUsd: cumulativeSpendUsd!
    },
    revenue: { recognizedUsd: recognizedUsd! }
  };
}

export async function getPublicMoneySnapshot(root = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")): Promise<PublicMoneySnapshot | null> {
  try {
    return parsePublicMoneySnapshot(JSON.parse(await readFile(path.join(root, "state/money/public.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}
