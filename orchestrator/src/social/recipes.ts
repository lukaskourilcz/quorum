import path from "node:path";
import {
  CAROUSEL_BRANDS,
  articleSlideSlot,
  buildArticleDeck,
  buildCarouselSummary,
  quizFrameJpeg,
  recipeTemplateId,
  recipeVariant,
  renderCarouselPng,
  reviewDeck,
  type TemplateReference
} from "@boardlessai/carousel-studio";
import type { DatasetEntry } from "../contracts/boardless-dataset.js";
import { DneskaiRecipePackageSchema, type DneskaiRecipe, type DneskaiRecipePackage } from "../contracts/dneskai-recipe.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { pragueSlotInstant } from "../meetings/calendar.js";
import { atomicWriteBuffer, atomicWriteJson, readJson } from "../state.js";
import { resolveLiveCarouselTemplate } from "../studio/catalog.js";
import { SOCIAL_DECISION_REFERENCE } from "./activation.js";
import { effectiveRecipe } from "./deck-style.js";
import { validateSocialImage } from "./media/validate.js";
import { loadSocialPublisherRegistry, ownPrimaryTarget } from "./publisher-targets.js";
import { AWAITING_OWNER_APPROVAL, CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash, type CapabilityAwareQueueItem } from "./queue.js";
import { fridayToolsCopy, howItWasMadeCopy, noEditionCopy, weeklyRecapCopy, type RecipeCopy } from "./recipe-copy.js";
import { addCalendarDays, isoWeekday, ledgerCostUsd, mondayOf, readEditionRoom, readEditionSummaries, readWeekTools } from "./recipe-sources.js";

/**
 * DNESKAi's recipe posts (quorum#592): Friday tools, Saturday "how it was made", Sunday recap, and
 * a lesson or fact on a day the desk published nothing. Deterministic studio templates over
 * committed records, drafted into the Queue beside the edition's own drafts, at $0. Nothing here
 * posts: every draft waits for the owner, bound by hash to its package.
 *
 * It runs inside the cycle's existing "prepare owner-reviewed articles and social drafts" step
 * (`pnpm delivery -- reviewed`), so it needs no job, cron or phase of its own, and it is idempotent
 * by date: a package already written is left alone, and a recipe whose sources are missing leaves a
 * reason record instead of a thinner post.
 */

export type RecipeOutcome =
  | { recipe: DneskaiRecipe; status: "drafted"; packagePath: string }
  | { recipe: DneskaiRecipe; status: "already-drafted"; packagePath: string }
  | { recipe: DneskaiRecipe; status: "skipped"; reason: string };

export function recipePackagePath(date: string, recipe: DneskaiRecipe): string {
  return `social/recipes/${date}-${recipe}.json`;
}

function recipeSkipPath(date: string, recipe: DneskaiRecipe): string {
  return `social/recipes/${date}-${recipe}.skipped.json`;
}

/** The recipes due on a date: one by weekday, and the fallback when the edition room said NO_EDITION. */
export function dueRecipes(date: string, editionOutcome: string | null): DneskaiRecipe[] {
  const byWeekday: Partial<Record<number, DneskaiRecipe>> = { 5: "friday-tools", 6: "how-it-was-made", 7: "weekly-recap" };
  const due = byWeekday[isoWeekday(date)];
  return [...(due ? [due] : []), ...(editionOutcome === "NO_EDITION" ? ["no-edition" as const] : [])];
}

interface RenderedRecipe {
  visual: TemplateReference;
  slides: Array<{ text: string; alt: string }>;
  frames: Array<{ path: string; sha256: string; bytes: Buffer }>;
  story: { path: string; sha256: string; bytes: Buffer } | null;
}

