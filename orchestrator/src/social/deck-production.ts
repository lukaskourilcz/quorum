import {
  ARTICLE_HERO_SLOT,
  CAROUSEL_BRANDS,
  articleSlideSlot,
  buildArticleDeck,
  encodeRecipe,
  recipeTemplate,
  recipeVariant,
  reviewDeck,
  type CarouselSummary,
  type CarouselSummaryVenture
} from "@boardlessai/carousel-studio";
import { renderCarouselPng } from "@boardlessai/carousel-studio";
import { mayRenderDeck, resolveDeckRender } from "../studio/render-access.js";
import { effectiveRecipe } from "./deck-style.js";
import { writeDeckReceipt } from "./deck-receipt.js";
import { createHash } from "node:crypto";
import { atomicWriteBuffer, atomicWriteJson, readJson } from "../state.js";
import { recipePath } from "../studio/carousel-summary-store.js";

/**
 * A rendered deck, written down.
 *
 * Every launch venture already records a bounded summary when it delivers or approves something,
 * and the Design Lab already draws one on request. Between those two there was nothing: the deck
 * routes render on demand and write nothing, so there were no bytes to hash, nothing to queue, and
 * nothing to review away from the browser. Kvórum's approval sets `designLab.status: "queued"` and
 * no code has ever moved it off that value, because there was no consumer for the queue.
 *
 * This is the consumer. It takes the summary the venture already recorded, renders it through the
 * same deterministic studio the Lab uses, writes the frames and a receipt beside them, and leaves
 * one draft queue item. It costs nothing — no model call anywhere in this path — and it cannot
 * post: every item is written `status: "draft"` with every approval pending, exactly as
 * marketingShark's have always been.
 *
 * The capability edge is checked first and the whole thing fails closed. `bounded-render-summary`
 * was registered for the five launch ventures precisely so this could run; an unregistered venture
 * is refused here and writes nothing at all, rather than rendering and being refused later.
 */

/** How many frames a queue item may carry, which is the platform's own carousel limit. */
const MAX_SLIDES = 10;

export interface DeckRefusal {
  produced: false;
  /** Why nothing was rendered, in the words a receipt would use. */
  reason: string;
}

export interface DeckProduction {
  produced: true;
  venture: CarouselSummaryVenture;
  date: string;
  slug: string;
  /** Everything written, state-relative, in the order a reader would want it. */
  artifactRefs: string[];
  recipeRef: string;
  receiptRef: string;
  queueRef: string;
  /** The hash the queue item carries, which is what re-running is idempotent on. */
  contentHash: string;
  slideCount: number;
}

function deckDirectory(summary: Pick<CarouselSummary, "venture" | "date" | "slug">): string {
  return `ventures/carousel-studio/decks/${summary.venture}/${summary.date}-${summary.slug}`;
}

/**
 * The caption a manual poster reads, built from the summary and nothing else.
 *
 * No handles, no hashtags invented here and no call to action: the drafts-only ventures post by
 * hand, and what they need is the words the desk already wrote plus the sources it cited. A
 * caption that added anything would be copy this pipeline is not licensed to write.
 */
function captionFor(summary: CarouselSummary): string {
  const sources = summary.sources.map((source) => source.label).filter(Boolean);
  return [
    summary.headline,
    "",
    summary.standfirst,
    ...(sources.length > 0 ? ["", `Zdroje: ${sources.join(" · ")}`] : [])
  ].join("\n").trim();
}

/**
 * The owner-facing record of a rendered deck, and why it is not a social queue item.
 *
 * The issue asked for a draft in `state/social/queue/`, and neither shape there can hold this.
 * The capability-aware v2 item requires a `connectionBindingRef` naming a live social connection,
 * and the whole point of these ventures is that they have none — minting `social-connection-kvorum`
 * to satisfy a schema would be inventing the binding the decision withheld. The legacy v1 item has
 * a closed venture enum, and widening it is worse than it looks: `auditSocialDistributionMigration`
 * walks every file in that directory and calls `migrateLegacyQueueItem`, which throws for a venture
 * with no explicit mapping — so one Kvórum draft would fail the release audit.
 *
 * So the record lives beside the deck it describes. It carries what a review needs — the caption,
 * the alt text, the frames, the hash — with every approval pending and no destination at all,
 * because this path ends at a file the owner downloads. The publisher's queue, its triple-lock and
 * every per-venture counter are untouched, and a venture reaches them only by the route its own
 * decision opens.
 */
export interface DeckReviewItem {
  schemaVersion: "deck-review-item/1";
  id: string;
  venture: CarouselSummaryVenture;
  date: string;
  slug: string;
  status: "draft";
  content: {
    caption: string;
    altText: string;
    assetPaths: string[];
    sourceLabels: string[];
    contentHash: string;
  };
  /** What still has to happen before anything is posted, all of it by a person. */
  approvals: {
    owner: "pending";
    posting: "manual-only";
  };
  receiptRef: string;
  createdAt: string;
}

