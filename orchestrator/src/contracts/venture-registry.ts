import { z } from "zod";
import { ContractAgentIdSchema, VentureIdSchema, openObject } from "./common.js";

const VentureMeetingDefinitionSchema = openObject({
  kind: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  label: z.string().trim().min(1).max(120),
  cadence: z.string().regex(/^daily@(?:0[5-9]|1\d|2[0-3]):00$/),
  cast: z.array(ContractAgentIdSchema).min(1),
  envelopeUsd: z.number().finite().positive().max(1),
  packet: openObject({
    topicType: z.enum([
      "growth",
      "build",
      "evidence",
      "finance",
      "social",
      "org",
      "incident",
      "council",
      "edition",
      "product"
    ]),
    decisionNeeded: z.enum([
      "PLAN",
      "NO_ACTION",
      "VERDICT",
      "MEMO",
      "EDITION",
      "IDEA_VERDICT"
    ]),
    preset: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    objectives: openObject({
      dry: z.string().trim().min(1).max(400),
      live: z.string().trim().min(1).max(400)
    })
  })
});

const VentureRenderingSchema = z.strictObject({
  path: z.literal("design-lab"),
  imageGeneration: z.literal(false),
  freeformSocialImages: z.literal(false)
});

const VentureEditionSchema = z.strictObject({
  id: VentureIdSchema,
  locale: z.enum(["cs", "en"]),
  profileRef: z.string().trim().min(1).max(160),
  state: z.enum(["held", "draft", "operating"])
});

const VentureDefinitionSchema = openObject({
  id: VentureIdSchema,
  name: z.string().trim().min(1).max(100),
  status: z.enum(["exploration", "operating", "paused"]),
  visibility: z.enum(["public", "owner-only"]),
  taste: z.boolean(),
  ledgerNamespace: VentureIdSchema,
  delivery: z.strictObject({
    product: z.literal("instagram-threads"),
    website: z.literal("absent")
  }).optional(),
  editions: z.array(VentureEditionSchema).min(1).max(10).optional(),
  growth_objective: openObject({
    label: z.string().trim().min(1).max(200),
    components: z.array(z.enum([
      "edition-cadence",
      "source-coverage",
      "slot-fill",
      "rendered-fightaiq-coverage",
      "event-fighter-coverage",
      "two-source-agreement",
      "readiness-dossiers",
      "campaign-inventory",
      "live-template-library",
      "package-cadence",
      "recommendation-approval",
      "feature-cadence",
      "research-efficiency",
      "action-completion"
    ])).min(1).max(4)
  }),
  mode: z.enum(["data-only", "live-analysis"]).optional(),
  adminTabs: z.array(z.enum([
    "ideas",
    "plans",
    "visuals",
    "fighters",
    "bouts",
    "events",
    "slates",
    "sources",
    "articles",
    "predictions",
    "banners",
    "calendar",
    "social-lab",
    // `studio` builds a carousel for one article; `templates` browses the template library and
    // rates it. Two jobs, two tabs — collapsing them left the gallery with no route to it.
    // `decks` was retired with the question it answered and is not accepted any more.
    "studio",
    "templates",
    "inspiration",
    "hooks",
    "packages",
    "shortlist",
    "dossiers",
    "features",
    "recommendations",
    "actions",
    "knowledge",
    "monitor",
    "claims",
    "library",
    "signals",
    "today",
    "timeline",
    "threads",
    "instagram",
    "reels",
    "trend-radar",
    "results",
    "experiments",
    "voice-strategy",
    "budget",
    // WebDev Signal's workspace. `decision` is the tab that says why one story won or why there
    // is none; the two edition tabs are separate because each locale has its own hold state, and
    // one merged tab would hide a held Czech package behind a valid English one.
    "decision",
    "edition-cs",
    "edition-en",
    "delivery"
  ])),
  rendering: VentureRenderingSchema.optional(),
  productionJobs: z.array(openObject({
    kind: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    cadence: z.string().regex(/^(?:2x-daily@\d{2}:00,\d{2}:00|daily@(?:0[5-9]|1\d|2[0-3]):00)$/),
    envelopeUsd: z.number().finite().positive().max(1)
  })).optional(),
  /**
   * The venture's one slot a day, and the rooms it dispatches inside it.
   *
   * The owner's 2026-08-29 instruction — one calendar slot per venture — consolidates the clock
   * and nothing else. Every room named in `steps` keeps its full definition in `meetings` below,
   * because that definition is its cast, its envelope and its agenda packet; what it loses is a
   * cadence of its own. A room a day dispatches is dropped from the clock and the sixty-minute
   * spacing check, and the day's own hour takes its place.
   *
   * `steps` may name a room another venture owns: FightAIQ's two data checks are steps of the MMA
   * Files day, which is what "combine MMA Files and Fight Analysis into one meeting" means.
   */
  day: openObject({
    kind: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-day$/),
    label: z.string().min(1),
    cadence: z.string().regex(/^daily@(?:0[5-9]|1\d|2[0-3]):00$/),
    steps: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1)
  }).optional(),
  meetings: z.array(VentureMeetingDefinitionSchema)
});