async function renderRecipe(copy: RecipeCopy, input: { stateRoot: string; date: string }): Promise<RenderedRecipe | string> {
  const brand = CAROUSEL_BRANDS["caught-up"];
  let visual: TemplateReference;
  let texts: string[];
  if (copy.visual.kind === "deck") {
    const slides = buildArticleDeck({ title: copy.visual.title, dek: copy.visual.dek, points: copy.visual.points, outro: copy.visual.outro });
    const review = reviewDeck(slides);
    if (!review.publishable) return `the deck is not publishable: ${review.problems.join(" ")}`;
    const recipe = await effectiveRecipe({ root: input.stateRoot, venture: "caught-up", slug: `${input.date}-${copy.recipe}`, date: input.date, hasHero: false });
    texts = slides.map((slide) => slide.text);
    visual = {
      template_id: recipeTemplateId(recipe, slides.length),
      version: "1.0.0",
      content: {
        locale: "cs",
        ...(recipeVariant(recipe) ? { variant: recipeVariant(recipe)! } : {}),
        strings: Object.fromEntries(texts.map((text, index) => [articleSlideSlot(index), text]))
      }
    };
  } else {
    texts = [copy.visual.strings.quote];
    visual = { template_id: copy.visual.templateId, version: "1.0.0", content: { locale: "cs", strings: copy.visual.strings } };
  }
  const rendered = await renderCarouselPng({
    template: resolveLiveCarouselTemplate(visual.template_id, visual.version),
    payload: visual.content,
    brand,
    format: "instagram-portrait"
  });
  const clipped = rendered.filter((slide) => slide.truncatedSlots.length > 0).map((slide) => slide.index + 1);
  if (clipped.length > 0) return `slide ${clipped.join(", ")} would clip`;
  const base = `/social/caught-up/${input.date}/${copy.recipe}`;
  const frames = [];
  for (const slide of rendered) {
    const bytes = await quizFrameJpeg(slide.png, brand.colors.background ?? "#ffffff");
    const check = await validateSocialImage(bytes);
    if (check.width !== 1080 || check.height !== 1350) return "a frame came out at the wrong canvas";
    frames.push({ path: `${base}/frame-${String(slide.index + 1).padStart(2, "0")}.jpg`, sha256: sha256(bytes), bytes });
  }
  let story: RenderedRecipe["story"] = null;
  if (copy.story) {
    const [storySlide] = await renderCarouselPng({
      template: resolveLiveCarouselTemplate("story-quote", "1.0.0"),
      payload: { locale: "cs", strings: { quote: copy.story.quote, attribution: copy.story.line } },
      brand,
      format: "instagram-story"
    });
    if (storySlide) story = { path: `${base}/story.png`, sha256: storySlide.pngHash, bytes: storySlide.png };
  }
  const slides = rendered.map((slide) => {
    const text = texts[Math.min(slide.index, texts.length - 1)] ?? copy.visual.kind;
    return { text: text.slice(0, 400), alt: `Slide ${slide.index + 1}: ${text}`.slice(0, 300) };
  });
  return { visual, slides, frames, story };
}

