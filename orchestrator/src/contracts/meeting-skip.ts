import { z } from "zod";
import { DateSchema, DateTimeSchema, openObject } from "./common.js";

/**
 * A meeting slot a gate turned off before any room opened.
 *
 * A skip used to leave nothing behind. The workflow decided it in a shell step, wrote the
 * reason to a GitHub Actions log that expires, and the calendar then showed the slot as
 * "missed" alongside slots that were genuinely never reached — so on 2 August eleven meetings
 * did not happen and nothing on the site could say why. The reason is the whole point of the
 * record: it is what turns "missed" into an answer.
 */
export const MeetingSkipSchema = openObject({
  schemaVersion: z.literal("meeting-skip/1"),
  date: DateSchema,
  phase: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(1).max(240),
  decidedAt: DateTimeSchema
});

export type MeetingSkip = z.infer<typeof MeetingSkipSchema>;
