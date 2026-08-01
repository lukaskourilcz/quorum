import { z } from "zod";
import { ArticleFrontmatterV2Schema } from "./article-frontmatter.js";
import {
  DateSchema,
  HttpsUrlSchema,
  MeetingRefSchema,
  Sha256Schema,
  openObject
} from "./common.js";

const LocalizedArticleSchema = (lang: "en" | "cs") => openObject({
  frontmatter: ArticleFrontmatterV2Schema.extend({ lang: z.literal(lang) }),
  body: z.string().trim().min(1)
});

const ArticleSchema = openObject({
  en: LocalizedArticleSchema("en"),
  cs: LocalizedArticleSchema("cs")
});

const HeroSchema = openObject({
  path: z.string().regex(/^public\/illustrations\/\d{4}-\d{2}-\d{2}\.webp$/),
  bytesBase64: z.base64().refine((value) => Buffer.byteLength(value, "base64") <= 400_000),
  alt: z.string().trim().min(1).max(300),
  provenance: openObject({
    method: z.enum(["og-cache", "composed"]),
    composerVersion: z.string().trim().min(1).max(40),
    inputsHash: Sha256Schema
  })
});

const GenerationSchema = openObject({
  models: z.record(z.string().min(1), z.string().min(1)),
  costUsd: z.number().finite().nonnegative().optional()
});

const CommonFields = {
  schemaVersion: z.literal("edition-package/1"),
  date: DateSchema,
  idempotencyKey: Sha256Schema,
  generation: GenerationSchema,
  reason: z.string().trim().min(1).max(280)
};

const EditionSchema = openObject({
  ...CommonFields,
  status: z.literal("edition"),
  article: ArticleSchema,
  hero: HeroSchema.optional(),
  board: openObject({
    meetingRef: MeetingRefSchema,
    roomUrl: HttpsUrlSchema,
    whyThisStory: z.string().trim().min(1).max(280)
  }),
  socialPackRef: z.string().regex(/^state\/social\/packs\/\d{4}-\d{2}-\d{2}\.json$/).optional()
});

const NoEditionSchema = openObject({
  ...CommonFields,
  status: z.literal("no_edition"),
  board: openObject({
    meetingRef: MeetingRefSchema,
    roomUrl: HttpsUrlSchema,
    noEditionReason: z.string().trim().min(1).max(280)
  }),
  socialPackRef: z.string().regex(/^state\/social\/packs\/\d{4}-\d{2}-\d{2}\.json$/).optional()
});

export const EditionPackageSchema = z
  .discriminatedUnion("status", [EditionSchema, NoEditionSchema])
  .superRefine((editionPackage, context) => {
    if (Buffer.byteLength(JSON.stringify(editionPackage), "utf8") > 2_000_000) {
      context.addIssue({
        code: "custom",
        message: "serialized edition package exceeds 2 MB"
      });
    }
  });

export type EditionPackage = z.infer<typeof EditionPackageSchema>;
