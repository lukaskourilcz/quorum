import { safeFetch, type SafeFetchOptions } from "../security/url.js";
import type { SourceFetchContext } from "../sources/types.js";

/**
 * Scheduled cards, read from Wikipedia.
 *
 * FightAIQ discovers events from Cito and then has no card to put in them: the bouts endpoint has
 * returned nothing on every run, and intake drops an event with no card, so state/mma/events has
 * always been empty. Wikipedia does publish schedules, on the same keyless endpoint the roster
 * reader already uses and a host already in the allowlist.
 *
 * The two promotions are not laid out the same way, which is the whole reason this is one module
 * with two readers rather than one clever parser:
 *
 * - "List of UFC events" carries a dedicated "Scheduled events" table. Every row in it is future.
 * - "2026 in Oktagon MMA" carries a single "List of events" table for the whole year, past and
 *   future mixed, so rows have to be filtered by their own date.
 */

const USER_AGENT = "boardlessai-fightaiq/0.1 (https://github.com/lukaskourilcz/quorum)";

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

export interface ScheduledEvent {
  org: "ufc" | "oktagon";
  name: string;
  /** Midnight UTC on the published day. Wikipedia gives a date, never a start time. */
  startsAtUtc: string;
  venue: string | null;
  location: string | null;
  sourceTitle: string;
}

/** `{{dts|2026|Oct|24}}` and `{{dts|2026|10|24}}` both appear on these pages. */
export function parseDtsDate(cell: string): string | null {
  const match = /\{\{\s*dts\s*\|(?:[^|}]*\|)*?(\d{4})\|([A-Za-z]+|\d{1,2})\|(\d{1,2})/u.exec(cell);
  if (!match) return null;
  const [, year, rawMonth, day] = match;
  const month = /^\d+$/u.test(rawMonth!) ? Number(rawMonth) - 1 : MONTHS[rawMonth!.slice(0, 3).toLowerCase()];
  if (month === undefined || Number.isNaN(month)) return null;
  const at = Date.UTC(Number(year), month, Number(day));
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

/**
 * A table cell as a reader would see it.
 *
 * Links are unwrapped in place rather than extracted, because a cell is often a link plus text —
 * `[[Dortmund]], Germany` is a location, and returning just the link would publish the city and
 * throw away the country. Piped links keep their label: readers know the venue by the name on the
 * page, not by the article it points at.
 */
export function parseWikiLinkLabel(cell: string): string | null {
  const rendered = cell
    .replace(/<ref[\s\S]*?(?:\/>|<\/ref>)/gu, "")
    .replace(/\[\[(?:[^\]|]+)\|([^\]]+)\]\]/gu, "$1")
    .replace(/\[\[([^\]|]+)\]\]/gu, "$1")
    .replace(/\{\{[^{}]*\}\}/gu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/^\s*align=\w+\|/u, "")
    .replace(/^#/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  return rendered || null;
}

/** Split one wikitable into its data rows, each row into its cells. */
function tableRows(table: string): string[][] {
  return table
    .split(/^\s*\|-\s*$/mu)
    .slice(1)
    .map((row) => row
      .split(/^\s*\|(?!\|)/mu)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0 && !cell.startsWith("!")))
    .filter((cells) => cells.length >= 2);
}

/** The wikitable that follows a heading, or the first one on the page when no heading is given. */
function tableAfter(wikitext: string, heading: string | null): string | null {
  const from = heading === null ? 0 : wikitext.search(new RegExp(`^==+\\s*${heading}\\s*==+`, "mu"));
  if (from < 0) return null;
  const open = wikitext.indexOf("{|", from);
  if (open < 0) return null;
  const close = wikitext.indexOf("\n|}", open);
  return close < 0 ? wikitext.slice(open) : wikitext.slice(open, close);
}

export function projectScheduledEvents(input: {
  wikitext: string;
  org: ScheduledEvent["org"];
  sourceTitle: string;
  heading: string | null;
  now: Date;
}): ScheduledEvent[] {
  const table = tableAfter(input.wikitext, input.heading);
  if (!table) return [];
  const events: ScheduledEvent[] = [];
  for (const cells of tableRows(table)) {
    // Position, not pattern. Both tables put the event immediately before the date and the venue
    // and location immediately after it — "List of UFC events" as Event|Date|Venue|Location|Ref,
    // and Oktagon's year table as #|Event|Date|Venue|Location. Picking the name by looking for a
    // wikilink instead put a venue in the event column when a row happened to have no link on its
    // name, and the row number in when it had none at all.
    const dateIndex = cells.findIndex((cell) => cell.includes("{{dts"));
    if (dateIndex < 1) continue;
    const startsAtUtc = parseDtsDate(cells[dateIndex]!);
    if (!startsAtUtc) continue;
    // Oktagon's table covers the whole year, so a row is only scheduled if its own date says so.
    // The UFC section is future by construction; filtering both costs nothing and means neither
    // reader depends on a page's section titles staying what they are today.
    if (Date.parse(startsAtUtc) < input.now.getTime()) continue;
    const name = parseWikiLinkLabel(cells[dateIndex - 1]!);
    if (!name) continue;
    events.push({
      org: input.org,
      name,
      startsAtUtc,
      venue: cells[dateIndex + 1] ? parseWikiLinkLabel(cells[dateIndex + 1]!) : null,
      location: cells[dateIndex + 2] ? parseWikiLinkLabel(cells[dateIndex + 2]!) : null,
      sourceTitle: input.sourceTitle
    });
  }
  return events.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
}

async function wikitextOf(input: {
  title: string;
  context: SourceFetchContext;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<string> {
  const endpoint = new URL("https://en.wikipedia.org/w/api.php");
  for (const [key, value] of Object.entries({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    redirects: "1",
    maxlag: "5",
    titles: input.title
  })) endpoint.searchParams.set(key, value);
  const response = await safeFetch(endpoint.toString(), {
    allowHosts: input.context.allowHosts,
    headers: { "User-Agent": USER_AGENT },
    maxBytes: 3_000_000,
    timeoutMs: 20_000,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
  });
  const body = JSON.parse(new TextDecoder().decode(response.body)) as {
    query?: { pages?: Array<{ revisions?: Array<{ slots?: { main?: { content?: string } } }> }> };
  };
  return body.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? "";
}

/** Where each promotion publishes its schedule, and under which heading. */
export const SCHEDULE_PAGES: ReadonlyArray<{
  org: ScheduledEvent["org"];
  title: string;
  heading: string | null;
}> = [
  { org: "ufc", title: "List of UFC events", heading: "Scheduled events" },
  // Oktagon has no scheduled section; its year page lists everything and the dates decide.
  { org: "oktagon", title: "2026 in Oktagon MMA", heading: null }
];

export async function fetchScheduledEvents(input: {
  context: SourceFetchContext;
  now: Date;
  pages?: typeof SCHEDULE_PAGES;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<ScheduledEvent[]> {
  const pages = input.pages ?? SCHEDULE_PAGES;
  const found: ScheduledEvent[] = [];
  for (const page of pages) {
    try {
      const wikitext = await wikitextOf({
        title: page.title,
        context: input.context,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
      });
      found.push(...projectScheduledEvents({
        wikitext,
        org: page.org,
        sourceTitle: page.title,
        heading: page.heading,
        now: input.now
      }));
    } catch {
      // One promotion's page being unreadable is not a reason to lose the other's schedule.
    }
  }
  return found.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
}
