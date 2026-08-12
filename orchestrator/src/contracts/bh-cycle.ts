import { z } from "zod";
import { DateSchema, DateTimeSchema, MeetingRefSchema, openObject } from "./common.js";

/** Shared three-step editorial cycle vocabulary; BOOKSOFHISTORY is its first consumer. */
export const EditorialCyclePhaseSchema = z.enum(["selection", "research", "production"]);
export const EditorialCycleDayStatusSchema = z.enum([
  "pending",
  "active",
  "completed",
  // A shelf-backed candidate may make paid research unnecessary. That is recorded, not skipped.
  "not-needed"
]);

export const EditorialCycleCandidateSchema = openObject({
  candidateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  source: z.enum(["shortlist", "shelf"]),
  briefRef: MeetingRefSchema.nullable(),
  dossierRef: MeetingRefSchema.nullable()
}).superRefine((candidate, context) => {
  if (candidate.source === "shelf" && candidate.dossierRef === null) {
    context.addIssue({
      code: "custom",
      message: "A shelf candidate requires its existing dossier reference",
      path: ["dossierRef"]
    });
  }
});

export const EditorialCycleStretchSchema = openObject({
  count: z.number().int().min(0).max(30),
  reason: z.enum(["budget-pressure", "missed-day", "incomplete-phase"]).nullable(),
  nextAttemptOn: DateSchema.nullable()
}).superRefine((stretch, context) => {
  const complete = stretch.reason !== null && stretch.nextAttemptOn !== null;
  if ((stretch.count === 0 && (stretch.reason !== null || stretch.nextAttemptOn !== null)) ||
      (stretch.count > 0 && !complete)) {
    context.addIssue({
      code: "custom",
      message: "Stretch reason and next attempt must be present exactly when count is positive"
    });
  }
});

export const BhCycleSchema = openObject({
  schemaVersion: z.literal("bh-cycle/1"),
  currentCycleId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  cycleDays: z.number().int().min(2).max(7),
  phase: EditorialCyclePhaseSchema,
  dayStatuses: openObject({
    selection: EditorialCycleDayStatusSchema,
    research: EditorialCycleDayStatusSchema,
    production: EditorialCycleDayStatusSchema
  }),
  candidateSet: z.array(EditorialCycleCandidateSchema).max(3),
  chosenStory: openObject({
    candidateId: z.string().min(1).max(120),
    dossierRef: MeetingRefSchema,
    storyRef: MeetingRefSchema
  }).nullable(),
  stretch: EditorialCycleStretchSchema,
  startedOn: DateSchema,
  updatedAt: DateTimeSchema
}).superRefine((cycle, context) => {
  const ids = cycle.candidateSet.map((candidate) => candidate.candidateId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Cycle candidates must be unique", path: ["candidateSet"] });
  }

  const active = Object.entries(cycle.dayStatuses)
    .filter(([, status]) => status === "active")
    .map(([phase]) => phase);
  if (active.length > 1 || (active.length === 1 && active[0] !== cycle.phase)) {
    context.addIssue({ code: "custom", message: "Only the current phase may be active", path: ["dayStatuses"] });
  }

  if (cycle.phase === "selection" &&
      (cycle.dayStatuses.research !== "pending" || cycle.dayStatuses.production !== "pending")) {
    context.addIssue({ code: "custom", message: "Later days remain pending during selection", path: ["dayStatuses"] });
  }
  if (cycle.phase === "research" &&
      (cycle.dayStatuses.selection !== "completed" || cycle.dayStatuses.production !== "pending")) {
    context.addIssue({ code: "custom", message: "Research begins only after selection completes", path: ["dayStatuses"] });
  }
  if (cycle.phase === "production" &&
      (cycle.dayStatuses.selection !== "completed" ||
       !["completed", "not-needed"].includes(cycle.dayStatuses.research))) {
    context.addIssue({ code: "custom", message: "Production begins only after research settles", path: ["dayStatuses"] });
  }

  if (cycle.chosenStory !== null) {
    const candidate = cycle.candidateSet.find(({ candidateId }) => candidateId === cycle.chosenStory?.candidateId);
    if (!candidate || candidate.dossierRef !== cycle.chosenStory.dossierRef) {
      context.addIssue({
        code: "custom",
        message: "The chosen story must belong to a candidate dossier in this cycle",
        path: ["chosenStory"]
      });
    }
  }
});

export type BhCycle = z.infer<typeof BhCycleSchema>;
