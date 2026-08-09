import { z } from "zod";
import { DateSchema, HttpsUrlSchema, openObject } from "./common.js";

/**
 * `boardless-stream/1` — the external link streams the magazine renders at
 * /o-cem-se-mluvi and /podcasty.
 *
 * Deliberately not `boardless-dataset/1`. A dataset is an append-only reveal
 * schedule where array order is meaning and a published entry is immutable. A
 * stream is the opposite: it is replaced wholesale on every sync, pruned by a
 * rolling window, and the reader has no memory of the previous copy. Sharing a
 * contract between the two would make the append guard meaningless for one of
 * them.
 */
export const STREAM_NAMES = ["talked-about", "podcasts"] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

export const STREAM_SOURCE_KINDS = ["medium", "substack", "blog", "youtube", "rss"] as const;
export type StreamSourceKind = (typeof STREAM_SOURCE_KINDS)[number];

export const StreamSourceSchema = openObject({
  kind: z.enum(STREAM_SOURCE_KINDS),
  name: z.string().trim().min(1).max(80),
  feed: HttpsUrlSchema.optional(),
});

export const StreamItemSchema = openObject({
  /** sha1 of the canonical URL. Stable across syncs, which is what dedupes. */
  id: z.string().regex(/^[0-9a-f]{40}$/u, "expected a sha1 hex digest"),
  title: z.string().trim().min(1).max(300),
  url: HttpsUrlSchema,
  source: StreamSourceSchema,
  author: z.string().trim().min(1).max(120).nullable().optional(),
  published: DateSchema,
  summary: z.string().trim().min(1).max(280).nullable().optional(),
  weight: z.number().finite().optional(),
  /** Podcast episodes only. */
  show: z.string().trim().min(1).max(120).optional(),
  durationSec: z.number().int().positive().optional(),
  links: openObject({
    youtube: HttpsUrlSchema.optional(),
    spotify: HttpsUrlSchema.optional(),
    apple: HttpsUrlSchema.optional(),
    rss: HttpsUrlSchema.optional(),
  }).optional(),
});

export const BoardlessStreamSchema = openObject({
  schemaVersion: z.literal("boardless-stream/1"),
  stream: z.enum(STREAM_NAMES),
  updated: DateSchema,
  windowDays: z.number().int().positive().max(365),
  items: z.array(StreamItemSchema),
});

export type StreamSource = z.infer<typeof StreamSourceSchema>;
export type StreamItem = z.infer<typeof StreamItemSchema>;
export type BoardlessStream = z.infer<typeof BoardlessStreamSchema>;

/** `stream-sync/1` — the receipt written beside every fetch, model-free by construction. */
export const StreamSyncReceiptSchema = openObject({
  schemaVersion: z.literal("stream-sync/1"),
  stream: z.enum(STREAM_NAMES),
  date: DateSchema,
  before: z.number().int().nonnegative(),
  after: z.number().int().nonnegative(),
  added: z.array(z.string()),
  pruned: z.array(z.string()),
  /** One entry per registry source that failed. A failure is a note, never a throw. */
  sourceErrors: z.array(
    openObject({
      source: z.string(),
      reason: z.string(),
    }),
  ),
});

export type StreamSyncReceipt = z.infer<typeof StreamSyncReceiptSchema>;
