import { z } from "zod";

/**
 * One day's garment proposals, with the provenance that makes each one defensible.
 *
 * The shape's whole point: provider, model, the exact prompt that was sent, a content hash and a
 * cost on every variant. An image with no recorded prompt cannot be reproduced or argued about, so
 * the record is written before anything is shown to anyone.
 *
 * A doctrine rejection removes the bytes and keeps everything else. Policy violations do not stay
 * on disk; the evidence that they happened does.
 */
export const DesignProposalSchema = z.object({
  schemaVersion: z.literal("design-proposal/1"),
  ventureId: z.literal("titty-tuesdays"),
  date: z.string().date(),
  promptTemplateVersion: z.string().min(1).max(60),
  concept: z.object({
    conceptId: z.string().min(1).max(80),
    title: z.string().min(1).max(160),
    colorway: z.string().min(1).max(160),
    palette: z.array(z.string().min(1).max(40)).max(6),
    sceneTexture: z.string().min(1).max(160),
    axis: z.enum(["flat-lay", "silhouette", "detail"])
  }),
  variants: z.array(z.object({
    variantId: z.string().min(1).max(80),
    provider: z.enum(["openai", "fal"]),
    model: z.string().min(1).max(120),
    /** The exact string sent. Not a summary of it. */
    prompt: z.string().min(1).max(4_000),
    altText: z.string().min(1).max(400),
    /** Relative to `state/`. Null once a doctrine rejection has removed the bytes. */
    imagePath: z.string().min(1).max(300).nullable(),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
    usd: z.number().nonnegative(),
    createdAt: z.string().datetime(),
    status: z.enum(["proposed", "doctrine-rejected"]),
    /** Set only by a doctrine rejection, with the reason and when. */
    rejectedAt: z.string().datetime().nullable(),
    reason: z.string().min(1).max(400).nullable()
  })).max(8),
  /** Providers that failed, and why. One failing provider costs its image, never the run. */
  failures: z.array(z.object({
    provider: z.enum(["openai", "fal"]),
    reason: z.string().min(1).max(400)
  })).max(4),
  generatedAt: z.string().datetime()
});

export type DesignProposal = z.infer<typeof DesignProposalSchema>;

export function designProposalPath(date: string): string {
  return `ventures/titty-tuesdays/design-proposals/${date}.json`;
}

export function designProposalMediaPath(date: string, conceptId: string, provider: string): string {
  return `ventures/titty-tuesdays/design-proposals/media/${date}/${conceptId}-${provider}.webp`;
}
