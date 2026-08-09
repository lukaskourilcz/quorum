import { createHash } from "node:crypto";
import path from "node:path";
import {
  ARTICLE_HERO_SLOT,
  CAROUSEL_BRANDS,
  renderCarouselPng,
  toRenderablePng,
  type TemplateReference
} from "@boardlessai/carousel-studio";
import { articleSlideSlot, recipeTemplateId, recipeVariant } from "@boardlessai/carousel-studio";
import { resolveLiveCarouselTemplate } from "../studio/catalog.js";
import { writeDeckReceipt } from "./deck-receipt.js";
import { effectiveRecipe } from "./deck-style.js";
import { buildArticleDeck, reviewDeck } from "@boardlessai/carousel-studio";
import type { EditionPackage } from "../contracts/edition-package.js";
import type { MeetingRecord } from "../contracts/meeting-record.js";
import { SocialPackSchema, type SocialPack } from "../contracts/social-pack.js";
import { parseSafeHttpsUrl } from "../security/url.js";
import { atomicWriteBuffer, atomicWriteJson, atomicWriteText, readText } from "../state.js";
import { validateSocialImage } from "./media/validate.js";
import { QueueItemSchema, queuePayloadHash, type QueueItem } from "./queue.js";
import { assignPackHook, channelRecordFor } from "../studio/hook-brain.js";
import { recordPost, writeHookChannels } from "../studio/hook-channels.js";

const COMPOSER_VERSION = "carousel-studio-1" as const;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function deterministicVariant(value: string): "A" | "B" {
  return Number.parseInt(sha256(value).slice(0, 2), 16) % 2 === 0 ? "A" : "B";
}

type SocialLocale = "en" | "cs";

function hashtags(tags: readonly string[], locale: SocialLocale): string[] {
  const normalized = tags
    .map((tag) => tag.normalize("NFKC").toLowerCase().replaceAll(/[^a-z0-9_]+/g, ""))
    .filter(Boolean);
  const defaults = locale === "cs"
    ? ["ai", "umelainteligence", "technologie", "aitech", "caughtup"]
    : ["ai", "artificialintelligence", "aitech", "technews", "caughtup"];
  return [...new Set([...normalized, ...defaults])].slice(0, 10);
}

function boundedCopy(body: string, suffix: string, maximum: number): string {
  const complete = `${body}${suffix}`;
  if (complete.length <= maximum) return complete;
  const room = maximum - suffix.length - 1;
  if (room < 40) throw new Error("Social destination and required labels exceed the copy limit");
  const candidate = body.slice(0, room).trimEnd();
  const sentenceBoundary = candidate.lastIndexOf(". ");
  const wordBoundary = candidate.lastIndexOf(" ");
  const boundary = sentenceBoundary >= Math.floor(room * 0.6)
    ? sentenceBoundary + 1
    : wordBoundary;
  const clipped = candidate.slice(0, Math.max(1, boundary)).trimEnd();
  return `${clipped}…${suffix}`;
}

function queueAltText(pack: SocialPack, locale: SocialLocale, channel: "instagram" | "threads"): string {
  const frames = pack.byLocale[locale]![channel].frames;
  // A Threads item carries no frames at all, so it has nothing to describe. The schema still
  // wants a sentence; the honest one says the post is words.
  if (frames.length === 0) {
    return locale === "cs" ? "Textový příspěvek bez obrázku." : "A text post with no image.";
  }
  return frames
    .map((frame, index) => `Frame ${index + 1}: ${pack.altTexts[frame]}`)
    .join(" ")
    .slice(0, 1_000);
}

