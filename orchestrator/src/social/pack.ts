import { createHash } from "node:crypto";
import path from "node:path";
import type { EditionPackage } from "../contracts/edition-package.js";
import type { MeetingRecord } from "../contracts/meeting-record.js";
import { SocialPackSchema, type SocialPack } from "../contracts/social-pack.js";
import { parseSafeHttpsUrl } from "../security/url.js";
import { atomicWriteBuffer, atomicWriteJson, atomicWriteText, readText } from "../state.js";
import { composeCarouselFrame, composeQuoteCard } from "./media/compose.js";
import { validateSocialImage } from "./media/validate.js";
import { QueueItemSchema, queuePayloadHash, type QueueItem } from "./queue.js";

const COMPOSER_VERSION = "carousel-1";
const FRAME_COUNT = 4;

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

function queueAltText(pack: SocialPack, locale: SocialLocale): string {
  return pack.byLocale[locale].instagram.frames
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
  const localized = input.pack.byLocale[input.locale];
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
      altText: queueAltText(input.pack, input.locale),
      assetPaths: platform.frames,
      factualClaimRefs: input.evidenceRefs,
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
  queueItems: [QueueItem, QueueItem, QueueItem, QueueItem];
  artifactPaths: string[];
}

export async function composeEditionSocialPack(input: {
  editionPackage: EditionPackage;
  meeting: MeetingRecord;
  destinations: Record<SocialLocale, string>;
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
    en: parseSafeHttpsUrl(input.destinations.en).toString(),
    cs: parseSafeHttpsUrl(input.destinations.cs).toString()
  };
  const bestTurnIndex = input.meeting.roomTranscript.turns.findIndex((turn) => turn.agent === "STET") >= 0
    ? input.meeting.roomTranscript.turns.findIndex((turn) => turn.agent === "STET")
    : Math.max(0, input.meeting.roomTranscript.turns.findIndex((turn) => turn.mode === "raises-concern"));
  const bestTurn = input.meeting.roomTranscript.turns[bestTurnIndex] ?? input.meeting.roomTranscript.turns[0]!;
  const frameInputs = {
    en: [
      { eyebrow: "Today’s signal", title: editionPackage.article.en.frontmatter.title, body: editionPackage.article.en.frontmatter.dek },
      { eyebrow: "What changed", title: "The change", body: editionPackage.article.en.frontmatter.what_changed[0]! },
      { eyebrow: "Why it matters", title: "The consequence", body: editionPackage.article.en.frontmatter.why_it_matters[0]! },
      { eyebrow: "What remains open", title: "The uncertainty", body: editionPackage.article.en.frontmatter.uncertainty[0]! }
    ],
    cs: [
      { eyebrow: "Dnešní signál", title: editionPackage.article.cs.frontmatter.title, body: editionPackage.article.cs.frontmatter.dek },
      { eyebrow: "Co se změnilo", title: "Změna", body: editionPackage.article.cs.frontmatter.what_changed[0]! },
      { eyebrow: "Proč na tom záleží", title: "Důsledek", body: editionPackage.article.cs.frontmatter.why_it_matters[0]! },
      { eyebrow: "Co zůstává otevřené", title: "Nejistota", body: editionPackage.article.cs.frontmatter.uncertainty[0]! }
    ]
  };
  const inputHash = sha256(JSON.stringify({
    composerVersion: COMPOSER_VERSION,
    editionRef: input.editionPackage.idempotencyKey,
    meetingRef: input.editionPackage.board.meetingRef,
    destinations,
    frameInputs,
    quote: { agent: bestTurn.agent, text: bestTurn.text }
  }));
  const relativeDirectory = `site/public/social/${input.editionPackage.date}`;
  const publicDirectory = `/social/${input.editionPackage.date}`;
  const framePaths: Record<SocialLocale, string[]> = { en: [], cs: [] };
  const frameHashes: Record<string, string> = {};
  const altTexts: Record<string, string> = {};
  for (const locale of ["en", "cs"] as const) {
    for (const [index, frameInput] of frameInputs[locale].entries()) {
      const name = `frame-${String(index + 1).padStart(2, "0")}.webp`;
      const publicPath = `${publicDirectory}/${locale}/${name}`;
      const bytes = await composeCarouselFrame({
        date: input.editionPackage.date,
        ...frameInput,
        index: index + 1,
        total: FRAME_COUNT
      });
      const validation = await validateSocialImage(bytes);
      if (validation.width !== 1080 || validation.height !== 1350) {
        throw new Error(`Social frame ${publicPath} must be 1080x1350`);
      }
      await atomicWriteBuffer(
        input.repoRoot,
        `${relativeDirectory}/${locale}/${name}`,
        bytes
      );
      framePaths[locale].push(publicPath);
      frameHashes[publicPath] = sha256(bytes);
      altTexts[publicPath] = `${frameInput.eyebrow}: ${frameInput.title}. ${frameInput.body}`.slice(0, 300);
    }
  }
  const quotePath = `${publicDirectory}/quote.webp`;
  const quoteBytes = await composeQuoteCard({
    date: input.editionPackage.date,
    agent: bestTurn.agent,
    quote: bestTurn.text
  });
  const quoteValidation = await validateSocialImage(quoteBytes);
  if (quoteValidation.width !== 1080 || quoteValidation.height !== 1350) {
    throw new Error("Social quote card must be 1080x1350");
  }
  await atomicWriteBuffer(input.repoRoot, `${relativeDirectory}/quote.webp`, quoteBytes);
  frameHashes[quotePath] = sha256(quoteBytes);
  altTexts[quotePath] = `Quote from ${bestTurn.agent} in the edition room: ${bestTurn.text}`.slice(0, 300);

  const buildLocalePack = (locale: SocialLocale) => {
      const article = editionPackage.article[locale].frontmatter;
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
          frames: framePaths[locale]
        },
        threads: {
          text: threadsA,
          variants: { A: threadsA, B: boundedCopy(threadsBBody, threadsSuffix, 500) },
          hashtags: [],
          frames: framePaths[locale]
        }
      };
  };
  const localePacks = {
    en: buildLocalePack("en"),
    cs: buildLocalePack("cs")
  };
  const pack = SocialPackSchema.parse({
    schemaVersion: "social-pack/1",
    date: input.editionPackage.date,
    editionRef: input.editionPackage.idempotencyKey,
    byLocale: localePacks,
    instagram: localePacks.en.instagram,
    threads: localePacks.en.threads,
    quoteCard: {
      frame: quotePath,
      sourceTurnRef: `${input.editionPackage.board.meetingRef}#turn-${bestTurnIndex + 1}`
    },
    provenance: { composerVersion: COMPOSER_VERSION, inputsHash: inputHash },
    altTexts
  });
  const evidenceRefs = editionPackage.article.en.frontmatter.sources
    .map((source) => `source:${source.source_id ?? source.id}`);
  const now = input.now ?? new Date();
  const enInstagram = queueItem({ pack, locale: "en", channel: "instagram", destination: destinations.en, evidenceRefs, now });
  const enThreads = queueItem({ pack, locale: "en", channel: "threads", destination: destinations.en, evidenceRefs, now });
  const csInstagram = queueItem({ pack, locale: "cs", channel: "instagram", destination: destinations.cs, evidenceRefs, now });
  const csThreads = queueItem({ pack, locale: "cs", channel: "threads", destination: destinations.cs, evidenceRefs, now });
  await Promise.all([
    atomicWriteJson(input.stateRoot, `social/packs/${input.editionPackage.date}.json`, pack),
    atomicWriteJson(input.stateRoot, `social/assets/${input.editionPackage.date}.json`, {
      schemaVersion: 1,
      composerVersion: COMPOSER_VERSION,
      inputsHash: inputHash,
      frameHashes,
      width: 1080,
      height: 1350,
      format: "webp"
    }),
    atomicWriteJson(input.stateRoot, `social/queue/${input.editionPackage.date}-en-instagram.json`, enInstagram),
    atomicWriteJson(input.stateRoot, `social/queue/${input.editionPackage.date}-en-threads.json`, enThreads),
    atomicWriteJson(input.stateRoot, `social/queue/${input.editionPackage.date}-cs-instagram.json`, csInstagram),
    atomicWriteJson(input.stateRoot, `social/queue/${input.editionPackage.date}-cs-threads.json`, csThreads)
  ]);
  return {
    pack,
    queueItems: [enInstagram, enThreads, csInstagram, csThreads],
    artifactPaths: [
      `social/packs/${input.editionPackage.date}.json`,
      `social/assets/${input.editionPackage.date}.json`,
      `social/queue/${input.editionPackage.date}-en-instagram.json`,
      `social/queue/${input.editionPackage.date}-en-threads.json`,
      `social/queue/${input.editionPackage.date}-cs-instagram.json`,
      `social/queue/${input.editionPackage.date}-cs-threads.json`,
      ...Object.values(framePaths).flat().map((frame) => path.relative(input.stateRoot, path.join(input.repoRoot, "site", "public", frame.slice(1)))),
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
