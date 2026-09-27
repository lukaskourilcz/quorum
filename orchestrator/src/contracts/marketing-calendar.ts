import { z } from "zod";
import { DateSchema, openObject } from "./common.js";

/**
 * `marketing-calendar/1` — one venture's 30-day marketing plan (quorum#592).
 *
 * One document per venture at `state/marketing-calendar/<venture>.json`, written by hand (or by a
 * research session) and read by the admin Calendar. The calendar is a plan and a brief, not a
 * scheduler: nothing here publishes, books an ad or starts a room. The admin writes back only an
 * entry's owner-set `status` and `note` and a pre-launch item's `status`; `queued` and `published`
 * are read from the Queue snapshot, never typed.
 *
 * The October 2026 documents predate `launch`, `period`, `prelaunch` and `producer` (they carried
 * `work: owner | auto-draft`), so those stay optional here and the admin derives them. The site
 * parser (`site/src/lib/marketing-calendar-model.ts`) is the tolerant reader: an entry this schema
 * rejects is dropped there with its reason, never the whole document.
 */

export const MARKETING_CALENDAR_PLATFORMS = ["instagram", "threads", "facebook", "reddit", "linkedin", "newsletter", "web"] as const;
/** Channels may name a platform the plan does not post to yet (X), so they accept one more. */
export const MARKETING_CALENDAR_CHANNEL_PLATFORMS = [...MARKETING_CALENDAR_PLATFORMS, "x"] as const;
export const MARKETING_CALENDAR_KINDS = ["carousel", "reel", "post", "story", "thread", "reddit", "ad", "task", "review", "newsletter"] as const;
export const MARKETING_CALENDAR_STATUSES = ["planned", "drafted", "queued", "published", "skipped", "blocked"] as const;
/** The statuses the owner may set. `queued` and `published` come from the Queue. */
export const MARKETING_CALENDAR_OWNER_STATUSES = ["planned", "drafted", "skipped", "blocked"] as const;
export const MARKETING_CALENDAR_PRODUCERS = ["owner", "marketingShark", "dneskai-pack"] as const;
export const MARKETING_CALENDAR_HOOK_TYPES = [
  "curiosity", "contrarian", "list", "number", "story", "question", "problem", "promise", "negative", "authority"
] as const;

const TimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, "expected HH:mm");
const Text = (max: number) => z.string().max(max);

export const MarketingCalendarEntrySchema = openObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/u),
  date: DateSchema,
  time: TimeSchema,
  platform: z.enum(MARKETING_CALENDAR_PLATFORMS),
  kind: z.enum(MARKETING_CALENDAR_KINDS),
  pillar: z.string().min(1).max(20),
  title: z.string().trim().min(1).max(60),
  hook: Text(400),
  hookType: z.enum(MARKETING_CALENDAR_HOOK_TYPES),
  body: Text(4_000),
  cta: Text(400),
  assets: z.array(Text(400)).max(20),
  effortMin: z.number().int().nonnegative().max(600),
  status: z.enum(MARKETING_CALENDAR_STATUSES),
  blockedBy: Text(400).optional(),
  producer: z.enum(MARKETING_CALENDAR_PRODUCERS).optional(),
  tipRefs: z.array(Text(200)).max(12),
  measure: Text(600),
  links: z.array(openObject({ label: Text(120), url: z.string().min(1).max(600) })).max(10).optional(),
  /** The owner's note from the admin. */
  note: Text(500).optional()
});

export const MarketingCalendarAdSchema = openObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/u),
  platform: z.enum(MARKETING_CALENDAR_PLATFORMS),
  start: DateSchema,
  end: DateSchema,
  dailyBudgetEur: z.number().finite().nonnegative().max(1_000),
  objective: Text(200),
  audience: Text(1_000),
  placement: Text(1_000),
  creative: Text(1_000),
  policyNotes: Text(2_000),
  successRule: Text(1_000),
  status: z.enum(MARKETING_CALENDAR_STATUSES)
}).refine((ad) => ad.end >= ad.start, { message: "end must not precede start", path: ["end"] });