function recipeDraft(input: {
  built: DneskaiRecipePackage;
  channel: "instagram" | "threads";
  target: { profileId: string; connectionBindingRef: string };
  now: Date;
}): CapabilityAwareQueueItem {
  const { built } = input;
  const campaignId = `caught-up-${built.date}-cs-recipe-${built.recipe}`;
  const midday = pragueSlotInstant(built.date, 12);
  const opens = midday > input.now ? midday : input.now;
  const base = {
    schemaVersion: 2 as const,
    id: `${campaignId}-${input.channel}`,
    sourceVentureId: "caught-up",
    releaseId: campaignId,
    campaignId,
    experimentId: null,
    target: {
      profileId: input.target.profileId,
      profileRole: "venture-primary" as const,
      role: "primary" as const,
      connectionBindingRef: input.target.connectionBindingRef,
      capabilityRef: null,
      amplifierEligibilityRef: null,
      campaignApprovalRef: null
    },
    action: "publish-original" as const,
    sourcePackage: {
      schemaVersion: "approved-publish-package/1" as const,
      artifactRef: `state/${recipePackagePath(built.date, built.recipe)}`,
      packageHash: sha256(canonicalJson(built))
    },
    locale: "cs" as const,
    variant: "A" as const,
    channel: input.channel,
    objective: "trust" as const,
    audience: "Caught Up readers (cs)",
    destination: built.destination,
    utm: { source: input.channel, medium: "organic_social" as const, campaign: built.recipe, content: `${built.date}-${built.recipe}` },
    content: {
      text: input.channel === "instagram" ? built.instagram.caption : built.threads.text,
      altText: input.channel === "instagram" ? built.slides.map((slide) => slide.alt).join(" ").slice(0, 1_000) : "Textový příspěvek bez obrázku.",
      assetPaths: input.channel === "instagram" ? built.frames.map((frame) => frame.path) : [],
      factualClaimRefs: built.sourceRefs.slice(0, 10),
      rendererVersion: "carousel-studio-1" as const,
      contentHash: "0".repeat(64)
    },
    publishWindow: { notBefore: opens.toISOString(), notAfter: new Date(opens.getTime() + 72 * 3_600_000).toISOString() },
    status: "draft" as const,
    checks: Object.fromEntries(["schema", "brand", "claims", "quill", "keeper", "duplicate", "accessibility", "budget", "capability", "authority", "policy"]
      .map((check) => [check, "pending"])) as CapabilityAwareQueueItem["checks"],
    approvalProvenance: {
      approvalRef: AWAITING_OWNER_APPROVAL,
      selectionRef: `state/${recipePackagePath(built.date, built.recipe)}`,
      policyRef: SOCIAL_DECISION_REFERENCE
    },
    selectedBy: "PULSE" as const,
    createdAt: input.now.toISOString(),
    attempt: null,
    receiptId: null,
    migration: null
  };
  return CapabilityAwareQueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) } });
}

export function recipeQueuePath(date: string, recipe: DneskaiRecipe, channel: "instagram" | "threads"): string {
  return `social/queue/${date}-cs-recipe-${recipe}-${channel}.json`;
}

/** The words for one recipe on a date, or why there are none. */
async function recipeCopy(recipe: DneskaiRecipe, input: DraftRecipesInput): Promise<RecipeCopy | string> {
  const { date, stateRoot } = input;
  if (recipe === "friday-tools") {
    const { tools } = await readWeekTools(stateRoot, mondayOf(date), date);
    return fridayToolsCopy(tools) ?? "no edition this week carried a practical item of type tool";
  }
  if (recipe === "weekly-recap") {
    const from = mondayOf(date);
    const { editions } = await readEditionSummaries(stateRoot, from, date);
    return weeklyRecapCopy({ editions, siteUrl: input.siteUrl, from, to: date }) ?? `the week had ${editions.length} recorded edition(s), and a recap needs two`;
  }
  if (recipe === "how-it-was-made") {
    const { editions } = await readEditionSummaries(stateRoot, addCalendarDays(date, -6), date);
    for (const edition of [...editions].reverse()) {
      const room = await readEditionRoom(stateRoot, edition.date);
      if (!room || room.outcome !== "EDITION") continue;
      const copy = howItWasMadeCopy({ room, edition, costUsd: await ledgerCostUsd(stateRoot, edition.date), siteUrl: input.siteUrl });
      if (copy) return copy;
    }
    return "no edition of the last seven days has a room record with a quotable turn";
  }
  const lesson = await input.readEntry("ai-lessons", date);
  if (lesson) return noEditionCopy({ entry: lesson, kind: "lesson", siteUrl: input.siteUrl, date });
  const fact = await input.readEntry("ai-facts", date);
  if (fact) return noEditionCopy({ entry: fact, kind: "fact", siteUrl: input.siteUrl, date });
  return "neither the lesson nor the fact of the day could be read from the reader's datasets";
}

export interface DraftRecipesInput {
  date: string;
  /** The state tree; the recipes read and write under it. */
  stateRoot: string;
  /** The repository root; frames are written under its `site/public/social`. */
  repoRoot: string;
  configRoot?: string;
  siteUrl: string;
  now: Date;
  /** The reader's lesson or fact for a date (`readDailyDatasetEntry`), or null. */
  readEntry: (dataset: "ai-lessons" | "ai-facts", date: string) => Promise<DatasetEntry | null>;
}

