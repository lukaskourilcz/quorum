import { z } from "zod";
import { VentureIdSchema, openObject } from "./common.js";

export const PublicInterestCategorySchema = z.enum([
  "artificial-intelligence",
  "business",
  "culture",
  "design",
  "digital-media",
  "ecommerce",
  "entrepreneurship",
  "fashion",
  "news",
  "skateboarding",
  "startups",
  "streetwear",
  "technology",
  "womens-fashion"
]).describe(
  "Interest-based public categories only. Never use personal data or custom audiences from data the company does not have."
);

export const AudienceAgeRangeSchema = openObject({
  min: z.number().int().min(18).max(120),
  max: z.number().int().min(18).max(120)
}).refine(({ min, max }) => min <= max, {
  message: "ageRange.min must not exceed ageRange.max"
});

export const AudienceCoreSchema = openObject({
  regions: z.array(z.string().trim().min(2).max(80)).min(1),
  ageRange: AudienceAgeRangeSchema,
  genders: z.array(z.enum(["women", "men", "nonbinary", "all"])).min(1),
  interests: z.array(PublicInterestCategorySchema).min(1),
  platforms: z.array(z.enum([
    "instagram",
    "threads",
    "facebook",
    "tiktok",
    "youtube",
    "reddit",
    "web",
    "newsletter"
  ])).min(1),
  adTargetingNotes: z.string().trim().min(1).max(800)
});

export const AudienceSpecSchema = openObject({
  schemaVersion: z.literal("audience-spec/1"),
  ventureId: VentureIdSchema,
  subjectRef: z.string().trim().min(1).max(160),
  ...AudienceCoreSchema.shape,
  status: z.enum(["draft", "validated", "graduated", "archived"])
});

export type AudienceSpec = z.infer<typeof AudienceSpecSchema>;
