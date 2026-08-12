import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  BookChunkIdSchema,
  BookKbIndexSchema,
  type BookKbIndex
} from "../../contracts/book-kb-index.js";
import { DateSchema } from "../../contracts/common.js";
import {
  StyleProfileSchema,
  type StyleExemplar,
  type StyleProfile
} from "../../contracts/style-profile.js";
import {
  VentureRecommendationSchema,
  type VentureRecommendation
} from "../../contracts/venture-recommendation.js";
import { repoRoot } from "../../paths.js";
import { AnnotatedBookChunkSchema } from "./ingest/annotate.js";
import type { ManuscriptChunk } from "./ingest/chunker.js";
import type { BookIngestEmbedding } from "./ingest/run.js";
import {
  doorMoneyHookStyle,
  type DoorMoneyFormat,
  type PassageSelectionOutcome,
  type SelectedPassage,
  type SelectionPerformanceWeights
} from "./select.js";

const HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ByteRangeSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive()
}).refine(({ start, end }) => end > start, "Byte ranges must be nonempty");
const ContextWindowSchema = z.strictObject({
  text: z.string(),
  byteOffsets: ByteRangeSchema,
  estimatedTokens: z.number().int().nonnegative()
});

export const PrivateBookChunkSchema = z.strictObject({
  schemaVersion: z.literal("private-book-chunk/1"),
  manuscriptHash: HashSchema,
  id: BookChunkIdSchema,
  chapterId: z.string().regex(/^ch\d{2,}$/),
  sceneId: z.string().regex(/^ch\d{2,}-s\d{2,}$/),
  ordinal: z.number().int().positive(),
  text: z.string().min(1),
  byteOffsets: ByteRangeSchema,
  estimatedTokens: z.number().int().positive(),
  context: z.strictObject({
    before: ContextWindowSchema.nullable(),
    after: ContextWindowSchema.nullable()
  }),
  boundary: z.enum(["target", "scene-end", "oversized-paragraph"]),
  annotation: AnnotatedBookChunkSchema
}).superRefine((chunk, context) => {
  if (chunk.annotation.chunkId !== chunk.id) {
    context.addIssue({ code: "custom", path: ["annotation", "chunkId"], message: "Annotation must belong to the private chunk" });
  }
  if (!chunk.id.startsWith(`${chunk.sceneId}-`) || !chunk.sceneId.startsWith(`${chunk.chapterId}-`)) {
    context.addIssue({ code: "custom", path: ["id"], message: "Private chunk hierarchy is inconsistent" });
  }
  if (chunk.annotation.quotables.some((quote) => !chunk.text.includes(quote))) {
    context.addIssue({ code: "custom", path: ["annotation", "quotables"], message: "Private quotables must be exact source substrings" });
  }
});

const EmbeddingRowsSchema = z.array(z.strictObject({
  id: z.string().trim().min(1).max(160),
  embedding: z.array(z.number().finite()).min(1).max(4_096)
})).min(1).superRefine((rows, context) => {
  const ids = rows.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Embedding ids must be unique" });
  }
  const dimensions = new Set(rows.map(({ embedding }) => embedding.length));
  if (dimensions.size !== 1) {
    context.addIssue({ code: "custom", message: "Embedding dimensions must agree" });
  }
});

const PrivateEmbeddingsSchema = z.strictObject({
  schemaVersion: z.literal("private-book-embeddings/1"),
  manuscriptHash: HashSchema,
  model: z.string().trim().min(1).max(120),
  embeddings: EmbeddingRowsSchema
});

export type PrivateBookChunk = z.infer<typeof PrivateBookChunkSchema>;

export interface DoorMoneyKnowledgeStore {
  chunk(manuscriptHash: string, chunkId: string): Promise<PrivateBookChunk>;
  embeddings(manuscriptHash: string): Promise<BookIngestEmbedding[]>;
}

function versionPath(manuscriptHash: string, tail: string): string {
  const hash = HashSchema.parse(manuscriptHash).slice("sha256:".length);
  return path.join("kb", "versions", hash, tail);
}

async function readPrivateJson(root: string, relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8")) as unknown;
}

export class LocalCloneDoorMoneyKnowledgeStore implements DoorMoneyKnowledgeStore {
  constructor(readonly privateRoot: string) {}

