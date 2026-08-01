import { z } from "zod";
import {
  ContractAgentIdSchema,
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  MeetingRefSchema,
  VentureIdSchema,
  openObject
} from "./common.js";

export const AgendaPhaseSchema = z.enum([
  "tt-marketing",
  "incubator-scan",
  "incubator-synthesis",
  "mma-intake",
  "mma-analysis",
  "mag-editorial",
  "mag-desk"
]);

export const MeetingAgendaSchema = openObject({
  schemaVersion: z.literal("meeting-agenda/1"),
  id: z.string().regex(/^agenda-[a-f0-9]{16}$/),
  ventureId: VentureIdSchema,
  phase: AgendaPhaseSchema,
  requestedBy: ContractAgentIdSchema,
  sourcePhase: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sourceMeetingRef: MeetingRefSchema,
  summary: z.string().trim().min(1).max(280),
  evidenceRefs: z.array(EvidenceRefSchema).max(12),
  requestedAt: DateTimeSchema,
  notBefore: DateSchema,
  expiresAt: DateTimeSchema,
  status: z.enum(["pending", "consumed", "expired", "cancelled"]),
  consumedBy: z.string().trim().min(1).max(160).optional(),
  consumedAt: DateTimeSchema.optional()
}).superRefine((agenda, context) => {
  if (agenda.status === "consumed" && (!agenda.consumedBy || !agenda.consumedAt)) {
    context.addIssue({
      code: "custom",
      message: "Consumed agendas require consumedBy and consumedAt",
      path: ["consumedBy"]
    });
  }
  if (agenda.status !== "consumed" && (agenda.consumedBy || agenda.consumedAt)) {
    context.addIssue({
      code: "custom",
      message: "Only consumed agendas may carry consumption fields",
      path: ["status"]
    });
  }
});

export const MeetingAgendaQueueSchema = openObject({
  schemaVersion: z.literal("meeting-agenda-queue/1"),
  agendas: z.array(MeetingAgendaSchema).max(200),
  updatedAt: DateTimeSchema
});

export type AgendaPhase = z.infer<typeof AgendaPhaseSchema>;
export type MeetingAgenda = z.infer<typeof MeetingAgendaSchema>;
export type MeetingAgendaQueue = z.infer<typeof MeetingAgendaQueueSchema>;
