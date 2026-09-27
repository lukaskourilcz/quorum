import { z } from "zod";
import { DateSchema, DateTimeSchema, HttpsUrlSchema, Sha256Schema } from "./common.js";

/**
 * `marketingshark-qotd/1` — devShark's code question of the day on Threads (quorum#592).
 *
 * The one marketingShark post that is not a carousel. Threads is the plan's primary follower
 * engine and its daily 09:00 post is one short question with lettered options; a five-slide deck
 * would be the wrong shape for it. So the post is text, drafted by code from the served question
 * bank with no model call, and the answer waits in a first-reply draft the owner posts under it:
 * the plan keeps every link out of the post itself and puts it in the first reply.
 *
 * The package is the record of the pick. It is written once per date and read back, never
 * re-derived, because a re-import of the bank can change which question a fresh pick would reach.
 */
export const QOTD_THREADS_TEXT_LIMIT = 500;

export const MarketingSharkQotdSchema = z.strictObject({
  schemaVersion: z.literal("marketingshark-qotd/1"),
  id: z.string().regex(/^ms-qotd-\d{4}-\d{2}-\d{2}-devshark$/u),
  date: DateSchema,
  brandId: z.literal("devshark"),
  platform: z.literal("threads"),
  question: z.strictObject({
    id: z.string().min(1).max(120),
    category: z.string().min(1).max(60),
    difficulty: z.number().int().min(1).max(5),
    correctIndex: z.number().int().min(0).max(5)
  }),
  /** The committed snapshot the question came from, as the carousel's packages record it. */
  bank: z.strictObject({
    sourceRepo: z.string().min(1).max(120),
    sourceCommit: z.string().min(7).max(64),
    contentHash: Sha256Schema
  }),
  post: z.strictObject({ text: z.string().trim().min(1).max(QOTD_THREADS_TEXT_LIMIT) }),
  /** Posted by the owner under the question: the answer, why, and the one tracked link. */
  firstReply: z.strictObject({
    text: z.string().trim().min(1).max(QOTD_THREADS_TEXT_LIMIT),
    link: HttpsUrlSchema
  }),
  publishWindow: z.strictObject({
    /** The plan's slot, in Prague time; the window below is its UTC form for that date. */
    prague: z.string().regex(/^\d{2}:\d{2}$/u),
    notBefore: DateTimeSchema,
    notAfter: DateTimeSchema
  }),
  status: z.literal("draft"),
  /** Code drafts it from committed data. There is no call to bill. */
  spendUsd: z.literal(0)
});

export type MarketingSharkQotd = z.infer<typeof MarketingSharkQotdSchema>;
