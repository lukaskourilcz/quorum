import { z } from "zod";

export const CouncilAgentSchema = z.enum(["VIZE", "FORGE", "PULSE", "AUDIT"]);
export type CouncilAgent = z.infer<typeof CouncilAgentSchema>;

export const FoundingAgentSchema = z.enum([
  "VIZE",
  "FORGE",
  "PULSE",
  "AUDIT",
  "SCOUT",
  "SCRIBE",
  "LENS",
  "QUILL",
  "RADAR",
  "KEEPER",
  "THREADS",
  "INSTAGRAM",
  "PEOPLE",
  "LEDGER"
]);
export type FoundingAgent = z.infer<typeof FoundingAgentSchema>;

export const StageSchema = z.enum([
  "DISCOVERY",
  "VALIDATION",
  "AUDIENCE",
  "MONETIZATION",
  "OPTIMIZATION"
]);
export type Stage = z.infer<typeof StageSchema>;

export const PhaseSchema = z.enum(["founding", "am", "pm"]);
export type Phase = z.infer<typeof PhaseSchema>;

export const TaskTypeSchema = z.enum([
  "research",
  "experiment",
  "page",
  "feature",
  "content",
  "brand",
  "infra",
  "biz",
  "spend",
  "source",
  "channel",
  "org_change"
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const NullableNumberSchema = z.number().finite().nullable();

export const EvidenceRefSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Z][A-Z0-9_-]*$/);

