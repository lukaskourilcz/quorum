import { z } from "zod";
import { EvidenceRefSchema, FoundingAgentSchema } from "../types.js";

export const ParticipantSchema = z.object({
  agent: FoundingAgentSchema,
  reason: z.string().min(1).max(200),
  mandatoryRule: z.string().nullable().optional()
});

export const RoomPacketSchema = z.object({
  roomId: z.string().min(1),
  topicType: z.enum([
    "growth",
    "build",
    "evidence",
    "finance",
    "social",
    "org",
    "incident",
    "council"
  ]),
  objective: z.string().min(1).max(400),
  owner: FoundingAgentSchema,
  evidenceRefs: z.array(EvidenceRefSchema),
  decisionNeeded: z.enum(["PLAN", "NO_ACTION", "VERDICT", "MEMO"]),
  riskTags: z.array(z.string().min(1)),
  budgetImpactUsd: z.number().min(0),
  selectedParticipants: z.array(ParticipantSchema).min(1),
  skippedParticipants: z.array(ParticipantSchema),
  maxRounds: z.number().int().min(1).max(2),
  maxTurns: z.number().int().min(1).max(6),
  maxTotalTokens: z.number().int().positive().max(12000),
  expiresAt: z.string().datetime()
});
export type RoomPacket = z.infer<typeof RoomPacketSchema>;

export const RoomMessageSchema = z.object({
  messageId: z.string().min(1),
  roomId: z.string().min(1),
  from: FoundingAgentSchema,
  to: z.array(FoundingAgentSchema),
  kind: z.enum([
    "brief",
    "review",
    "question",
    "answer",
    "verdict",
    "decision_memo"
  ]),
  summary: z.string().min(1).max(600),
  evidenceRefs: z.array(EvidenceRefSchema),
  requestedAgent: FoundingAgentSchema.nullable(),
  relevanceReason: z.string().max(200).nullable(),
  createdAt: z.string().datetime()
});
export type RoomMessage = z.infer<typeof RoomMessageSchema>;

export const RoomDecisionSchema = z.object({
  roomId: z.string().min(1),
  outcome: z.enum(["PLAN", "NO_ACTION", "PASS", "FLAG", "CLOSED"]),
  summary: z.string().min(1).max(600),
  owner: FoundingAgentSchema.nullable(),
  evidenceRefs: z.array(EvidenceRefSchema),
  costUsd: z.number().min(0),
  latencyMs: z.number().int().min(0),
  closedAt: z.string().datetime()
});
export type RoomDecision = z.infer<typeof RoomDecisionSchema>;

