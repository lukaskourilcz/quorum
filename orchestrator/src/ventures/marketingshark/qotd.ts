import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisesEngagementReward } from "@boardlessai/carousel-studio";
import {
  MarketingSharkQotdSchema,
  QOTD_THREADS_TEXT_LIMIT,
  type MarketingSharkQotd
} from "../../contracts/marketingshark-qotd.js";
import type { SocialCapabilityRef } from "../../contracts/social-distribution.js";
import { canonicalJson, sha256 } from "../../hashing.js";
import { pragueSlotInstant } from "../../meetings/calendar.js";
import {
  AWAITING_OWNER_APPROVAL,
  CapabilityAwareQueueItemSchema,
  capabilityAwareQueuePayloadHash,
  type CapabilityAwareQueueItem
} from "../../social/queue.js";
import { atomicWriteJson, readJson } from "../../state.js";
import type { NormalizedQuestion, QuestionBankSnapshot } from "./bank.js";
import type { Brand } from "./config.js";
import { clipToWords } from "./kinds.js";
import { epochOrder, type MarketingSharkLedger } from "./ledger.js";
import { DEVSHARK_SOCIAL_TARGETS } from "./queue.js";
import { topicLabel } from "./topics.js";

/**
 * devShark's Threads code question of the day (quorum#592).
 *
 * A text post, not a deck: the question and its lettered options, drafted by code from the served
 * bank at $0, and the answer with its explanation in a first-reply draft. Everything here is
 * deterministic — the same bank and the same served history pick the same question — and nothing
 * posts: the queue item is a draft with every check pending, like the carousel's.
 */

export type QotdSettings = NonNullable<Brand["qotd"]>;

/** The order a question takes in the rotation is a property of its id, so a re-import only adds places. */
const QOTD_ORDER_SEED = sha256("marketingshark-qotd/1:devshark");
const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export function qotdPackagePath(date: string, brandId: string): string {
  return `ventures/marketingshark/qotd/${date}/${brandId}.json`;
}

export function qotdQueueItemPath(date: string, brandId: string): string {
  return `social/queue/${date}-${brandId}-en-threads-qotd.json`;
}

export function qotdLink(brand: Pick<Brand, "productUrl">, settings: QotdSettings, date: string): string {
  const url = new URL(brand.productUrl);
  url.searchParams.set("utm_source", "threads");
  url.searchParams.set("utm_medium", "reply");
  url.searchParams.set("utm_campaign", settings.utmCampaign);
  url.searchParams.set("utm_content", date);
  return url.toString();
}

function oneLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** The post: the topic, the question, the options, and where the answer will be. No link. */
export function qotdPostText(question: NormalizedQuestion): string {
  const options = question.en.options.map((option, index) => `${LETTERS[index]}) ${oneLine(option)}`);
  return [
    `Code question of the day · ${topicLabel(question.category)}`,
    oneLine(question.en.question),
    options.join("\n"),
    "Your answer? The answer and why are in the replies."
  ].join("\n\n");
}

/** The first reply: the letter and option, the bank's own explanation clipped to fit, the tracked link. */
export function qotdReplyText(question: NormalizedQuestion, link: string): string {
  const letter = LETTERS[question.correctIndex]!;
  const answer = `Answer: ${letter}) ${oneLine(question.en.options[question.correctIndex] ?? "")}`;
  const closing = `One question like this a day on devShark: ${link}`;
  const room = QOTD_THREADS_TEXT_LIMIT - answer.length - closing.length - 4;
  const explanation = room >= 40 ? clipToWords(oneLine(question.en.explanation), room) : "";
  return [answer, explanation, closing].filter(Boolean).join("\n\n");
}

/**
 * Whether a question can be a Threads post as it stands: no fenced code (Threads renders none),
 * letters for every option, and both texts inside the platform's 500 characters.
 */
export function qotdEligible(question: NormalizedQuestion, link: string): boolean {
  if (question.hasCode || question.en.options.length < 2 || question.en.options.length > LETTERS.length) return false;
  if (/```/u.test(question.en.question) || question.en.options.some((option) => /```|\n/u.test(option))) return false;
  const post = qotdPostText(question);
  const reply = qotdReplyText(question, link);
  return post.length <= QOTD_THREADS_TEXT_LIMIT && reply.length <= QOTD_THREADS_TEXT_LIMIT
    && !promisesEngagementReward(post) && !promisesEngagementReward(reply);
}

