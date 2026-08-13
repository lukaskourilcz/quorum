export interface AdminRecentActivityEvent {
  at: string;
  singular: string;
  plural: string;
}

export interface AdminRecentActivityInput {
  ventureId: string;
  ventureName: string;
  href: string;
  events: AdminRecentActivityEvent[];
}

export interface AdminRecentActivityRow {
  ventureId: string;
  ventureName: string;
  href: string;
  count: number;
  summary: string;
  latestAt: string | null;
  latestLabel: string | null;
}

const PRAGUE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function pragueDay(date: Date): string {
  const parts = Object.fromEntries(PRAGUE.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! - 1)).toISOString().slice(0, 10);
}

function joinSummary(parts: string[]): string {
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts.length - 2} more`;
}

/**
 * Four truthful answers to “what happened since yesterday”.
 *
 * The boundary is the start of yesterday's Prague calendar day, not a rolling 24-hour guess.
 * Invalid and future timestamps are discarded. An empty answer stays empty rather than turning a
 * missing store into a confident zero.
 */
export function buildAdminRecentActivity(
  inputs: readonly AdminRecentActivityInput[],
  now: Date
): AdminRecentActivityRow[] {
  const nowMs = now.getTime();
  const earliestDay = previousDay(pragueDay(now));
  return inputs.map((input) => {
    const valid = input.events
      .map((event) => ({ ...event, time: Date.parse(event.at) }))
      .filter((event) => Number.isFinite(event.time) && event.time <= nowMs)
      .sort((left, right) => right.time - left.time || left.singular.localeCompare(right.singular));
    const recent = valid.filter((event) => pragueDay(new Date(event.time)) >= earliestDay);
    const counts = new Map<string, { count: number; singular: string; plural: string }>();
    for (const event of recent) {
      const key = `${event.singular}\0${event.plural}`;
      const current = counts.get(key);
      counts.set(key, { count: (current?.count ?? 0) + 1, singular: event.singular, plural: event.plural });
    }
    const parts = [...counts.values()]
      .sort((left, right) => right.count - left.count || left.singular.localeCompare(right.singular))
      .map(({ count, singular, plural }) => `${count} ${count === 1 ? singular : plural}`);
    const latest = valid[0] ?? null;
    return {
      ventureId: input.ventureId,
      ventureName: input.ventureName,
      href: input.href,
      count: recent.length,
      summary: parts.length ? `${joinSummary(parts)} since yesterday.` : "No recorded activity since yesterday.",
      latestAt: latest?.at ?? null,
      latestLabel: latest?.singular ?? null
    };
  });
}
