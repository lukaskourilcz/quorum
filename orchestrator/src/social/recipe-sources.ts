import { readdir } from "node:fs/promises";
import path from "node:path";
import { BudgetLedgerEntrySchema } from "../budget.js";
import { SocialPackSchema } from "../contracts/social-pack.js";
import type { PracticalShape } from "../contracts/practical.js";
import { pragueClockParts } from "../meetings/clock.js";
import { readJson } from "../state.js";

/**
 * What the DNESKAi recipes read (quorum#592). Every reader is parse-or-drop: a record that does
 * not parse is left out and counted, never guessed at, and a missing directory is an empty week.
 */

export function addCalendarDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(at.getTime())) throw new Error(`${date} is not a calendar date`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Monday of the date's week, read as the calendar date itself. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay() || 7;
  return addCalendarDays(date, 1 - weekday);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay() || 7;
}

export interface EditionSummary {
  date: string;
  slug: string;
  headline: string;
  standfirst: string;
  ref: string;
}

/** The week's recorded DNESKAi carousel summaries, one per date (the last written), oldest first. */
export async function readEditionSummaries(stateRoot: string, from: string, to: string): Promise<{ editions: EditionSummary[]; dropped: number }> {
  const directory = "ventures/carousel-studio/summaries/caught-up";
  const files = (await readdir(path.join(stateRoot, directory)).catch(() => [] as string[])).filter((file) => file.endsWith(".json")).sort();
  const byDate = new Map<string, EditionSummary>();
  let dropped = 0;
  for (const file of files) {
    const date = file.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date < from || date > to) continue;
    const raw = await readJson<Record<string, unknown> | null>(stateRoot, `${directory}/${file}`, null).catch(() => null);
    const valid = raw && raw.schemaVersion === "carousel-summary/1" && raw.venture === "caught-up" && raw.date === date
      && typeof raw.slug === "string" && typeof raw.headline === "string" && typeof raw.standfirst === "string";
    if (!valid) {
      dropped += 1;
      continue;
    }
    // A recipe's own summary is not an edition.
    if (/-(?:friday-tools|weekly-recap|how-it-was-made|no-edition)$/u.test(raw.slug as string)) continue;
    byDate.set(date, { date, slug: raw.slug as string, headline: raw.headline as string, standfirst: raw.standfirst as string, ref: `state/${directory}/${file}` });
  }
  return { editions: [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)), dropped };
}

export interface WeekTool {
  date: string;
  practical: PracticalShape;
  destination: string;
  ref: string;
}

/** The week's practical items of type `tool`, from the social packs that copied them. */
export async function readWeekTools(stateRoot: string, from: string, to: string): Promise<{ tools: WeekTool[]; dropped: number }> {
  const tools: WeekTool[] = [];
  let dropped = 0;
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) {
    const relative = `social/packs/${date}.json`;
    const raw = await readJson<unknown>(stateRoot, relative, null).catch(() => null);
    if (raw === null) continue;
    const parsed = SocialPackSchema.safeParse(raw);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    const practical = parsed.data.practical;
    if (practical?.type === "tool" && practical.url) {
      tools.push({ date, practical, destination: parsed.data.byLocale.cs.destination, ref: `state/${relative}` });
    }
  }
  return { tools, dropped };
}

export interface RoomQuote {
  agent: string;
  text: string;
  outcome: string;
  ref: string;
}

/**
 * The edition room's record for a date: its outcome, and the turn the pack's quote card uses (STET's,
 * else the first raised concern, else the first turn). Null when the record is missing or malformed.
 */
export async function readEditionRoom(stateRoot: string, date: string): Promise<RoomQuote | null> {
  const relative = `meetings/${date}-cu-edition.json`;
  const raw = await readJson<Record<string, unknown> | null>(stateRoot, relative, null).catch(() => null);
  const decision = raw?.decision as { outcome?: unknown } | undefined;
  if (!raw || typeof decision?.outcome !== "string") return null;
  const turns = ((raw.roomTranscript as { turns?: unknown } | undefined)?.turns ?? []) as Array<{ agent?: unknown; mode?: unknown; text?: unknown }>;
  const usable = turns.filter((turn) => typeof turn.agent === "string" && typeof turn.text === "string" && (turn.text as string).trim());
  const best = usable.find((turn) => turn.agent === "STET") ?? usable.find((turn) => turn.mode === "raises-concern") ?? usable[0];
  return { agent: (best?.agent as string) ?? "", text: ((best?.text as string) ?? "").trim(), outcome: decision.outcome, ref: `state/${relative}` };
}

/**
 * What DNESKAi's model calls cost on a Prague date, from the budget ledger. Null when the ledger
 * records nothing for that day: an unrecorded day is an absence, not a free one.
 */
export async function ledgerCostUsd(stateRoot: string, date: string): Promise<number | null> {
  const raw = await readJson<{ entries?: unknown[] }>(stateRoot, "budget/ledger.json", { entries: [] }).catch(() => ({ entries: [] }));
  let total = 0;
  let seen = 0;
  for (const entry of raw.entries ?? []) {
    const parsed = BudgetLedgerEntrySchema.safeParse(entry);
    if (!parsed.success || parsed.data.ventureId !== "caught-up") continue;
    if (pragueClockParts(new Date(parsed.data.ts)).date !== date) continue;
    total += parsed.data.usd;
    seen += 1;
  }
  return seen > 0 ? Math.round(total * 100) / 100 : null;
}
