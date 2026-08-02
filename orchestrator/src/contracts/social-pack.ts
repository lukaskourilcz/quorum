import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { LiveTemplateReferenceSchema } from "./carousel-template.js";
import {
  DateSchema,
  HttpsUrlSchema,
  MeetingRefSchema,
  Sha256Schema,
  openObject
} from "./common.js";

const FramePathSchema = z.string().regex(/^\/social\/[a-zA-Z0-9/_-]+\.png$/);

const InstagramSchema = openObject({
  caption: z.string().trim().min(1).max(2200),
  variants: openObject({
    A: z.string().trim().min(1).max(2200),
    B: z.string().trim().min(1).max(2200)
  }),
  hashtags: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(5).max(10),
  frames: z.array(FramePathSchema).min(1).max(10),
  visual: LiveTemplateReferenceSchema
});

const ThreadsSchema = openObject({
  text: z.string().trim().min(1).max(500),
  variants: openObject({
    A: z.string().trim().min(1).max(500),
    B: z.string().trim().min(1).max(500)
  }),
  hashtags: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(2),
  frames: z.array(FramePathSchema).min(1).max(10),
  visual: LiveTemplateReferenceSchema
});

const LocalePackSchema = openObject({
  destination: HttpsUrlSchema,
  instagram: InstagramSchema,
  threads: ThreadsSchema
});

export const SocialPackSchema = openObject({
  schemaVersion: z.literal("social-pack/1"),
  date: DateSchema,
  editionRef: Sha256Schema,
  byLocale: openObject({
    en: LocalePackSchema,
    cs: LocalePackSchema
  }),
  instagram: openObject({
    caption: z.string().trim().min(1).max(2200),
    hashtags: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(5).max(10),
    frames: z.array(FramePathSchema).min(1).max(10),
    visual: LiveTemplateReferenceSchema
  }),
  threads: openObject({
    text: z.string().trim().min(1).max(500),
    hashtags: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(2),
    frames: z.array(FramePathSchema).min(1).max(10),
    visual: LiveTemplateReferenceSchema
  }),
  quoteCard: openObject({
    frame: FramePathSchema,
    sourceTurnRef: MeetingRefSchema,
    visual: LiveTemplateReferenceSchema
  }),
  provenance: openObject({
    composerVersion: z.string().trim().min(1).max(40),
    inputsHash: Sha256Schema
  }),
  altTexts: z.record(FramePathSchema, z.string().trim().min(1).max(300))
}).superRefine((pack, context) => {
  if (
    !isDeepStrictEqual(pack.instagram, pack.byLocale.en.instagram) ||
    !isDeepStrictEqual(pack.threads, pack.byLocale.en.threads)
  ) {
    context.addIssue({
      code: "custom",
      message: "legacy channel fields must mirror the English locale",
      path: ["byLocale", "en"]
    });
  }
  for (const locale of ["en", "cs"] as const) {
    if (pack.byLocale[locale].instagram.caption !== pack.byLocale[locale].instagram.variants.A) {
      context.addIssue({ code: "custom", message: `${locale} Instagram caption must mirror variant A`, path: ["byLocale", locale, "instagram", "caption"] });
    }
    if (pack.byLocale[locale].threads.text !== pack.byLocale[locale].threads.variants.A) {
      context.addIssue({ code: "custom", message: `${locale} Threads text must mirror variant A`, path: ["byLocale", locale, "threads", "text"] });
    }
  }
  const frames = new Set([
    ...pack.byLocale.en.instagram.frames,
    ...pack.byLocale.en.threads.frames,
    ...pack.byLocale.cs.instagram.frames,
    ...pack.byLocale.cs.threads.frames,
    pack.quoteCard.frame
  ]);
  for (const frame of frames) {
    if (!pack.altTexts[frame]) {
      context.addIssue({
        code: "custom",
        message: "every frame requires alt text",
        path: ["altTexts", frame]
      });
    }
  }
});

export type SocialPack = z.infer<typeof SocialPackSchema>;
