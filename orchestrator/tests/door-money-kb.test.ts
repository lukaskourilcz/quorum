import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BOOK_KB_SCORE_AXES,
  BookKbIndexSchema,
  type BookKbChunk,
  type BookKbIndex
} from "../src/contracts/book-kb-index.js";
import { StyleProfileSchema, type StyleProfile } from "../src/contracts/style-profile.js";
import { repoRoot } from "../src/paths.js";
import {
  assembleDoorMoneyDeskPacket,
  openLocalCloneDoorMoneyKnowledgeStore,
  type DoorMoneyKnowledgeStore,
  type PrivateBookChunk
} from "../src/ventures/door-money/kb.js";
import { selectDoorMoneyPassages, type DoorMoneyFormatRules } from "../src/ventures/door-money/select.js";

const HASH = `sha256:${"a".repeat(64)}`;
let baseStyle: StyleProfile;

beforeAll(async () => {
  baseStyle = StyleProfileSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/style-profile.valid.json"),
    "utf8"
  )));
});

function publicChunk(ordinal: number): BookKbChunk {
  const chapterId = `ch${String(ordinal).padStart(2, "0")}`;
  const sceneId = `${chapterId}-s01`;
  return {
    id: `${sceneId}-c${String(ordinal).padStart(3, "0")}`,
    chapterId,
    sceneId,
    ordinal,
    arc: `invented-arc-${ordinal}`,
    byteOffsets: { start: ordinal * 10, end: ordinal * 10 + 9 },
    summary: `Invented public summary ${ordinal}.`,
    entities: [],
    themes: [`invented-theme-${ordinal}`],
    era: "invented-era",
    storyType: "lesson",
    quotables: [`Invented line ${ordinal}.`],
    scores: Object.fromEntries(BOOK_KB_SCORE_AXES.map((axis) => [axis, {
      score: axis === "carouselPotential" ? 5 : 4,
      justification: `Invented ${axis} reason.`
    }])) as BookKbChunk["scores"],
    usageHistory: []
  };
}

function indexFixture(): BookKbIndex {
  const chunks = Array.from({ length: 6 }, (_, index) => publicChunk(index + 1));
  return BookKbIndexSchema.parse({
    schemaVersion: "book-kb-index/1",
    ventureId: "door-money",
    ingestionId: "invented-packet-fixture",
    manuscriptHash: HASH,
    manuscriptBytes: 1_000,
    modelVersions: { annotation: "fixture", rollup: "fixture", embedding: "fixture" },
    ingestionCostUsd: 0,
    chunkCount: chunks.length,
    chapters: chunks.map((chunk) => ({
      id: chunk.chapterId,
      ordinal: chunk.ordinal,
      summary: `Invented chapter ${chunk.ordinal}.`,
      chunkIds: [chunk.id]
    })),
    entityIndex: [],
    themeIndex: chunks.map((chunk) => ({ theme: chunk.themes[0]!, chunkIds: [chunk.id] })),
    chunks,
    generatedAt: "2026-08-01T00:00:00.000Z"
  });
}

function privateChunk(chunk: BookKbChunk): PrivateBookChunk {
  return {
    schemaVersion: "private-book-chunk/1",
    manuscriptHash: HASH,
    id: chunk.id,
    chapterId: chunk.chapterId,
    sceneId: chunk.sceneId,
    ordinal: chunk.ordinal,
    text: `Invented private fixture passage ${chunk.ordinal}; it is not book text. Invented line ${chunk.ordinal}.`,
    byteOffsets: chunk.byteOffsets,
    estimatedTokens: 12,
    context: { before: null, after: null },
    boundary: "scene-end",
    annotation: {
      chunkId: chunk.id,
      summary: chunk.summary,
      entities: chunk.entities,
      themes: chunk.themes,
      arc: chunk.arc,
      era: chunk.era,
      storyType: chunk.storyType,
      quotables: chunk.quotables,
      scores: chunk.scores
    }
  };
}

function styleFixture(index: BookKbIndex): StyleProfile {
  return StyleProfileSchema.parse({
    ...baseStyle,
    manuscriptHash: HASH,
    fingerprintHash: `sha256:${"b".repeat(64)}`,
    exemplarBank: index.chunks.slice(0, 5).map((chunk, exemplarIndex) => ({
      id: `invented-exemplar-${exemplarIndex + 1}`,
      chunkId: chunk.id,
      text: `Invented exemplar ${exemplarIndex + 1}.`,
      embeddingId: chunk.id,
      formats: exemplarIndex < 2 ? ["carousel"] : ["thread"],
      tags: ["invented"]
    }))
  });
}

class CountingStore implements DoorMoneyKnowledgeStore {
  readonly chunkReads = new Map<string, number>();
  embeddingReads = 0;

  constructor(readonly index: BookKbIndex) {}

