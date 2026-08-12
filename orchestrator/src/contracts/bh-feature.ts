import { z } from "zod";

const ClaimRefSchema = z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

export const BhLanguageFeatureSchema = z.strictObject({
  schemaVersion: z.literal("bh-language-feature/1"),
  locale: z.enum(["cs", "en"]),
  headline: z.string().trim().min(8).max(180),
  slides: z.array(z.strictObject({
    role: z.enum(["hook", "context", "turn", "ending"]),
    text: z.string().trim().min(8).max(800),
    factualSentences: z.array(z.strictObject({
      text: z.string().trim().min(5).max(500),
      claimRefs: z.array(ClaimRefSchema).min(1).max(10)
    })).max(10)
  })).min(3).max(10),
  caption: z.string().trim().min(8).max(2_200),
  quotes: z.array(z.strictObject({
    text: z.string().trim().min(1).max(300),
    attribution: z.string().trim().min(1).max(300),
    claimRef: ClaimRefSchema
  })).max(5)
});

export type BhLanguageFeature = z.infer<typeof BhLanguageFeatureSchema>;