function queueItem(input: {
  pack: SocialPack;
  locale: SocialLocale;
  channel: "instagram" | "threads";
  destination: string;
  evidenceRefs: string[];
  now: Date;
}): QueueItem {
  const notBefore = input.now.toISOString();
  const notAfter = new Date(input.now.getTime() + 72 * 60 * 60 * 1_000).toISOString();
  const localized = input.pack.byLocale[input.locale]!;
  const platform = localized[input.channel];
  const id = `caught-up-${input.pack.date}-${input.locale}-${input.channel}`;
  const variant = deterministicVariant(id);
  const base = {
    schemaVersion: 1 as const,
    id,
    venture: "caught-up" as const,
    locale: input.locale,
    variant,
    campaignId: `caught-up-${input.pack.date}-${input.locale}`,
    experimentId: null,
    channel: input.channel,
    objective: "trust" as const,
    audience: `Caught Up readers (${input.locale})`,
    destination: input.destination,
    utm: {
      source: input.channel,
      medium: "organic_social" as const,
      campaign: `caught-up-${input.pack.date}-${input.locale}`,
      content: `edition-carousel-${input.locale}`
    },
    content: {
      text: input.channel === "instagram" ? localized.instagram.variants[variant] : localized.threads.variants[variant],
      altText: queueAltText(input.pack, input.locale, input.channel),
      // Threads carries text and a link; the guarded connector is text-only and
      // assertQueueItemPublishable rejects a Threads item with any asset, throwing the whole
      // publisher run out rather than skipping the one item. Frames belong to the carousel,
      // which is Instagram's.
      assetPaths: input.channel === "threads" ? [] : platform.frames,
      factualClaimRefs: input.evidenceRefs,
      rendererVersion: COMPOSER_VERSION,
      contentHash: "0".repeat(64)
    },
    publishWindow: { notBefore, notAfter },
    status: "draft" as const,
    checks: {
      schema: "pass" as const,
      brand: "pass" as const,
      claims: "pass" as const,
      quill: "pass" as const,
      keeper: "pass" as const,
      duplicate: "pass" as const,
      accessibility: "pass" as const,
      budget: "pass" as const
    },
    selectedBy: "PULSE" as const,
    createdAt: input.now.toISOString(),
    attempt: null,
    receiptId: null
  };
  return QueueItemSchema.parse({
    ...base,
    content: { ...base.content, contentHash: queuePayloadHash(base) }
  });
}

export interface SocialPackComposition {
  pack: SocialPack;
  /** One per published locale and channel. Two while the desk publishes one language. */
  queueItems: QueueItem[];
  artifactPaths: string[];
}

