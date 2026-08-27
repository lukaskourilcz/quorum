import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  PersonalGrowthJournalMetadataSchema,
  PersonalGrowthLeakAuditSchema,
  type PersonalGrowthJournalMetadata,
  type PersonalGrowthLeakAudit
} from "../../contracts/personal-growth.js";
import { atomicWriteJson, readJson } from "../../state.js";
import { chunkManuscript } from "../../manuscript-chunker.js";
import { personalGrowthHash } from "./planner.js";

export type PersonalGrowthJournalLanguage = "cs" | "en";

export interface PersonalGrowthJournalIngestResult {
  status: "complete" | "reused" | "refused";
  reason: "none" | "missing-source" | "private-store-unavailable" | "invalid-language" | "invalid-title" | "budget-exhausted";
  metadata: PersonalGrowthJournalMetadata | null;
  actualUsd: number;
}

const PrivateJournalChunksSchema = z.strictObject({
  schemaVersion: z.literal("private-personal-growth-journal-chunks/1"),
  language: z.enum(["cs", "en"]),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  chunks: z.array(z.strictObject({
    id: z.string().min(1),
    text: z.string().min(1),
    byteOffsets: z.strictObject({
      start: z.number().int().nonnegative(),
      end: z.number().int().positive()
    }),
    estimatedTokens: z.number().int().positive()
  })).min(1)
});

function separatedRoots(privateRoot: string, publicStateRoot: string): boolean {
  const privatePath = path.resolve(privateRoot);
  const publicPath = path.resolve(publicStateRoot);
  const privateFromPublic = path.relative(publicPath, privatePath);
  const publicFromPrivate = path.relative(privatePath, publicPath);
  const nested = (relative: string) => relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  return !nested(privateFromPublic) && !nested(publicFromPrivate);
}

function words(value: string): string[] {
  return value.toLocaleLowerCase("und").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

function sentences(value: string): string[] {
  return value.split(/(?<=[.!?])\s+|\n+/u).map((part) => part.trim()).filter(Boolean);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

export function measurePersonalGrowthJournalStyle(source: string): PersonalGrowthJournalMetadata["style"] {
  const sentenceLengths = sentences(source).map((sentence) => words(sentence).length).filter((length) => length > 0);
  if (sentenceLengths.length === 0) throw new Error("Journal style analysis requires at least one sentence");
  const paragraphs = source.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean);
  const punctuation = source.match(/[.,!?;:—–-]/gu)?.length ?? 0;
  return {
    sampledSentences: sentenceLengths.length,
    meanWordsPerSentence: rounded(sentenceLengths.reduce((sum, value) => sum + value, 0) / sentenceLengths.length),
    medianWordsPerSentence: rounded(median(sentenceLengths)),
    fragmentRatio: rounded(sentenceLengths.filter((length) => length <= 4).length / sentenceLengths.length),
    oneSentenceParagraphRatio: rounded(paragraphs.filter((paragraph) => sentences(paragraph).length === 1).length / paragraphs.length),
    punctuationDensity: rounded(punctuation / Math.max(1, [...source].length))
  };
}

function ngrams(value: string, size: number): Set<string> {
  const tokens = words(value);
  const result = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

function similarity(left: string, right: string): number {
  const leftSet = ngrams(left, 5);
  const rightSet = ngrams(right, 5);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  const common = [...leftSet].filter((value) => rightSet.has(value)).length;
  return rounded(common / (leftSet.size + rightSet.size - common));
}

function matchingQuoteCharacters(candidate: string, source: string): number {
  const candidateWords = words(candidate);
  const normalizedSource = words(source).join(" ");
  let longest = 0;
  for (let start = 0; start < candidateWords.length; start += 1) {
    let phrase = "";
    for (let end = start; end < Math.min(candidateWords.length, start + 40); end += 1) {
      phrase = phrase ? `${phrase} ${candidateWords[end]}` : candidateWords[end]!;
      if (!normalizedSource.includes(phrase)) break;
      longest = Math.max(longest, phrase.length);
    }
  }
  return longest;
}

function hasPrivateSerialization(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasPrivateSerialization);
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    /(?:manuscript|sourceText|chunkText|embedding|rawPrompt|rawResponse|unpublishedText)/iu.test(key)
    || hasPrivateSerialization(entry));
}