/**
 * Today's question: the first in the fixed id order that neither an earlier question of the day
 * nor the carousel has served. When every eligible question has been used, the rotation starts
 * again from the top of the order, skipping only what the carousel served.
 */
export function selectQotdQuestion(input: {
  snapshot: QuestionBankSnapshot;
  link: string;
  servedByQotd: ReadonlySet<string>;
  servedByCarousel: ReadonlySet<string>;
}): NormalizedQuestion | null {
  const eligible = input.snapshot.questions.filter((question) => qotdEligible(question, input.link));
  const order = epochOrder(eligible.map((question) => question.id), QOTD_ORDER_SEED);
  const fresh = order.find((id) => !input.servedByQotd.has(id) && !input.servedByCarousel.has(id))
    ?? order.find((id) => !input.servedByCarousel.has(id))
    ?? null;
  return fresh ? eligible.find((question) => question.id === fresh) ?? null : null;
}

/** The question ids earlier questions of the day recorded, read from their own packages. */
export async function servedQotdIds(root: string, brandId: string, before: string): Promise<Set<string>> {
  const directory = path.join(root, "ventures/marketingshark/qotd");
  const dates = await readdir(directory).catch(() => [] as string[]);
  const ids = new Set<string>();
  for (const date of dates.filter((entry) => /^\d{4}-\d{2}-\d{2}$/u.test(entry) && entry < before)) {
    const parsed = MarketingSharkQotdSchema.safeParse(await readJson<unknown>(root, qotdPackagePath(date, brandId), null));
    if (parsed.success) ids.add(parsed.data.question.id);
  }
  return ids;
}

export function buildQotdPackage(input: {
  brand: Brand;
  settings: QotdSettings;
  date: string;
  question: NormalizedQuestion;
  snapshot: Pick<QuestionBankSnapshot, "sourceRepo" | "sourceCommit" | "contentHash">;
}): MarketingSharkQotd {
  const link = qotdLink(input.brand, input.settings, input.date);
  const notBefore = pragueSlotInstant(input.date, input.settings.pragueHour);
  const notAfter = new Date(notBefore.getTime() + input.settings.windowHours * 3_600_000);
  return MarketingSharkQotdSchema.parse({
    schemaVersion: "marketingshark-qotd/1",
    id: `ms-qotd-${input.date}-${input.brand.id}`,
    date: input.date,
    brandId: input.brand.id,
    platform: "threads",
    question: {
      id: input.question.id,
      category: input.question.category,
      difficulty: input.question.difficulty,
      correctIndex: input.question.correctIndex
    },
    bank: { sourceRepo: input.snapshot.sourceRepo, sourceCommit: input.snapshot.sourceCommit, contentHash: input.snapshot.contentHash },
    post: { text: qotdPostText(input.question) },
    firstReply: { text: qotdReplyText(input.question, link), link },
    publishWindow: {
      prague: `${String(input.settings.pragueHour).padStart(2, "0")}:00`,
      notBefore: notBefore.toISOString(),
      notAfter: notAfter.toISOString()
    },
    status: "draft",
    spendUsd: 0
  });
}

/**
 * The Threads draft for the question: text only, bound to devShark's own Threads profile under the
 * `marketingshark -> social-distribution` edge, every check pending. The first reply is not part of
 * the item — the publisher sends one post — so the owner posts it from the package (the Queue export
 * carries it as `first-reply.txt`).
 */
