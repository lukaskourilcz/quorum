import { z } from "zod";
import { DateSchema, VentureIdSchema, openObject } from "./common.js";

export function countWords(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

const DigestBulletSchema = openObject({
  text: z.string().trim().min(1).max(240).refine((text) => countWords(text) <= 20, {
    message: "Digest bullets must stay within 20 words"
  }),
  roomLink: z.string().regex(/^\/(?:meetings|standups|calendar)\//)
});

export const DigestOperationSchema = openObject({
  ventureId: z.union([VentureIdSchema, z.literal("global")]),
  type: z.enum(["delivery", "release-proof", "failure", "social-gate"]),
  status: z.string().trim().min(1).max(40),
  text: z.string().trim().min(1).max(240).refine((text) => countWords(text) <= 24, {
    message: "Digest operation lines must stay within 24 words"
  }),
  ref: z.string().trim().min(1).max(500).nullable()
});

export const DailyDigestSchema = openObject({
  schemaVersion: z.literal("daily-digest/1"),
  date: DateSchema,
  meetings: z.array(openObject({
    ventureId: z.union([VentureIdSchema, z.literal("global")]),
    kind: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    held: z.boolean(),
    bullets: z.array(DigestBulletSchema).min(1),
    costUsd: z.number().finite().nonnegative()
  })),
  operations: z.array(DigestOperationSchema).max(16),
  portfolioLine: z.string().trim().min(1).max(240),
  bodyWordCount: z.number().int().nonnegative().max(400)
}).superRefine((digest, context) => {
  const calculated = countWords(digest.portfolioLine) + digest.meetings.reduce(
    (total, meeting) => total + meeting.bullets.reduce(
      (meetingTotal, bullet) => meetingTotal + countWords(bullet.text),
      0
    ),
    0
  ) + digest.operations.reduce((total, operation) => total + countWords(operation.text), 0);
  if (calculated !== digest.bodyWordCount) {
    context.addIssue({
      code: "custom",
      message: `bodyWordCount must equal ${calculated}`,
      path: ["bodyWordCount"]
    });
  }
});

export type DailyDigest = z.infer<typeof DailyDigestSchema>;
export type DigestOperation = z.infer<typeof DigestOperationSchema>;
