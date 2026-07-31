import { z } from "zod";
import { ContractAgentIdSchema, MeetingRefSchema, HttpsUrlSchema, openObject } from "./common.js";

export const MeetingEmailSchema = openObject({
  schemaVersion: z.literal("meeting-email/1"),
  meetingRef: MeetingRefSchema,
  kind: z.enum(["venture", "cu-edition", "cu-product"]),
  subject: z.string().trim().min(1).max(180),
  decisionLine: z.string().trim().min(1).max(280),
  voteLine: z.string().trim().min(1).max(280),
  summary: z.string().trim().min(1).max(900),
  bestExchange: openObject({
    agent: ContractAgentIdSchema,
    text: z.string().trim().min(1).max(1600)
  }).optional(),
  links: openObject({
    room: HttpsUrlSchema,
    edition: HttpsUrlSchema.optional()
  }),
  meetingCostUsd: z.number().finite().nonnegative()
}).describe("Retired meeting-email/1 compatibility schema. Runtime delivery uses daily-digest/1.");

export type MeetingEmail = z.infer<typeof MeetingEmailSchema>;
