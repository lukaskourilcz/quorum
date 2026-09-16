import { z } from "zod";
import { DateSchema, DateTimeSchema, openObject } from "./common.js";

/**
 * Which guard ended the slot, in four words a program can branch on.
 *
 * `reason` is the sentence a reader gets and it has to stay a sentence — it is printed on the
 * week board. Nothing could read it back: the site, the digest and the owner's admin all had to
 * match on prose to tell "the day's pace is spent" from "the month is over", which is exactly
 * the kind of match that breaks the first time the sentence is reworded. This is the same fact
 * as a code, so a budget stop can be counted, filtered and answered without parsing English.
 *
 * It is deliberately coarser than BudgetErrorCode: a reader does not need to know whether the
 * stage cap or the cycle cap refused the seat, only that this room ran out of its own money.
 * A refusal that none of the four describe leaves the field off rather than guessing.
 */
export const MeetingStopReasonSchema = z.enum([
  /** A monthly limit — the company's, the model share's or a desk's — is spent. */
  "budget_reached",
  /** The day's pace is spent. Tomorrow opens as normal. */
  "daily_pace",
  /** This room reached its own declared envelope. Other rooms are unaffected. */
  "room_cap",
  /** The reservation would have eaten the repair reserve the pacing rung holds back. */
  "pacing"
]);
export type MeetingStopReason = z.infer<typeof MeetingStopReasonSchema>;

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
  /**
   * Optional because every skip written before this field existed is still a valid skip, and
   * because gates other than the budget close slots too. The schema is an open object, so the
   * committed records parse unchanged and an older reader simply does not see the field.
   */
  stopReason: MeetingStopReasonSchema.optional(),
  decidedAt: DateTimeSchema
});

export type MeetingSkip = z.infer<typeof MeetingSkipSchema>;
