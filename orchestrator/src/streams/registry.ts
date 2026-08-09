import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { openObject } from "../contracts/common.js";
import { STREAM_NAMES, STREAM_SOURCE_KINDS, type StreamName } from "../contracts/boardless-stream.js";
import { configRoot } from "../paths.js";

/**
 * The curated source registry. Owner-editable, and every entry carries the
 * exact hostname that must also appear in `config/network-allowlist.json`:
 * a source the allowlist does not know cannot be fetched, and the registry is
 * where a human sees which hosts the system will contact.
 */
export const StreamSourceEntrySchema = openObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/u),
  stream: z.enum(STREAM_NAMES),
  kind: z.enum(STREAM_SOURCE_KINDS),
  name: z.string().trim().min(1).max(80),
  /** The feed to read. Absent means the entry is a placeholder the owner fills. */
  feed: z.string().url().startsWith("https://").optional(),
  host: z.string().trim().min(1),
  /** Podcast shows carry static platform links; episodes inherit them. */
  links: openObject({
    youtube: z.string().url().startsWith("https://").optional(),
    spotify: z.string().url().startsWith("https://").optional(),
    apple: z.string().url().startsWith("https://").optional(),
    rss: z.string().url().startsWith("https://").optional(),
  }).optional(),
  /**
   * A feed whose id could not be resolved ships disabled with a note rather
   * than a guessed URL. Disabled entries are visible and inert.
   */
  enabled: z.boolean().default(true),
  note: z.string().trim().min(1).max(200).optional(),
});

export const StreamRegistrySchema = openObject({
  schemaVersion: z.literal("caught-up-streams/1"),
  /**
   * The Apify client is quota-guarded and off. Nothing in this path needs it,
   * and turning it on is a spend decision, not a fetch decision.
   */
  apify: z.literal(false),
  sources: z.array(StreamSourceEntrySchema),
});

export type StreamSourceEntry = z.infer<typeof StreamSourceEntrySchema>;
export type StreamRegistry = z.infer<typeof StreamRegistrySchema>;

export function registryPath(): string {
  return path.join(configRoot, "caught-up-streams.json");
}

export function loadStreamRegistry(file = registryPath()): StreamRegistry {
  return StreamRegistrySchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** The enabled, resolvable sources for one stream. */
export function sourcesFor(registry: StreamRegistry, stream: StreamName): StreamSourceEntry[] {
  return registry.sources.filter((entry) => entry.stream === stream && entry.enabled && entry.feed);
}

/** Every host the registry can contact, for the allowlist cross-check. */
export function registryHosts(registry: StreamRegistry): string[] {
  return [...new Set(registry.sources.map((entry) => entry.host))].sort();
}
