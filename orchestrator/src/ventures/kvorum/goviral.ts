import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MarketingPlanSchema, type MarketingPlan } from "../../contracts/marketing-plan.js";
import {
  KvorumTrendContextSchema,
  type KvorumTrendContext
} from "../../contracts/kvorum-monitor.js";
import { resolveStatePath } from "../../state.js";

const PLAN_DIRECTORY = "ventures/goviral/plans";
const KVORUM_TREND_TACTIC = /^Trend call:\s*(.+?)\s+\(kvorum\):/iu;
const CONTEXT_STOPWORDS = new Set(["call", "kvorum", "trend"]);

function emptyContext(droppedRecords = 0): KvorumTrendContext {
  return KvorumTrendContextSchema.parse({
    topicSet: "kvorum",
    planId: null,
    planRef: null,
    originMeetingRef: null,
    status: null,
    matchedTactics: 0,
    terms: [],
    droppedRecords
  });
}

/** Lowercase ASCII terms make Czech hashtag matching byte-stable across platforms. */
export function normalizeKvorumTrendTerms(value: string): string[] {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return [...new Set((normalized.match(/[a-z0-9]+/gu) ?? [])
    .filter((term) => term.length >= 3 && !CONTEXT_STOPWORDS.has(term)))]
    .sort();
}

function planDate(plan: MarketingPlan): string | null {
  return plan.originMeetingRef.match(/^(\d{4}-\d{2}-\d{2})-gv-brief$/u)?.[1] ?? null;
}

function contextForPlan(
  plan: MarketingPlan,
  filename: string,
  droppedRecords: number
): KvorumTrendContext {
  const usable = plan.status === "approved" || plan.status === "owner_rated";
  const calls = usable
    ? plan.tactics.flatMap((tactic) => {
        const match = tactic.description.match(KVORUM_TREND_TACTIC);
        return match?.[1] ? [match[1]] : [];
      })
    : [];
  return KvorumTrendContextSchema.parse({
    topicSet: "kvorum",
    planId: plan.id,
    planRef: `state/${PLAN_DIRECTORY}/${filename}`,
    originMeetingRef: plan.originMeetingRef,
    status: plan.status,
    matchedTactics: calls.length,
    terms: [...new Set(calls.flatMap(normalizeKvorumTrendTerms))].sort(),
    droppedRecords
  });
}

/**
 * Read the newest valid GoVIRAL weekly plan at or before the desk date.
 *
 * Invalid records are counted and dropped. A newer draft or archived plan still wins, but carries
 * no boost terms: the desk consumes the record without turning vetoed context into ranking weight.
 */
export async function loadLatestKvorumGoViralContext(input: {
  stateRoot: string;
  asOfDate: string;
}): Promise<KvorumTrendContext> {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.asOfDate)) {
    throw new Error("Kvórum GoVIRAL context requires an ISO date.");
  }
  const directory = resolveStatePath(input.stateRoot, PLAN_DIRECTORY);
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let droppedRecords = 0;
  const candidates: Array<{ filename: string; plan: MarketingPlan; date: string }> = [];
  for (const filename of names.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const parsed = MarketingPlanSchema.safeParse(JSON.parse(
        await readFile(path.join(directory, filename), "utf8")
      ) as unknown);
      const date = parsed.success ? planDate(parsed.data) : null;
      if (!parsed.success || parsed.data.ventureId !== "goviral" || !date) {
        droppedRecords += 1;
        continue;
      }
      if (date <= input.asOfDate) candidates.push({ filename, plan: parsed.data, date });
    } catch {
      droppedRecords += 1;
    }
  }
  candidates.sort((left, right) =>
    right.date.localeCompare(left.date)
    || right.plan.id.localeCompare(left.plan.id)
    || right.filename.localeCompare(left.filename));
  const latest = candidates[0];
  return latest
    ? contextForPlan(latest.plan, latest.filename, droppedRecords)
    : emptyContext(droppedRecords);
}
