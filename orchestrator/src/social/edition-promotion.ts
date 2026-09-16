import { createHash } from "node:crypto";
import {
  ARTICLE_HERO_SLOT,
  CAROUSEL_BRANDS,
  MASTER_CANVAS,
  MASTER_FORMAT,
  PROMOTION_SLIDE_COUNT,
  articleSlideSlot,
  buildEditionPromotionDeck,
  recipeTemplate,
  recipeVariant,
  renderCarouselPng,
  renderCaption,
  reviewDeck,
  toRenderablePng,
  type CarouselRecipe,
  type PromotionBeat,
  type Slide
} from "@boardlessai/carousel-studio";
import type { EditionPackage } from "../contracts/edition-package.js";
import { editionCopyPack } from "../studio/social-copy-store.js";
import { mayRenderDeck, resolveDeckRender } from "../studio/render-access.js";
import { atomicWriteBuffer, atomicWriteJson, readJson } from "../state.js";
import { effectiveRecipe } from "./deck-style.js";
import {
  loadPromotionConfig,
  resolveCta,
  resolvePromotionChannel,
  type PromotionChannel,
  type PromotionConfig,
  type ResolvedCta
} from "./promotion-config.js";
import { validateSocialImage } from "./media/validate.js";

/**
 * DNESKAi's edition, cut as a repost deck with one ask on the last slide.
 *
 * ## Why this is not a queue item
 *
 * The issue asks for the repost to go out on LinkedIn. There is no LinkedIn channel in this
 * repository and none can be made here: `config/channels.json` holds exactly two, both still
 * `draft` with `enabledByHumanAt: null`; `config/network-allowlist.json` has no LinkedIn host; no
 * venture owns a LinkedIn account; and `social-distribution-2026-08a` reserves account creation,
 * OAuth, credentials and live activation to the owner. `docs/NEEDED.md` has been carrying "decide
 * whether LinkedIn is a channel this repository serves" since #542, and `state/INBOX.md` now
 * carries `CAUGHT-UP-LINKEDIN-CHANNEL` as the approval item.
 *
 * So this composes and holds, exactly the way `deck-production.ts` explains for the drafts-only
 * ventures: a record beside the deck it describes, with the caption, the alt text, the frames and
 * the hash, every approval pending, and posting marked manual-only. The publisher's queue, its
 * triple-lock and every per-venture counter are untouched. Widening `QueueItemSchema`'s channel
 * enum to hold a string the connector cannot send would buy nothing and would put an unpostable
 * item in front of `assertQueueItemPublishable`.
 *
 * ## Why the render is not automatic
 *
 * `socialChannelsEnabled` exists because composing frames no channel can consume filled
 * `site/public/social/` with megabytes of committed PNG. The same arithmetic applies here, so the
 * daily path writes only the record — five short strings, a caption and a hash, a few kilobytes —
 * and `renderEditionPromotionDeck` draws the frames when a person or the CLI asks for them. The
 * record says which of the two states it is in rather than leaving a reader to guess.
 *
 * ## Cost
 *
 * Zero. No model call anywhere in this path: the slides are the editor's own named fields, the
 * caption is the copy pack recorded at delivery, and the renderer is the deterministic studio.
 * Nothing here draws on the `budget-2026-08f` model share.
 */

const SCHEMA_VERSION = "caught-up-promotion-deck/1" as const;

export interface EditionPromotionRender {
  status: "not-rendered" | "rendered";
  /** Why the frames are or are not on disk, in the words a receipt would use. */
  reason: string;
  format: typeof MASTER_FORMAT;
  canvas: { width: number; height: number } | null;
  assetPaths: string[];
  frameHashes: string[];
}

export interface EditionPromotionRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  venture: "caught-up";
  date: string;
  slug: string;
  /** `held` — composed, waiting on a channel. `refused` — no honest deck could be built. */
  status: "held" | "refused";
  reason: string;
  channel: PromotionChannel;
  cta: ResolvedCta | null;
  slides: { kind: Slide["kind"]; text: string }[];
  /** What each middle beat carried against what the editor wrote. Null on a refusal. */
  coverage: { whyItMatters: PromotionBeat; whatChanged: PromotionBeat; briefs: PromotionBeat } | null;
  caption: string | null;
  altText: string | null;
  /** Nothing posts from here. Both fields are the statement, not a status to be advanced. */
  approvals: { owner: "pending"; posting: "manual-only" };
  recipe: CarouselRecipe | null;
  render: EditionPromotionRender;
  contentHash: string;
  createdAt: string;
}

export function promotionRecordPath(date: string, slug: string): string {
  return `ventures/caught-up/promotion/${date}-${slug}.json`;
}

/** Where the frames land when somebody asks for them, beside the Lab's other decks. */
export function promotionDeckDirectory(date: string, slug: string): string {
  return `ventures/carousel-studio/decks/caught-up/${date}-${slug}-promotion`;
}

function contentHashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Every slide described, which is what an image post owes a reader who cannot see it. */
function altTextFor(slides: readonly Slide[]): string {
  return slides
    .map((slide, index) => `Slide ${index + 1}: ${slide.text}`)
    .join(" ")
    .slice(0, 1_000);
}

export interface BuildEditionPromotionInput {
  editionPackage: EditionPackage;
  /** The edition's own public URL. The fallback ask points here, and the caption always does. */
  editionUrl: string;
  config: PromotionConfig;
  channel: PromotionChannel;
  recipe?: CarouselRecipe;
  now: Date;
}

/**
 * Compose the record. Pure: no disk, no clock beyond the caller's `now`, no network.
 *
 * A `no_edition` day returns null — there is nothing to repost and the reason is already recorded
 * upstream. A day whose edition cannot fill five honest slides returns a `refused` record, because
 * "today produced no deck, and here is why" is worth more than silence.
 */
export function buildEditionPromotion(input: BuildEditionPromotionInput): EditionPromotionRecord | null {
  const { editionPackage } = input;
  if (editionPackage.status !== "edition") return null;
  const article = editionPackage.article.cs.frontmatter;
  const base = {
    schemaVersion: SCHEMA_VERSION,
    id: `caught-up-${editionPackage.date}-${article.slug}-promotion`,
    venture: "caught-up" as const,
    date: editionPackage.date,
    slug: article.slug,
    channel: input.channel,
    approvals: { owner: "pending" as const, posting: "manual-only" as const },
    recipe: input.recipe ?? null,
    createdAt: input.now.toISOString()
  };
  const refused = (reason: string): EditionPromotionRecord => ({
    ...base,
    status: "refused",
    reason,
    cta: null,
    slides: [],
    coverage: null,
    caption: null,
    altText: null,
    render: notRendered("The deck was refused, so there was nothing to draw."),
    contentHash: contentHashOf({ id: base.id, refused: reason })
  });

  const cta = resolveCta(input.config, input.editionUrl);
  const deck = buildEditionPromotionDeck({
    title: article.title,
    coverLine: article.alternative_headlines?.[0],
    whyItMatters: article.why_it_matters,
    whatChanged: article.what_changed,
    briefTitles: (article.dispatches ?? []).map((dispatch) => dispatch.title),
    cta: cta.slideText
  });
  if (!deck.built) return refused(deck.reason);

  // The studio's own review, rather than trusting the builder that made the deck.
  const review = reviewDeck(deck.slides);
  if (!review.publishable) return refused(`The deck did not pass its own review: ${review.problems.join("; ")}`);
  if (deck.slides.length !== PROMOTION_SLIDE_COUNT) {
    return refused(`A promotion deck is ${PROMOTION_SLIDE_COUNT} slides; this one has ${deck.slides.length}.`);
  }

  const copy = editionCopyPack(editionPackage);
  if (!copy) return refused("The edition carries no copy pack to caption the deck with.");
  // `renderCaption` appends the photograph's licence credit, and refuses a caption that would
  // reach a feed without one. Code appends it, never a model.
  const caption = [
    renderCaption(copy.copy.igCaption, copy.heroCredit),
    `${cta.line}: ${cta.destination}`,
    copy.copy.hashtags.map((tag) => `#${tag}`).join(" ")
  ].join("\n\n");

  const slides = deck.slides.map((slide) => ({ kind: slide.kind, text: slide.text }));
  const altText = altTextFor(deck.slides);
  return {
    ...base,
    status: "held",
    reason: input.channel.reason,
    cta,
    slides,
    coverage: deck.beats,
    caption,
    altText,
    render: notRendered("Composed only. The frames are drawn on request while the channel is held."),
    contentHash: contentHashOf({ id: base.id, slides, caption, altText, cta })
  };
}

function notRendered(reason: string): EditionPromotionRender {
  return { status: "not-rendered", reason, format: MASTER_FORMAT, canvas: null, assetPaths: [], frameHashes: [] };
}

export interface StoreEditionPromotionInput {
  stateRoot: string;
  configRoot: string;
  editionPackage: EditionPackage;
  editionUrl: string;
  now?: Date;
  /**
   * Draw the frames as well as the record.
   *
   * Off in the daily path while the channel is held, and unnecessary then: the CLI draws them on
   * request. An open channel renders without being asked, because at that point the frames are
   * what the channel consumes rather than inventory nobody can use.
   */
  render?: boolean;
}

export interface StoredEditionPromotion {
  path: string;
  record: EditionPromotionRecord;
}

/**
 * Compose one edition's promotion deck and write it down.
 *
 * Returns null for a `no_edition` day and for a day this cannot address — a promotion record whose
 * destination does not parse would carry a URL nobody can open, and the edition itself is unharmed
 * either way.
 */
