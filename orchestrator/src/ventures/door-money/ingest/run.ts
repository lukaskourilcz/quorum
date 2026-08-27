import {
  BudgetLedgerEntrySchema,
  estimateEmbeddingCall,
  estimateTextCall,
  type BudgetLedgerEntry,
  type ReserveContext
} from "../../../budget.js";
import {
  guardedEmbeddingCall,
  type EmbeddingProvider
} from "../../../llm/embedding.js";
import { guardedJsonCall, type GuardedCallInput } from "../../../llm/call.js";
import { readJson } from "../../../state.js";
import type { StyleProfile } from "../../../contracts/style-profile.js";
import type { BookAnnotationRollups, AnnotatedBookChunk, BookIngestCall } from "./annotate.js";
import { chunkManuscript, type ChunkedManuscript } from "../../../manuscript-chunker.js";
import {
  bookIngestCycleId,
  manuscriptSha256,
  runResumableBookAnnotationPass
} from "./cursor.js";
import { dryBookIngestCall, dryEmbeddingVector } from "./dry-fixture.js";
import {
  assertBookIngestEnvelope,
  bookIngestEnvelopeStatus,
  BookIngestEnvelopeError
} from "./envelope.js";
import { runStyleProfilePass } from "./style.js";

export interface BookIngestEmbedding {
  id: string;
  embedding: number[];
}

export interface BookIngestPrivateArtifacts {
  manuscriptHash: string;
  manuscriptBytes: number;
  annotationModelVersion: string;
  rollupModelVersion: string;
  embeddingModelVersion: string;
  chunked: ChunkedManuscript;
  annotations: AnnotatedBookChunk[];
  rollups: BookAnnotationRollups;
  styleProfile: StyleProfile;
  embeddings: BookIngestEmbedding[];
}

export interface BookIngestCoverage {
  chapters: number;
  chunks: number;
  annotations: number;
  embeddings: number;
  styleExemplars: number;
}

export interface BookIngestReport {
  status: "complete" | "refused";
  reason: string | null;
  dry: boolean;
  reused: boolean;
  manuscriptHash: string | null;
  cycleId: string | null;
  actualUsd: number;
  dayUsd: number;
  programUsd: number;
  calls: number;
  coverage: BookIngestCoverage;
}

export interface BookIngestPrivateStore {
  summary(manuscriptHash: string): Promise<BookIngestReport | null>;
  writeVersion(artifacts: BookIngestPrivateArtifacts, report: BookIngestReport): Promise<void>;
}

export class MemoryBookIngestPrivateStore implements BookIngestPrivateStore {
  readonly versions = new Map<string, { artifacts: BookIngestPrivateArtifacts; report: BookIngestReport }>();

  async summary(manuscriptHash: string): Promise<BookIngestReport | null> {
    return this.versions.get(manuscriptHash)?.report ?? null;
  }

  async writeVersion(artifacts: BookIngestPrivateArtifacts, report: BookIngestReport): Promise<void> {
    if (this.versions.has(artifacts.manuscriptHash)) {
      throw new Error(`Private book version ${artifacts.manuscriptHash} already exists and cannot be mutated`);
    }
    this.versions.set(artifacts.manuscriptHash, { artifacts, report });
  }
}

const emptyCoverage = (): BookIngestCoverage => ({
  chapters: 0,
  chunks: 0,
  annotations: 0,
  embeddings: 0,
  styleExemplars: 0
});

async function ledger(root: string): Promise<BudgetLedgerEntry[]> {
  const raw = await readJson<{ entries?: unknown[] }>(root, "budget/ledger.json", {});
  return (raw.entries ?? []).map((entry) => BudgetLedgerEntrySchema.parse(entry));
}

