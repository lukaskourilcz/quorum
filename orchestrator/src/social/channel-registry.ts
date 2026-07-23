import { z } from "zod";

export const ChannelSchema = z.object({
  id: z.enum(["threads", "instagram"]),
  specialist: z.enum(["THREADS", "INSTAGRAM"]),
  mode: z.enum(["draft", "autopublish"]),
  connector: z.string().min(1),
  credentialRef: z.string().min(1),
  approvedScopes: z.array(z.string()),
  nativeFormats: z.array(z.enum(["text", "image", "carousel", "reel"])),
  maxOrganicPostsPerDay: z.number().int().positive(),
  minHoursBetweenPosts: z.number().nonnegative(),
  timezone: z.string().min(1),
  enabledByHumanAt: z.string().datetime().nullable()
});
export type Channel = z.infer<typeof ChannelSchema>;

export const ChannelRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  channels: z.array(ChannelSchema).length(2)
});
export type ChannelRegistry = z.infer<typeof ChannelRegistrySchema>;

export function assertLiveChannel(channel: Channel, environment: NodeJS.ProcessEnv): void {
  const parsed = ChannelSchema.parse(channel);
  if (parsed.mode !== "autopublish" || parsed.enabledByHumanAt === null) {
    throw new Error(`${parsed.id} is in draft-only mode`);
  }
  if (!environment[parsed.credentialRef]) {
    throw new Error(`Missing credential: ${parsed.credentialRef}`);
  }
  if (parsed.approvedScopes.length === 0) {
    throw new Error(`${parsed.id} has no approved scopes`);
  }
  if (!environment.META_GRAPH_API_VERSION) {
    throw new Error("META_GRAPH_API_VERSION must be explicitly configured");
  }
}
