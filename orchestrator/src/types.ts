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
  "LEDGER",
  "HERALD",
  "STET",
  "HACEK",
  "SPARK",
  "VAULT",
  "FRAME",
  "RELAY",
  "ANGLE",
  "COHORT",
  "FUNNEL",
  "PALATE",
  "SCENE",
  "STUNT",
  "CORNER",
  "SPOTTER",
  "TAPE",
  "SIGMA",
  "VIG",
  "SONAR",
  "CANVAS",
  "JAB",
  "REACH",
  "SPLIT",
  "EASEL",
  "MOTIF",
  "PIVOT",
  "MAKO",
  "CHUM"
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

export const LegacyPhaseSchema = z.enum(["am", "pm"]);
export type LegacyPhase = z.infer<typeof LegacyPhaseSchema>;

export const ShiftPhaseSchema = z.enum(["morning", "afternoon", "night"]);
export type ShiftPhase = z.infer<typeof ShiftPhaseSchema>;

export const PhaseSchema = z.enum([
  "founding",
  "am",
  "pm",
  "morning",
  "afternoon",
  "night",
  "cu-edition",
  "cu-product",
  "tt-marketing",
  "gv-brief",
  "ms-daily",
  "incubator-scan",
  "incubator-synthesis",
  "mma-intake",
  "mma-analysis",
  "mag-editorial",
  "mag-desk",
  "article-am",
  "article-pm",
  "studio"
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const RunnablePhaseSchema = z.enum([
  "founding",
  "cu-edition",
  "morning",
  "afternoon",
  "cu-product",
  "tt-marketing",
  "gv-brief",
  "ms-daily",
  "mma-intake",
  "mma-analysis",
  "mag-editorial",
  "mag-desk",
  "article-am",
  "article-pm",
  "studio",
  "night"
]);
export type RunnablePhase = z.infer<typeof RunnablePhaseSchema>;

export const ScheduledPhaseSchema = z.enum([
  "cu-edition",
  "morning",
  "afternoon",
  "cu-product",
  "tt-marketing",
  "gv-brief",
  "ms-daily",
  "mma-intake",
  "mma-analysis",
  "mag-editorial",
  "mag-desk",
  "article-am",
  "article-pm",
  "studio",
  "night"
]);
export type ScheduledPhase = z.infer<typeof ScheduledPhaseSchema>;

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
