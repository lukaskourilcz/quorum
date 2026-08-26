import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The catalog of ways this company could earn.
 *
 * A curated list the owner maintains, not something the runtime writes — so the loader's whole job
 * is to be unable to break the page over a hand edit. Parse-or-drop, count what was dropped, and
 * name it on the panel: a malformed row costs that row.
 */
export interface MonetizationOption {
  id: string;
  name: string;
  category: string;
  description: string;
  fitFor: string[];
  effort: "low" | "medium" | "high";
  upfrontCostUsd: number;
  recurringCostUsd: number;
  blockers: string[];
  status: "future-reference" | "blocked";
}

export interface MonetizationCatalog {
  updatedAt: string | null;
  posture: "information-only";
  executionEnabled: false;
  /** Grouped by category, categories in alphabetical order, options in file order inside each. */
  byCategory: Array<{ category: string; options: MonetizationOption[] }>;
  total: number;
  dropped: number;
  state: "missing" | "present";
}

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => text(entry, 200)).filter((entry): entry is string => entry !== null)
    : [];
}

function parseOption(value: unknown): MonetizationOption | null {
  const option = record(value);
  const id = text(option?.id, 80);
  const name = text(option?.name, 160);
  const category = text(option?.category, 60);
  const description = text(option?.description, 1_200);
  const upfrontCostUsd = money(option?.upfrontCostUsd);
  const recurringCostUsd = money(option?.recurringCostUsd);
  const effort = ["low", "medium", "high"].includes(String(option?.effort))
    ? option!.effort as MonetizationOption["effort"]
    : null;
  const status = ["future-reference", "blocked"].includes(String(option?.status))
    ? option!.status as MonetizationOption["status"]
    : null;
  if (!id || !name || !category || !description || !effort || !status
    || upfrontCostUsd === null || recurringCostUsd === null) return null;

  return {
    id,
    name,
    category,
    description,
    fitFor: strings(option?.fitFor),
    effort,
    upfrontCostUsd,
    recurringCostUsd,
    blockers: strings(option?.blockers),
    status
  };
}

export async function readMonetizationOptions(root = repositoryRoot): Promise<MonetizationCatalog> {
  const empty: MonetizationCatalog = {
    updatedAt: null,
    posture: "information-only",
    executionEnabled: false,
    byCategory: [],
    total: 0,
    dropped: 0,
    state: "missing"
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.join(root, "config", "monetization-options.json"), "utf8"));
  } catch {
    return empty;
  }

  const file = record(parsed);
  if (file?.schemaVersion !== "monetization-option/2"
    || file.posture !== "information-only"
    || file.executionEnabled !== false
    || !Array.isArray(file.options)) return empty;

  let dropped = 0;
  const options: MonetizationOption[] = [];
  for (const value of file.options) {
    const option = parseOption(value);
    if (option) options.push(option);
    else dropped += 1;
  }

  const byCategory = new Map<string, MonetizationOption[]>();
  for (const option of options) {
    byCategory.set(option.category, [...(byCategory.get(option.category) ?? []), option]);
  }

  return {
    updatedAt: text(file.updatedAt, 10),
    posture: "information-only",
    executionEnabled: false,
    byCategory: [...byCategory.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, entries]) => ({ category, options: entries })),
    total: options.length,
    dropped,
    state: "present"
  };
}
