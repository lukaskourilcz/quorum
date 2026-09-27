/**
 * `marketing-calendar/1`, read tolerantly (quorum#592).
 *
 * The contract is `orchestrator/src/contracts/marketing-calendar.ts`; the site cannot import the
 * orchestrator package, so the enumerations are repeated here and
 * `orchestrator/tests/marketing-calendar-parity.test.ts` fails when the two drift.
 *
 * Parse-or-drop, never throw: one malformed entry costs that entry and a line in `dropped` with
 * its reason, and the rest of the plan still renders. Only a document without a name or without a
 * single readable entry is refused as a whole. The October 2026 documents predate `launch`,
 * `period`, `prelaunch` and `producer`; the period is then the span of the entries, the launch its
 * first day, and `work: auto-draft` becomes the venture's own drafting producer.
 */

export const CALENDAR_PLATFORMS = ["instagram", "threads", "facebook", "reddit", "linkedin", "newsletter", "web"] as const;
export type CalendarPlatform = (typeof CALENDAR_PLATFORMS)[number];
export const CALENDAR_CHANNEL_PLATFORMS = [...CALENDAR_PLATFORMS, "x"] as const;
export type CalendarChannelPlatform = (typeof CALENDAR_CHANNEL_PLATFORMS)[number];
export const CALENDAR_KINDS = ["carousel", "reel", "post", "story", "thread", "reddit", "ad", "task", "review", "newsletter"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];
export const CALENDAR_STATUSES = ["planned", "drafted", "queued", "published", "skipped", "blocked"] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];
export const CALENDAR_OWNER_STATUSES = ["planned", "drafted", "skipped", "blocked"] as const;
export type CalendarOwnerStatus = (typeof CALENDAR_OWNER_STATUSES)[number];
export const CALENDAR_PRODUCERS = ["owner", "marketingShark", "dneskai-pack"] as const;
export type CalendarProducer = (typeof CALENDAR_PRODUCERS)[number];
export const CALENDAR_HOOK_TYPES = [
  "curiosity", "contrarian", "list", "number", "story", "question", "problem", "promise", "negative", "authority"
] as const;

export const CALENDAR_PLATFORM_LABELS: Readonly<Record<CalendarChannelPlatform, string>> = {
  instagram: "Instagram", threads: "Threads", facebook: "Facebook", reddit: "Reddit",
  linkedin: "LinkedIn", newsletter: "Newsletter", web: "Web", x: "X"
};
export const CALENDAR_KIND_LABELS: Readonly<Record<CalendarKind, string>> = {
  carousel: "Carousel", reel: "Reel", post: "Post", story: "Story", thread: "Thread", reddit: "Reddit post",
  ad: "Ad", task: "Task", review: "Review", newsletter: "Newsletter"
};
export const CALENDAR_STATUS_LABELS: Readonly<Record<CalendarStatus, string>> = {
  planned: "Planned", drafted: "Drafted", queued: "Queued", published: "Published", skipped: "Skipped", blocked: "Blocked"
};
export const CALENDAR_PRODUCER_LABELS: Readonly<Record<CalendarProducer, string>> = {
  owner: "Owner", marketingShark: "marketingShark", "dneskai-pack": "DNESKAi pack"
};
/** Kinds that are work rather than something the audience sees. */
export const CALENDAR_WORK_KINDS: ReadonlySet<CalendarKind> = new Set(["task", "review"]);

export interface CalendarEntry {
  id: string;
  date: string;
  time: string;
  platform: CalendarPlatform;
  kind: CalendarKind;
  pillar: string | null;
  title: string;
  hook: string | null;
  hookType: string | null;
  body: string;
  cta: string | null;
  assets: string[];
  effortMin: number | null;
  status: CalendarStatus;
  blockedBy: string | null;
  producer: CalendarProducer;
  tipRefs: string[];
  measure: string | null;
  links: { label: string; url: string }[];
  note: string | null;
}

export interface CalendarAd {
  id: string;
  platform: CalendarPlatform;
  start: string;
  end: string;
  dailyBudgetEur: number;
  days: number;
  totalEur: number;
  objective: string;
  audience: string;
  placement: string;
  creative: string;
  /** An entry id the creative names, when it names one that exists. */
  creativeEntryId: string | null;
  policyNotes: string;
  successRule: string;
  status: CalendarStatus;
}

export interface CalendarPrelaunchItem {
  id: string;
  due: string;
  title: string;
  detail: string;
  owner: "owner" | "agent";
  repo: string | null;
  issue: string | null;
  status: "planned" | "done";
}

