import { z } from "zod";
import {
  ContractAgentIdSchema,
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  FingerprintSchema,
  MeetingRefSchema,
  openObject
} from "./common.js";

export const IdeaStatusSchema = z.enum([
  "proposed",
  "accepted",
  "in_progress",
  "shipped",
  "deferred",
  "vetoed",
  "killed",
  "superseded",
  "revived"
]);

const IdeaIdSchema = z.string().regex(/^idea-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/);

export const IdeaLedgerEntrySchema = openObject({
  schemaVersion: z.literal("idea-ledger/1"),
  id: IdeaIdSchema,
  fingerprint: FingerprintSchema,
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(280),
  origin: openObject({
    agent: ContractAgentIdSchema,
    meetingRef: MeetingRefSchema
  }),
  status: IdeaStatusSchema,
  statusHistory: z.array(openObject({
    status: IdeaStatusSchema,
    at: DateTimeSchema,
    meetingRef: MeetingRefSchema,
    reason: z.string().trim().min(1).max(280)
  })).min(1),
  similarTo: z.array(openObject({
    id: IdeaIdSchema,
    score: z.number().finite().min(0).max(1),
    verdict: z.enum(["duplicate_of", "variant_of"])
  })),
  deferred: z.union([
    openObject({ until: DateSchema }),
    openObject({ condition: z.string().trim().min(1).max(200) })
  ]).optional(),
  revival: openObject({
    from: IdeaIdSchema,
    evidenceRef: EvidenceRefSchema
  }).optional(),
  supersededBy: IdeaIdSchema.optional()
});

export type IdeaLedgerEntry = z.infer<typeof IdeaLedgerEntrySchema>;
