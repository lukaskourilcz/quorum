import { z } from "zod";
import { DateSchema, DateTimeSchema, HttpsUrlSchema } from "./common.js";
import { VentureClaimTypeSchema } from "./venture-recommendation.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const Sha1Schema = z.string().regex(/^[a-f0-9]{40}$/);
const RecommendationRefSchema = z.string().regex(
  /^state\/ventures\/kvorum\/recommendations\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u
);

export const KvorumClaimSourceSchema = z.strictObject({
  itemRef: Sha1Schema,
  sourceId: SlugSchema,
  sourceName: z.string().trim().min(1).max(120),
  url: HttpsUrlSchema,
  publishedAt: DateTimeSchema,
  excerpt: z.string().trim().min(1).max(600),
  discoveryOnly: z.boolean(),
  stitEngagement: z.strictObject({
    likes: z.number().int().nonnegative().nullable(),
    comments: z.number().int().nonnegative().nullable(),
    shares: z.number().int().nonnegative().nullable()
  }).nullable()
});

export const KvorumClaimSchema = z.strictObject({
  schemaVersion: z.literal("kvorum-claim/1"),
  id: SlugSchema,
  ventureId: z.literal("kvorum"),
  recommendationId: SlugSchema,
  recommendationRef: RecommendationRefSchema,
  recommendationStatus: z.enum(["approved-draft", "posted"]),
  monitorDate: DateSchema,
  receiptRef: z.string().regex(/^state\/ventures\/kvorum\/monitor\/\d{4}-\d{2}-\d{2}\.json$/u),
  clusterId: Sha1Schema,
  claimId: SlugSchema,
  claim: z.string().trim().min(1).max(1_000),
  type: VentureClaimTypeSchema,
  refs: z.array(KvorumClaimSourceSchema).min(1).max(20),
  status: z.enum(["standing", "corrected", "retracted"]),
  correctionRef: RecommendationRefSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  publishedAt: DateTimeSchema.nullable(),
  postedUrl: HttpsUrlSchema.nullable()
}).superRefine((claim, context) => {
  if (new Set(claim.refs.map((source) => source.itemRef)).size !== claim.refs.length) {
    context.addIssue({ code: "custom", message: "Claim source refs must be unique", path: ["refs"] });
  }
  if (claim.type === "fact-multi" && claim.refs.length < 2) {
    context.addIssue({ code: "custom", message: "fact-multi requires at least two refs", path: ["refs"] });
  }
  if (claim.type !== "commentary" && claim.refs.some((source) => source.discoveryOnly)) {
    context.addIssue({ code: "custom", message: "Discovery-only sources cannot support factual claims", path: ["refs"] });
  }
  if (claim.receiptRef !== `state/ventures/kvorum/monitor/${claim.monitorDate}.json`) {
    context.addIssue({ code: "custom", message: "Monitor receipt ref must match monitorDate", path: ["receiptRef"] });
  }
  for (const [index, source] of claim.refs.entries()) {
    if (source.discoveryOnly !== (source.stitEngagement !== null)) {
      context.addIssue({ code: "custom", message: "Discovery context requires its retained engagement", path: ["refs", index, "stitEngagement"] });
    }
  }
  if (Date.parse(claim.updatedAt) < Date.parse(claim.createdAt)) {
    context.addIssue({ code: "custom", message: "updatedAt cannot predate createdAt", path: ["updatedAt"] });
  }
  const published = claim.publishedAt !== null && claim.postedUrl !== null;
  if (claim.recommendationStatus === "approved-draft" && (claim.publishedAt !== null || claim.postedUrl !== null)) {
    context.addIssue({ code: "custom", message: "An approved draft is not published", path: ["recommendationStatus"] });
  }
  if (claim.recommendationStatus === "posted" && !published) {
    context.addIssue({ code: "custom", message: "A posted claim requires its manual post receipt", path: ["recommendationStatus"] });
  }
  if (claim.status === "standing" && claim.correctionRef !== null) {
    context.addIssue({ code: "custom", message: "A standing claim has no correction ref", path: ["correctionRef"] });
  }
  if (claim.status !== "standing" && claim.correctionRef === null) {
    context.addIssue({ code: "custom", message: "A corrected or retracted claim requires its correction draft", path: ["correctionRef"] });
  }
});

export type KvorumClaim = z.infer<typeof KvorumClaimSchema>;