export interface CalendarPillar { id: string; name: string; share: string; shareValue: number | null; description: string; tipRefs: string[] }
export interface CalendarChannel { platform: CalendarChannelPlatform; role: "primary" | "secondary" | "support"; handle: string | null; cadence: string; notes: string | null }
export interface CalendarDependency { repo: string; what: string; why: string; issue: string | null; href: string | null }
export interface CalendarSource { title: string; url: string | null; checked: string; note: string }
export interface CalendarDropped { section: string; index: number; id: string | null; reason: string }

export interface CalendarDocument {
  project: string;
  name: string;
  tagline: string;
  description: string;
  audience: string;
  goal: string;
  launch: string;
  period: { start: string; end: string };
  /** True when the document carried no period and it was read off the entries. */
  periodDerived: boolean;
  kpis: { name: string; baseline: string; target: string; how: string }[];
  channels: CalendarChannel[];
  pillars: CalendarPillar[];
  profileSetup: string[];
  weeks: { week: number; dates: string; theme: string; focus: string }[];
  prelaunch: CalendarPrelaunchItem[];
  entries: CalendarEntry[];
  ads: CalendarAd[];
  reviews: { date: string; what: string }[];
  risks: string[];
  productDependencies: CalendarDependency[];
  sources: CalendarSource[];
  dropped: CalendarDropped[];
}

export type CalendarParseResult =
  | { ok: true; document: CalendarDocument }
  | { ok: false; reason: string };

type Row = Record<string, unknown>;

const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/u;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  return new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