  async chunk(manuscriptHash: string, chunkId: string): Promise<PrivateBookChunk> {
    const id = BookChunkIdSchema.parse(chunkId);
    const parsed = PrivateBookChunkSchema.parse(await readPrivateJson(
      this.privateRoot,
      versionPath(manuscriptHash, path.join("chunks", `${id}.json`))
    ));
    if (parsed.manuscriptHash !== manuscriptHash || parsed.id !== id) {
      throw new Error("Private chunk does not match the requested knowledge version");
    }
    return parsed;
  }

  async embeddings(manuscriptHash: string): Promise<BookIngestEmbedding[]> {
    const parsed = PrivateEmbeddingsSchema.parse(await readPrivateJson(
      this.privateRoot,
      versionPath(manuscriptHash, "embeddings.json")
    ));
    if (parsed.manuscriptHash !== manuscriptHash) {
      throw new Error("Private embeddings do not match the requested knowledge version");
    }
    return parsed.embeddings;
  }
}

export function openLocalCloneDoorMoneyKnowledgeStore(input: {
  privateRoot: string | null | undefined;
  repositoryRoot?: string;
}): LocalCloneDoorMoneyKnowledgeStore | null {
  if (!input.privateRoot?.trim()) return null;
  const privateRoot = path.resolve(input.privateRoot);
  const publicRoot = path.resolve(input.repositoryRoot ?? repoRoot);
  const relative = path.relative(publicRoot, privateRoot);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("The private book store must live outside the public repository");
  }
  return new LocalCloneDoorMoneyKnowledgeStore(privateRoot);
}

class DoorMoneyKnowledgeCycle {
  private readonly chunks = new Map<string, Promise<PrivateBookChunk>>();
  private embeddingLoad: Promise<BookIngestEmbedding[]> | null = null;

  constructor(
    private readonly store: DoorMoneyKnowledgeStore,
    private readonly manuscriptHash: string
  ) {}

  chunk(chunkId: string): Promise<PrivateBookChunk> {
    const id = BookChunkIdSchema.parse(chunkId);
    const existing = this.chunks.get(id);
    if (existing) return existing;
    const loaded = this.store.chunk(this.manuscriptHash, id).then((raw) => {
      const parsed = PrivateBookChunkSchema.parse(raw);
      if (parsed.manuscriptHash !== this.manuscriptHash || parsed.id !== id) {
        throw new Error("Private chunk does not match the requested knowledge version");
      }
      return parsed;
    });
    this.chunks.set(id, loaded);
    return loaded;
  }

  embeddings(): Promise<BookIngestEmbedding[]> {
    this.embeddingLoad ??= this.store.embeddings(this.manuscriptHash)
      .then((rows) => EmbeddingRowsSchema.parse(rows));
    return this.embeddingLoad;
  }
}

export interface DoorMoneyFormatMenuItem {
  format: DoorMoneyFormat;
  compatiblePlatforms: VentureRecommendation["platforms"];
  constraints: string[];
}

export const DOOR_MONEY_FORMAT_MENU: readonly DoorMoneyFormatMenuItem[] = [
  {
    format: "carousel",
    compatiblePlatforms: ["instagram", "tiktok"],
    constraints: ["One visible story beat per slide.", "End with curiosity, not a manufactured lesson."]
  },
  {
    format: "single-image",
    compatiblePlatforms: ["instagram", "x", "threads"],
    constraints: ["Use one exact, source-checked line or one concise adaptation.", "Keep the source context attached for owner review."]
  },
  {
    format: "thread",
    compatiblePlatforms: ["x", "threads"],
    constraints: ["Every post advances the same sourced story.", "Do not invent connective facts."]
  },
  {
    format: "caption",
    compatiblePlatforms: ["instagram", "tiktok", "youtube"],
    constraints: ["Preserve the specific event and voice.", "A buy-the-book CTA is not the default."]
  },
  {
    format: "short-video-script",
    compatiblePlatforms: ["instagram", "tiktok", "youtube"],
    constraints: ["Write speakable lines plus a bounded shot list.", "Do not stage an event as documentary fact."]
  }
] as const;

export interface MatchedStyleExemplar extends StyleExemplar {
  similarity: number;
  formatMatched: boolean;
}

export interface DoorMoneyPacketPassage {
  selection: SelectedPassage;
  source: PrivateBookChunk;
  neighbors: PrivateBookChunk[];
}

export interface DoorMoneyRecommendationHistoryItem {
  id: string;
  date: string;
  status: VentureRecommendation["status"];
  hook: string;
  formats: VentureRecommendation["formats"];
  platforms: VentureRecommendation["platforms"];
  ctaMode: VentureRecommendation["cta"]["mode"];
  evidenceChunkIds: string[];
}