/**
 * One fail-closed gate for public artifacts, logs, fixtures and meeting payloads. Callers must
 * discard blocked text; the audit deliberately returns counts and booleans, never the suspect text.
 */
export function auditPersonalGrowthOutput(input: {
  candidate: string;
  privateSources: readonly string[];
  serializedValue?: unknown;
  maximumQuoteCharacters?: number;
  maximumSimilarity?: number;
}): PersonalGrowthLeakAudit {
  const maximumQuoteCharacters = input.maximumQuoteCharacters ?? 120;
  const maximumSimilarity = input.maximumSimilarity ?? 0.35;
  const candidateLong = ngrams(input.candidate, 12);
  const exactLongNgram = input.privateSources.some((source) => {
    const sourceLong = ngrams(source, 12);
    return [...candidateLong].some((gram) => sourceLong.has(gram));
  });
  const similarityScore = input.privateSources.reduce((highest, source) => Math.max(highest, similarity(input.candidate, source)), 0);
  const quoteCharacters = input.privateSources.reduce((highest, source) => Math.max(highest, matchingQuoteCharacters(input.candidate, source)), 0);
  const serializedPrivateField = hasPrivateSerialization(input.serializedValue);
  const safeToPersistPublicly = !exactLongNgram
    && similarityScore <= maximumSimilarity
    && quoteCharacters <= maximumQuoteCharacters
    && !serializedPrivateField;
  return PersonalGrowthLeakAuditSchema.parse({
    schemaVersion: "personal-growth-leak-audit/1",
    status: safeToPersistPublicly ? "pass" : "blocked",
    exactLongNgram,
    similarity: similarityScore,
    quoteCharacters,
    serializedPrivateField,
    safeToPersistPublicly
  });
}

function privateVersionPath(language: PersonalGrowthJournalLanguage, sourceHash: string, tail: string): string {
  return `journal/${language}/versions/${sourceHash}/${tail}`;
}

function publicMetadataPath(language: PersonalGrowthJournalLanguage): string {
  return `ventures/personal-growth/journal/${language}.json`;
}

export class PersonalGrowthPrivateJournalStore {
  constructor(readonly privateRoot: string, readonly publicStateRoot: string) {
    if (!separatedRoots(privateRoot, publicStateRoot)) {
      throw new Error("Personal Growth private journal and public state roots must not overlap");
    }
  }

  async current(language: PersonalGrowthJournalLanguage): Promise<PersonalGrowthJournalMetadata | null> {
    const raw = await readJson<unknown>(this.publicStateRoot, publicMetadataPath(language), null);
    return raw === null ? null : PersonalGrowthJournalMetadataSchema.parse(raw);
  }

  async privateChunks(language: PersonalGrowthJournalLanguage, sourceHash: string): Promise<Array<{ id: string; text: string }>> {
    const raw = await readJson<unknown>(this.privateRoot, privateVersionPath(language, sourceHash, "chunks.json"), null);
    const parsed = PrivateJournalChunksSchema.safeParse(raw);
    if (!parsed.success || parsed.data.language !== language || parsed.data.sourceHash !== sourceHash) {
      throw new Error(`The ${language.toUpperCase()} private journal lane is unavailable`);
    }
    return parsed.data.chunks.map(({ id, text }) => ({ id, text }));
  }

