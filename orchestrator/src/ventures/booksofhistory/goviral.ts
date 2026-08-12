import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { MarketingPlanSchema, type MarketingPlan } from "../../contracts/marketing-plan.js";
import type { BhTrendSignal } from "./score.js";

const PLAN_DATE = /^plan-(\d{4}-\d{2}-\d{2})-/u;
const BH_FREE_CALL = /^Trend call:\s*(.+?)\s+\(booksofhistory,\s*free\s+(?:velocity|volume|rank),\s*(?:cs|en)\):\s*([0-9]+(?:\.[0-9]+)?)\.?$/iu;

export interface BhGoViralContext {
  planRef: string | null;
  trendSignals: BhTrendSignal[];
}

function planDate(plan: MarketingPlan): string | null {
  return PLAN_DATE.exec(plan.id)?.[1] ?? null;
}

/**
 * Turn positive, measured BOOKSOFHISTORY calls in an approved GoVIRAL brief into categorical
 * scorer signals. Provider units stay out of the scorer: news volume, search rank and velocity
 * are incomparable, so a recorded positive call is one bounded crossover signal, never a sum.
 */
export function bhTrendSignalsFromPlan(plan: MarketingPlan): BhTrendSignal[] {
  if (plan.ventureId !== "goviral" || (plan.status !== "approved" && plan.status !== "owner_rated")) return [];
  const byTopic = new Map<string, BhTrendSignal>();
  for (const [index, tactic] of plan.tactics.entries()) {
    const match = BH_FREE_CALL.exec(tactic.description.trim());
    if (!match || Number(match[2]) <= 0) continue;
    const topic = match[1]!.replace(/^#/u, "").trim();
    const key = topic.normalize("NFKD").replaceAll(/\p{Mark}/gu, "").toLocaleLowerCase("en");
    if (!key || byTopic.has(key)) continue;
    byTopic.set(key, { id: `${plan.id}:free-${index + 1}`, keywords: [topic], strength: 1 });
  }
  return [...byTopic.values()].sort((left, right) => left.id.localeCompare(right.id, "en"));
}

/** Latest valid, approved GoVIRAL plan at or before the shortlist date; malformed files drop. */
export async function readBhGoViralContext(root: string, date: string): Promise<BhGoViralContext> {
  const directory = path.join(root, "ventures", "goviral", "plans");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { planRef: null, trendSignals: [] };
    throw error;
  }
  const candidates: Array<{ name: string; plan: MarketingPlan; date: string }> = [];
  for (const name of names) {
    try {
      const parsed = MarketingPlanSchema.safeParse(JSON.parse(await readFile(path.join(directory, name), "utf8")));
      if (!parsed.success) continue;
      const recorded = planDate(parsed.data);
      if (parsed.data.ventureId === "goviral" && recorded && recorded <= date) candidates.push({ name, plan: parsed.data, date: recorded });
    } catch { /* A bad sibling plan is dropped; it cannot erase a readable one. */ }
  }
  const latest = candidates.sort((left, right) => right.date.localeCompare(left.date) || right.name.localeCompare(left.name, "en"))[0];
  if (!latest) return { planRef: null, trendSignals: [] };
  const signals = bhTrendSignalsFromPlan(latest.plan);
  return {
    planRef: signals.length ? `ventures/goviral/plans/${latest.name}` : null,
    trendSignals: signals
  };
}
