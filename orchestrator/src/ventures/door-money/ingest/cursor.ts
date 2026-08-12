import { createHash } from "node:crypto";
import { z } from "zod";
import type { ReserveContext } from "../../../budget.js";
import {
  BookChapterRollupSchema,
  BookEntityRollupSchema,
  BookThemeRollupSchema
} from "../../../contracts/book-kb-index.js";
import { guardedJsonCall } from "../../../llm/call.js";
import { atomicWriteJson, readJson } from "../../../state.js";
import {
  AnnotatedBookChunkSchema,
  annotateBookChunk,
  loadBookIngestRoute,
  rollupBookAnnotations,
  type AnnotatedBookChunk,
  type BookAnnotationPassResult,
  type BookAnnotationRollups,
  type BookIngestCall,
  type BookIngestCallContext,
  type BookIngestRoute
} from "./annotate.js";
import type { ChunkedManuscript } from "./chunker.js";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const RollupsSchema = z.strictObject({
  chapters: z.array(BookChapterRollupSchema),
  entityIndex: z.array(BookEntityRollupSchema),
  themeIndex: z.array(BookThemeRollupSchema)
});

export const BookIngestCursorSchema = z.strictObject({
  schemaVersion: z.literal("book-ingest-cursor/1"),
  manuscriptHash: Sha256Schema,
  chunkSetHash: Sha256Schema,
  cycleId: z.string().regex(/^book-ingest-[a-f0-9]{16}$/),
  modelVersion: z.string().trim().min(1),
  status: z.enum(["annotating", "rolling-up", "complete"]),
  nextChunkIndex: z.number().int().nonnegative(),
  annotations: z.array(AnnotatedBookChunkSchema),
  rollups: RollupsSchema.nullable(),
  actualUsd: z.number().finite().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((cursor, context) => {
  if (cursor.nextChunkIndex !== cursor.annotations.length) {
    context.addIssue({ code: "custom", path: ["nextChunkIndex"], message: "Cursor index must match saved annotations" });
  }
  if ((cursor.status === "complete") !== (cursor.rollups !== null)) {
    context.addIssue({ code: "custom", path: ["rollups"], message: "Only a complete cursor carries rollups" });
  }
});

const VersionEntrySchema = z.strictObject({
  manuscriptHash: Sha256Schema,
  status: z.enum(["current", "superseded"]),
  createdAt: z.string().datetime(),
  supersededAt: z.string().datetime().nullable(),
  supersededBy: Sha256Schema.nullable()
});

export const BookKbVersionsSchema = z.strictObject({
  schemaVersion: z.literal("book-kb-versions/1"),
  currentManuscriptHash: Sha256Schema,
  versions: z.array(VersionEntrySchema).min(1)
}).superRefine((manifest, context) => {
  const hashes = manifest.versions.map(({ manuscriptHash }) => manuscriptHash);
  if (new Set(hashes).size !== hashes.length) {
    context.addIssue({ code: "custom", path: ["versions"], message: "Manuscript versions must be unique" });
  }
  const current = manifest.versions.filter(({ status }) => status === "current");
  if (current.length !== 1 || current[0]?.manuscriptHash !== manifest.currentManuscriptHash) {
    context.addIssue({ code: "custom", path: ["currentManuscriptHash"], message: "Manifest requires one matching current version" });
  }
});

export type BookIngestCursor = z.infer<typeof BookIngestCursorSchema>;
export type BookKbVersions = z.infer<typeof BookKbVersionsSchema>;

export function manuscriptSha256(source: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function hashHex(manuscriptHash: string): string {
  return Sha256Schema.parse(manuscriptHash).slice("sha256:".length);
}

export function bookIngestCycleId(manuscriptHash: string): string {
  return `book-ingest-${hashHex(manuscriptHash).slice(0, 16)}`;
}

export function bookIngestCursorPath(manuscriptHash: string): string {
  return `kb/versions/${hashHex(manuscriptHash)}/ingestion-cursor.json`;
}

function chunkSetHash(chunked: ChunkedManuscript): string {
  return manuscriptSha256(JSON.stringify(chunked.chunks.map((chunk) => ({
    id: chunk.id,
    byteOffsets: chunk.byteOffsets,
    estimatedTokens: chunk.estimatedTokens
  }))));
}

async function currentActualUsd(budgetContext: () => Promise<ReserveContext>, cycleId: string): Promise<number> {
  const context = await budgetContext();
  return Number(context.ledger
    .filter((entry) => entry.cycleId === cycleId)
    .reduce((sum, entry) => sum + entry.usd, 0)
    .toFixed(8));
}

async function ensureVersionManifest(input: {
  privateRoot: string;
  manuscriptHash: string;
  now: () => Date;
}): Promise<void> {
  const raw = await readJson<unknown>(input.privateRoot, "kb/versions.json", null);
  const at = input.now().toISOString();
  if (raw === null) {
    await atomicWriteJson(input.privateRoot, "kb/versions.json", BookKbVersionsSchema.parse({
      schemaVersion: "book-kb-versions/1",
      currentManuscriptHash: input.manuscriptHash,
      versions: [{
        manuscriptHash: input.manuscriptHash,
        status: "current",
        createdAt: at,
        supersededAt: null,
        supersededBy: null
      }]
    }));
    return;
  }
  const manifest = BookKbVersionsSchema.parse(raw);
  if (manifest.currentManuscriptHash === input.manuscriptHash) return;
  const existing = manifest.versions.find(({ manuscriptHash }) => manuscriptHash === input.manuscriptHash);
  const versions = manifest.versions.map((version) => version.status === "current"
    ? { ...version, status: "superseded" as const, supersededAt: at, supersededBy: input.manuscriptHash }
    : version);
  if (existing) {
    const index = versions.findIndex(({ manuscriptHash }) => manuscriptHash === input.manuscriptHash);
    versions[index] = { ...existing, status: "current", supersededAt: null, supersededBy: null };
  } else {
    versions.push({
      manuscriptHash: input.manuscriptHash,
      status: "current",
      createdAt: at,
      supersededAt: null,
      supersededBy: null
    });
  }
  await atomicWriteJson(input.privateRoot, "kb/versions.json", BookKbVersionsSchema.parse({
    schemaVersion: "book-kb-versions/1",
    currentManuscriptHash: input.manuscriptHash,
    versions
  }));
}

async function loadCursor(input: {
  privateRoot: string;
  manuscriptHash: string;
  chunked: ChunkedManuscript;
  route: BookIngestRoute;
  now: () => Date;
}): Promise<BookIngestCursor> {
  const relativePath = bookIngestCursorPath(input.manuscriptHash);
  const stored = await readJson<unknown>(input.privateRoot, relativePath, null);
  const expectedChunkSetHash = chunkSetHash(input.chunked);
  if (stored === null) {
    const at = input.now().toISOString();
    const cursor = BookIngestCursorSchema.parse({
      schemaVersion: "book-ingest-cursor/1",
      manuscriptHash: input.manuscriptHash,
      chunkSetHash: expectedChunkSetHash,
      cycleId: bookIngestCycleId(input.manuscriptHash),
      modelVersion: input.route.model,
      status: "annotating",
      nextChunkIndex: 0,
      annotations: [],
      rollups: null,
      actualUsd: 0,
      createdAt: at,
      updatedAt: at
    });
    await atomicWriteJson(input.privateRoot, relativePath, cursor);
    return cursor;
  }
  const cursor = BookIngestCursorSchema.parse(stored);
  if (cursor.manuscriptHash !== input.manuscriptHash ||
      cursor.cycleId !== bookIngestCycleId(input.manuscriptHash)) {
    throw new Error("Saved ingestion cursor identity does not match this manuscript version");
  }
  if (cursor.chunkSetHash !== expectedChunkSetHash) {
    throw new Error("Saved ingestion cursor does not match this deterministic chunk set");
  }
  if (cursor.modelVersion !== input.route.model) {
    throw new Error("Saved ingestion cursor uses a different BOOK_INGEST model version");
  }
  for (const [index, annotation] of cursor.annotations.entries()) {
    if (annotation.chunkId !== input.chunked.chunks[index]?.id) {
      throw new Error("Saved ingestion cursor annotations are not the leading chunk sequence");
    }
  }
  if (cursor.nextChunkIndex > input.chunked.chunks.length) {
    throw new Error("Saved ingestion cursor is past the end of the chunk set");
  }
  return cursor;
}

export async function runResumableBookAnnotationPass(input: {
  chunked: ChunkedManuscript;
  manuscriptHash: string;
  privateRoot: string;
  stateRoot: string;
  budgetContext: () => Promise<ReserveContext>;
  route?: BookIngestRoute;
  call?: BookIngestCall;
  now?: () => Date;
  /** Test/process-boundary hook: an interruption here models death after billing, before rename. */
  beforeChunkCheckpoint?: (chunkIndex: number) => Promise<void>;
}): Promise<BookAnnotationPassResult> {
  Sha256Schema.parse(input.manuscriptHash);
  const now = input.now ?? (() => new Date());
  const route = input.route ?? await loadBookIngestRoute();
  await ensureVersionManifest({ privateRoot: input.privateRoot, manuscriptHash: input.manuscriptHash, now });
  let cursor = await loadCursor({
    privateRoot: input.privateRoot,
    manuscriptHash: input.manuscriptHash,
    chunked: input.chunked,
    route,
    now
  });
  const context: BookIngestCallContext = {
    stateRoot: input.stateRoot,
    cycleId: cursor.cycleId,
    route,
    budgetContext: input.budgetContext,
    call: input.call ?? guardedJsonCall
  };
  if (cursor.status === "complete") {
    return {
      annotations: cursor.annotations,
      rollups: cursor.rollups as BookAnnotationRollups,
      modelVersion: cursor.modelVersion,
      calls: input.chunked.chunks.length + input.chunked.chapters.length + 1,
      actualUsd: await currentActualUsd(input.budgetContext, cursor.cycleId)
    };
  }

  const annotations: AnnotatedBookChunk[] = [...cursor.annotations];
  for (let index = cursor.nextChunkIndex; index < input.chunked.chunks.length; index += 1) {
    const result = await annotateBookChunk({ chunk: input.chunked.chunks[index]!, context });
    await input.beforeChunkCheckpoint?.(index);
    annotations.push(result.annotation);
    const updatedAt = now().toISOString();
    cursor = BookIngestCursorSchema.parse({
      ...cursor,
      status: "annotating",
      nextChunkIndex: annotations.length,
      annotations,
      rollups: null,
      actualUsd: await currentActualUsd(input.budgetContext, cursor.cycleId),
      updatedAt
    });
    await atomicWriteJson(input.privateRoot, bookIngestCursorPath(input.manuscriptHash), cursor);
  }

  cursor = BookIngestCursorSchema.parse({
    ...cursor,
    status: "rolling-up",
    nextChunkIndex: annotations.length,
    annotations,
    rollups: null,
    actualUsd: await currentActualUsd(input.budgetContext, cursor.cycleId),
    updatedAt: now().toISOString()
  });
  await atomicWriteJson(input.privateRoot, bookIngestCursorPath(input.manuscriptHash), cursor);
  const rolled = await rollupBookAnnotations({ chunked: input.chunked, annotations, context });
  cursor = BookIngestCursorSchema.parse({
    ...cursor,
    status: "complete",
    rollups: rolled.rollups,
    actualUsd: await currentActualUsd(input.budgetContext, cursor.cycleId),
    updatedAt: now().toISOString()
  });
  await atomicWriteJson(input.privateRoot, bookIngestCursorPath(input.manuscriptHash), cursor);
  return {
    annotations,
    rollups: rolled.rollups,
    modelVersion: cursor.modelVersion,
    calls: input.chunked.chunks.length + rolled.calls,
    actualUsd: cursor.actualUsd
  };
}