function refused(input: {
  reason: string;
  dry: boolean;
  manuscriptHash?: string;
  cycleId?: string;
  entries: readonly BudgetLedgerEntry[];
  baselineEntries?: readonly BudgetLedgerEntry[];
  now: Date;
  coverage?: BookIngestCoverage;
}): BookIngestReport {
  const envelope = bookIngestEnvelopeStatus(input.entries, input.now);
  const cycleUsd = (entries: readonly BudgetLedgerEntry[]) => input.cycleId
    ? entries.filter((entry) => entry.cycleId === input.cycleId)
      .reduce((sum, entry) => sum + entry.usd, 0)
    : 0;
  const calls = input.cycleId
    ? input.entries.filter((entry) => entry.cycleId === input.cycleId).length -
      (input.baselineEntries ?? input.entries).filter((entry) => entry.cycleId === input.cycleId).length
    : 0;
  return {
    status: "refused",
    reason: input.reason,
    dry: input.dry,
    reused: false,
    manuscriptHash: input.manuscriptHash ?? null,
    cycleId: input.cycleId ?? null,
    actualUsd: Number(Math.max(
      0,
      cycleUsd(input.entries) - cycleUsd(input.baselineEntries ?? input.entries)
    ).toFixed(8)),
    dayUsd: envelope.dayUsd,
    programUsd: envelope.programUsd,
    calls: Math.max(0, calls),
    coverage: input.coverage ?? emptyCoverage()
  };
}

function envelopedCall(input: {
  stateRoot: string;
  now: Date;
  call: BookIngestCall;
  reserveContext: (entries: readonly BudgetLedgerEntry[], cycleId: string) => Promise<ReserveContext>;
}): BookIngestCall {
  return async function callWithinEnvelope<T>(request: GuardedCallInput<T>) {
    const entries = await ledger(input.stateRoot);
    const estimate = estimateTextCall({
      provider: request.provider,
      model: request.model,
      promptChars: request.system.length + request.input.length,
      maxOutputTokens: request.maxOutputTokens,
      at: input.now
    });
    assertBookIngestEnvelope(entries, input.now, estimate.estimatedUsd);
    return input.call({
      ...request,
      budgetContext: await input.reserveContext(entries, request.cycleId)
    });
  };
}

async function embeddings(input: {
  dry: boolean;
  stateRoot: string;
  cycleId: string;
  now: Date;
  chunks: ChunkedManuscript["chunks"];
  annotations: readonly AnnotatedBookChunk[];
  reserveContext: (entries: readonly BudgetLedgerEntry[], cycleId: string) => Promise<ReserveContext>;
  provider?: EmbeddingProvider;
}): Promise<{ items: BookIngestEmbedding[]; usd: number; calls: number }> {
  const byChunk = new Map(input.annotations.map((annotation) => [annotation.chunkId, annotation]));
  const items = input.chunks.map((chunk) => ({
    id: chunk.id,
    text: `${byChunk.get(chunk.id)!.summary}\n${chunk.text}`
  }));
  if (input.dry) {
    return {
      items: items.map(({ id, text }) => ({ id, embedding: dryEmbeddingVector(id, text) })),
      usd: 0,
      calls: 1
    };
  }
  const entries = await ledger(input.stateRoot);
  const estimate = estimateEmbeddingCall({
    model: "text-embedding-3-small",
    inputChars: items.reduce((sum, item) => sum + item.text.length, 0),
    at: input.now
  });
  assertBookIngestEnvelope(entries, input.now, estimate.estimatedUsd);
  const result = await guardedEmbeddingCall({
    stateRoot: input.stateRoot,
    cycleId: input.cycleId,
    items,
    budgetContext: await input.reserveContext(entries, input.cycleId),
    provider: input.provider
  });
  return { items: result.items, usd: result.usd, calls: 1 };
}

