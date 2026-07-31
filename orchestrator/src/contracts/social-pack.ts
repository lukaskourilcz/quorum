import { z } from "zod";
import {
  DateSchema,
  HttpsUrlSchema,
  MeetingRefSchema,
  Sha256Schema,
  openObject
} from "./common.js";

const FramePathSchema = z.string().regex(/^\/social\/[a-zA-Z0-9/_-]+\.webp$/);

const InstagramSchema = openObject({
  caption: z.string().trim().min(1).max(2200),
  hashtags: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(5).max(10),
  frames: z.array(FramePathSchema).min(3).max(6)
});

const ThreadsSchema = openObject({
  text: z.string().trim().min(1).max(500),
  hashtags: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(2),
  frames: z.array(FramePathSchema).min(3).max(6)
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
    frames: z.array(FramePathSchema).min(3).max(6)
  }),
  threads: openObject({
    text: z.string().trim().min(1).max(500),
    hashtags: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(2),
    frames: z.array(FramePathSchema).min(3).max(6)
  }),
  quoteCard: openObject({
    frame: FramePathSchema,
    sourceTurnRef: MeetingRefSchema
  }),
  provenance: openObject({
    composerVersion: z.string().trim().min(1).max(40),
    inputsHash: Sha256Schema
  }),
  altTexts: z.record(FramePathSchema, z.string().trim().min(1).max(300))
}).superRefine((pack, context) => {
  if (
    JSON.stringify(pack.instagram) !== JSON.stringify(pack.byLocale.en.instagram) ||
    JSON.stringify(pack.threads) !== JSON.stringify(pack.byLocale.en.threads)
  ) {
    context.addIssue({
      code: "custom",
      message: "legacy channel fields must mirror the English locale",
      path: ["byLocale", "en"]
    });
  }
  for (const locale of ["en", "cs"] as const) {
    const localized = pack.byLocale[locale];
    if (localized.instagram.frames.join("\n") === localized.threads.frames.join("\n")) {
      continue;
    }
    context.addIssue({
      code: "custom",
      message: `${locale} instagram and threads must reference the same render set`,
      path: ["byLocale", locale, "threads", "frames"]
    });
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