/** A trimmed string, or null for an absent or blank one. */
function text(value: unknown, max = 4_000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function texts(value: unknown, max = 1_000): string[] {
  return Array.isArray(value) ? value.map((item) => text(item, max)).filter((item): item is string => item !== null) : [];
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T : null;
}

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function httpsUrl(value: unknown): string | null {
  const candidate = text(value, 600);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function calendarDaysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
}

function producerOf(raw: Row, project: string): CalendarProducer {
  const explicit = oneOf(CALENDAR_PRODUCERS, raw.producer);
  if (explicit) return explicit;
  // The October documents said who works with `work`; an automated draft is the venture's own drafter.
  if (raw.work === "auto-draft") return project === "dneskai" ? "dneskai-pack" : "marketingShark";
  return "owner";
}

function parseEntry(raw: unknown, project: string): CalendarEntry | string {
  if (!isRow(raw)) return "not an object";
  if (typeof raw.id !== "string" || !ID.test(raw.id)) return "missing or malformed id";
  if (!isDate(raw.date)) return "date is not YYYY-MM-DD";
  if (typeof raw.time !== "string" || !TIME.test(raw.time)) return "time is not HH:mm";
  const platform = oneOf(CALENDAR_PLATFORMS, raw.platform);
  if (!platform) return `unknown platform ${JSON.stringify(raw.platform)}`;
  const kind = oneOf(CALENDAR_KINDS, raw.kind);
  if (!kind) return `unknown kind ${JSON.stringify(raw.kind)}`;
  const title = text(raw.title, 200);
  if (!title) return "missing title";
  if (title.length > 60) return "title is longer than 60 characters";
  const status = raw.status === undefined ? "planned" : oneOf(CALENDAR_STATUSES, raw.status);
  if (!status) return `unknown status ${JSON.stringify(raw.status)}`;
  const effort = typeof raw.effortMin === "number" && Number.isFinite(raw.effortMin) && raw.effortMin >= 0 ? Math.round(raw.effortMin) : null;
  return {
    id: raw.id,
    date: raw.date,
    time: raw.time,
    platform,
    kind,
    pillar: text(raw.pillar, 20),
    title,
    hook: text(raw.hook, 400),
    hookType: oneOf(CALENDAR_HOOK_TYPES, raw.hookType),
    body: text(raw.body) ?? "",
    cta: text(raw.cta, 400),
    assets: texts(raw.assets, 400),
    effortMin: effort,
    status,
    blockedBy: text(raw.blockedBy, 400),
    producer: producerOf(raw, project),
    tipRefs: texts(raw.tipRefs, 200),
    measure: text(raw.measure, 600),
    links: rows(raw.links).flatMap((link) => {
      if (!isRow(link)) return [];
      const label = text(link.label, 120);
      const url = text(link.url, 600);
      return label && url && (url.startsWith("https://") || url.startsWith("/admin")) ? [{ label, url }] : [];
    }),
    note: text(raw.note, 500)
  };
}

function parseAd(raw: unknown, entryIds: ReadonlySet<string>): CalendarAd | string {
  if (!isRow(raw)) return "not an object";
  if (typeof raw.id !== "string" || !ID.test(raw.id)) return "missing or malformed id";
  const platform = oneOf(CALENDAR_PLATFORMS, raw.platform);
  if (!platform) return `unknown platform ${JSON.stringify(raw.platform)}`;
  if (!isDate(raw.start) || !isDate(raw.end)) return "start or end is not YYYY-MM-DD";
  if (raw.end < raw.start) return "end precedes start";
  if (typeof raw.dailyBudgetEur !== "number" || !Number.isFinite(raw.dailyBudgetEur) || raw.dailyBudgetEur < 0) return "daily budget is not a number";
  const days = calendarDaysBetween(raw.start, raw.end) + 1;
  const creative = text(raw.creative, 1_000) ?? "";
  const named = creative.match(/\b[a-z]{2}-\d{3}\b/u)?.[0] ?? null;
  return {
    id: raw.id,
    platform,
    start: raw.start,
    end: raw.end,
    dailyBudgetEur: raw.dailyBudgetEur,
    days,
    totalEur: Math.round(raw.dailyBudgetEur * days * 100) / 100,
    objective: text(raw.objective, 200) ?? "",
    audience: text(raw.audience, 1_000) ?? "",
    placement: text(raw.placement, 1_000) ?? "",
    creative,
    creativeEntryId: named && entryIds.has(named) ? named : null,
    policyNotes: text(raw.policyNotes, 2_000) ?? "",
    successRule: text(raw.successRule, 1_000) ?? "",
    status: oneOf(CALENDAR_STATUSES, raw.status) ?? "planned"
  };
}

function parsePrelaunch(raw: unknown): CalendarPrelaunchItem | string {
  if (!isRow(raw)) return "not an object";
  if (typeof raw.id !== "string" || !ID.test(raw.id)) return "missing or malformed id";
  if (!isDate(raw.due)) return "due is not YYYY-MM-DD";
  const title = text(raw.title, 200);
  if (!title) return "missing title";
  const repo = text(raw.repo, 120);
  const issue = text(raw.issue, 20);
  return {
    id: raw.id,
    due: raw.due,
    title,
    detail: text(raw.detail, 1_000) ?? "",
    owner: raw.owner === "agent" ? "agent" : "owner",
    repo: repo && /^[\w.-]+\/[\w.-]+$/u.test(repo) ? repo : null,
    issue: issue && /^#\d+$/u.test(issue) ? issue : null,
    status: raw.status === "done" ? "done" : "planned"
  };
}

/** A bare repository name in the October documents is one of the owner's. */
function repoSlug(repo: string): string {
  return repo.includes("/") ? repo : `lukaskourilcz/${repo}`;
}

export function repoIssueHref(repo: string | null, issue: string | null): string | null {
  if (!repo) return null;
  const slug = repoSlug(repo);
  if (!/^[\w.-]+\/[\w.-]+$/u.test(slug)) return null;
  return issue && /^#\d+$/u.test(issue) ? `https://github.com/${slug}/issues/${issue.slice(1)}` : `https://github.com/${slug}`;
}

function collect<T>(section: string, values: unknown[], parse: (value: unknown) => T | string, dropped: CalendarDropped[], seen?: Set<string>): T[] {
  const kept: T[] = [];
  values.forEach((value, index) => {
    const result = parse(value);
    const id = isRow(value) && typeof value.id === "string" ? value.id : null;
    if (typeof result === "string") {
      dropped.push({ section, index, id, reason: result });
      return;
    }
    if (seen && id) {
      if (seen.has(id)) {
        dropped.push({ section, index, id, reason: "duplicate id" });
        return;
      }
      seen.add(id);
    }
    kept.push(result);
  });
  return kept;
}

export function parseMarketingCalendar(value: unknown): CalendarParseResult {
  if (!isRow(value)) return { ok: false, reason: "The file is not a JSON object." };
  if (value.schemaVersion !== undefined && value.schemaVersion !== "marketing-calendar/1") {
    return { ok: false, reason: `Unknown schema ${JSON.stringify(value.schemaVersion)}; this admin reads marketing-calendar/1.` };
  }
  const name = text(value.name, 80);
  const project = text(value.project, 40) ?? "";
  if (!name) return { ok: false, reason: "The plan has no name." };
  const dropped: CalendarDropped[] = [];
  const entries = collect("entries", rows(value.entries), (raw) => parseEntry(raw, project), dropped, new Set())
    .sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`) || left.id.localeCompare(right.id));
  if (!entries.length) return { ok: false, reason: "The plan has no readable entry." };
  const entryIds = new Set(entries.map((entry) => entry.id));

  const periodRow = isRow(value.period) ? value.period : null;
  const declared = periodRow && isDate(periodRow.start) && isDate(periodRow.end) && periodRow.end >= periodRow.start
    ? { start: periodRow.start, end: periodRow.end }
    : null;
  const period = declared ?? { start: entries[0]!.date, end: entries.at(-1)!.date };
  const pillarIds = new Set<string>();
  const pillars = rows(value.pillars).flatMap((raw): CalendarPillar[] => {
    if (!isRow(raw) || typeof raw.id !== "string" || !text(raw.name)) return [];
    pillarIds.add(raw.id);
    const share = text(raw.share, 10) ?? "";
    const shareValue = /^\d{1,3}\s?%$/u.test(share) ? Number.parseInt(share, 10) : null;
    return [{ id: raw.id, name: text(raw.name, 120)!, share, shareValue, description: text(raw.description, 1_500) ?? "", tipRefs: texts(raw.tipRefs, 200) }];
  });

  return {
    ok: true,
    document: {
      project,
      name,
      tagline: text(value.tagline, 300) ?? "",
      description: text(value.description, 1_500) ?? "",
      audience: text(value.audience, 1_500) ?? "",
      goal: text(value.goal, 1_000) ?? "",
      launch: isDate(value.launch) ? value.launch : period.start,
      period,
      periodDerived: declared === null,
      kpis: rows(value.kpis).flatMap((raw) => isRow(raw) && text(raw.name)
        ? [{ name: text(raw.name, 200)!, baseline: text(raw.baseline, 400) ?? "unknown", target: text(raw.target, 400) ?? "—", how: text(raw.how, 600) ?? "" }]
        : []),
      channels: rows(value.channels).flatMap((raw): CalendarChannel[] => {
        const platform = isRow(raw) ? oneOf(CALENDAR_CHANNEL_PLATFORMS, raw.platform) : null;
        if (!isRow(raw) || !platform) return [];
        const role = raw.role === "primary" || raw.role === "secondary" ? raw.role : "support";
        return [{ platform, role, handle: text(raw.handle, 200), cadence: text(raw.cadence, 600) ?? "", notes: text(raw.notes, 2_000) }];
      }),
      pillars,
      profileSetup: texts(value.profileSetup),
      weeks: rows(value.weeks).flatMap((raw) => isRow(raw) && typeof raw.week === "number"
        ? [{ week: raw.week, dates: text(raw.dates, 40) ?? "", theme: text(raw.theme, 200) ?? "", focus: text(raw.focus, 1_000) ?? "" }]
        : []),
      prelaunch: collect("prelaunch", rows(value.prelaunch), parsePrelaunch, dropped, new Set()).sort((left, right) => left.due.localeCompare(right.due)),
      entries: entries.map((entry) => entry.pillar && !pillarIds.has(entry.pillar) && entry.pillar !== "p0" ? { ...entry, pillar: null } : entry),
      ads: collect("ads", rows(value.ads), (raw) => parseAd(raw, entryIds), dropped, new Set()).sort((left, right) => left.start.localeCompare(right.start)),
      reviews: rows(value.reviews).flatMap((raw) => isRow(raw) && isDate(raw.date) && text(raw.what)
        ? [{ date: raw.date, what: text(raw.what, 1_000)! }]
        : []).sort((left, right) => left.date.localeCompare(right.date)),
      risks: texts(value.risks),
      productDependencies: rows(value.productDependencies).flatMap((raw): CalendarDependency[] => {
        if (!isRow(raw)) return [];
        const repo = text(raw.repo, 120);
        const what = text(raw.what, 1_500);
        if (!repo || !what) return [];
        const issue = text(raw.issue, 20);
        return [{ repo: repoSlug(repo), what, why: text(raw.why, 1_000) ?? "", issue, href: repoIssueHref(repo, issue) }];
      }),
      sources: rows(value.sources).flatMap((raw) => isRow(raw) && text(raw.title)
        ? [{ title: text(raw.title, 300)!, url: httpsUrl(raw.url), checked: text(raw.checked, 40) ?? "", note: text(raw.note, 1_000) ?? "" }]
        : []),
      dropped
    }
  };
}

/** What the owner reads for a pillar id: `p0` is the setup and operations work outside the pillars. */
export function pillarName(document: Pick<CalendarDocument, "pillars">, id: string | null): string {
  if (!id) return "No pillar";
  if (id === "p0") return "Setup & operations";
  return document.pillars.find((pillar) => pillar.id === id)?.name ?? id;
}