/** The hash the record is idempotent on: the caption, the alt text and every frame it names. */
function contentHashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deckReviewItem(input: {
  summary: CarouselSummary;
  assetPaths: string[];
  altText: string;
  receiptRef: string;
  now: Date;
}): DeckReviewItem {
  const { summary } = input;
  const content = {
    caption: captionFor(summary),
    altText: input.altText,
    assetPaths: input.assetPaths,
    sourceLabels: summary.sources.map((source) => source.label)
  };
  return {
    schemaVersion: "deck-review-item/1",
    // The deck's own address, so producing the same deck twice rewrites one record rather than
    // leaving a second for the owner to reconcile.
    id: `${summary.venture}-${summary.date}-${summary.slug}-deck`,
    venture: summary.venture,
    date: summary.date,
    slug: summary.slug,
    status: "draft",
    content: { ...content, contentHash: contentHashOf({ ...content, venture: summary.venture }) },
    approvals: { owner: "pending", posting: "manual-only" },
    receiptRef: input.receiptRef,
    createdAt: input.now.toISOString()
  };
}

export async function produceDeck(input: {
  root: string;
  summary: CarouselSummary;
  now?: Date;
  configRoot?: string;
  /** The article's own picture, when the venture is one that may carry one. */
  hero?: Buffer;
}): Promise<DeckProduction | DeckRefusal> {
  const { summary } = input;
  const now = input.now ?? new Date();

  const resolution = await resolveDeckRender(
    summary.venture,
    input.configRoot === undefined ? {} : { configRoot: input.configRoot }
  );
  if (!mayRenderDeck(resolution)) {
    return { produced: false, reason: `Design Lab may not render ${summary.venture}: ${resolution.decision}.` };
  }

  const brand = CAROUSEL_BRANDS[summary.venture as keyof typeof CAROUSEL_BRANDS];
  if (!brand) return { produced: false, reason: `${summary.venture} has no brand in the studio.` };

  const slides = buildArticleDeck({
    title: summary.headline,
    ...(summary.coverLine ? { coverLine: summary.coverLine } : {}),
    dek: summary.standfirst,
    points: [...summary.passages],
    outro: summary.closing
  }).slice(0, MAX_SLIDES);
  const review = reviewDeck(slides);
  // A deck the studio's own review calls unpublishable is not queued for the owner to find out.
  if (!review.publishable) {
    return { produced: false, reason: `The deck did not pass its own review: ${review.problems.join("; ")}` };
  }

  const recipe = await effectiveRecipe({
    root: input.root,
    venture: summary.venture,
    slug: summary.slug,
    date: summary.date,
    hasHero: Boolean(input.hero)
  });
  const template = recipeTemplate(recipe, slides.length);
  const rendered = await renderCarouselPng({
    template,
    payload: {
      locale: "cs",
      strings: Object.fromEntries(slides.map((slide, index) => [articleSlideSlot(index), slide.text])),
      ...(recipeVariant(recipe) ? { variant: recipeVariant(recipe)! } : {})
    },
    brand,
    format: "instagram-portrait",
    ...(input.hero ? { images: { [ARTICLE_HERO_SLOT]: input.hero } } : {})
  });

  const directory = deckDirectory(summary);
  const artifactRefs: string[] = [];
  for (const [index, slide] of rendered.entries()) {
    const relative = `${directory}/${articleSlideSlot(index)}.png`;
    await atomicWriteBuffer(input.root, relative, slide.png);
    artifactRefs.push(relative);
  }

  const receiptRef = await writeDeckReceipt({
    root: input.root,
    venture: summary.venture,
    date: summary.date,
    slug: summary.slug,
    templateId: template.id,
    style: recipe.family,
    recipe,
    slideCount: rendered.length,
    hashes: rendered.map((slide) => slide.pngHash)
  });

  const item = deckReviewItem({
    summary,
    assetPaths: artifactRefs,
    altText: summary.standfirst,
    receiptRef,
    now
  });
  const queueRef = `ventures/carousel-studio/deck-queue/${summary.venture}/${summary.date}-${summary.slug}.json`;
  await atomicWriteJson(input.root, queueRef, item);

  return {
    produced: true,
    venture: summary.venture,
    date: summary.date,
    slug: summary.slug,
    artifactRefs,
    recipeRef: recipePath(recipe),
    receiptRef,
    queueRef,
    contentHash: item.content.contentHash,
    slideCount: rendered.length
  };
}

/**
 * Whether this exact deck has already been produced.
 *
 * The queue item's content hash is the answer, because it covers the caption and every frame path.
 * Callers use it to skip a render they have already paid for in wall-clock rather than to decide
 * whether the deck is correct — the receipt beside it says that.
 */
export async function deckAlreadyProduced(
  root: string,
  summary: Pick<CarouselSummary, "venture" | "date" | "slug">
): Promise<boolean> {
  const existing = await readJson<{ content?: { contentHash?: unknown } } | null>(
    root,
    `ventures/carousel-studio/deck-queue/${summary.venture}/${summary.date}-${summary.slug}.json`,
    null
  );
  return typeof existing?.content?.contentHash === "string";
}

/** The token the admin's deck and export routes address a recipe by. */
export function deckRecipeToken(recipe: Parameters<typeof encodeRecipe>[0]): string {
  return encodeRecipe(recipe);
}
