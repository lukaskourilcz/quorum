import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DateSchema } from "../../contracts/common.js";
import { MarketingPlanSchema, type MarketingPlan } from "../../contracts/marketing-plan.js";

export interface DoorMoneyGoViralBrief {
  ref: string;
  date: string;
  id: string;
  title: string;
  summary: string;
  objective: string;
  tactics: Array<{
    type: string;
    description: string;
    platformPolicyNote: string;
  }>;
  status: MarketingPlan["status"];
  originMeetingRef: string;
}

export interface LoadedDoorMoneyGoViralBrief {
  latest: DoorMoneyGoViralBrief | null;
  dropped: number;
}

export function projectDoorMoneyGoViralBrief(plan: MarketingPlan): DoorMoneyGoViralBrief | null {
  const idMatch = /^plan-(\d{4}-\d{2}-\d{2})-weekly-brief$/u.exec(plan.id);
  const meetingMatch = /^(\d{4}-\d{2}-\d{2})-gv-brief$/u.exec(plan.originMeetingRef);
  if (!idMatch || !meetingMatch || idMatch[1] !== meetingMatch[1] || !DateSchema.safeParse(idMatch[1]).success) {
    return null;
  }
  const reference = `goviral-plan:${plan.id}`;
  if (reference.length > 160) return null;
  return {
    ref: reference,
    date: idMatch[1]!,
    id: plan.id,
    title: plan.title,
    summary: plan.summary,
    objective: plan.objective,
    tactics: plan.tactics.slice(0, 24).map((tactic) => ({
      type: tactic.type,
      description: tactic.description,
      platformPolicyNote: tactic.platformPolicyNote
    })),
    status: plan.status,
    originMeetingRef: plan.originMeetingRef
  };
}

/** Reads only canonical recorded weekly briefs at or before the consuming room's date. */
export async function loadLatestDoorMoneyGoViralBrief(
  root: string,
  asOfDate: string
): Promise<LoadedDoorMoneyGoViralBrief> {
  const throughDate = DateSchema.parse(asOfDate);
  const directory = path.join(root, "ventures", "goviral", "plans");
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(({ name }) => name)
      .sort();
  } catch (error) {
    return {
      latest: null,
      dropped: (error as NodeJS.ErrnoException).code === "ENOENT" ? 0 : 1
    };
  }

  const briefs: DoorMoneyGoViralBrief[] = [];
  let dropped = 0;
  for (const name of names) {
    try {
      const parsed = MarketingPlanSchema.safeParse(
        JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown
      );
      const projected = parsed.success && parsed.data.ventureId === "goviral"
        ? projectDoorMoneyGoViralBrief(parsed.data)
        : null;
      if (projected && name === `${projected.id}.json` && projected.date <= throughDate) briefs.push(projected);
      else dropped += 1;
    } catch {
      dropped += 1;
    }
  }
  briefs.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  return { latest: briefs[0] ?? null, dropped };
}