export async function storeEditionPromotion(
  input: StoreEditionPromotionInput
): Promise<StoredEditionPromotion | null> {
  if (input.editionPackage.status !== "edition") return null;
  const now = input.now ?? new Date();
  const config = await loadPromotionConfig(input.configRoot);
  const channel = await resolvePromotionChannel(input.configRoot, config.channelId);
  const article = input.editionPackage.article.cs.frontmatter;
  const recipe = await effectiveRecipe({
    root: input.stateRoot,
    venture: "caught-up",
    slug: article.slug,
    date: input.editionPackage.date,
    hasHero: Boolean(input.editionPackage.image?.hero_bytes_base64)
  });
  let record: EditionPromotionRecord | null;
  try {
    record = buildEditionPromotion({
      editionPackage: input.editionPackage,
      editionUrl: input.editionUrl,
      config,
      channel,
      recipe,
      now
    });
  } catch {
    // An unparseable destination is a configuration fault, not an edition fault.
    return null;
  }
  if (!record) return null;
  if ((input.render || channel.status === "open") && record.status === "held") {
    record = { ...record, render: await renderEditionPromotionDeck({ ...input, record, recipe, now }) };
  }
  const relative = promotionRecordPath(record.date, record.slug);
  await atomicWriteJson(input.stateRoot, relative, record);
  return { path: relative, record };
}

/**
 * Draw the five frames at the 4:5 master canvas and write them beside the Lab's other decks.
 *
 * The capability edge is checked first and fails closed, the same question `produceDeck` asks:
 * `caught-up → design-lab → bounded-render-summary` is registered and allowed, and an unregistered
 * venture renders nothing rather than rendering and being refused downstream. Every failure is
 * reported as a not-rendered reason, because a promotion deck that could not be drawn must never
 * cost the edition its record.
 */
export async function renderEditionPromotionDeck(input: {
  stateRoot: string;
  configRoot?: string;
  editionPackage: EditionPackage;
  record: EditionPromotionRecord;
  recipe: CarouselRecipe;
  now?: Date;
}): Promise<EditionPromotionRender> {
  const { record } = input;
  if (record.status !== "held" || record.slides.length === 0) {
    return notRendered("There is no composed deck to draw.");
  }
  const resolution = await resolveDeckRender(
    "caught-up",
    input.configRoot === undefined ? {} : { configRoot: input.configRoot }
  );
  if (!mayRenderDeck(resolution)) {
    return notRendered(`Design Lab may not render caught-up: ${resolution.decision}.`);
  }
  const hero = input.editionPackage.status === "edition" && input.editionPackage.image?.hero_bytes_base64
    // Heroes are stored as WebP and librsvg draws nothing at all for a WebP data URI.
    ? await toRenderablePng(Buffer.from(input.editionPackage.image.hero_bytes_base64, "base64"))
    : null;
  const template = recipeTemplate(input.recipe, record.slides.length);
  const variant = recipeVariant(input.recipe);
  const rendered = await renderCarouselPng({
    template,
    payload: {
      locale: "cs",
      strings: Object.fromEntries(record.slides.map((slide, index) => [articleSlideSlot(index), slide.text])),
      ...(variant ? { variant } : {})
    },
    brand: CAROUSEL_BRANDS["caught-up"],
    format: MASTER_FORMAT,
    ...(hero ? { images: { [ARTICLE_HERO_SLOT]: hero } } : {})
  });
  const directory = promotionDeckDirectory(record.date, record.slug);
  const assetPaths: string[] = [];
  const frameHashes: string[] = [];
  for (const [index, frame] of rendered.entries()) {
    // 4:5 is the frame the issue asks for and the canvas the studio calls master. Checked on the
    // bytes rather than assumed from the template that produced them.
    const measured = await validateSocialImage(frame.png);
    if (measured.width !== MASTER_CANVAS.width || measured.height !== MASTER_CANVAS.height) {
      return notRendered(`Frame ${index + 1} rendered at ${measured.width}x${measured.height}, not the 4:5 master canvas.`);
    }
    const relative = `${directory}/${articleSlideSlot(index)}.png`;
    await atomicWriteBuffer(input.stateRoot, relative, frame.png);
    assetPaths.push(relative);
    frameHashes.push(frame.pngHash);
  }
  return {
    status: "rendered",
    reason: `Rendered at ${MASTER_CANVAS.width}x${MASTER_CANVAS.height}. Posting stays manual while the channel is held.`,
    format: MASTER_FORMAT,
    canvas: { width: MASTER_CANVAS.width, height: MASTER_CANVAS.height },
    assetPaths,
    frameHashes
  };
}

/** Whether this exact deck has already been composed, by the hash the record carries. */
export async function promotionAlreadyComposed(
  stateRoot: string,
  date: string,
  slug: string
): Promise<boolean> {
  const existing = await readJson<{ contentHash?: unknown } | null>(stateRoot, promotionRecordPath(date, slug), null);
  return typeof existing?.contentHash === "string";
}
