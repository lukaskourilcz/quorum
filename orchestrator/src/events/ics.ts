/**
 * A small iCalendar (RFC 5545) reader for event candidates.
 *
 * It reads VEVENT blocks and nothing else: no recurrence expansion, no alarms, no timezone
 * definitions. A calendar that publishes an event as an RRULE is offered its first occurrence,
 * which is what the owner would see on the calendar's own page anyway. Pure and synchronous, so
 * the candidate tests run on a fixture string with no network.
 */
export interface IcsEvent {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  url?: string;
  /** The Prague calendar date the event starts on. */
  starts?: string;
  /** The Prague calendar date the event ends on, inclusive. */
  ends?: string;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Continuation lines begin with one space or tab (RFC 5545 §3.1). */
export function unfoldLines(text: string): string[] {
  return text.replace(/\r\n|\r/gu, "\n").replace(/\n[ \t]/gu, "").split("\n");
}

/** `\n`, `\,`, `\;` and `\\` are the only escapes TEXT values carry (§3.3.11). */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/gu, (_, escaped: string) => (escaped === "n" || escaped === "N" ? "\n" : escaped));
}

function parseProperty(line: string): Property | null {
  // The value starts at the first colon outside a quoted parameter value.
  let quoted = false;
  let colon = -1;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === ":" && !quoted) {
      colon = index;
      break;
    }
  }
  if (colon <= 0) return null;
  const [rawName, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const equals = param.indexOf("=");
    if (equals > 0) params[param.slice(0, equals).toUpperCase()] = param.slice(equals + 1).replace(/^"|"$/gu, "");
  }
  return { name: (rawName ?? "").toUpperCase(), params, value: line.slice(colon + 1) };
}

const PRAGUE_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

function addDays(day: string, days: number): string {
  const at = new Date(`${day}T12:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * The Prague calendar date of a DATE or DATE-TIME value.
 *
 * A UTC instant (`...Z`) is converted, because an evening meetup at 23:30 UTC is the next day
 * in Prague. A floating or TZID-qualified local time keeps the date it was written with: the
 * calendars this reads are Czech, and a local date is already the day the organiser meant.
 */
export function pragueDate(property: Pick<Property, "value" | "params">): string | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/u.exec(property.value.trim());
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, utc] = match;
  const date = `${year}-${month}-${day}`;
  if (!hour || !utc) return date;
  const instant = new Date(`${date}T${hour}:${minute}:${second}.000Z`);
  return Number.isNaN(instant.getTime()) ? undefined : PRAGUE_DATE.format(instant);
}

/** Every VEVENT in a calendar, in the order the file lists them. */
export function parseIcsEvents(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Property[] | null = null;
  for (const line of unfoldLines(text)) {
    const trimmed = line.trimEnd();
    if (trimmed.toUpperCase() === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (trimmed.toUpperCase() === "END:VEVENT") {
      if (current) events.push(toEvent(current));
      current = null;
      continue;
    }
    if (!current) continue;
    const property = parseProperty(trimmed);
    if (property) current.push(property);
  }
  return events;
}

function toEvent(properties: readonly Property[]): IcsEvent {
  const first = (name: string) => properties.find((property) => property.name === name);
  const text = (name: string) => {
    const value = first(name)?.value;
    return value === undefined ? undefined : unescapeText(value).trim() || undefined;
  };
  const start = first("DTSTART");
  const end = first("DTEND");
  const starts = start ? pragueDate(start) : undefined;
  let ends = end ? pragueDate(end) : undefined;
  // An all-day DTEND is exclusive: a one-day event on the 5th ends on the 6th.
  if (ends && end && (end.params.VALUE === "DATE" || /^\d{8}$/u.test(end.value.trim()))) ends = addDays(ends, -1);
  if (ends && starts && ends < starts) ends = starts;
  const event: IcsEvent = {};
  const uid = text("UID");
  const summary = text("SUMMARY");
  const description = text("DESCRIPTION");
  const location = text("LOCATION");
  const url = first("URL")?.value.trim();
  if (uid) event.uid = uid;
  if (summary) event.summary = summary;
  if (description) event.description = description;
  if (location) event.location = location;
  if (url) event.url = url;
  if (starts) event.starts = starts;
  if (ends) event.ends = ends;
  return event;
}
