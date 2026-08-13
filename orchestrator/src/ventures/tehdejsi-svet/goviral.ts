import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MarketingPlanSchema, type MarketingPlan } from "../../contracts/marketing-plan.js";

const PLAN_ID = /^plan-(\d{4}-\d{2}-\d{2})-weekly-brief$/u;
const MEETING_ID = /^(\d{4}-\d{2}-\d{2})-gv-brief$/u;
const FREE_CALL = /^Trend call:\s*(.+?)\s+\(tehdejsi-svet,\s*free\s+(?:velocity|volume|rank),\s*(?:cs|en)\):\s*([0-9]+(?:\.[0-9]+)?)\.?$/iu;

export interface TehdejsiTimingSignal {
  id: string;
  topic: string;
  /** A Ukrainian city-memory call is awareness input, never an engagement boost. */
  wartimeNewsCycle: boolean;
}

export interface TehdejsiGoViralContext {
  planRef: string | null;
  signals: TehdejsiTimingSignal[];
  dropped: number;
}

function planDate(plan: MarketingPlan): string | null {
  const planMatch = PLAN_ID.exec(plan.id);
  const meetingMatch = MEETING_ID.exec(plan.originMeetingRef);
  return planMatch && meetingMatch && planMatch[1] === meetingMatch[1] ? planMatch[1]! : null;
}

export function tehdejsiTimingSignalsFromPlan(plan: MarketingPlan): TehdejsiTimingSignal[] {
  if (plan.ventureId !== "goviral" || (plan.status !== "approved" && plan.status !== "owner_rated")) return [];
  const signals: TehdejsiTimingSignal[] = [];
  const seen = new Set<string>();
  for (const [index, tactic] of plan.tactics.entries()) {
    const match = FREE_CALL.exec(tactic.description.trim());
    if (!match || Number(match[2]) <= 0) continue;
    const topic = match[1]!.trim();
    const key = topic.toLocaleLowerCase("en");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    signals.push({
      id: `${plan.id}:free-${index + 1}`,
      topic,
      wartimeNewsCycle: key === "пам'ять міста"
    });
  }
  return signals.sort((left, right) => left.id.localeCompare(right.id, "en"));
}

/** Reads only the latest canonical, non-future weekly brief. Malformed siblings are counted. */
export async function readTehdejsiGoViralContext(root: string, date: string): Promise<TehdejsiGoViralContext> {
  const directory = path.join(root, "ventures", "goviral", "plans");
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { planRef: null, signals: [], dropped: 0 };
    return { planRef: null, signals: [], dropped: 1 };
  }

  const candidates: Array<{ name: string; plan: MarketingPlan; date: string; signals: TehdejsiTimingSignal[] }> = [];
  let dropped = 0;
  for (const name of names) {
    try {
      const parsed = MarketingPlanSchema.safeParse(JSON.parse(await readFile(path.join(directory, name), "utf8")));
      const plan = parsed.success ? parsed.data : null;
      const recorded = plan ? planDate(plan) : null;
      const signals = plan ? tehdejsiTimingSignalsFromPlan(plan) : [];
      if (plan && plan.ventureId === "goviral" && (plan.status === "approved" || plan.status === "owner_rated")
        && recorded && recorded <= date && name === `${plan.id}.json`) {
        candidates.push({ name, plan, date: recorded, signals });
      } else {
        dropped += 1;
      }
    } catch {
      dropped += 1;
    }
  }
  const latest = candidates.sort((left, right) =>
    right.date.localeCompare(left.date) || right.plan.id.localeCompare(left.plan.id, "en")
  )[0];
  return latest
    ? { planRef: `ventures/goviral/plans/${latest.name}`, signals: latest.signals, dropped }
    : { planRef: null, signals: [], dropped };
}