export interface DoorMoneyDeskPacket {
  schemaVersion: "door-money-desk-packet/1";
  ventureId: "door-money";
  date: string;
  manuscriptHash: string;
  passages: DoorMoneyPacketPassage[];
  styleProfile: StyleProfile;
  exemplarsByFormat: Partial<Record<DoorMoneyFormat, MatchedStyleExemplar[]>>;
  recommendationHistory: DoorMoneyRecommendationHistoryItem[];
  performanceWeights: SelectionPerformanceWeights;
  formatMenu: readonly DoorMoneyFormatMenuItem[];
}

export type DoorMoneyDeskPacketOutcome = {
  kind: "ready";
  packet: DoorMoneyDeskPacket;
} | {
  kind: "fixture-required";
  reason: string;
  actualUsd: 0;
  externalRequests: 0;
};

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateSelection(index: BookKbIndex, selected: readonly SelectedPassage[]): void {
  const chunks = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
  if (new Set(selected.map(({ chunkId }) => chunkId)).size !== selected.length) {
    throw new Error("Passage selection contains duplicate chunk ids");
  }
  for (const selection of selected) {
    const chunk = chunks.get(selection.chunkId);
    if (!chunk || selection.chapterId !== chunk.chapterId || selection.sceneId !== chunk.sceneId ||
        selection.arc !== chunk.arc || !sameJson(selection.themes, chunk.themes) ||
        selection.hookStyle !== doorMoneyHookStyle(chunk.scores) ||
        !sameJson(selection.scoresAtSelection, chunk.scores)) {
      throw new Error(`Passage selection does not match the public index for ${selection.chunkId}`);
    }
  }
}

function cosine(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) throw new Error("Embedding dimensions do not match");
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftMagnitude += left[index]! ** 2;
    rightMagnitude += right[index]! ** 2;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) throw new Error("Embedding vectors cannot be zero");
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function centroid(vectors: readonly (readonly number[])[]): number[] {
  if (vectors.length === 0) throw new Error("A target passage embedding is required");
  const dimensions = vectors[0]!.length;
  if (vectors.some((vector) => vector.length !== dimensions)) throw new Error("Embedding dimensions do not match");
  return Array.from({ length: dimensions }, (_, dimension) =>
    vectors.reduce((sum, vector) => sum + vector[dimension]!, 0) / vectors.length);
}

const exemplarFormatAliases: Readonly<Record<DoorMoneyFormat, readonly string[]>> = {
  carousel: ["carousel"],
  "single-image": ["single-image", "quote-card"],
  thread: ["thread"],
  caption: ["caption", "quote-card"],
  "short-video-script": ["short-video-script", "short-video"]
};

function matchedExemplars(input: {
  format: DoorMoneyFormat;
  selected: readonly SelectedPassage[];
  profile: StyleProfile;
  embeddings: Map<string, number[]>;
}): MatchedStyleExemplar[] {
  const selectedVectors = input.selected
    .filter(({ primaryFormat }) => primaryFormat === input.format)
    .map(({ chunkId }) => input.embeddings.get(chunkId));
  if (selectedVectors.some((vector) => vector === undefined)) {
    throw new Error(`A selected ${input.format} passage has no private embedding`);
  }
  const target = centroid(selectedVectors as number[][]);
  const ranked = input.profile.exemplarBank.map((exemplar) => {
    const vector = input.embeddings.get(exemplar.embeddingId);
    if (!vector) throw new Error(`Style exemplar ${exemplar.id} has no private embedding`);
    const formatMatched = exemplar.formats.some((format) => exemplarFormatAliases[input.format].includes(format));
    return { ...exemplar, similarity: cosine(target, vector), formatMatched };
  }).sort((left, right) =>
    Number(right.formatMatched) - Number(left.formatMatched) ||
    right.similarity - left.similarity ||
    left.id.localeCompare(right.id));
  if (ranked.length < 3) throw new Error("The style profile needs at least three embedding-backed exemplars");
  return ranked.slice(0, 5);
}

function priorHistory(input: {
  recommendations: readonly VentureRecommendation[];
  date: string;
}): DoorMoneyRecommendationHistoryItem[] {
  const target = Date.parse(`${input.date}T00:00:00.000Z`);
  return input.recommendations
    .map((item) => VentureRecommendationSchema.parse(item))
    .filter(({ date }) => {
      const days = (target - Date.parse(`${date}T00:00:00.000Z`)) / 86_400_000;
      return days >= 1 && days <= 14;
    })
    .sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id))
    .map((item) => ({
      id: item.id,
      date: item.date,
      status: item.status,
      hook: item.hook,
      formats: item.formats,
      platforms: item.platforms,
      ctaMode: item.cta.mode,
      evidenceChunkIds: item.evidence.chunkIds
    }));
}

