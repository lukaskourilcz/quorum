import { z } from "zod";
import { DateSchema, MeetingRefSchema, Sha256Schema, openObject } from "./common.js";

const FramePathSchema = z.string().regex(/^\/social\/[a-zA-Z0-9/_-]+\.webp$/);

export const SocialPackSchema = openObject({
  schemaVersion: z.literal("social-pack/1"),
  date: DateSchema,
  editionRef: Sha256Schema,
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
  if (pack.instagram.frames.join("\n") !== pack.threads.frames.join("\n")) {
    context.addIssue({
      code: "custom",
      message: "instagram and threads must reference the same render set",
      path: ["threads", "frames"]
    });
  }
  const frames = new Set([
    ...pack.instagram.frames,
    ...pack.threads.frames,
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
