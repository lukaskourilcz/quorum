import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DateTimeSchema, Sha256Schema } from "../../../contracts/common.js";

const NullableDateTimeSchema = DateTimeSchema.nullable();

export const WebDevSourceCacheEntrySchema = z.strictObject({
  sourceId: z.string().regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/).max(160),
  etag: z.string().trim().min(1).max(256).nullable(),
  lastModified: z.string().trim().min(1).max(256).nullable(),
  contentHash: Sha256Schema.nullable(),
  lastAttemptAt: NullableDateTimeSchema,
  lastSuccessAt: NullableDateTimeSchema,
  lastNonEmptySuccessAt: NullableDateTimeSchema,
  retryAfterAt: NullableDateTimeSchema,
  parserVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  sourceVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  layoutFingerprint: Sha256Schema.nullable(),
  consecutiveFailures: z.number().int().min(0).max(1_000),
  heldReason: z.string().trim().min(1).max(240).nullable()
});

export const WebDevSourceCacheSchema = z.strictObject({
  schemaVersion: z.literal("webdev-source-cache/1"),
  entries: z.record(z.string(), WebDevSourceCacheEntrySchema)
}).superRefine((cache, context) => {
  for (const [key, entry] of Object.entries(cache.entries)) {
    if (key !== entry.sourceId) {
      context.addIssue({ code: "custom", path: ["entries", key, "sourceId"], message: "cache key must match source id" });
    }
  }
});

export type WebDevSourceCache = z.infer<typeof WebDevSourceCacheSchema>;
export type WebDevSourceCacheEntry = z.infer<typeof WebDevSourceCacheEntrySchema>;

export function emptyWebDevSourceCache(): WebDevSourceCache {
  return { schemaVersion: "webdev-source-cache/1", entries: {} };
}

export async function loadWebDevSourceCache(filePath: string): Promise<WebDevSourceCache> {
  try {
    return WebDevSourceCacheSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyWebDevSourceCache();
    throw error;
  }
}

/** Persists conditional metadata only. Raw response bodies are not accepted by the schema. */
export async function writeWebDevSourceCache(filePath: string, cache: WebDevSourceCache): Promise<void> {
  const validated = WebDevSourceCacheSchema.parse(cache);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}
