import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  BhDossierSchema,
  BhDossierSynthesisSchema,
  BhResearchLedgerEntrySchema,
  BhVerificationStateSchema,
  type BhDossier,
  type BhDossierSynthesis,
  type BhResearchLedgerEntry
} from "../../contracts/bh-dossier.js";
import type { BhResearchBriefEntry } from "../../contracts/bh-research-brief.js";
import type { BhSeedRecord } from "../../contracts/bh-seed.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import type { RawResearch, ResearchProvider } from "../../research/provider.js";
import { atomicWriteJson, readJson } from "../../state.js";
import { BH_SHELF_STORY_THRESHOLD } from "./score.js";

export const BH_DOSSIER_STALE_DAYS = 90;
export const BH_RESEARCH_LEDGER_PATH = "ventures/booksofhistory/research-ledger.jsonl";

export interface BhResearchPrecheck {
  existingDossier: boolean;
  questionAnswered: boolean;
  trustworthy: boolean;
  stale: boolean;
  shelfSufficient: boolean;
  decision: "research" | "reuse";
  reason: "missing-dossier" | "unanswered-question" | "untrustworthy" | "stale" | "thin-shelf" | "shelf-sufficient";
}

function ageDays(instant: string, now: Date): number {
  return (now.getTime() - new Date(instant).getTime()) / 86_400_000;
}

/** Record all five checks even when the first one already establishes that research is needed. */
export function assessBhResearchNeed(input: {
  dossier: unknown | null;
  briefHash: string;
  now: Date;
}): BhResearchPrecheck {
  const parsed = BhDossierSchema.safeParse(input.dossier);
  const dossier = parsed.success ? parsed.data : null;
  const existingDossier = input.dossier !== null;
  const questionAnswered = dossier?.answeredBriefHashes.includes(input.briefHash) ?? false;
  const suitableClaims = new Set((dossier?.claims ?? [])
    .filter((claim) => claim.publicationSuitable && !["legend", "rejected"].includes(claim.verificationState))
    .map(({ claimId }) => claimId));
  const trustworthy = dossier !== null && suitableClaims.size > 0;
  const stale = dossier !== null && ageDays(dossier.updatedAt, input.now) > BH_DOSSIER_STALE_DAYS;
  const shelfSufficient = dossier?.storyCandidates.some((story) =>
    !story.used &&
    story.score >= BH_SHELF_STORY_THRESHOLD &&
    story.claimRefs.every((claimRef) => suitableClaims.has(claimRef))) ?? false;

  let reason: BhResearchPrecheck["reason"] = "shelf-sufficient";
  if (!existingDossier) reason = "missing-dossier";
  else if (!questionAnswered) reason = "unanswered-question";
  else if (!trustworthy) reason = "untrustworthy";
  else if (stale) reason = "stale";
  else if (!shelfSufficient) reason = "thin-shelf";
  return {
    existingDossier,
    questionAnswered,
    trustworthy,
    stale,
    shelfSufficient,
    decision: reason === "shelf-sufficient" ? "reuse" : "research",
    reason
  };
}

export function bhDossierPath(bookId: string): string {
  return `ventures/booksofhistory/dossiers/${bookId}/dossier.json`;
}

export function bhRawResearchPath(bookId: string, briefHash: string): string {
  return `ventures/booksofhistory/dossiers/${bookId}/raw/${briefHash}.json`;
}

export function parseBhResearchLedgerJsonl(raw: string): BhResearchLedgerEntry[] {
  return raw.split(/\r?\n/u).filter(Boolean).map((line) =>
    BhResearchLedgerEntrySchema.parse(JSON.parse(line))
  );
}

/** Validate the complete existing ledger, then append new immutable lines without rewriting it. */
export async function appendBhResearchLedger(
  root: string,
  entries: readonly BhResearchLedgerEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  const file = path.join(root, BH_RESEARCH_LEDGER_PATH);
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  parseBhResearchLedgerJsonl(existing);
  const parsed = entries.map((entry) => BhResearchLedgerEntrySchema.parse(entry));
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, parsed.map((entry) => `${JSON.stringify(entry)}\n`).join(""), "utf8");
}

export type BhSynthCallConfig = Omit<
  GuardedCallInput<BhDossierSynthesis>,
  "input" | "parse"
>;

function synthPacket(input: {
  book: BhSeedRecord;
  brief: BhResearchBriefEntry;
  raw: RawResearch;
}): string {
  return JSON.stringify({
    book: {
      bookId: input.book.bookId,
      title: input.book.title,
      originalTitle: input.book.originalTitle,
      author: input.book.author,
      year: input.book.year,
      originalLanguage: input.book.originalLanguage,
      genres: input.book.genres,
      contentCategories: input.book.contentCategories
    },
    brief: {
      objective: input.brief.objective,
      investigateSpecifically: input.brief.investigateSpecifically,
      lookFor: input.brief.lookFor,
      avoid: input.brief.avoid
    },
    rawResearch: input.raw.response,
    constraints: {
      quoteMaximumCharacters: 300,
      quoteAttributionRequired: true,
      coverArtworkForbidden: true,
      acceptedInitialStates: BhVerificationStateSchema.options
    }
  });
}