const PRIVATE_UNAVAILABLE_REASON = "Private book knowledge is unavailable; use the recorded $0 fixture path.";

export async function assembleDoorMoneyDeskPacket(input: {
  date: string;
  index: BookKbIndex;
  styleProfile: StyleProfile;
  selection: PassageSelectionOutcome;
  store: DoorMoneyKnowledgeStore | null;
  recommendationHistory?: readonly VentureRecommendation[];
  performanceWeights?: SelectionPerformanceWeights;
}): Promise<DoorMoneyDeskPacketOutcome> {
  const date = DateSchema.safeParse(input.date);
  if (!date.success || input.selection.seed !== `${date.data}:door-money`) {
    return { kind: "fixture-required", reason: PRIVATE_UNAVAILABLE_REASON, actualUsd: 0, externalRequests: 0 };
  }
  if (input.selection.kind === "quiet-day") {
    return { kind: "fixture-required", reason: "Passage selection produced an honest quiet day; nothing was fetched or spent.", actualUsd: 0, externalRequests: 0 };
  }
  if (!input.store) {
    return { kind: "fixture-required", reason: PRIVATE_UNAVAILABLE_REASON, actualUsd: 0, externalRequests: 0 };
  }
  try {
    if (input.selection.passages.length > 2) {
      throw new Error("Passage selection does not belong to this Door Money desk date");
    }
    const index = BookKbIndexSchema.parse(input.index);
    const profile = StyleProfileSchema.parse(input.styleProfile);
    if (profile.manuscriptHash !== index.manuscriptHash) {
      throw new Error("Style profile and public index use different manuscript versions");
    }
    validateSelection(index, input.selection.passages);
    const knowledge = new DoorMoneyKnowledgeCycle(input.store, index.manuscriptHash);
    const order = new Map(index.chunks.map((chunk, chunkIndex) => [chunk.id, chunkIndex]));
    const passages = await Promise.all(input.selection.passages.map(async (selection) => {
      const position = order.get(selection.chunkId)!;
      const neighborIds = [index.chunks[position - 1]?.id, index.chunks[position + 1]?.id]
        .filter((id): id is string => id !== undefined);
      const [source, neighbors] = await Promise.all([
        knowledge.chunk(selection.chunkId),
        Promise.all(neighborIds.map((id) => knowledge.chunk(id)))
      ]);
      if (source.manuscriptHash !== index.manuscriptHash || source.id !== selection.chunkId ||
          neighbors.some((neighbor) => neighbor.manuscriptHash !== index.manuscriptHash)) {
        throw new Error("Private chunk fetch crossed a knowledge version boundary");
      }
      return { selection, source, neighbors };
    }));
    const embeddingRows = await knowledge.embeddings();
    const embeddings = new Map(embeddingRows.map(({ id, embedding }) => [id, embedding]));
    if (embeddings.size !== embeddingRows.length) throw new Error("Private embedding ids must be unique");
    const formats = [...new Set(input.selection.passages.map(({ primaryFormat }) => primaryFormat))];
    const exemplarsByFormat = Object.fromEntries(formats.map((format) => [format, matchedExemplars({
      format,
      selected: input.selection.passages,
      profile,
      embeddings
    })])) as Partial<Record<DoorMoneyFormat, MatchedStyleExemplar[]>>;
    return {
      kind: "ready",
      packet: {
        schemaVersion: "door-money-desk-packet/1",
        ventureId: "door-money",
        date: date.data,
        manuscriptHash: index.manuscriptHash,
        passages,
        styleProfile: profile,
        exemplarsByFormat,
        recommendationHistory: priorHistory({
          recommendations: input.recommendationHistory ?? [],
          date: date.data
        }),
        performanceWeights: input.performanceWeights ?? {},
        formatMenu: DOOR_MONEY_FORMAT_MENU
      }
    };
  } catch {
    return { kind: "fixture-required", reason: PRIVATE_UNAVAILABLE_REASON, actualUsd: 0, externalRequests: 0 };
  }
}

// The shape written by DM-11b is intentionally documented here for store doubles and callers.
export type StoredPrivateBookChunk = ManuscriptChunk & {
  schemaVersion: "private-book-chunk/1";
  manuscriptHash: string;
  annotation: z.infer<typeof AnnotatedBookChunkSchema>;
};
