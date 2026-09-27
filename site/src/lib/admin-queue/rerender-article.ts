import "server-only";
import { createHash } from "node:crypto";
import { ARTICLE_HERO_SLOT, CAROUSEL_BRANDS, articleSlideSlot, recipeTemplate, recipeVariant, renderCarouselSlidePng, quizFrameJpeg, toRenderablePng } from "@boardlessai/carousel-studio";
import { readDesignLab } from "@/lib/design-lab";
import { readArticleHeroPng } from "@/lib/admin-deck-hero";
import { canonicalJson, packageHash } from "@/lib/devshark-package";
import { readEditorialQueue } from "./editorial";
import { rawObject, supersedingQueueItem } from "./item";
import { QueueActionError } from "./store";
import { freeRevisionId, validated, writeSupersession } from "./writes";
import type { RerenderInput } from "./rerender";
import type { QueueActionResult } from "./actions";

export async function rerenderArticleQueueItem(input: RerenderInput): Promise<QueueActionResult> {
  const { current, store } = input;
  const date = /^caught-up-(\d{4}-\d{2}-\d{2})-cs$/u.exec(current.releaseId)?.[1];
  if (!date) throw new QueueActionError("REFUSED", "This post has no Czech article release.");
  const deck = (await readDesignLab(100, "caught-up")).find(article => article.date === date);
  if (!deck || !deck.renderable) throw new QueueActionError("REFUSED", "Save a complete article design in Design Lab first.");
  let hero = await readArticleHeroPng("caught-up", deck.slug, date);
  let heroAlt: string | null = null;
  let heroCredit = deck.heroCredit;
  let imageRef: { reviewId: string; imageId: string } | null = null;
  if (input.request.imageId) {
    const review = (await readEditorialQueue(input.root)).items.find(item => item.date === date && item.decision === "approve");
    if (!review || !review.images.find(image => image.id === input.request.imageId)?.available) throw new QueueActionError("REFUSED", "The selected image is unavailable.");
    const record = rawObject((await store.read(`state/editorial/reviews/${review.id}.json`))?.value);
    const slot = Array.isArray(record?.images) ? record.images.find(value => rawObject(value)?.id === input.request.imageId) : null;
    const image = rawObject(rawObject(slot)?.image);
    if (typeof image?.hero_bytes_base64 !== "string" || typeof image.alt_cs !== "string") throw new QueueActionError("REFUSED", "The selected image could not be read.");
    hero = await toRenderablePng(Buffer.from(image.hero_bytes_base64, "base64"));
    heroAlt = image.alt_cs;
    const licence = rawObject(image.license);
    heroCredit = typeof licence?.attribution_html === "string" ? licence.attribution_html.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim() : null;
    if (!heroCredit) throw new QueueActionError("REFUSED", "The selected image has no attribution.");
    imageRef = { reviewId: review.id, imageId: input.request.imageId };
  }
  if (deck.hasHero && !hero) throw new QueueActionError("REFUSED", "The article image is unavailable; no incomplete deck was queued.");
  const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const key = sha(Buffer.from(canonicalJson({ release: current.releaseId, recipe: deck.recipe, slides: deck.slides, imageRef, hero: hero ? sha(hero) : null }))).slice(0, 12);
  const frames: Array<{ locale: string; slide: number; png: { path: string; sha256: string }; jpeg: { path: string; sha256: string } }> = [];
  const brand = CAROUSEL_BRANDS["caught-up"];
  for (const [index] of deck.slides.entries()) {
    const rendered = await renderCarouselSlidePng({ template: recipeTemplate(deck.recipe, deck.slides.length),
      payload: { locale: "cs", strings: Object.fromEntries(deck.slides.map((slide, i) => [articleSlideSlot(i), slide.text])),
        ...(recipeVariant(deck.recipe) ? { variant: recipeVariant(deck.recipe)! } : {}) },
      brand, format: "instagram-portrait", index, ...(hero ? { images: { [ARTICLE_HERO_SLOT]: hero } } : {}) });
    if (!rendered || rendered.truncatedSlots.length) throw new QueueActionError("REFUSED", `Slide ${index + 1} does not fit. Shorten it in Design Lab.`);
    const jpeg = await quizFrameJpeg(rendered.png, brand.colors.background ?? "#000000");
    const base = `/social/caught-up/${date}/cs/${key}/slide-${String(index + 1).padStart(2, "0")}`;
    const frame = { locale: "cs", slide: index + 1, png: { path: `${base}.png`, sha256: sha(rendered.png) }, jpeg: { path: `${base}.jpg`, sha256: sha(jpeg) } };
    for (const [asset, bytes] of [[frame.png, rendered.png], [frame.jpeg, jpeg]] as const) {
      const relative = `site/public${asset.path}`;
      if (!await store.createBytes(relative, bytes, `admin(queue): render article design ${key}`)) {
        const existing = await store.readBytes(relative);
        if (!existing || sha(existing) !== asset.sha256) throw new QueueActionError("CONFLICT", "An existing design frame has different bytes.");
      }
    }
    frames.push(frame);
  }
  const revision = { schemaVersion: "social-design-revision/1", venture: "caught-up", date, slug: deck.slug,
    recipe: deck.recipe, imageRef, heroCredit, render: { frames }, carousels: { cs: { slides: deck.slides.map((slide, index) => ({ text: slide.text, alt: (index === 0 && heroAlt ? `${slide.text}. ${heroAlt}` : slide.text).slice(0, 1000) })) } } };
  const artifactRef = `state/social/design-revisions/${date}-${key}.json`;
  const hash = packageHash(revision);
  if (current.sourcePackage?.artifactRef === artifactRef && current.sourcePackage.packageHash === hash) throw new QueueActionError("INVALID", "This post already carries the saved design.");
  if (!await store.create(artifactRef, revision, `admin(queue): save article design ${key}`)) {
    const existing = await store.read(artifactRef);
    if (!existing || packageHash(existing.value) !== hash) throw new QueueActionError("CONFLICT", "A different design revision already exists.");
  }
  const previous = current.sourcePackage ? rawObject((await store.read(current.sourcePackage.artifactRef).catch(() => null))?.value) : null;
  const previousCredit = typeof previous?.heroCredit === "string" ? previous.heroCredit : deck.heroCredit;
  let caption = current.content.text;
  if (previousCredit && caption.endsWith(previousCredit)) caption = caption.slice(0, -previousCredit.length).trimEnd();
  if (heroCredit && !caption.includes(heroCredit)) caption += `\n\n${heroCredit}`;
  if (caption.length > (current.channel === "threads" ? 500 : 2200)) throw new QueueActionError("REFUSED", "Shorten the caption before adding the selected image credit.");
  const id = await freeRevisionId(input.state, store, current.id);
  const successor = supersedingQueueItem(current, { id, text: caption,
    altText: revision.carousels.cs.slides.map(slide => slide.alt).join(" ").slice(0, 1000), now: input.now,
    assetPaths: frames.map(frame => current.channel === "instagram" ? frame.jpeg.path : frame.png.path),
    sourcePackage: { schemaVersion: "approved-publish-package/1", artifactRef, packageHash: hash } });
  const event = validated({ ...input.event, supersedingItemId: id, resultingContentHash: successor.content.contentHash, changedFields: ["frames", "altText", ...(caption !== current.content.text ? ["caption" as const] : [])] });
  await writeSupersession(store, { event, successor, original: { relative: input.relative, value: current, version: input.stored.version }, message: `admin(queue): ${id} replaces the previous article design` });
  return { changed: true, itemId: current.id, supersedingItemId: id, event: { id: event.id, action: "rerender", nextStatus: "cancelled" },
    persistence: store.persistence, dispatch: null, message: "Saved as a new social draft. Review its frames and approve it in Queue." };
}