export type BhCandidateResearchResult =
  | { status: "reused"; precheck: BhResearchPrecheck; dossier: BhDossier }
  | { status: "researched"; precheck: BhResearchPrecheck; dossier: BhDossier; rawRef: string; dossierRef: string };

/** The sole writer for normalized BOOKSOFHISTORY dossiers and their retained raw response. */
export async function runBhCandidateResearch(input: {
  root: string;
  book: BhSeedRecord;
  brief: BhResearchBriefEntry;
  provider: ResearchProvider;
  gatherEnvelopeUsd: number;
  researchedAt: Date;
  requestingMeetingRef: string;
  synthCallConfig: BhSynthCallConfig;
  synthCall?: typeof guardedJsonCall;
}): Promise<BhCandidateResearchResult> {
  const dossierRef = bhDossierPath(input.book.bookId);
  const stored = await readJson<unknown | null>(input.root, dossierRef, null);
  const precheck = assessBhResearchNeed({
    dossier: stored,
    briefHash: input.brief.briefHash,
    now: input.researchedAt
  });
  if (precheck.decision === "reuse") {
    return { status: "reused", precheck, dossier: BhDossierSchema.parse(stored) };
  }

  const raw = await input.provider.researchBook({
    bookRef: input.brief.bookRef,
    brief: input.brief,
    envelopeUsd: input.gatherEnvelopeUsd
  });
  const synth = input.synthCall ?? guardedJsonCall;
  const normalized = await synth({
    ...input.synthCallConfig,
    input: synthPacket({ book: input.book, brief: input.brief, raw }),
    parse: (text) => BhDossierSynthesisSchema.parse(JSON.parse(text))
  });
  const rawRef = bhRawResearchPath(input.book.bookId, input.brief.briefHash);
  const previous = BhDossierSchema.safeParse(stored);
  const dossier = BhDossierSchema.parse({
    schemaVersion: "bh-dossier/1",
    bookId: input.book.bookId,
    bookRef: input.brief.bookRef,
    title: input.book.title,
    author: input.book.author,
    answeredBriefHashes: [...new Set([
      ...(previous.success ? previous.data.answeredBriefHashes : []),
      input.brief.briefHash
    ])],
    rawRefs: [...new Set([...(previous.success ? previous.data.rawRefs : []), rawRef])],
    supplementRefs: previous.success ? previous.data.supplementRefs : [],
    researchedAt: previous.success ? previous.data.researchedAt : input.researchedAt.toISOString(),
    updatedAt: input.researchedAt.toISOString(),
    ...BhDossierSynthesisSchema.parse(normalized.value)
  });
  await atomicWriteJson(input.root, rawRef, {
    schemaVersion: "bh-raw-research/1",
    bookId: input.book.bookId,
    bookRef: input.brief.bookRef,
    briefHash: input.brief.briefHash,
    retainedAt: input.researchedAt.toISOString(),
    research: raw
  });
  await atomicWriteJson(input.root, dossierRef, dossier);
  if (precheck.reason === "shelf-sufficient") {
    throw new Error("A reused shelf dossier cannot reach the research ledger writer");
  }
  const synthUsage = normalized.usage;
  await appendBhResearchLedger(input.root, [
    BhResearchLedgerEntrySchema.parse({
      schemaVersion: "bh-research-ledger/1",
      step: "gather",
      provider: raw.providerId,
      model: raw.model,
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      bookId: input.book.bookId,
      bookRef: input.brief.bookRef,
      briefHash: input.brief.briefHash,
      reason: precheck.reason,
      tokensIn: raw.tokensIn,
      tokensOut: raw.tokensOut,
      searches: raw.searchUses,
      costUsd: raw.usd,
      requestingMeetingRef: input.requestingMeetingRef,
      rawRef,
      dossierRef,
      used: false
    }),
    BhResearchLedgerEntrySchema.parse({
      schemaVersion: "bh-research-ledger/1",
      step: "synth",
      provider: input.synthCallConfig.provider,
      model: synthUsage?.model ?? input.synthCallConfig.model,
      startedAt: input.researchedAt.toISOString(),
      completedAt: input.researchedAt.toISOString(),
      bookId: input.book.bookId,
      bookRef: input.brief.bookRef,
      briefHash: input.brief.briefHash,
      reason: precheck.reason,
      tokensIn: synthUsage?.tokensIn ?? 0,
      tokensOut: synthUsage?.tokensOut ?? 0,
      searches: 0,
      costUsd: normalized.usd,
      requestingMeetingRef: input.requestingMeetingRef,
      rawRef,
      dossierRef,
      used: false
    })
  ]);
  return { status: "researched", precheck, dossier, rawRef, dossierRef };
}