export const MarketingCalendarPrelaunchSchema = openObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/u),
  due: DateSchema,
  title: z.string().trim().min(1).max(60),
  detail: Text(1_000),
  owner: z.enum(["owner", "agent"]),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/u).nullable(),
  issue: z.string().regex(/^#\d+$/u).nullable(),
  status: z.enum(["planned", "done"])
});

export const MarketingCalendarSchema = openObject({
  schemaVersion: z.literal("marketing-calendar/1"),
  project: z.string().regex(/^[a-z0-9-]{1,40}$/u),
  name: z.string().trim().min(1).max(80),
  tagline: Text(300),
  description: Text(1_500),
  audience: Text(1_500),
  goal: Text(1_000),
  launch: DateSchema.optional(),
  period: openObject({ start: DateSchema, end: DateSchema })
    .refine((period) => period.end >= period.start, { message: "end must not precede start", path: ["end"] })
    .optional(),
  kpis: z.array(openObject({ name: Text(200), baseline: Text(400), target: Text(400), how: Text(600) })),
  channels: z.array(openObject({
    platform: z.enum(MARKETING_CALENDAR_CHANNEL_PLATFORMS),
    role: z.enum(["primary", "secondary", "support"]),
    handle: Text(200).nullable(),
    cadence: Text(600),
    notes: Text(2_000).optional()
  })),
  pillars: z.array(openObject({
    id: z.string().min(1).max(20),
    name: Text(120),
    share: z.string().regex(/^\d{1,3}\s?%$/u),
    description: Text(1_500),
    tipRefs: z.array(Text(200))
  })),
  profileSetup: z.array(Text(1_000)),
  weeks: z.array(openObject({ week: z.number().int().positive(), dates: Text(40), theme: Text(200), focus: Text(1_000) })),
  prelaunch: z.array(MarketingCalendarPrelaunchSchema).optional(),
  entries: z.array(MarketingCalendarEntrySchema).min(1),
  ads: z.array(MarketingCalendarAdSchema),
  reviews: z.array(openObject({ date: DateSchema, what: Text(1_000) })),
  risks: z.array(Text(1_000)),
  productDependencies: z.array(openObject({ repo: Text(120), what: Text(1_500), why: Text(1_000), issue: Text(20).nullable().optional() })),
  sources: z.array(openObject({ title: Text(300), url: z.string().min(1).max(600), checked: Text(40), note: Text(1_000) }))
}).superRefine((calendar, context) => {
  const ids = new Set<string>();
  calendar.entries.forEach((entry, index) => {
    if (ids.has(entry.id)) context.addIssue({ code: "custom", message: `duplicate entry id ${entry.id}`, path: ["entries", index, "id"] });
    ids.add(entry.id);
    if (entry.status === "blocked" && !entry.blockedBy && !entry.note) {
      context.addIssue({ code: "custom", message: "a blocked entry names what blocks it", path: ["entries", index, "blockedBy"] });
    }
  });
  const pillars = new Set(calendar.pillars.map((pillar) => pillar.id));
  calendar.entries.forEach((entry, index) => {
    if (!pillars.has(entry.pillar) && entry.pillar !== "p0") {
      context.addIssue({ code: "custom", message: `unknown pillar ${entry.pillar}`, path: ["entries", index, "pillar"] });
    }
  });
  if (calendar.period && calendar.launch && calendar.launch !== calendar.period.start) {
    context.addIssue({ code: "custom", message: "launch is the first day of the period", path: ["launch"] });
  }
});

export type MarketingCalendar = z.infer<typeof MarketingCalendarSchema>;
export type MarketingCalendarEntry = z.infer<typeof MarketingCalendarEntrySchema>;
