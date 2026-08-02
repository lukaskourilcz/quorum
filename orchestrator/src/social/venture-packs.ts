import path from "node:path";
import { CAROUSEL_BRANDS, renderCarouselPng } from "@boardlessai/carousel-studio";
import { resolveLiveCarouselTemplate } from "../studio/catalog.js";
import type { MarketingPlan } from "../contracts/marketing-plan.js";
import type { ArticlePackage, SocialVariantPack } from "../contracts/mma-files.js";
import { parseSafeHttpsUrl } from "../security/url.js";
import { atomicWriteBuffer, atomicWriteJson } from "../state.js";
import { deterministicVariant } from "./pack.js";
import { QueueItemSchema, queuePayloadHash, type QueueItem } from "./queue.js";

function nextTuesday(date: string): string {
  const base = new Date(`${date}T12:00:00.000Z`);
  const days = (2 - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function baseQueue(input: {
  id: string;
  venture: "mma-files" | "titty-tuesdays";
  locale: "en" | "cs" | null;
  variant: "A" | "B";
  channel: "instagram" | "threads";
  destination: string;
  text: string;
  assetPaths: string[];
  altText: string | null;
  evidenceRefs: string[];
  notBefore: string;
  notAfter: string;
  now: Date;
}): QueueItem {
  const campaignId = input.id.replace(/-(?:instagram|threads)$/u, "");
  const raw = {
    schemaVersion: 1 as const,
    id: input.id,
    venture: input.venture,
    locale: input.locale,
    variant: input.variant,
    campaignId,
    experimentId: null,
    channel: input.channel,
    objective: "trust" as const,
    audience: input.venture === "mma-files" ? `MMA Files readers${input.locale ? ` (${input.locale})` : ""}` : "Titty Tuesdays adult brand audience",
    destination: input.destination,
    utm: { source: input.channel, medium: "organic_social" as const, campaign: campaignId, content: input.variant },
    content: { text: input.text, altText: input.altText, assetPaths: input.assetPaths, factualClaimRefs: input.evidenceRefs, contentHash: "0".repeat(64) },
    publishWindow: { notBefore: input.notBefore, notAfter: input.notAfter },
    status: "draft" as const,
    checks: { schema: "pass" as const, brand: "pass" as const, claims: "pass" as const, quill: "pass" as const, keeper: "pass" as const, duplicate: "pass" as const, accessibility: "pass" as const, budget: "pass" as const },
    selectedBy: "PULSE" as const,
    createdAt: input.now.toISOString(),
    attempt: null,
    receiptId: null
  };
  return QueueItemSchema.parse({ ...raw, content: { ...raw.content, contentHash: queuePayloadHash(raw) } });
}

export async function composeMmaFilesSocialQueue(input: {
  stateRoot: string;
  repoRoot: string;
  article: ArticlePackage;
  pack: SocialVariantPack;
  destinationBaseUrl: string;
  now: Date;
}): Promise<string[]> {
  const baseUrl = parseSafeHttpsUrl(input.destinationBaseUrl);
  const date = input.article.publishAt.slice(0, 10);
  const evidenceRefs = input.article.sources.map((source) => source.kind === "internal" ? source.ref : source.url);
  const paths: string[] = [];
  for (const locale of ["en", "cs"] as const) {
    for (const channel of ["instagram", "threads"] as const) {
      const id = `mma-files-${date}-${input.article.slot}-${input.article.slug}-${locale}-${channel}`;
      const variant = deterministicVariant(id);
      const selected = input.pack.variants.find((item) => item.id === variant)!;
      const reference = selected.carousel[locale];
      const format = channel === "instagram" ? "instagram-portrait" as const : "threads" as const;
      const renders = await renderCarouselPng({ template: resolveLiveCarouselTemplate(reference.template_id, reference.version), payload: reference.content, brand: CAROUSEL_BRANDS["mma-files"], format });
      const assetPaths: string[] = [];
      for (const render of renders) {
        const assetPath = `/social/mma-files/${date}/${input.article.slug}-${variant}-${locale}-${channel}-${String(render.index + 1).padStart(2, "0")}.png`;
        await atomicWriteBuffer(input.repoRoot, `site/public${assetPath}`, render.png);
        assetPaths.push(assetPath);
        paths.push(path.relative(input.stateRoot, path.join(input.repoRoot, "site", "public", assetPath.slice(1))));
      }
      const destination = new URL(`/${locale}/articles/${input.article.slug}`, baseUrl).toString();
      const item = baseQueue({
        id,
        venture: "mma-files",
        locale,
        variant,
        channel,
        destination,
        text: selected.captions[locale][channel],
        assetPaths,
        altText: `MMA Files ${variant} carousel: ${input.article.localizations[locale].title}`,
        evidenceRefs,
        notBefore: input.now.toISOString(),
        notAfter: new Date(input.now.getTime() + 72 * 60 * 60 * 1_000).toISOString(),
        now: input.now
      });
      const queuePath = `social/queue/${id}.json`;
      await atomicWriteJson(input.stateRoot, queuePath, item);
      paths.push(queuePath);
    }
  }
  return paths;
}

export async function composeTittyTuesdaysSocialQueue(input: {
  stateRoot: string;
  repoRoot: string;
  plan: MarketingPlan;
  destinationBaseUrl: string;
  now: Date;
}): Promise<string[]> {
  const baseUrl = parseSafeHttpsUrl(input.destinationBaseUrl).toString();
  const date = nextTuesday(input.now.toISOString().slice(0, 10));
  const notBefore = new Date(`${date}T10:00:00.000Z`);
  const notAfter = new Date(`${date}T20:00:00.000Z`);
  const paths: string[] = [];
  for (const asset of input.plan.postable_assets) {
    for (const channel of ["instagram", "threads"] as const) {
      const id = `titty-tuesdays-${input.plan.id}-${asset.id}-${channel}`;
      const variant = deterministicVariant(id);
      const reference = { ...asset.visual, content: { ...asset.visual.content, variant } };
      const format = channel === "instagram" ? "instagram-portrait" as const : "threads" as const;
      const renders = await renderCarouselPng({ template: resolveLiveCarouselTemplate(reference.template_id, reference.version), payload: reference.content, brand: CAROUSEL_BRANDS["titty-tuesdays"], format });
      const assetPaths: string[] = [];
      for (const render of renders) {
        const assetPath = `/social/titty-tuesdays/${date}/${asset.id}-${variant}-${channel}-${String(render.index + 1).padStart(2, "0")}.png`;
        await atomicWriteBuffer(input.repoRoot, `site/public${assetPath}`, render.png);
        assetPaths.push(assetPath);
        paths.push(path.relative(input.stateRoot, path.join(input.repoRoot, "site", "public", assetPath.slice(1))));
      }
      const item = baseQueue({
        id,
        venture: "titty-tuesdays",
        locale: null,
        variant,
        channel,
        destination: baseUrl,
        text: asset.captions[channel][variant],
        assetPaths,
        altText: `Titty Tuesdays carousel: ${reference.content.strings["cover-title"] ?? reference.content.strings["poster-line"] ?? "campaign draft"}`,
        evidenceRefs: [input.plan.originMeetingRef],
        notBefore: notBefore.toISOString(),
        notAfter: notAfter.toISOString(),
        now: input.now
      });
      const queuePath = `social/queue/${id}.json`;
      await atomicWriteJson(input.stateRoot, queuePath, item);
      paths.push(queuePath);
    }
  }
  return paths;
}