export const VentureRegistrySchema = openObject({
  schemaVersion: z.literal("venture-registry/1"),
  ventures: z.array(VentureDefinitionSchema).min(1)
}).superRefine(({ ventures }, context) => {
  for (const key of ["id", "ledgerNamespace"] as const) {
    const values = ventures.map((venture) => venture[key]);
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `Venture ${key} values must be unique`,
        path: ["ventures"]
      });
    }
  }
  const kvorum = ventures.find((venture) => venture.id === "kvorum");
  if (kvorum && !kvorum.rendering) {
    context.addIssue({
      code: "custom",
      message: "Kvórum must declare the Design Lab as its sole rendering path",
      path: ["ventures", ventures.indexOf(kvorum), "rendering"]
    });
  }
  const webdevSignal = ventures.find((venture) => venture.id === "webdev-signal");
  if (webdevSignal) {
    const editions = webdevSignal.editions ?? [];
    if (webdevSignal.ledgerNamespace !== "webdev-signal"
      || webdevSignal.delivery?.product !== "instagram-threads"
      || webdevSignal.delivery.website !== "absent"
      || editions.length !== 2
      || editions.map(({ locale }) => locale).sort().join(",") !== "cs,en"
      || editions.some(({ state }) => state !== "held")) {
      context.addIssue({
        code: "custom",
        message: "WebDev Signal must be one held Instagram-and-Threads venture with exactly Czech and English editions and no website",
        path: ["ventures", ventures.indexOf(webdevSignal)]
      });
    }
  }
  const kinds = ventures.flatMap((venture) => venture.meetings.map(({ kind }) => kind));
  if (new Set(kinds).size !== kinds.length) {
    context.addIssue({
      code: "custom",
      message: "Meeting kinds must be unique across ventures",
      path: ["ventures"]
    });
  }
  /*
   * Every room a venture day dispatches, across the whole registry.
   *
   * Collected before the clock is built because a dispatched room has no hour of its own any
   * more: its day holds the slot, and leaving both on the clock would double-book the venture and
   * fail the spacing check against itself.
   */
  const dispatched = new Set(ventures.flatMap((venture) => venture.day?.steps ?? []));
  const scheduledKinds = new Set([
    ...ventures.flatMap((venture) => venture.meetings.map(({ kind }) => kind)),
    // A production job schedules slots, not a room: `article-production` puts `article-am` on the
    // clock (and `article-pm` when the cadence still promises two), which is the name the day's
    // steps and the calendar both use.
    ...ventures.flatMap((venture) => (venture.productionJobs ?? []).flatMap((job) => {
      const base = job.kind.replace(/-production$/u, "");
      return /^2x-daily@/.test(job.cadence) ? [`${base}-am`, `${base}-pm`] : [`${base}-am`];
    }))
  ]);
  for (const venture of ventures) {
    for (const step of venture.day?.steps ?? []) {
      if (scheduledKinds.has(step)) continue;
      context.addIssue({
        code: "custom",
        message: `${venture.day?.kind} dispatches ${step}, which no venture defines`,
        path: ["ventures", ventures.indexOf(venture), "day", "steps"]
      });
    }
  }
  const starts = [
    // One company meeting a day, per `operations-2026-08c`. The afternoon and night shifts are
    // retired from the schedule and no longer hold an hour against the ventures.
    { kind: "venture-morning", hour: 6 },
    ...ventures.flatMap((venture) => venture.day
      ? [{ kind: venture.day.kind, hour: Number(venture.day.cadence.slice(6, 8)) }]
      : []),
    ...ventures.flatMap((venture) => venture.meetings
      .filter((meeting) => !dispatched.has(meeting.kind))
      .map((meeting) => ({ kind: meeting.kind, hour: Number(meeting.cadence.slice(6, 8)) }))),
    ...ventures.flatMap((venture) => (venture.productionJobs ?? []).flatMap((job) => {
      const base = job.kind.replace(/-production$/u, "");
      const match = /^2x-daily@(\d{2}):00,(\d{2}):00$/.exec(job.cadence);
      const slots = match
        ? [{ kind: `${base}-am`, hour: Number(match[1]) }, { kind: `${base}-pm`, hour: Number(match[2]) }]
        : [{ kind: `${base}-am`, hour: Number(job.cadence.slice(6, 8)) }];
      return slots.filter((slot) => !dispatched.has(slot.kind));
    }))
  ].sort((left, right) => left.hour - right.hour);
  for (let index = 1; index < starts.length; index += 1) {
    const previous = starts[index - 1]!;
    const current = starts[index]!;
    if ((current.hour - previous.hour) * 60 < 60) {
      context.addIssue({
        code: "custom",
        message: `Portfolio meetings ${previous.kind} and ${current.kind} must start at least 60 minutes apart`,
        path: ["ventures"]
      });
    }
  }
});

export type VentureRegistry = z.infer<typeof VentureRegistrySchema>;
