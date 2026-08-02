export const fixedCostCategories = [
  "hosting",
  "database",
  "domain",
  "software",
  "email",
  "other"
] as const;

export type FixedCostCategory = (typeof fixedCostCategories)[number];

export interface FixedCostEntry {
  name: string;
  monthlyUsd: number;
  category: FixedCostCategory;
  since: string;
}

interface StoredFixedCostEntry {
  name: string;
  monthly_usd: number;
  category: FixedCostCategory;
  since: string;
}

export interface StoredFixedCostRegistry {
  schemaVersion: "fixed-costs/1";
  currency: "USD";
  costs: StoredFixedCostEntry[];
  $comment?: string | string[];
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: string): boolean {
  if (!isoDate.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validCategory(value: unknown): value is FixedCostCategory {
  return typeof value === "string" && fixedCostCategories.includes(value as FixedCostCategory);
}

export function parseStoredFixedCostRegistry(value: unknown): StoredFixedCostRegistry | null {
  if (!isRecord(value) || value.schemaVersion !== "fixed-costs/1" || value.currency !== "USD" || !Array.isArray(value.costs)) return null;
  if (value.costs.length > 100) return null;
  if (!(value.$comment === undefined || typeof value.$comment === "string" || (Array.isArray(value.$comment) && value.$comment.every((entry) => typeof entry === "string")))) return null;
  const costs: StoredFixedCostEntry[] = [];
  const seen = new Set<string>();
  for (const entry of value.costs) {
    if (!isRecord(entry)) return null;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name || name.length > 120 || typeof entry.monthly_usd !== "number" || !Number.isFinite(entry.monthly_usd) || entry.monthly_usd <= 0 || entry.monthly_usd > 1_000_000 || !validCategory(entry.category) || typeof entry.since !== "string" || !validDate(entry.since)) return null;
    const key = `${name.toLocaleLowerCase("en-US")}\n${entry.since}`;
    if (seen.has(key)) return null;
    seen.add(key);
    costs.push({ name, monthly_usd: entry.monthly_usd, category: entry.category, since: entry.since });
  }
  return {
    schemaVersion: "fixed-costs/1",
    currency: "USD",
    costs,
    ...(value.$comment === undefined ? {} : { $comment: value.$comment as string | string[] })
  };
}

export function toAdminFixedCosts(registry: StoredFixedCostRegistry): FixedCostEntry[] {
  return registry.costs.map((entry) => ({
    name: entry.name,
    monthlyUsd: entry.monthly_usd,
    category: entry.category,
    since: entry.since
  }));
}

export function replaceStoredFixedCosts(
  registry: StoredFixedCostRegistry,
  costs: FixedCostEntry[]
): StoredFixedCostRegistry | null {
  return parseStoredFixedCostRegistry({
    ...registry,
    costs: costs.map((entry) => ({
      name: entry.name,
      monthly_usd: entry.monthlyUsd,
      category: entry.category,
      since: entry.since
    }))
  });
}
