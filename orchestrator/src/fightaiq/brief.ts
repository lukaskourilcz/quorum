/**
 * What the intake room is told about the day's sources.
 *
 * It used to be the raw snapshot pasted in and cut at eighteen thousand characters. The snapshot
 * is sixty-six thousand, and the first source in it is the bookmaker feed, so the room read
 * eleven kilobytes of decimal odds, then some fighter records, then nothing — the ninety-two
 * Wikipedia roster entries were past the cut and were never seen at all. On 3 August SPOTTER
 * concluded that no Oktagon data was present. It was present; it was just past the cut.
 *
 * A brief is facts, not a payload. It fits because it counts and names things rather than
 * quoting them, and what it leaves out it says it has left out.
 */

export interface BriefSource {
  sourceId: string;
  status: string;
  reason?: string | null;
  items?: unknown[];
}

export interface FightAiQBriefInput {
  sources: readonly BriefSource[];
  /** Events already verified as being inside the intake horizon, nearest first. */
  horizonEvents: ReadonlyArray<{ id?: string; slug?: string; name?: string; startsAt?: string | null; bouts?: unknown[] }>;
  now: Date;
}

interface Fighter {
  name?: string;
  slug?: string;
  division?: string | null;
  record?: string | null;
  stance?: string | null;
  heightCm?: number | null;
  reachCm?: number | null;
}

/** The fields FightAIQ treats as critical; a profile missing one cannot be used for analysis. */
const CRITICAL_FIELDS = ["division", "record", "stance", "heightCm", "reachCm"] as const;

function missingCritical(fighter: Fighter): string[] {
  return CRITICAL_FIELDS.filter((field) => {
    const value = fighter[field];
    return value === null || value === undefined || value === "";
  });
}

function days(from: Date, to: string | null | undefined): number | null {
  if (!to) return null;
  const at = Date.parse(to);
  return Number.isNaN(at) ? null : Math.round((at - from.getTime()) / 86_400_000);
}

export function fightAiQBrief(input: FightAiQBriefInput): string {
  const lines: string[] = [];

  lines.push("Sources this run:");
  for (const source of input.sources) {
    const count = source.items?.length ?? 0;
    const why = source.status === "success" ? "" : ` — ${source.reason ?? "no reason recorded"}`;
    lines.push(`- ${source.sourceId}: ${source.status}, ${count} item${count === 1 ? "" : "s"}${why}`);
  }

  lines.push("");
  if (input.horizonEvents.length === 0) {
    lines.push("No scheduled card is inside the intake horizon. Do not open weigh-in or press-conference work for an event that is not on the calendar.");
  } else {
    lines.push("Scheduled cards inside the horizon, nearest first:");
    for (const event of input.horizonEvents) {
      const away = days(input.now, event.startsAt ?? null);
      const card = event.bouts?.length ?? 0;
      lines.push(`- ${event.name ?? event.slug ?? event.id ?? "unnamed event"}${away === null ? "" : `, in ${away} day${away === 1 ? "" : "s"}`}: ${card} bout${card === 1 ? "" : "s"} on file`);
    }
  }

  const fighters = input.sources
    .flatMap((source) => (source.items ?? []) as Array<Record<string, unknown>>)
    .filter((item) => item.kind === "fighter" || (typeof item.name === "string" && "record" in item))
    .map((item) => item as Fighter);

  if (fighters.length > 0) {
    const incomplete = fighters
      .map((fighter) => ({ fighter, missing: missingCritical(fighter) }))
      .filter((entry) => entry.missing.length > 0);
    lines.push("");
    lines.push(`Fighter records seen: ${fighters.length}. Complete on every critical field: ${fighters.length - incomplete.length}.`);
    if (incomplete.length > 0) {
      // Named, not dumped: enough to work from, and the count says what is not shown.
      const shown = incomplete.slice(0, 12);
      lines.push("Missing critical fields:");
      for (const { fighter, missing } of shown) {
        lines.push(`- ${fighter.name ?? fighter.slug ?? "unnamed"}: ${missing.join(", ")}`);
      }
      if (incomplete.length > shown.length) {
        lines.push(`- and ${incomplete.length - shown.length} more with at least one critical field missing`);
      }
    }
  }

  const roster = input.sources
    .flatMap((source) => (source.items ?? []) as Array<Record<string, unknown>>)
    .filter((item) => typeof item.wikipediaTitle === "string");
  if (roster.length > 0) {
    const byOrg = new Map<string, number>();
    for (const entry of roster) {
      const org = String(entry.org ?? "unknown");
      byOrg.set(org, (byOrg.get(org) ?? 0) + 1);
    }
    lines.push("");
    lines.push(`Roster pages resolved: ${[...byOrg].map(([org, count]) => `${org} ${count}`).join(", ")}.`);
  }

  return lines.join("\n");
}