export async function runBookIngest(input: {
  source: string | null;
  stateRoot: string;
  privateRoot: string;
  privateStore?: BookIngestPrivateStore;
  approved: boolean;
  dry: boolean;
  now: Date;
  reserveContext: (entries: readonly BudgetLedgerEntry[], cycleId: string) => Promise<ReserveContext>;
  call?: BookIngestCall;
  embeddingProvider?: EmbeddingProvider;
}): Promise<BookIngestReport> {
  const openingLedger = await ledger(input.stateRoot);
  if (!input.source?.trim()) {
    return refused({ reason: "Manuscript file is missing or empty; nothing was spent.", dry: input.dry, entries: openingLedger, now: input.now });
  }
  if (!input.dry && !input.approved) {
    return refused({ reason: "BOOK-SOURCE-001 and BOOK-INGEST-002 are not both countersigned; nothing was spent.", dry: false, entries: openingLedger, now: input.now });
  }
  if (!input.privateStore) {
    return refused({ reason: "The configured private-store writer is unavailable; nothing was spent.", dry: input.dry, entries: openingLedger, now: input.now });
  }
  try {
    assertBookIngestEnvelope(openingLedger, input.now);
  } catch (error) {
    if (!(error instanceof BookIngestEnvelopeError)) throw error;
    return refused({ reason: `${error.message}; nothing was spent.`, dry: input.dry, entries: openingLedger, now: input.now });
  }

  const manuscriptHash = manuscriptSha256(input.source);
  const cycleId = bookIngestCycleId(manuscriptHash);
  const existing = await input.privateStore.summary(manuscriptHash);
  if (existing?.status === "complete") return { ...existing, reused: true };
  const chunked = chunkManuscript(input.source);
  const call = envelopedCall({
    stateRoot: input.stateRoot,
    now: input.now,
    call: input.call ?? (input.dry ? dryBookIngestCall : guardedJsonCall),
    reserveContext: input.reserveContext
  });
  const budgetContext = async () => input.reserveContext(await ledger(input.stateRoot), cycleId);

  try {
    const annotated = await runResumableBookAnnotationPass({
      chunked,
      manuscriptHash,
      privateRoot: input.privateRoot,
      stateRoot: input.stateRoot,
      budgetContext,
      call,
      now: () => input.now
    });
    const style = await runStyleProfilePass({
      chunked,
      annotations: annotated.annotations,
      manuscriptHash,
      stateRoot: input.stateRoot,
      cycleId,
      budgetContext,
      call,
      now: () => input.now
    });
    const embedded = await embeddings({
      dry: input.dry,
      stateRoot: input.stateRoot,
      cycleId,
      now: input.now,
      chunks: chunked.chunks,
      annotations: annotated.annotations,
      reserveContext: input.reserveContext,
      provider: input.embeddingProvider
    });
    const finalLedger = await ledger(input.stateRoot);
    const envelope = bookIngestEnvelopeStatus(finalLedger, input.now);
    const coverage = {
      chapters: chunked.chapters.length,
      chunks: chunked.chunks.length,
      annotations: annotated.annotations.length,
      embeddings: embedded.items.length,
      styleExemplars: style.profile.exemplarBank.length
    };
    const report: BookIngestReport = {
      status: "complete",
      reason: null,
      dry: input.dry,
      reused: false,
      manuscriptHash,
      cycleId,
      actualUsd: Number((annotated.actualUsd + style.actualUsd + embedded.usd).toFixed(8)),
      dayUsd: envelope.dayUsd,
      programUsd: envelope.programUsd,
      calls: annotated.calls + style.calls + embedded.calls,
      coverage
    };
    await input.privateStore.writeVersion({
      manuscriptHash,
      manuscriptBytes: Buffer.byteLength(input.source, "utf8"),
      annotationModelVersion: annotated.modelVersion,
      rollupModelVersion: annotated.modelVersion,
      embeddingModelVersion: style.profile.modelVersions.embedding,
      chunked,
      annotations: annotated.annotations,
      rollups: annotated.rollups,
      styleProfile: style.profile,
      embeddings: embedded.items
    }, report);
    return report;
  } catch (error) {
    if (!(error instanceof BookIngestEnvelopeError)) throw error;
    const current = await ledger(input.stateRoot);
    return refused({
      reason: `${error.message}; the cursor is preserved and no further call was made.`,
      dry: input.dry,
      manuscriptHash,
      cycleId,
      entries: current,
      baselineEntries: openingLedger,
      now: input.now,
      coverage: { ...emptyCoverage(), chapters: chunked.chapters.length, chunks: chunked.chunks.length }
    });
  }
}
