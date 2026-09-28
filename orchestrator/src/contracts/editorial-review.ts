import { z } from "zod";
import { EditionPackageSchema } from "./edition-package.js";
import { ArticleImageSchema } from "./autonomy.js";

export const EditorialReviewSchema = z.strictObject({
  schemaVersion: z.enum(["editorial-review/1", "editorial-review/2"]),
  id: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.string().datetime(),
  package: EditionPackageSchema,
  titles: z.array(z.string().trim().min(1).max(240)).max(4),
  images: z.array(z.strictObject({
    id: z.enum(["photo-1", "photo-2", "fal", "candidate-1", "candidate-2", "candidate-3", "candidate-4"]),
    image: ArticleImageSchema.nullable(),
    unavailableReason: z.string().max(300).nullable()
  })).min(3).max(4)
}).superRefine((review, context) => {
  if (review.package.status !== "edition" || review.id !== review.package.idempotencyKey) {
    context.addIssue({ code: "custom", message: "A review belongs to one exact article package" });
  }
  if (review.images.length !== (review.schemaVersion === "editorial-review/2" ? 4 : 3) || new Set(review.images.map(image => image.id)).size !== review.images.length) {
    context.addIssue({ code: "custom", message: "Image slots must be unique" });
  }
  for (const slot of review.images) {
    if (review.schemaVersion === "editorial-review/1" && slot.image && slot.image.origin !== (slot.id === "fal" ? "illustration" : "photo")) {
      context.addIssue({ code: "custom", message: "Candidate origin does not match its slot" });
    }
    if (!slot.image && !slot.unavailableReason) {
      context.addIssue({ code: "custom", message: "An unavailable candidate needs a reason" });
    }
  }
});

export const EditorialDecisionSchema = z.strictObject({
  schemaVersion: z.literal("editorial-decision/1"),
  reviewId: z.string().regex(/^[a-f0-9]{64}$/u),
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/u),
  action: z.enum(["approve", "reject"]),
  title: z.string().trim().min(1).max(240),
  imageId: z.enum(["photo-1", "photo-2", "fal", "candidate-1", "candidate-2", "candidate-3", "candidate-4"]),
  decidedAt: z.string().datetime(),
  actor: z.literal("owner")
});

export type EditorialReview = z.infer<typeof EditorialReviewSchema>;
export type EditorialDecision = z.infer<typeof EditorialDecisionSchema>;
