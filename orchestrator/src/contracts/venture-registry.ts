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

const VentureDefinitionSchema = openObject({
  id: VentureIdSchema,
  name: z.string().trim().min(1).max(100),
  status: z.enum(["exploration", "operating", "paused"]),
  taste: z.boolean(),
  ledgerNamespace: VentureIdSchema,
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
      "package-cadence"
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
    "calendar",
    "social-lab",
    // `studio` builds a carousel for one article; `templates` browses the template library and
    // rates it. Two jobs, two tabs — collapsing them left the gallery with no route to it.
    // `decks` was retired with the question it answered and is not accepted any more.
    "studio",
    "templates",
    "inspiration",
    "hooks",
    "packages"
  ])),
  productionJobs: z.array(openObject({
    kind: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    cadence: z.string().regex(/^(?:2x-daily@\d{2}:00,\d{2}:00|daily@(?:0[5-9]|1\d|2[0-3]):00)$/),
    envelopeUsd: z.number().finite().positive().max(1)
  })).optional(),
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
  const kinds = ventures.flatMap((venture) => venture.meetings.map(({ kind }) => kind));
  if (new Set(kinds).size !== kinds.length) {
    context.addIssue({
      code: "custom",
      message: "Meeting kinds must be unique across ventures",
      path: ["ventures"]
    });
  }
  const starts = [
    { kind: "venture-morning", hour: 6 },
    { kind: "venture-afternoon", hour: 14 },
    { kind: "venture-night", hour: 22 },
    ...ventures.flatMap((venture) => venture.meetings.map((meeting) => ({
      kind: meeting.kind,
      hour: Number(meeting.cadence.slice(6, 8))
    }))),
    ...ventures.flatMap((venture) => (venture.productionJobs ?? []).flatMap((job) => {
      const match = /^2x-daily@(\d{2}):00,(\d{2}):00$/.exec(job.cadence);
      return match
        ? [{ kind: `${job.kind}-am`, hour: Number(match[1]) }, { kind: `${job.kind}-pm`, hour: Number(match[2]) }]
        : [{ kind: job.kind, hour: Number(job.cadence.slice(6, 8)) }];
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
