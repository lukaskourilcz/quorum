import { z } from "zod";
import { DateTimeSchema, EvidenceRefSchema } from "./common.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const PlaybookIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
export const DoorMoneyLearningRefSchema = EvidenceRefSchema.refine(
  (reference) => /^completion:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(reference) ||
    /^result:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(reference),
  "Playbook evidence must cite a completion or owner result id"
);

export const DoorMoneyPlaybookRevisionSchema = z.strictObject({
  revision: z.number().int().positive(),
  sourceCycleId: SlugSchema,
  summary: z.string().trim().min(1).max(1_000),
  steps: z.array(z.string().trim().min(1).max(500)).min(1).max(24),
  evidenceRefs: z.array(DoorMoneyLearningRefSchema).min(1).max(20),
  updatedAt: DateTimeSchema
}).superRefine((revision, context) => {
  if (new Set(revision.evidenceRefs).size !== revision.evidenceRefs.length) {
    context.addIssue({ code: "custom", path: ["evidenceRefs"], message: "Playbook evidence references must be unique" });
  }
});

export const DoorMoneyPlaybookSchema = z.strictObject({
  schemaVersion: z.literal("door-money-playbook/1"),
  id: PlaybookIdSchema,
  ventureId: z.literal("door-money"),
  channel: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  revisions: z.array(DoorMoneyPlaybookRevisionSchema).min(1).max(100)
}).superRefine((playbook, context) => {
  const cycleIds = playbook.revisions.map(({ sourceCycleId }) => sourceCycleId);
  if (new Set(cycleIds).size !== cycleIds.length) {
    context.addIssue({ code: "custom", path: ["revisions"], message: "A growth cycle may revise a playbook only once" });
  }
  playbook.revisions.forEach((revision, index) => {
    if (revision.revision !== index + 1) {
      context.addIssue({ code: "custom", path: ["revisions", index, "revision"], message: "Playbook revisions must be consecutive" });
    }
    if (index > 0 && Date.parse(revision.updatedAt) < Date.parse(playbook.revisions[index - 1]!.updatedAt)) {
      context.addIssue({ code: "custom", path: ["revisions", index, "updatedAt"], message: "Playbook revisions cannot move backward in time" });
    }
  });
});

export type DoorMoneyPlaybook = z.infer<typeof DoorMoneyPlaybookSchema>;
export type DoorMoneyPlaybookRevision = z.infer<typeof DoorMoneyPlaybookRevisionSchema>;
