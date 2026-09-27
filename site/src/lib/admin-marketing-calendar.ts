import "server-only";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { readAdminQueue } from "@/lib/admin-queue";
import type { AdminQueueItemView } from "@/lib/admin-queue/types";
import { readAdminJson } from "@/lib/admin-repository";
import { pragueCalendarDate } from "@/lib/calendar-feed-model";
import {
  parseMarketingCalendar,
  type CalendarDocument,
  type CalendarEntry,
  type CalendarStatus
} from "@/lib/marketing-calendar-model";
import { periodDays, type CalendarEntryView } from "@/lib/marketing-calendar-view";

/**
 * The admin Calendar's one read boundary (quorum#592).
 *
 * It merges four things and owns none of them: the venture's `marketing-calendar/1` document, the
 * devShark weekday rotation in `config/marketingshark.json`, which days marketingShark already
 * wrote a package for, and the Queue snapshot. The Queue is the only source of `queued` and
 * `published` — the document's status is what the owner set, the calendar shows the Queue's word
 * wherever the Queue has one. Nothing here publishes, schedules or starts a room.
 */

export const MARKETING_CALENDAR_VENTURES = [
  { id: "marketingshark", label: "devShark", queueKey: "devshark" },
  { id: "caught-up", label: "DNESKAi", queueKey: "caught-up" }
] as const;
export type MarketingCalendarVentureId = (typeof MARKETING_CALENDAR_VENTURES)[number]["id"];

export function isMarketingCalendarVenture(value: unknown): value is MarketingCalendarVentureId {
  return MARKETING_CALENDAR_VENTURES.some((venture) => venture.id === value);
}

export function marketingCalendarPath(venture: MarketingCalendarVentureId): string {
  return `state/marketing-calendar/${venture}.json`;
}

/** own-dashboard's IG TIPS page; `?q=<exact title>` opens one tip (own-dashboard#91). */
export function ownDashboardUrl(): string {
  const configured = process.env.OWN_DASHBOARD_URL?.trim();
  if (configured && /^https:\/\/[^\s/]+/u.test(configured)) return configured.replace(/\/+$/u, "");
  return "https://own-dashboard-tau.vercel.app";
}

export type MarketingCalendarSnapshot =
  | {
      state: "ready";
      venture: { id: MarketingCalendarVentureId; label: string };
      document: CalendarDocument;
      entries: CalendarEntryView[];
      /** Weekday → marketingShark kind, devShark only. */
      rotation: Record<string, string> | null;
      queue: { state: "read" | "unavailable"; matched: number; unmatched: number };
      today: string;
      clock: string;
      ownDashboardUrl: string;
      sourcePath: string;
    }
  | {
      state: "missing" | "malformed";
      venture: { id: MarketingCalendarVentureId; label: string };
      reason: string;
      sourcePath: string;
      today: string;
    };

const QUEUED: ReadonlySet<string> = new Set(["approved", "queued", "publishing"]);

/** The calendar's word for a Queue status, or null where the Queue says nothing the calendar tracks. */
function statusFromQueue(status: string): CalendarStatus | null {
  if (status === "published") return "published";
  if (QUEUED.has(status)) return "queued";
  if (status === "draft") return "drafted";
  return null;
}

function kindFits(entry: CalendarEntry, item: Pick<AdminQueueItemView, "contentKind">): boolean {
  if (item.contentKind === "text") return entry.kind === "thread" || entry.kind === "post";
  return entry.kind !== "task" && entry.kind !== "review" && entry.kind !== "ad";
}

/**
 * Fold the Queue into the entries, keyed by date + venture + platform.
 *
 * A day can hold two Threads posts and one Queue item, so each item goes to one entry: the one an
 * automated producer drafts before one the owner writes, an entry of a fitting kind before any
 * other, earlier before later. An item that fits no entry is counted, not invented into the plan.
 */