export async function composeEditionSocialPack(input: {
  editionPackage: EditionPackage;
  meeting: MeetingRecord;
  /** Czech is what the desk publishes. English destinations are no longer produced. */
  destinations: { en?: string; cs: string };
  repoRoot: string;
  stateRoot: string;
  now?: Date;
}): Promise<SocialPackComposition | null> {
  const editionPackage = input.editionPackage;
  if (editionPackage.status !== "edition") return null;
  if (input.meeting.kind !== "cu-edition" || input.meeting.date !== input.editionPackage.date) {
    throw new Error("Social pack requires the matching Caught Up edition meeting");
  }
  const destinations = {
    ...(input.destinations.en ? { en: parseSafeHttpsUrl(input.destinations.en).toString() } : {}),
    cs: parseSafeHttpsUrl(input.destinations.cs).toString()
  };
  const bestTurnIndex = input.meeting.roomTranscript.turns.findIndex((turn) => turn.agent === "STET") >= 0
    ? input.meeting.roomTranscript.turns.findIndex((turn) => turn.agent === "STET")
    : Math.max(0, input.meeting.roomTranscript.turns.findIndex((turn) => turn.mode === "raises-concern"));
  const bestTurn = input.meeting.roomTranscript.turns[bestTurnIndex] ?? input.meeting.roomTranscript.turns[0]!;
  /**
   * The carousel is the edition, split.
   *
   * It was five slides carrying one point each from what_changed, why_it_matters and
   * uncertainty — the first of each, and the rest of the editor's argument dropped. The deck
   * takes up to three of each, so the reader gets the reasoning rather than a sample of it.
   *
   * Never the body. An eleven-hundred-word edition would be thirty-seven slides, and the
   * frontmatter arrays are already the editor's own summary of the same text.
   */
  // The recorded recipe: family, variant, treatment, type scale and rhythm rotation, derived from
  // the edition's own identity and the venture's recent receipts, so a replay renders the bytes it
  // rendered the first time.
  const recipe = await effectiveRecipe({
    root: input.stateRoot,
    venture: "caught-up",
    slug: (editionPackage.article?.cs ?? editionPackage.article?.en)?.frontmatter.slug ?? editionPackage.date,
    date: editionPackage.date,
    hasHero: Boolean(editionPackage.image?.hero_bytes_base64)
  });
  const visualReference = (locale: SocialLocale): TemplateReference | null => {
    const article = editionPackage.article?.[locale]?.frontmatter;
    if (!article) return null;
    const slides = buildArticleDeck({
      title: article.title,
      coverLine: article.alternative_headlines?.[0],
      dek: article.dek,
      points: [
        ...article.what_changed.slice(0, 3),
        ...article.why_it_matters.slice(0, 3),
        ...article.uncertainty.slice(0, 1)
      ],
      outro: locale === "cs" ? "Jedno vydání a máte přehled." : "One edition and you are caught up."
    });
    if (!reviewDeck(slides).publishable) return null;
    return {
      template_id: recipeTemplateId(recipe, slides.length),
      version: "1.0.0",
      content: {
        locale,
        // The recipe's own rendering, so the queued frames are the design that was recorded
        // rather than whichever one the renderer defaults to.
        ...(recipeVariant(recipe) ? { variant: recipeVariant(recipe)! } : {}),
        strings: Object.fromEntries(slides.map((slide, index) => [articleSlideSlot(index), slide.text]))
      }
    };
  };
  // Only the locales the edition carries. Building both unconditionally read article.en on a
  // Czech-only package and threw "Cannot read properties of undefined"; cycle.ts catches that
  // and recordSocialPackFailure dedupes on a marker, so the composer went silently dark and
  // only the first day ever reached the inbox.
  const visualRefs: Partial<Record<SocialLocale, TemplateReference>> = Object.fromEntries(
    (["en", "cs"] as const)
      .map((locale) => [locale, visualReference(locale)] as const)
      .filter((entry): entry is readonly [SocialLocale, TemplateReference] => entry[1] !== null)
  );
  // An edition too thin for a deck gets no social pack. The edition itself still ships.
  if (!visualRefs.cs && !visualRefs.en) {
    console.warn(JSON.stringify({ event: "carousel_skipped", date: editionPackage.date, reason: "deck below the five-slide minimum" }));
    return null;
  }
  const quoteVisual: TemplateReference = {
    template_id: "quote-card",
    version: "1.0.0",
    content: {
      locale: "en",
      strings: { quote: bestTurn.text, attribution: `${bestTurn.agent} · ${input.editionPackage.date}` }
    }
  };
  const inputHash = sha256(JSON.stringify({
    composerVersion: COMPOSER_VERSION,
    editionRef: input.editionPackage.idempotencyKey,
    meetingRef: input.editionPackage.board.meetingRef,
    destinations,
    visualRefs,
    quote: { agent: bestTurn.agent, text: bestTurn.text }
  }));
  const relativeDirectory = `site/public/social/${input.editionPackage.date}`;
  // The templates reserve a hero slot with a scrim over it and the admin preview has always
  // filled it; the production render passed no images at all, so every shipped cover was type
  // on a flat panel. Heroes are stored as WebP and librsvg draws nothing for a WebP data URI,
  // which is what `toRenderablePng` exists to fix.
  const heroBytes = editionPackage.image?.hero_bytes_base64
    ? await toRenderablePng(Buffer.from(editionPackage.image.hero_bytes_base64, "base64"))
    : null;
  const publicDirectory = `/social/${input.editionPackage.date}`;
  const framePaths: Partial<Record<SocialLocale, Record<"instagram" | "threads", string[]>>> = {};
  const frameHashes: Record<string, string> = {};
  const altTexts: Record<string, string> = {};
  for (const locale of ["en", "cs"] as const) {
    const reference = visualRefs[locale];
    if (!reference) continue;
    framePaths[locale] = { instagram: [], threads: [] };
    const template = resolveLiveCarouselTemplate(reference.template_id, reference.version);
    /*
     * Instagram only.
     *
     * The Threads frames were rendered, hashed, written into `site/public/social` and then
     * discarded: the queue item forces `assetPaths: []` because the guarded connector is
     * text-only and `assertQueueItemPublishable` throws the whole publisher run out over a
     * Threads item carrying an asset. So every edition rasterised a second full deck nothing
     * could ever send, and committed it. Not rendering it is both cheaper and more honest about
     * what the channel is; the Lab still renders a Threads cover on request for manual use.
     */
    for (const channel of ["instagram"] as const) {
      const format = "instagram-portrait" as const;
      const rendered = await renderCarouselPng({
        template,
        payload: reference.content,
        brand: CAROUSEL_BRANDS["caught-up"],
        format,
        ...(heroBytes ? { images: { [ARTICLE_HERO_SLOT]: heroBytes } } : {})
      });
      for (const slide of rendered) {
        const name = `frame-${String(slide.index + 1).padStart(2, "0")}.png`;
        const publicPath = `${publicDirectory}/${locale}/${channel}/${name}`;
        const validation = await validateSocialImage(slide.png);
        const expected = template.formats[format];
        if (validation.width !== expected.width || validation.height !== expected.height) {
          throw new Error(`Social frame ${publicPath} has the wrong canvas`);
        }
        await atomicWriteBuffer(input.repoRoot, `${relativeDirectory}/${locale}/${channel}/${name}`, slide.png);
        framePaths[locale][channel].push(publicPath);
        frameHashes[publicPath] = slide.pngHash;
        const slots = Object.values(reference.content.strings);
        altTexts[publicPath] = `${locale === "cs" ? "Slide" : "Slide"} ${slide.index + 1}: ${slots[Math.min(slide.index, slots.length - 1)]}`.slice(0, 300);
      }
    }
  }
  const quotePath = `${publicDirectory}/quote.png`;
  const [quote] = await renderCarouselPng({
    template: resolveLiveCarouselTemplate(quoteVisual.template_id, quoteVisual.version),
    payload: quoteVisual.content,
    brand: CAROUSEL_BRANDS["caught-up"],
    format: "instagram-portrait"
  });
  const quoteBytes = quote!.png;
  const quoteValidation = await validateSocialImage(quoteBytes);
  if (quoteValidation.width !== 1080 || quoteValidation.height !== 1350) {
    throw new Error("Social quote card must be 1080x1350");
  }
  await atomicWriteBuffer(input.repoRoot, `${relativeDirectory}/quote.png`, quoteBytes);
  frameHashes[quotePath] = quote!.pngHash;
  altTexts[quotePath] = `Quote from ${bestTurn.agent} in the edition room: ${bestTurn.text}`.slice(0, 300);

  const buildLocalePack = (locale: SocialLocale) => {
      const localized = editionPackage.article?.[locale];
      const frames = framePaths[locale];
      const visual = visualRefs[locale];
      if (!localized || !frames || !visual) {
        throw new Error(`social pack: the edition has no ${locale} locale to compose from`);
      }
      const article = localized.frontmatter;
      const tagList = hashtags(article.tags, locale);
      const readLabel = locale === "cs" ? "Celý článek" : "Read the edition";
      const openLabel = locale === "cs" ? "Otevřené zůstává" : "Still open";
      const instagramBody = `${article.title}\n\n${article.dek}\n\n${article.what_changed[0]}\n\n${article.why_it_matters[0]}\n\n${openLabel}: ${article.uncertainty[0]}`;
      const instagramSuffix = `\n\n${readLabel}: ${destinations[locale]}\n\n${tagList.map((tag) => `#${tag}`).join(" ")}`;
      const threadsBody = `${article.title}\n\n${article.why_it_matters[0]}\n\n${openLabel}: ${article.uncertainty[0]}`;
      const threadsSuffix = `\n\n${destinations[locale]}`;
      const instagramA = boundedCopy(instagramBody, instagramSuffix, 2_200);
      const instagramBBody = `${article.what_changed[0]}\n\n${article.title}\n\n${article.dek}\n\n${openLabel}: ${article.uncertainty[0]}`;
      const threadsA = boundedCopy(threadsBody, threadsSuffix, 500);
      const threadsBBody = `${article.what_changed[0]}\n\n${article.why_it_matters[0]}\n\n${openLabel}: ${article.uncertainty[0]}`;
      return {
        destination: destinations[locale],
        instagram: {
          caption: instagramA,
          variants: { A: instagramA, B: boundedCopy(instagramBBody, instagramSuffix, 2_200) },
          hashtags: tagList,
          frames: frames.instagram,
          visual
        },
        threads: {
          text: threadsA,
          variants: { A: threadsA, B: boundedCopy(threadsBBody, threadsSuffix, 500) },
          hashtags: [],
          frames: frames.threads,
          visual
        }
      };
  };
  const localePacks = {
    ...(destinations.en ? { en: buildLocalePack("en") } : {}),
    cs: buildLocalePack("cs")
  };
  const pack = SocialPackSchema.parse({
    schemaVersion: "social-pack/1",
    date: input.editionPackage.date,
    editionRef: input.editionPackage.idempotencyKey,
    byLocale: localePacks,
    // The legacy top-level fields mirror the locale the pack leads with — English while it
    // existed, Czech now. Filling an `en` mirror with Czech was the alternative and is not
    // something this codebase does.
    instagram: (localePacks.en ?? localePacks.cs).instagram,
    threads: (localePacks.en ?? localePacks.cs).threads,
    quoteCard: {
      frame: quotePath,
      sourceTurnRef: `${input.editionPackage.board.meetingRef}#turn-${bestTurnIndex + 1}`,
      visual: quoteVisual
    },
    provenance: { composerVersion: COMPOSER_VERSION, inputsHash: inputHash },
    altTexts
  });
  const evidenceRefs = editionPackage.article.cs.frontmatter.sources
    .map((source) => `source:${source.source_id ?? source.id}`);
  const now = input.now ?? new Date();
  // A queue item carries its destination all the way to the platform and cannot be edited
  // after it publishes. Items are built only for locales that have a destination, so nothing
  // in the queue can outlive the route it points at.
  const queued = (["en", "cs"] as const).flatMap((locale) => {
    const destination = destinations[locale];
    if (!destination) return [];
    return (["instagram", "threads"] as const).map((channel) => ({
      locale,
      channel,
      item: queueItem({ pack, locale, channel, destination, evidenceRefs, now })
    }));
  });
  const csVisual = visualRefs.cs ?? visualRefs.en!;
  // DNESKAi's hook library is not written yet, so every edition takes the `no-hook` fallback and
  // the deck's own cover headline renders. Running it through the brain from day one rather than
  // wiring it later is the point: the fallback is logged and countable now, so the KPI can read a
  // real number instead of an absence, and authoring news.hooks.json changes a data file rather
  // than this code path. See docs/hooks/05-surfaces.md.
  const newsFrontmatter = (editionPackage.article?.cs ?? editionPackage.article?.en)!.frontmatter;
  const hookDecision = await assignPackHook({
    stateRoot: input.stateRoot,
    surface: "news",
    channel: "caught-up-carousel",
    date: input.editionPackage.date,
    itemId: newsFrontmatter.slug,
    vertical: "dev",
    languages: ["cs"],
    subject: {
      subject: {
        sourceCount: newsFrontmatter.sources.length,
        primarySourceCount: newsFrontmatter.sources.filter((source) => source.classification === "primary").length,
        // Optional in the schema and unscored on some items. Null fails a threshold gate rather
        // than defaulting past it: a weight claim on an item nobody scored licenses nothing.
        signalStrength: newsFrontmatter.signal_strength ?? null,
        tags: newsFrontmatter.tags,
        // Read from the title and what_changed, which is where a figure the hook could point at
        // would actually appear. A digit inside a slug or a URL is not a figure in the story.
        hasNumber: /\d/u.test([newsFrontmatter.title, ...newsFrontmatter.what_changed].join(" "))
      }
    }
  });
  const hookChannelsPath = await writeHookChannels(
    input.stateRoot,
    recordPost(hookDecision.channels, hookDecision.assignment.channel, channelRecordFor(hookDecision.assignment, hookDecision.hook))
  );

  const deckReceipt = await writeDeckReceipt({
    root: input.stateRoot,
    venture: "caught-up",
    date: input.editionPackage.date,
    slug: (editionPackage.article?.cs ?? editionPackage.article?.en)!.frontmatter.slug,
    templateId: csVisual.template_id,
    style: recipe.family,
    recipe,
    slideCount: Object.keys(csVisual.content.strings).length,
    hashes: Object.values(frameHashes)
  });
  await Promise.all([
    atomicWriteJson(input.stateRoot, `social/packs/${input.editionPackage.date}.json`, pack),
    atomicWriteJson(input.stateRoot, `social/assets/${input.editionPackage.date}.json`, {
      schemaVersion: 1,
      composerVersion: COMPOSER_VERSION,
      inputsHash: inputHash,
      frameHashes,
      formats: ["instagram-portrait", "threads"],
      format: "png"
    }),
    ...queued.map(({ locale, channel, item }) =>
      atomicWriteJson(input.stateRoot, `social/queue/${input.editionPackage.date}-${locale}-${channel}.json`, item))
  ]);
  return {
    pack,
    queueItems: queued.map(({ item }) => item),
    artifactPaths: [
      `social/packs/${input.editionPackage.date}.json`,
      `social/assets/${input.editionPackage.date}.json`,
      deckReceipt,
      hookChannelsPath,
      ...queued.map(({ locale, channel }) => `social/queue/${input.editionPackage.date}-${locale}-${channel}.json`),
      ...Object.values(framePaths).flatMap((channels) => Object.values(channels).flat()).map((frame) => path.relative(input.stateRoot, path.join(input.repoRoot, "site", "public", frame.slice(1)))),
      path.relative(input.stateRoot, path.join(input.repoRoot, "site", "public", quotePath.slice(1)))
    ]
  };
}

