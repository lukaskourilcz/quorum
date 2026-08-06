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

/**
 * Phases an agenda may be filed for.
 *
 * `studio` is gone: the room never held a live session, its only unique capability produced
 * nothing any consumer read, and everything the venture delivers is deterministic code that
 * renders at $0. Its historical meeting records stay readable, because MeetingRecord's own kind
 * enum is unchanged and past pages still have to render.
 *
 * The two incubator phases stay in this list although the venture is paused and neither room is
 * on the clock. The venture is parked for revival with all of its state, and taking its phases
 * out of the contract would mean rewriting the contract again to bring it back.
 */
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