export function mergeCalendarEntries(input: {
  entries: readonly CalendarEntry[];
  queueItems: readonly Pick<AdminQueueItemView, "id" | "ventureKey" | "platform" | "status" | "contentKind" | "publishWindow" | "designLabHref" | "permalink">[];
  queueKey: string;
  packageDates: ReadonlySet<string> | null;
  rotation: Record<string, string> | null;
  period: { start: string; end: string };
}): { entries: CalendarEntryView[]; matched: number; unmatched: number } {
  const views: CalendarEntryView[] = input.entries.map((entry) => ({
    ...entry,
    effectiveStatus: entry.status,
    statusSource: entry.status === "queued" || entry.status === "published" ? "queue" : "owner",
    queue: null,
    packageExists: input.packageDates && entry.producer === "marketingShark" ? input.packageDates.has(entry.date) : null,
    synthetic: false
  }));
  let matched = 0;
  let unmatched = 0;
  const items = input.queueItems
    .filter((item) => item.ventureKey === input.queueKey)
    .sort((left, right) => left.publishWindow.notBefore.localeCompare(right.publishWindow.notBefore));
  for (const item of items) {
    const date = pragueCalendarDate(new Date(item.publishWindow.notBefore));
    // A post from before or after the plan is not the plan's business, and not a mismatch either.
    if (date < input.period.start || date > input.period.end) continue;
    const candidates = views
      .filter((view) => view.date === date && view.platform === item.platform && view.queue === null && kindFits(view, item))
      .sort((left, right) => Number(left.producer === "owner") - Number(right.producer === "owner"));
    const target = candidates[0];
    if (!target) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    target.queue = { itemId: item.id, status: item.status, designLabHref: item.designLabHref, permalink: item.permalink };
    const derived = statusFromQueue(item.status);
    // A Queue draft only says "drafted" over an entry nobody has moved yet; an owner's skip or
    // block stands. Queued and published are the Queue's alone.
    if (derived === "queued" || derived === "published" || (derived === "drafted" && target.status === "planned")) {
      target.effectiveStatus = derived;
      target.statusSource = "queue";
    }
  }
  if (input.rotation) {
    const covered = new Set(views.map((view) => view.date));
    for (const day of periodDays(input.period)) {
      if (covered.has(day)) continue;
      const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)).toLowerCase();
      const kind = input.rotation[weekday];
      if (!kind) continue;
      views.push({
        id: `rotation-${day}`,
        date: day,
        time: "07:00",
        platform: "instagram",
        kind: "carousel",
        pillar: null,
        title: `marketingShark ${kind.replaceAll("-", " ")} (rotation)`,
        hook: null,
        hookType: null,
        body: `The plan has nothing on this day, so marketingShark's weekday rotation applies: it drafts a ${kind} package into the Queue at 07:00.`,
        cta: null,
        assets: [],
        effortMin: null,
        status: "planned",
        blockedBy: null,
        producer: "marketingShark",
        tipRefs: [],
        measure: null,
        links: [],
        note: null,
        effectiveStatus: "planned",
        statusSource: "owner",
        queue: null,
        packageExists: input.packageDates ? input.packageDates.has(day) : null,
        synthetic: true
      });
    }
    views.sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`) || left.id.localeCompare(right.id));
  }
  return { entries: views, matched, unmatched };
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

async function readRotation(root: string): Promise<Record<string, string> | null> {
  try {
    const config = await readAdminJson(root, "config/marketingshark.json") as { brands?: Array<{ id?: string; rotation?: unknown }> };
    const rotation = config.brands?.find((brand) => brand.id === "devshark")?.rotation;
    if (!rotation || typeof rotation !== "object") return null;
    return Object.fromEntries(Object.entries(rotation).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
  } catch {
    return null;
  }
}

/**
 * Days marketingShark wrote a devShark package for. Read from the checkout this server runs on:
 * a hint for the detail view, while the Queue item's own Design Lab link stays authoritative.
 */
async function readPackageDates(root: string): Promise<Set<string> | null> {
  try {
    const dates = await readdir(path.join(root, "state", "ventures", "marketingshark", "packages"));
    const present = await Promise.all(dates.filter((name) => /^\d{4}-\d{2}-\d{2}$/u.test(name)).map(async (date) => {
      const brands = await readdir(path.join(root, "state", "ventures", "marketingshark", "packages", date)).catch((): string[] => []);
      return brands.includes("devshark") ? date : null;
    }));
    return new Set(present.filter((date): date is string => date !== null));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? new Set() : null;
  }
}

export async function readAdminMarketingCalendar(
  ventureId: MarketingCalendarVentureId,
  options: { root?: string; now?: Date; queueItems?: readonly AdminQueueItemView[] | null } = {}
): Promise<MarketingCalendarSnapshot> {
  const root = options.root ?? repositoryRoot();
  const now = options.now ?? new Date();
  const today = pragueCalendarDate(now);
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Prague" }).format(now);
  const venture = MARKETING_CALENDAR_VENTURES.find((candidate) => candidate.id === ventureId)!;
  const sourcePath = marketingCalendarPath(ventureId);
  let raw: unknown;
  try {
    raw = await readAdminJson(root, sourcePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      state: code === "ENOENT" ? "missing" : "malformed",
      venture: { id: venture.id, label: venture.label },
      reason: code === "ENOENT" ? `No plan is committed at ${sourcePath} yet.` : `${sourcePath} could not be read as JSON.`,
      sourcePath,
      today
    };
  }
  const parsed = parseMarketingCalendar(raw);
  if (!parsed.ok) {
    return { state: "malformed", venture: { id: venture.id, label: venture.label }, reason: parsed.reason, sourcePath, today };
  }
  const devshark = ventureId === "marketingshark";
  let queueItems = options.queueItems;
  let queueState: "read" | "unavailable" = "read";
  if (queueItems === undefined) {
    try {
      queueItems = (await readAdminQueue(root, { now })).items;
    } catch {
      queueItems = null;
    }
  }
  if (queueItems === null) queueState = "unavailable";
  const [rotation, packageDates] = devshark ? await Promise.all([readRotation(root), readPackageDates(root)]) : [null, null];
  const merged = mergeCalendarEntries({
    entries: parsed.document.entries,
    queueItems: queueItems ?? [],
    queueKey: venture.queueKey,
    packageDates,
    rotation,
    period: parsed.document.period
  });
  return {
    state: "ready",
    venture: { id: venture.id, label: venture.label },
    // The views carry every entry; sending the raw list beside them would double the payload.
    document: { ...parsed.document, entries: [] },
    entries: merged.entries,
    rotation,
    queue: { state: queueState, matched: merged.matched, unmatched: merged.unmatched },
    today,
    clock,
    ownDashboardUrl: ownDashboardUrl(),
    sourcePath
  };
}