  async chunk(_manuscriptHash: string, chunkId: string): Promise<PrivateBookChunk> {
    this.chunkReads.set(chunkId, (this.chunkReads.get(chunkId) ?? 0) + 1);
    return privateChunk(this.index.chunks.find(({ id }) => id === chunkId)!);
  }

  async embeddings(): Promise<Array<{ id: string; embedding: number[] }>> {
    this.embeddingReads += 1;
    return this.index.chunks.map((chunk, index) => ({
      id: chunk.id,
      embedding: index === 0 ? [1, 0, 0] : [1, index / 10, 0]
    }));
  }
}

const carouselRules: DoorMoneyFormatRules = {
  carousel: { threshold: 5, axisWeights: { carouselPotential: 1 } },
  "single-image": { threshold: 5, axisWeights: { quotePotential: 1 } },
  thread: { threshold: 5, axisWeights: { threadPotential: 1 } },
  caption: { threshold: 5, axisWeights: { relatability: 1 } },
  "short-video-script": { threshold: 5, axisWeights: { shortVideoPotential: 1 } }
};

describe("Door Money private knowledge packet", () => {
  it("fetches selected chunks and ±1 neighbors once per cycle and matches 3–5 exemplars", async () => {
    const index = indexFixture();
    const selection = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: index.chunks,
      formatRules: carouselRules
    });
    expect(selection.kind).toBe("selected");
    const store = new CountingStore(index);
    const result = await assembleDoorMoneyDeskPacket({
      date: "2026-09-01",
      index,
      styleProfile: styleFixture(index),
      selection,
      store,
      performanceWeights: { formatPriors: { carousel: 1.1 } }
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.packet.passages).toHaveLength(2);
    expect(result.packet.exemplarsByFormat.carousel).toHaveLength(5);
    expect(result.packet.exemplarsByFormat.carousel?.slice(0, 2).every(({ formatMatched }) => formatMatched)).toBe(true);
    expect([...store.chunkReads.values()].every((reads) => reads === 1)).toBe(true);
    expect(store.embeddingReads).toBe(1);
    expect(result.packet.passages.every(({ source }) => source.text.startsWith("Invented private fixture"))).toBe(true);
  });

  it("keeps only the prior 14 calendar days of recommendation history", async () => {
    const recommendation = JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/venture-recommendation.valid.json"),
      "utf8"
    ));
    const index = indexFixture();
    const selection = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: index.chunks,
      formatRules: carouselRules,
      maxPassages: 1
    });
    const records = [1, 14, 15, 0].map((days, recordIndex) => ({
      ...structuredClone(recommendation),
      id: `invented-history-${recordIndex}`,
      date: new Date(Date.UTC(2026, 8, 1 - days)).toISOString().slice(0, 10),
      evidence: {
        ...recommendation.evidence,
        manuscriptHash: HASH,
        privateStoreLink: `private-book://sha256/${"a".repeat(64)}/chunks/ch01-s01-c001.json`
      }
    }));
    const result = await assembleDoorMoneyDeskPacket({
      date: "2026-09-01",
      index,
      styleProfile: styleFixture(index),
      selection,
      store: new CountingStore(index),
      recommendationHistory: records
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.packet.recommendationHistory.map(({ id }) => id)).toEqual([
      "invented-history-0",
      "invented-history-1"
    ]);
  });

  it("fails closed at $0 when private knowledge is absent or inconsistent", async () => {
    const index = indexFixture();
    const selection = selectDoorMoneyPassages({
      ventureId: "door-money",
      date: "2026-09-01",
      chunks: index.chunks,
      formatRules: carouselRules
    });
    await expect(assembleDoorMoneyDeskPacket({
      date: "2026-09-01",
      index,
      styleProfile: styleFixture(index),
      selection,
      store: null
    })).resolves.toEqual({
      kind: "fixture-required",
      reason: "Private book knowledge is unavailable; use the recorded $0 fixture path.",
      actualUsd: 0,
      externalRequests: 0
    });

    const wrongVersion = styleFixture(index);
    wrongVersion.manuscriptHash = `sha256:${"c".repeat(64)}`;
    await expect(assembleDoorMoneyDeskPacket({
      date: "2026-09-01",
      index,
      styleProfile: wrongVersion,
      selection,
      store: new CountingStore(index)
    })).resolves.toMatchObject({ kind: "fixture-required", actualUsd: 0, externalRequests: 0 });
  });

  it("refuses to place the private knowledge store inside the public repository", () => {
    expect(openLocalCloneDoorMoneyKnowledgeStore({ privateRoot: null })).toBeNull();
    expect(() => openLocalCloneDoorMoneyKnowledgeStore({
      privateRoot: path.join(repoRoot, "private-book"),
      repositoryRoot: repoRoot
    })).toThrow(/outside the public repository/u);
  });
});
