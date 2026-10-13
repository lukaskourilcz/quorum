import { z } from "zod";

/** Exact shared OwnDashboard dneskai-feed/1 contract; research is never a SourcePacket approval. */
export const DneskaiFeedRequestSchema = z.strictObject({
  action: z.literal("collect"),
  sourceIds: z.array(z.string().max(100)).min(1).max(8),
  since: z.iso.datetime({ offset: true }),
  maxItems: z.number().int().min(1).max(20)
});
export const DneskaiFeedResponseSchema = z.strictObject({
  schemaVersion: z.literal("dneskai-feed/1"),
  sources: z.array(z.strictObject({
    sourceId: z.string(),
    status: z.enum(["ok", "partial", "error"]),
    errorCode: z.string().nullable(),
    items: z.array(z.strictObject({
      externalId: z.string(), title: z.string().max(500), url: z.url(),
      publishedAt: z.iso.datetime({ offset: true }).nullable(),
      summary: z.string().max(2000), fetchedAt: z.iso.datetime({ offset: true })
    })).max(20)
  })).max(8)
});
export type DneskaiFeedRequest = z.infer<typeof DneskaiFeedRequestSchema>;
export type DneskaiFeedResponse = z.infer<typeof DneskaiFeedResponseSchema>;