  async write(input: {
    language: PersonalGrowthJournalLanguage;
    title: string;
    source: string;
    now: Date;
    degradation?: "healthy" | "reduced" | "low" | "critical" | "exhausted";
  }): Promise<PersonalGrowthJournalIngestResult> {
    if (input.language !== "cs" && input.language !== "en") {
      return { status: "refused", reason: "invalid-language", metadata: null, actualUsd: 0 };
    }
    if (!input.source.trim()) return { status: "refused", reason: "missing-source", metadata: null, actualUsd: 0 };
    if (!input.title.trim() || input.title.length > 200 || /[\r\n]/u.test(input.title)) {
      return { status: "refused", reason: "invalid-title", metadata: null, actualUsd: 0 };
    }
    if (input.degradation === "exhausted") return { status: "refused", reason: "budget-exhausted", metadata: null, actualUsd: 0 };
    const sourceHash = personalGrowthHash(input.source);
    const versionId = `pg-journal-${input.language}-${sourceHash.slice(-16)}`;
    const existing = await this.current(input.language);
    if (existing?.sourceHash === sourceHash) {
      return { status: "reused", reason: "none", metadata: existing, actualUsd: 0 };
    }
    const wrapped = `# Chapter 1: ${input.title}\n## Scene 1\n${input.source.trim()}\n`;
    const chunked = chunkManuscript(wrapped, { minTokens: 120, targetTokens: 240, maxTokens: 360, contextRatio: 0.1 });
    const metadata = PersonalGrowthJournalMetadataSchema.parse({
      schemaVersion: "personal-growth-journal-metadata/1",
      language: input.language,
      sourceHash,
      titleHash: personalGrowthHash(input.title),
      versionId,
      status: "current",
      generatedAt: input.now.toISOString(),
      chunkCount: chunked.chunks.length,
      retrievalAvailable: true,
      style: measurePersonalGrowthJournalStyle(input.source),
      cost: {
        actualUsd: 0,
        monthlyCapUsd: 20,
        degradation: input.degradation ?? "healthy"
      }
    });
    await atomicWriteJson(this.privateRoot, privateVersionPath(input.language, sourceHash, "source.json"), {
      schemaVersion: "private-personal-growth-journal-source/1",
      language: input.language,
      sourceHash,
      title: input.title,
      source: input.source
    });
    await atomicWriteJson(this.privateRoot, privateVersionPath(input.language, sourceHash, "chunks.json"), {
      schemaVersion: "private-personal-growth-journal-chunks/1",
      language: input.language,
      sourceHash,
      chunks: chunked.chunks.map(({ id, text, byteOffsets, estimatedTokens }) => ({ id, text, byteOffsets, estimatedTokens }))
    });
    await atomicWriteJson(this.privateRoot, privateVersionPath(input.language, sourceHash, "style-profile.json"), {
      schemaVersion: "private-personal-growth-journal-style/1",
      language: input.language,
      sourceHash,
      style: metadata.style
    });
    // Public Git state receives only the bounded, non-reconstructive metadata contract.
    await atomicWriteJson(this.publicStateRoot, publicMetadataPath(input.language), metadata);
    await atomicWriteJson(this.privateRoot, privateVersionPath(input.language, sourceHash, "complete.json"), metadata);
    return { status: "complete", reason: "none", metadata, actualUsd: 0 };
  }
}

export async function openPersonalGrowthPrivateJournalStore(input: {
  privateRoot: string;
  publicStateRoot: string;
  requireGitClone?: boolean;
}): Promise<PersonalGrowthPrivateJournalStore> {
  if (input.requireGitClone ?? true) await access(path.join(input.privateRoot, ".git"));
  return new PersonalGrowthPrivateJournalStore(input.privateRoot, input.publicStateRoot);
}

export async function ingestPersonalGrowthJournalFile(input: {
  filePath: string;
  language: PersonalGrowthJournalLanguage;
  title: string;
  store: PersonalGrowthPrivateJournalStore;
  now: Date;
  degradation?: "healthy" | "reduced" | "low" | "critical" | "exhausted";
}): Promise<PersonalGrowthJournalIngestResult> {
  const source = await readFile(input.filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (source === null) return { status: "refused", reason: "missing-source", metadata: null, actualUsd: 0 };
  return input.store.write({
    language: input.language,
    title: input.title,
    source,
    now: input.now,
    degradation: input.degradation
  });
}

export function personalGrowthThreadsStyleGuidance(metadata: PersonalGrowthJournalMetadata) {
  const value = PersonalGrowthJournalMetadataSchema.parse(metadata);
  return {
    schemaVersion: "personal-growth-threads-style-guidance/1" as const,
    language: value.language,
    sourceVersionId: value.versionId,
    structuralTraits: value.style,
    originalityRequired: true as const,
    quotationAllowed: false as const,
    eventClaims: "owner-evidence-only" as const,
    automaticTranslation: false as const
  };
}
