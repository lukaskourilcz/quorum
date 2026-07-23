import { z } from "zod";

export const SocialPostDraftSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(["threads", "instagram"]),
  scheduledAt: z.string().datetime(),
  copy: z.string().min(1).max(2_200),
  destinationUrl: z.string().url().nullable(),
  assetIds: z.array(z.string()),
  altText: z.string().min(1).max(1_000).nullable(),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["draft", "approved", "queued"])
});
export type SocialPostDraft = z.infer<typeof SocialPostDraftSchema>;

export interface SocialPlan {
  decision: "PLAN" | "NO_POST";
  reason: string;
  posts: SocialPostDraft[];
}

export function planSocialPosts(
  drafts: readonly SocialPostDraft[],
  hasPublishableFact: boolean
): SocialPlan {
  const posts = drafts.map((draft) => SocialPostDraftSchema.parse(draft));
  if (!hasPublishableFact || posts.length === 0) {
    return {
      decision: "NO_POST",
      reason: "No evidence-backed publishable company or venture fact exists.",
      posts: []
    };
  }
  for (const post of posts) {
    if (post.assetIds.length > 0 && !post.altText) {
      throw new Error(`Alt text is required for media post ${post.id}`);
    }
    if (post.evidenceRefs.length === 0) {
      throw new Error(`Publishable post ${post.id} requires evidence`);
    }
  }
  return {
    decision: "PLAN",
    reason: "Evidence-backed drafts are ready for approval.",
    posts
  };
}
