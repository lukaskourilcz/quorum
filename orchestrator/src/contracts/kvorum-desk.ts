import { z } from "zod";

const Sha1Schema = z.string().regex(/^[a-f0-9]{40}$/);
const RefTextSchema = z.strictObject({
  text: z.string().trim().min(1).max(2_000),
  refs: z.array(Sha1Schema).min(1).max(20)
});
const TribunClaimSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  type: z.enum(["fact-multi", "fact-single", "commentary"]),
  text: z.string().trim().min(1).max(1_000),
  refs: z.array(Sha1Schema).min(1).max(20)
});

export const TribunPackageSchema = z.strictObject({
  clusterId: Sha1Schema,
  headline: z.string().trim().min(1).max(240),
  summary: RefTextSchema,
  whyItMatters: RefTextSchema,
  whyThisIsWorthIt: z.string().trim().min(1).max(1_000),
  ourAngle: z.string().trim().min(1).max(2_000),
  ourAngleDiffers: z.string().trim().min(1).max(2_000),
  stitAttribution: z.strictObject({
    summary: z.string().trim().min(1).max(1_000),
    itemRefs: z.array(Sha1Schema).min(1).max(30)
  }).nullable(),
  targets: z.array(z.strictObject({
    platform: z.enum(["instagram", "facebook", "threads", "x"]),
    format: z.enum(["carousel", "single-image", "thread", "caption"]),
    reason: z.string().trim().min(1).max(800),
    copy: z.string().trim().min(1).max(12_000),
    altText: z.string().trim().min(1).max(2_000).nullable()
  })).min(1).max(8),
  claims: z.array(TribunClaimSchema).min(1).max(80)
});

export const TribunDeskOutputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("recommendations"),
    packages: z.array(TribunPackageSchema).min(1).max(2)
  }),
  z.strictObject({
    outcome: z.literal("quiet"),
    reason: z.string().trim().min(1).max(1_000),
    packages: z.tuple([])
  })
]);

export type TribunDeskOutput = z.infer<typeof TribunDeskOutputSchema>;
export type TribunPackage = z.infer<typeof TribunPackageSchema>;