export async function recordMissingSocialPackConfiguration(stateRoot: string): Promise<void> {
  const marker = "CAUGHT-UP-SOCIAL-DOMAIN";
  const existing = await readText(stateRoot, "INBOX.md", "# Human approval queue\n\n## Pending\n\nNone.\n\n## Resolved\n");
  if (existing.includes(marker)) return;
  const item = `- [ ] INBOX ${marker} — Set CAUGHT_UP_SITE_URL before the live edition cycle can compose evidence-linked social drafts. SOCIAL_KILL_SWITCH remains true.`;
  const next = existing.includes("## Pending\n\nNone.")
    ? existing.replace("## Pending\n\nNone.", `## Pending\n\n${item}`)
    : existing.replace("## Resolved", `${item}\n\n## Resolved`);
  await atomicWriteText(stateRoot, "INBOX.md", next);
}

export async function recordSocialPackFailure(stateRoot: string, detail: string): Promise<void> {
  const marker = "CAUGHT-UP-SOCIAL-COMPOSER";
  const existing = await readText(stateRoot, "INBOX.md", "# Human approval queue\n\n## Pending\n\nNone.\n\n## Resolved\n");
  if (existing.includes(marker)) return;
  const safeDetail = detail.replaceAll(/\s+/g, " ").slice(0, 240);
  const item = `- [ ] INBOX ${marker} — Social draft composition failed after the edition meeting: ${safeDetail}. The edition remains valid; no social item was queued.`;
  const next = existing.includes("## Pending\n\nNone.")
    ? existing.replace("## Pending\n\nNone.", `## Pending\n\n${item}`)
    : existing.replace("## Resolved", `${item}\n\n## Resolved`);
  await atomicWriteText(stateRoot, "INBOX.md", next);
}
