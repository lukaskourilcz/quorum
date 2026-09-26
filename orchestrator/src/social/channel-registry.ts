import { z } from "zod";

export const ChannelSchema = z.object({
  id: z.enum(["threads", "instagram", "linkedin"]),
  // The agent that drafts platform-native copy. LinkedIn has none: marketingShark's CHUM writes the
  // devShark caption inside its own package, so the channel names no specialist of its own.
  specialist: z.enum(["THREADS", "INSTAGRAM"]).nullable(),
  mode: z.enum(["draft", "autopublish"]),
  connector: z.string().min(1),
  credentialRef: z.string().min(1),
  approvedScopes: z.array(z.string()),
  // LinkedIn's organic carousel is a document or a multi-image post, not an Instagram carousel.
  nativeFormats: z.array(z.enum(["text", "image", "carousel", "reel", "multi-image", "document"])),
  maxOrganicPostsPerDay: z.number().int().positive(),
  minHoursBetweenPosts: z.number().nonnegative(),
  timezone: z.string().min(1),
  enabledByHumanAt: z.string().datetime().nullable()
});
export type Channel = z.infer<typeof ChannelSchema>;

export const ChannelRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  channels: z.array(ChannelSchema).length(3)
});

export function assertLiveChannel(channel: Channel, environment: NodeJS.ProcessEnv): void {
  const parsed = ChannelSchema.parse(channel);
  if (parsed.mode !== "autopublish" || parsed.enabledByHumanAt === null) {
    throw new Error(`${parsed.id} is in draft-only mode`);
  }
  if (parsed.approvedScopes.length === 0) {
    throw new Error(`${parsed.id} has no approved scopes`);
  }
  // LinkedIn goes through Buffer (quorum#571), whose GraphQL API has no version to configure; the
  // Graph version is a Meta setting.
  if (parsed.id !== "linkedin" && !environment.META_GRAPH_API_VERSION) {
    throw new Error("META_GRAPH_API_VERSION must be explicitly configured");
  }
}
