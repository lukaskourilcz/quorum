import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema } from "./common.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const ShortTextSchema = z.string().trim().min(1).max(500);

export const ActionTemplateKindSchema = z.enum([
  "pitch-email",
  "video-script",
  "engagement-guide",
  "other"
]);

export const ActionPreparedTemplateSchema = z.strictObject({
  id: SlugSchema,
  label: z.string().trim().min(1).max(160),
  kind: ActionTemplateKindSchema,
  /** Prepared owner copy only. No runtime path may send this body. */
  body: z.string().trim().min(1).max(4_000)
});

export const ActionCompletionSchema = z.strictObject({
  completedAt: DateTimeSchema,
  outcome: z.string().trim().min(1).max(1_000)
});

export const ActionPacketTaskSchema = z.strictObject({
  /** Leaves room for completion:<packet-id>:<task-id> inside EvidenceRefSchema's 160 characters. */
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  title: z.string().trim().min(1).max(200),
  why: ShortTextSchema,
  steps: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  templates: z.array(ActionPreparedTemplateSchema).min(1).max(8),
  effort: z.string().trim().min(1).max(160),
  expectedImpact: ShortTextSchema,
  evidenceRefs: z.array(EvidenceRefSchema).max(20),
  /** Null until the owner records both the completion time and its outcome. */
  completion: ActionCompletionSchema.nullable()
}).superRefine((task, context) => {
  const templateIds = task.templates.map(({ id }) => id);
  if (new Set(templateIds).size !== templateIds.length) {
    context.addIssue({ code: "custom", path: ["templates"], message: "Prepared template ids must be unique per task" });
  }
  if (new Set(task.evidenceRefs).size !== task.evidenceRefs.length) {
    context.addIssue({ code: "custom", path: ["evidenceRefs"], message: "Task evidence references must be unique" });
  }
});

export const ActionPacketSchema = z.strictObject({
  schemaVersion: z.literal("action-packet/1"),
  id: SlugSchema,
  ventureId: z.literal("door-money"),
  date: DateSchema,
  weekOf: DateSchema,
  agenda: z.strictObject({
    isoWeek: z.string().regex(/^\d{4}-W\d{2}$/),
    topicId: SlugSchema,
    title: z.string().trim().min(1).max(160)
  }),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1_000),
  outcome: z.enum(["ACTIONS", "NO_ACTION"]),
  noActionReason: z.string().trim().min(1).max(1_000).nullable(),
  contextRefs: z.array(EvidenceRefSchema).max(100),
  tasks: z.array(ActionPacketTaskSchema).max(12),
  generatedAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).superRefine((packet, context) => {
  if (packet.id !== `action-packet-${packet.date}`) {
    context.addIssue({ code: "custom", path: ["id"], message: "Action packet id must match its packet date" });
  }
  const actionOutcome = packet.outcome === "ACTIONS";
  if (actionOutcome !== (packet.tasks.length > 0) || actionOutcome === (packet.noActionReason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["outcome"],
      message: "ACTIONS requires tasks and no reason; NO_ACTION requires a reason and no tasks"
    });
  }
  const taskIds = packet.tasks.map(({ id }) => id);
  if (new Set(taskIds).size !== taskIds.length) {
    context.addIssue({ code: "custom", path: ["tasks"], message: "Action task ids must be unique" });
  }
  if (new Set(packet.contextRefs).size !== packet.contextRefs.length) {
    context.addIssue({ code: "custom", path: ["contextRefs"], message: "Packet context references must be unique" });
  }
  const allowedRefs = new Set(packet.contextRefs);
  packet.tasks.forEach((task, index) => {
    if (task.evidenceRefs.some((reference) => !allowedRefs.has(reference))) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "evidenceRefs"],
        message: "Every task must cite only context supplied to BOOKER"
      });
    }
    if (task.completion && (Date.parse(task.completion.completedAt) < Date.parse(packet.generatedAt) ||
        Date.parse(task.completion.completedAt) > Date.parse(packet.updatedAt))) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "completion", "completedAt"],
        message: "Owner completion must fall within the packet lifetime"
      });
    }
  });
  if (Date.parse(packet.updatedAt) < Date.parse(packet.generatedAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "Packet updates cannot predate generation" });
  }
});

export type ActionPacket = z.infer<typeof ActionPacketSchema>;
export type ActionPacketTask = z.infer<typeof ActionPacketTaskSchema>;
