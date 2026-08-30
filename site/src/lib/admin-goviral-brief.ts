import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The newest GoVIRAL weekly brief, for the page the owner opens first.
 *
 * Five desks parse `Trend call:` lines out of this plan — BOOKSOFHISTORY, Tehdejší svět, Kvórum,
 * Door Money and Personal Growth — and the two magazines read it through their own registered
 * edges. Every one of them returned empty for as long as the room had no scout data, and the brief
 * itself sat in a tab nobody opens. It is the thing the owner reads to decide a week of writing,
 * so it belongs on the board.
 *
 * Read-only and bounded: the newest approved plan, its title, its date and its trend calls. No
 * ideas, no copy, no captions — GoVIRAL supplies bounded intelligence and never final copy, and a
 * summary that carried more would be the wrong side of that line.
 */

export interface GoViralBriefRecord {
  date: string;
  title: string;
  tactics: Array<{ description: string }>;
  href: string;
}

function stateRoot(): string {
  return path.join(process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), ".."), "state");
}

/** `YYYY-MM-DD` from the plan's own filename, which is how the directory is ordered. */
function dateFromName(name: string): string | null {
  return /^(\d{4}-\d{2}-\d{2})/u.exec(name)?.[1] ?? null;
}

export async function readNewestGoViralBrief(): Promise<GoViralBriefRecord | null> {
  const directory = path.join(stateRoot(), "ventures", "goviral", "plans");
  let names: string[] = [];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse();
  } catch {
    // The directory does not exist until the room produces its first brief, which is the state
    // this venture has been in since it was founded. Absent is an answer, not a fault.
    return null;
  }

  interface RawPlan {
    title?: unknown;
    status?: unknown;
    tactics?: unknown;
  }
  for (const name of names) {
    let plan: RawPlan | null = null;
    try {
      plan = JSON.parse(await readFile(path.join(directory, name), "utf8")) as RawPlan;
    } catch {
      // One malformed plan costs one plan. The next-newest is still a brief.
      continue;
    }
    if (!plan || plan.status !== "approved" || typeof plan.title !== "string") continue;
    const tactics = Array.isArray(plan.tactics)
      ? plan.tactics
        .map((tactic) => (tactic as { description?: unknown })?.description)
        .filter((description): description is string => typeof description === "string")
        .map((description) => ({ description }))
      : [];
    return {
      date: dateFromName(name) ?? "",
      title: plan.title,
      tactics,
      href: "/admin?venture=goviral"
    };
  }
  return null;
}
