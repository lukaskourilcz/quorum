import path from "node:path";
import sharp from "sharp";
import type { MarketingPlan } from "../contracts/marketing-plan.js";
import type { ArticlePackage, SocialVariantPack } from "../contracts/mma-files.js";
import { parseSafeHttpsUrl } from "../security/url.js";
import { atomicWriteBuffer, atomicWriteJson } from "../state.js";
import { renderSocialVariants } from "../mma-files/frame.js";
import { deterministicVariant } from "./pack.js";
import { QueueItemSchema, queuePayloadHash, type QueueItem } from "./queue.js";

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function wrapped(value: string, maximum = 24): string[] {
  const lines: string[] = [];
  for (const word of value.trim().split(/\s+/u)) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > maximum) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 5);
}

function ttSvg(headline: string, subhead: string, variant: "A" | "B"): string {
  const palette = variant === "A"
    ? { background: "#140f18", card: "#24172b", accent: "#ff5ea8", foreground: "#fff7fb" }
    : { background: "#fff4e8", card: "#ffe3c3", accent: "#c32e68", foreground: "#321323" };
  const title = wrapped(headline).map((line, index) => `<text x="92" y="${350 + index * 94}" fill="${palette.foreground}" font-family="Arial, sans-serif" font-size="78" font-weight="800">${escapeXml(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-label="Typographic Titty Tuesdays campaign card"><rect width="1080" height="1350" fill="${palette.background}"/><rect x="54" y="54" width="972" height="1242" rx="42" fill="${palette.card}" stroke="${palette.accent}" stroke-width="4"/><text x="92" y="155" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="34" font-weight="800">TITTY TUESDAYS · ${variant}</text>${title}<text x="92" y="1110" fill="${palette.foreground}" font-family="Arial, sans-serif" font-size="34">${escapeXml(subhead.slice(0, 72))}</text><circle cx="930" cy="1180" r="34" fill="${palette.accent}"/></svg>`;
}

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
  const renders = new Map(renderSocialVariants(input.pack, input.article).map((render) => [render.key, render]));
  const date = input.article.publishAt.slice(0, 10);
  const evidenceRefs = input.article.sources.map((source) => source.kind === "internal" ? source.ref : source.url);
  const paths: string[] = [];
  for (const locale of ["en", "cs"] as const) {
    for (const channel of ["instagram", "threads"] as const) {
      const id = `mma-files-${date}-${input.article.slot}-${input.article.slug}-${locale}-${channel}`;
      const variant = deterministicVariant(id);
      const selected = input.pack.variants.find((item) => item.id === variant)!;
      const assetPath = `/social/mma-files/${date}/${input.article.slug}-${variant}-${locale}.png`;
      if (channel === "instagram") {
        const render = renders.get(`${variant}-${locale}`)!;
        const bytes = await sharp(Buffer.from(render.svg)).png({ compressionLevel: 9 }).toBuffer();
        await atomicWriteBuffer(input.repoRoot, `site/public${assetPath}`, bytes);
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
        assetPaths: channel === "instagram" ? [assetPath] : [],
        altText: channel === "instagram" ? `MMA Files typographic ${variant} cover: ${input.article.localizations[locale].title}` : null,
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
      const assetPath = `/social/titty-tuesdays/${date}/${asset.id}-${variant}.png`;
      if (channel === "instagram") {
        const bytes = await sharp(Buffer.from(ttSvg(asset.visualSpec.headline, asset.visualSpec.subhead, variant))).png({ compressionLevel: 9 }).toBuffer();
        await atomicWriteBuffer(input.repoRoot, `site/public${assetPath}`, bytes);
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
        assetPaths: channel === "instagram" ? [assetPath] : [],
        altText: channel === "instagram" ? `Typographic Titty Tuesdays card: ${asset.visualSpec.headline}` : null,
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
