import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  chunkManuscript,
  DEFAULT_CHUNK_MAX_TOKENS,
  DEFAULT_CHUNK_MIN_TOKENS,
  estimateBookTokens
} from "../src/manuscript-chunker.js";

const fixturePath = path.join(process.cwd(), "tests/fixtures/door-money/synthetic-diary.md");
let fixture = "";

beforeAll(async () => {
  fixture = await readFile(fixturePath, "utf8");
});

describe("Door Money deterministic manuscript chunker", () => {
  it("parses the invented diary into chapters, scenes and stable ids", () => {
    const result = chunkManuscript(fixture);
    expect(result.chapters.map(({ id, title }) => [id, title])).toEqual([
      ["ch01", "The Paper Map"],
      ["ch02", "The Quiet Stage"]
    ]);
    expect(result.chapters.flatMap(({ scenes }) => scenes).map(({ id, title }) => [id, title])).toEqual([
      ["ch01-s01", "Morning inventory"],
      ["ch01-s02", "The long route"],
      ["ch02-s01", "Doors before dusk"],
      ["ch02-s02", "Packing the room"]
    ]);
    expect(result.chunks.map(({ id }) => id)).toEqual([
      "ch01-s01-c001",
      "ch01-s01-c002",
      "ch01-s02-c003",
      "ch01-s02-c004",
      "ch02-s01-c005",
      "ch02-s01-c006",
      "ch02-s02-c007",
      "ch02-s02-c008"
    ]);
  });

  it("returns byte-identical output on every run", () => {
    const first = JSON.stringify(chunkManuscript(fixture));
    const second = JSON.stringify(chunkManuscript(fixture));
    expect(second).toBe(first);
  });

  it("keeps every fixture chunk inside the 900-1200 target", () => {
    const result = chunkManuscript(fixture);
    expect(result.estimatedTokens).toBe(estimateBookTokens(fixture));
    for (const chunk of result.chunks) {
      expect(chunk.estimatedTokens, chunk.id).toBeGreaterThanOrEqual(DEFAULT_CHUNK_MIN_TOKENS);
      expect(chunk.estimatedTokens, chunk.id).toBeLessThanOrEqual(DEFAULT_CHUNK_MAX_TOKENS);
    }
  });

  it("makes every primary and context range an exact UTF-8 source slice", () => {
    const result = chunkManuscript(fixture);
    const bytes = Buffer.from(fixture, "utf8");
    const paragraphs = result.chapters.flatMap(({ scenes }) => scenes.flatMap((scene) => scene.paragraphs));
    const starts = new Set(paragraphs.map(({ byteOffsets }) => byteOffsets.start));
    const ends = new Set(paragraphs.map(({ byteOffsets }) => byteOffsets.end));

    for (const chunk of result.chunks) {
      expect(starts.has(chunk.byteOffsets.start), `${chunk.id} starts on a paragraph`).toBe(true);
      expect(ends.has(chunk.byteOffsets.end), `${chunk.id} ends on a paragraph`).toBe(true);
      expect(bytes.subarray(chunk.byteOffsets.start, chunk.byteOffsets.end).toString("utf8")).toBe(chunk.text);
      expect(chunk.text).not.toMatch(/^#{1,2} /mu);
      for (const window of [chunk.context.before, chunk.context.after]) {
        if (!window) continue;
        expect(starts.has(window.byteOffsets.start)).toBe(true);
        expect(ends.has(window.byteOffsets.end)).toBe(true);
        expect(bytes.subarray(window.byteOffsets.start, window.byteOffsets.end).toString("utf8")).toBe(window.text);
        expect(window.estimatedTokens / chunk.estimatedTokens).toBeGreaterThanOrEqual(0.07);
        expect(window.estimatedTokens / chunk.estimatedTokens).toBeLessThanOrEqual(0.16);
      }
    }
  });

  it("keeps overlap separate from primary text and inside its scene", () => {
    const result = chunkManuscript(fixture);
    for (const scene of result.chapters.flatMap(({ scenes }) => scenes)) {
      const sceneChunks = result.chunks.filter(({ sceneId }) => sceneId === scene.id);
      expect(sceneChunks).toHaveLength(2);
      const [first, second] = sceneChunks;
      expect(first!.context.before).toBeNull();
      expect(second!.context.after).toBeNull();
      expect(first!.context.after?.byteOffsets.start).toBe(second!.byteOffsets.start);
      expect(second!.context.before?.byteOffsets.end).toBe(first!.byteOffsets.end);
      expect(first!.byteOffsets.end).toBeLessThan(second!.byteOffsets.start);
    }
  });

  it("derives ids from explicit chapter and scene ordinals, including multibyte prose", () => {
    const source = "# Chapter 7: Later\n\n## Scene 2: Déšť\n\nŽlutý klíč zůstal na stole.\n";
    const result = chunkManuscript(source, { minTokens: 1, targetTokens: 8, maxTokens: 40 });
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({ id: "ch07-s02-c001", sceneId: "ch07-s02" });
    const chunk = result.chunks[0]!;
    expect(Buffer.from(source).subarray(chunk.byteOffsets.start, chunk.byteOffsets.end).toString("utf8"))
      .toBe("Žlutý klíč zůstal na stole.");
  });

  it("records an indivisible oversized paragraph instead of splitting it", () => {
    const paragraph = "x".repeat(4_804);
    const result = chunkManuscript(`# Chapter 1\n\n## Scene 1\n\n${paragraph}\n`);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      text: paragraph,
      estimatedTokens: 1_201,
      boundary: "oversized-paragraph"
    });
  });

  it("fails closed on missing structure, empty scenes and invalid targets", () => {
    expect(() => chunkManuscript("An unlabelled diary paragraph.")).toThrow(/Chapter/);
    expect(() => chunkManuscript("# Chapter 1\n\n## Scene 1\n\n# Chapter 2\n\n## Scene 1\n\nText.\n"))
      .toThrow(/Every scene/);
    expect(() => chunkManuscript("# Chapter 1\n\n## Scene 1\n\nText.\n", {
      minTokens: 100,
      targetTokens: 50,
      maxTokens: 200
    })).toThrow(/min <= target <= max/);
  });
});
