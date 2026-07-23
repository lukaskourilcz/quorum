import { z } from "zod";

export const SourceItemSchema = z.object({
  sourceId: z.string().min(1),
  externalId: z.string().min(1),
  title: z.string().min(1).max(500),
  url: z.string().url(),
  publishedAt: z.string().datetime().nullable(),
  author: z.string().max(200).nullable(),
  summary: z.string().max(2_000),
  fetchedAt: z.string().datetime()
});
export type SourceItem = z.infer<typeof SourceItemSchema>;

export const SourceConfigSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["hn", "rss"]),
  name: z.string().min(1),
  url: z.string().url(),
  enabled: z.boolean(),
  stage: z.array(z.string()),
  maxItems: z.number().int().min(1).max(100)
});
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