export function buildQotdQueueItem(input: {
  built: MarketingSharkQotd;
  brand: Brand;
  now: Date;
  capabilityRef: SocialCapabilityRef;
}): CapabilityAwareQueueItem {
  const { built, brand } = input;
  const target = DEVSHARK_SOCIAL_TARGETS.threads;
  const base = {
    schemaVersion: 2 as const,
    id: `ms-${built.date}-${brand.id}-en-threads-qotd`,
    sourceVentureId: "marketingshark",
    releaseId: built.id,
    campaignId: built.id,
    experimentId: null,
    target: {
      profileId: target.profileId,
      profileRole: "venture-primary" as const,
      role: "primary" as const,
      connectionBindingRef: target.connectionBindingRef,
      capabilityRef: input.capabilityRef,
      amplifierEligibilityRef: null,
      campaignApprovalRef: null
    },
    action: "publish-original" as const,
    sourcePackage: {
      schemaVersion: "approved-publish-package/1" as const,
      artifactRef: `state/${qotdPackagePath(built.date, brand.id)}`,
      packageHash: sha256(canonicalJson(built))
    },
    locale: "en" as const,
    variant: "A" as const,
    channel: "threads" as const,
    objective: "value_action" as const,
    audience: "Working developers who answer one code question a day",
    destination: brand.productUrl,
    utm: { source: "threads" as const, medium: "organic_social" as const, campaign: `${brand.qotd?.utmCampaign ?? "qotd"}`, content: `${built.date}-qotd-${built.question.id}`.slice(0, 200) },
    content: {
      text: built.post.text,
      // Threads takes a text post with no image and no alt text; the schema still wants a sentence.
      altText: "A text post with no image.",
      assetPaths: [],
      factualClaimRefs: [`marketingshark:qotd:${built.question.id}`],
      rendererVersion: "carousel-studio-1" as const,
      contentHash: "0".repeat(64)
    },
    publishWindow: { notBefore: built.publishWindow.notBefore, notAfter: built.publishWindow.notAfter },
    status: "draft" as const,
    checks: {
      schema: "pending" as const,
      brand: "pending" as const,
      claims: "pending" as const,
      quill: "pending" as const,
      keeper: "pending" as const,
      duplicate: "pending" as const,
      accessibility: "pending" as const,
      budget: "pending" as const,
      capability: "pending" as const,
      authority: "pending" as const,
      policy: "pending" as const
    },
    approvalProvenance: {
      approvalRef: AWAITING_OWNER_APPROVAL,
      selectionRef: `state/meetings/${built.date}-ms-daily.json`,
      policyRef: input.capabilityRef.decisionReference
    },
    selectedBy: "MAKO" as const,
    createdAt: input.now.toISOString(),
    attempt: null,
    receiptId: null,
    migration: null
  };
  return CapabilityAwareQueueItemSchema.parse({
    ...base,
    content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) }
  });
}

export type QotdOutcome =
  | { status: "drafted"; brandId: string; questionId: string; packagePath: string }
  | { status: "already-served"; brandId: string; questionId: string; packagePath: string }
  | { status: "skipped"; brandId: string; reason: string };

/**
 * The day's question of the day for one brand, or the reason there is none. Idempotent by date: a
 * rerun finds the package and writes nothing. The package and its queue draft are written together.
 */
export async function draftQotd(input: {
  brand: Brand;
  date: string;
  root: string;
  now: Date;
  loadSnapshot: () => Promise<QuestionBankSnapshot>;
  carouselLedger: MarketingSharkLedger;
  /** Null when the map does not allow the edge: the package is still written, the queue item is not. */
  capabilityRef: SocialCapabilityRef | null;
}): Promise<{ outcome: QotdOutcome; artifacts: string[] }> {
  const { brand, date } = input;
  const settings = brand.qotd;
  if (!settings?.enabled) {
    return { outcome: { status: "skipped", brandId: brand.id, reason: "the code question of the day is not enabled in config/marketingshark.json" }, artifacts: [] };
  }
  const relative = qotdPackagePath(date, brand.id);
  const existing = MarketingSharkQotdSchema.safeParse(await readJson<unknown>(input.root, relative, null));
  if (existing.success) {
    return { outcome: { status: "already-served", brandId: brand.id, questionId: existing.data.question.id, packagePath: `state/${relative}` }, artifacts: [] };
  }
  let snapshot: QuestionBankSnapshot;
  try {
    snapshot = await input.loadSnapshot();
  } catch (error) {
    return { outcome: { status: "skipped", brandId: brand.id, reason: `the question bank could not be read: ${error instanceof Error ? error.message : String(error)}` }, artifacts: [] };
  }
  const carousel = new Set((input.carouselLedger.brands[brand.id]?.served ?? []).map((entry) => entry.questionId));
  const question = selectQotdQuestion({
    snapshot,
    link: qotdLink(brand, settings, date),
    servedByQotd: await servedQotdIds(input.root, brand.id, date),
    servedByCarousel: carousel
  });
  if (!question) {
    return { outcome: { status: "skipped", brandId: brand.id, reason: "no question in the bank fits a Threads post without code" }, artifacts: [] };
  }
  const built = buildQotdPackage({ brand, settings, date, question, snapshot });
  await atomicWriteJson(input.root, relative, built);
  const artifacts = [relative];
  if (input.capabilityRef) {
    const queuePath = qotdQueueItemPath(date, brand.id);
    await atomicWriteJson(input.root, queuePath, buildQotdQueueItem({ built, brand, now: input.now, capabilityRef: input.capabilityRef }));
    artifacts.push(queuePath);
  }
  return { outcome: { status: "drafted", brandId: brand.id, questionId: question.id, packagePath: `state/${relative}` }, artifacts };
}
