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

// A pack records the original render manifest for evidence and frame count. Admin review renders
// from `visual` on demand, so these are never served as public `/social` URLs after delivery.
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
  /*
   * None, and that is the point.
   *
   * The guarded Threads connector is text-only and `assertQueueItemPublishable` throws the whole
   * publisher run out over a Threads item carrying an asset, so the composer forced
   * `assetPaths: []` while still rendering, hashing, writing and committing a second full deck
   * for the channel. A minimum of one frame here was the contract insisting on an artifact
   * nothing could ever send. The Lab still renders a Threads cover on request for manual use;
   * the pack no longer pretends the channel takes one.
   */
  frames: z.array(FramePathSchema).max(10),
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
    en: LocalePackSchema.optional(),
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
    frames: z.array(FramePathSchema).max(10),
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
  // The legacy top-level fields mirror the locale the pack actually leads with — English
  // while it exists, Czech once it does not. The alternative on offer was to keep an `en`
  // mirror and fill it with Czech text, which would publish Czech copy under an English key.
  const lead = pack.byLocale.en ?? pack.byLocale.cs;
  if (
    !isDeepStrictEqual(pack.instagram, lead.instagram) ||
    !isDeepStrictEqual(pack.threads, lead.threads)
  ) {
    context.addIssue({
      code: "custom",
      message: "legacy channel fields must mirror the leading locale",
      path: ["byLocale", pack.byLocale.en ? "en" : "cs"]
    });
  }
  const localePacks = (["en", "cs"] as const)
    .map((locale) => ({ locale, value: pack.byLocale[locale] }))
    .filter((entry): entry is { locale: "en" | "cs"; value: NonNullable<typeof entry.value> } => entry.value !== undefined);
  for (const { locale, value } of localePacks) {
    if (value.instagram.caption !== value.instagram.variants.A) {
      context.addIssue({ code: "custom", message: `${locale} Instagram caption must mirror variant A`, path: ["byLocale", locale, "instagram", "caption"] });
    }
    if (value.threads.text !== value.threads.variants.A) {
      context.addIssue({ code: "custom", message: `${locale} Threads text must mirror variant A`, path: ["byLocale", locale, "threads", "text"] });
    }
  }
  const frames = new Set([
    ...localePacks.flatMap(({ value }) => [...value.instagram.frames, ...value.threads.frames]),
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
