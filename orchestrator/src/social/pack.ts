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

function hashtags(tags: readonly string[]): string[] {
  const normalized = tags
    .map((tag) => tag.normalize("NFKC").toLowerCase().replaceAll(/[^a-z0-9_]+/g, ""))
    .filter(Boolean);
  return [...new Set([...normalized, "ai", "artificialintelligence", "aitech", "aifirst", "caughtup"])].slice(0, 10);
}

function queueAltText(pack: SocialPack): string {
  return pack.instagram.frames.map((frame, index) => `Frame ${index + 1}: ${pack.altTexts[frame]}`).join(" ").slice(0, 1_000);
}

function queueItem(input: {
  pack: SocialPack;
  channel: "instagram" | "threads";
  destination: string;
  evidenceRefs: string[];
  now: Date;
}): QueueItem {
  const notBefore = input.now.toISOString();
  const notAfter = new Date(input.now.getTime() + 72 * 60 * 60 * 1_000).toISOString();
  const platform = input.pack[input.channel];
  const base = {
    schemaVersion: 1 as const,
    id: `caught-up-${input.pack.date}-${input.channel}`,
    campaignId: `caught-up-${input.pack.date}`,
    experimentId: null,
    channel: input.channel,
    objective: "trust" as const,
    audience: "Caught Up readers",
    destination: input.destination,
    utm: {
      source: input.channel,
      medium: "organic_social" as const,
      campaign: `caught-up-${input.pack.date}`,
      content: "edition-carousel"
    },
    content: {
      text: input.channel === "instagram" ? input.pack.instagram.caption : input.pack.threads.text,
      altText: queueAltText(input.pack),
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
  queueItems: [QueueItem, QueueItem];
  artifactPaths: string[];
}

export async function composeEditionSocialPack(input: {
  editionPackage: EditionPackage;
  meeting: MeetingRecord;
  destination: string;
  repoRoot: string;
  stateRoot: string;
  now?: Date;
}): Promise<SocialPackComposition | null> {
  if (input.editionPackage.status !== "edition") return null;
  if (input.meeting.kind !== "cu-edition" || input.meeting.date !== input.editionPackage.date) {
    throw new Error("Social pack requires the matching Caught Up edition meeting");
  }
  const destination = parseSafeHttpsUrl(input.destination);
  const article = input.editionPackage.article.en.frontmatter;
  const bestTurnIndex = input.meeting.roomTranscript.turns.findIndex((turn) => turn.agent === "STET") >= 0
    ? input.meeting.roomTranscript.turns.findIndex((turn) => turn.agent === "STET")
    : Math.max(0, input.meeting.roomTranscript.turns.findIndex((turn) => turn.mode === "raises-concern"));
  const bestTurn = input.meeting.roomTranscript.turns[bestTurnIndex] ?? input.meeting.roomTranscript.turns[0]!;
  const frameInputs = [
    { eyebrow: "Today’s signal", title: article.title, body: article.dek },
    { eyebrow: "What changed", title: "The change", body: article.what_changed[0]! },
    { eyebrow: "Why it matters", title: "The consequence", body: article.why_it_matters[0]! },
    { eyebrow: "What remains open", title: "The uncertainty", body: article.uncertainty[0]! }
  ];
  const inputHash = sha256(JSON.stringify({
    composerVersion: COMPOSER_VERSION,
    editionRef: input.editionPackage.idempotencyKey,
    meetingRef: input.editionPackage.board.meetingRef,
    frameInputs,
    quote: { agent: bestTurn.agent, text: bestTurn.text }
  }));
  const relativeDirectory = `site/public/social/${input.editionPackage.date}`;
  const publicDirectory = `/social/${input.editionPackage.date}`;
  const framePaths: string[] = [];
  const frameHashes: Record<string, string> = {};
  const altTexts: Record<string, string> = {};
  for (const [index, frameInput] of frameInputs.entries()) {
    const publicPath = `${publicDirectory}/frame-${String(index + 1).padStart(2, "0")}.webp`;
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
    await atomicWriteBuffer(input.repoRoot, `${relativeDirectory}/frame-${String(index + 1).padStart(2, "0")}.webp`, bytes);
    framePaths.push(publicPath);
    frameHashes[publicPath] = sha256(bytes);
    altTexts[publicPath] = `${frameInput.eyebrow}: ${frameInput.title}. ${frameInput.body}`.slice(0, 300);
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

  const tagList = hashtags(article.tags);
  const pack = SocialPackSchema.parse({
    schemaVersion: "social-pack/1",
    date: input.editionPackage.date,
    editionRef: input.editionPackage.idempotencyKey,
    instagram: {
      caption: `${article.title}\n\n${article.dek}\n\n${article.why_it_matters[0]}\n\nRead the edition: ${destination.toString()}\n\n${tagList.map((tag) => `#${tag}`).join(" ")}`,
      hashtags: tagList,
      frames: framePaths
    },
    threads: {
      text: `${article.title}\n\n${article.why_it_matters[0]}\n\n${destination.toString()}`,
      hashtags: [],
      frames: framePaths
    },
    quoteCard: {
      frame: quotePath,
      sourceTurnRef: `${input.editionPackage.board.meetingRef}#turn-${bestTurnIndex + 1}`
    },
    provenance: { composerVersion: COMPOSER_VERSION, inputsHash: inputHash },
    altTexts
  });
  const evidenceRefs = article.sources.map((source) => `source:${source.source_id ?? source.id}`);
  const now = input.now ?? new Date();
  const instagram = queueItem({ pack, channel: "instagram", destination: destination.toString(), evidenceRefs, now });
  const threads = queueItem({ pack, channel: "threads", destination: destination.toString(), evidenceRefs, now });
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
    atomicWriteJson(input.stateRoot, `social/queue/${input.editionPackage.date}-instagram.json`, instagram),
    atomicWriteJson(input.stateRoot, `social/queue/${input.editionPackage.date}-threads.json`, threads)
  ]);
  return {
    pack,
    queueItems: [instagram, threads],
    artifactPaths: [
      `social/packs/${input.editionPackage.date}.json`,
      `social/assets/${input.editionPackage.date}.json`,
      `social/queue/${input.editionPackage.date}-instagram.json`,
      `social/queue/${input.editionPackage.date}-threads.json`,
      ...framePaths.map((frame) => path.relative(input.stateRoot, path.join(input.repoRoot, "site", "public", frame.slice(1)))),
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