export async function draftDneskaiRecipes(input: DraftRecipesInput): Promise<{ outcomes: RecipeOutcome[]; artifacts: string[] }> {
  const room = await readEditionRoom(input.stateRoot, input.date);
  const outcomes: RecipeOutcome[] = [];
  const artifacts: string[] = [];
  const due = dueRecipes(input.date, room?.outcome ?? null);
  if (due.length === 0) return { outcomes, artifacts };
  const registry = await loadSocialPublisherRegistry(input.configRoot);
  const targets = { instagram: ownPrimaryTarget(registry, "caught-up", "instagram"), threads: ownPrimaryTarget(registry, "caught-up", "threads") };

  for (const recipe of due) {
    const relative = recipePackagePath(input.date, recipe);
    if (DneskaiRecipePackageSchema.safeParse(await readJson<unknown>(input.stateRoot, relative, null)).success) {
      outcomes.push({ recipe, status: "already-drafted", packagePath: `state/${relative}` });
      continue;
    }
    const copy = await recipeCopy(recipe, input);
    const rendered = typeof copy === "string" ? copy : await renderRecipe(copy, input);
    if (typeof rendered === "string" || typeof copy === "string") {
      const reason = typeof copy === "string" ? copy : rendered as string;
      await atomicWriteJson(input.stateRoot, recipeSkipPath(input.date, recipe), { schemaVersion: "dneskai-recipe-skip/1", recipe, date: input.date, reason, recordedAt: input.now.toISOString() });
      outcomes.push({ recipe, status: "skipped", reason });
      artifacts.push(recipeSkipPath(input.date, recipe));
      continue;
    }
    const built = DneskaiRecipePackageSchema.parse({
      schemaVersion: "dneskai-recipe/1",
      id: `dneskai-${recipe}-${input.date}`,
      recipe,
      date: input.date,
      window: { from: recipe === "weekly-recap" || recipe === "friday-tools" ? mondayOf(input.date) : recipe === "how-it-was-made" ? addCalendarDays(input.date, -6) : input.date, to: input.date },
      sourceRefs: copy.sourceRefs,
      slides: rendered.slides,
      visual: rendered.visual,
      frames: rendered.frames.map(({ path, sha256: hash }) => ({ path, sha256: hash })),
      ...(rendered.story && copy.story ? { story: { frame: { path: rendered.story.path, sha256: rendered.story.sha256 }, link: copy.story.link } } : {}),
      destination: copy.destination,
      instagram: { caption: copy.caption },
      threads: { text: copy.threads },
      ownerSlots: copy.ownerSlots,
      status: "draft",
      spendUsd: 0
    });
    // Frames first: a package or a draft never points at a frame that was not written.
    for (const file of [...rendered.frames, ...(rendered.story ? [rendered.story] : [])]) {
      await atomicWriteBuffer(input.repoRoot, `site/public${file.path}`, file.bytes);
    }
    await atomicWriteJson(input.stateRoot, relative, built);
    for (const channel of ["instagram", "threads"] as const) {
      await atomicWriteJson(input.stateRoot, recipeQueuePath(input.date, recipe, channel), recipeDraft({ built, channel, target: targets[channel], now: input.now }));
      artifacts.push(recipeQueuePath(input.date, recipe, channel));
    }
    // The Design Lab lists a carousel recipe beside the editions, from the same words.
    if (copy.visual.kind === "deck") {
      const summary = buildCarouselSummary({ venture: "caught-up", slug: `${input.date}-${recipe}`, date: input.date, title: copy.visual.title, dek: copy.visual.dek, points: copy.visual.points, closing: copy.visual.outro });
      const summaryPath = `ventures/carousel-studio/summaries/caught-up/${input.date}-${summary.slug}.json`;
      await atomicWriteJson(input.stateRoot, summaryPath, summary);
      artifacts.push(summaryPath);
    }
    outcomes.push({ recipe, status: "drafted", packagePath: `state/${relative}` });
    artifacts.push(relative, ...[...rendered.frames, ...(rendered.story ? [rendered.story] : [])]
      .map((file) => path.relative(input.stateRoot, path.join(input.repoRoot, "site", "public", file.path.slice(1)))));
  }
  return { outcomes, artifacts };
}

