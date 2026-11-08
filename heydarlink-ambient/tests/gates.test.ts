import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { duplicateGate, formatGate, openaiGates, parseVerdict, readFormat, verdictReasons } from "../src/gates.js";
import { CropRefused, gradeFrame } from "../src/grade.js";
import { gradient } from "../src/mock.js";
import { hamming, phash, PHASH_PATTERN } from "../src/phash.js";
import { config, fixture, json, scriptedFetch } from "./helpers.js";

const graded = async (seed = 7, aspect: "4:5" | "9:16" = "4:5") => {
  const loaded = await config();
  const { width, height } = loaded.sizes[aspect];
  return gradeFrame({ source: await gradient(width, height, seed), aspect, grade: loaded.personas.nina.grade, config: loaded, noiseSeed: 1 });
};

describe("grading", () => {
  it("exports an exact-size baseline JPEG with no metadata, byte-identical on a rerun", async () => {
    const first = await graded();
    const meta = await sharp(first).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1080, 1350]);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(Buffer.compare(first, await graded())).toBe(0);
    const story = await sharp(await graded(7, "9:16")).metadata();
    expect([story.width, story.height]).toEqual([1080, 1920]);
  });

  it("accepts OpenAI's 2:3 portrait for both aspects and refuses a square that would need a 20%+ crop", async () => {
    const loaded = await config();
    const grade = loaded.personas.teresa.grade;
    const portrait = await gradient(1024, 1536, 3);
    for (const aspect of ["4:5", "9:16"] as const) {
      await expect(gradeFrame({ source: portrait, aspect, grade, config: loaded, noiseSeed: 1 })).resolves.toBeInstanceOf(Buffer);
    }
    const square = await gradient(1024, 1024, 3);
    await expect(gradeFrame({ source: square, aspect: "9:16", grade, config: loaded, noiseSeed: 1 })).rejects.toBeInstanceOf(CropRefused);
  });
});

describe("format gate", () => {
  it("passes a graded frame and names each failure of a wrong one", async () => {
    const loaded = await config();
    const jpeg = await graded();
    expect(formatGate(jpeg, await readFormat(jpeg), "4:5", loaded)).toEqual([]);
    // Right bytes, wrong slot: a 4:5 frame offered as a story.
    expect(formatGate(jpeg, await readFormat(jpeg), "9:16", loaded)).toEqual(["format:size-1080x1350"]);
    const png = await sharp(jpeg).png().toBuffer();
    expect(formatGate(png, await readFormat(png), "4:5", loaded)).toContain("format:not-jpeg");
    const tooBig = { ...loaded, gate: { ...loaded.gate, maxBytes: 1000 } };
    expect(formatGate(jpeg, await readFormat(jpeg), "4:5", tooBig)).toContain("format:too-large");
    expect(await readFormat(Buffer.from("not an image"))).toEqual({});
  });
});

describe("perceptual hash and the duplicate gate", () => {
  it("gives the same picture the same hash, a regraded copy a near one, and a different picture a far one", async () => {
    const loaded = await config();
    const source = await gradient(1080, 1350, 11);
    const nina = await gradeFrame({ source, aspect: "4:5", grade: loaded.personas.nina.grade, config: loaded, noiseSeed: 1 });
    const fatimah = await gradeFrame({ source, aspect: "4:5", grade: loaded.personas.fatimah.grade, config: loaded, noiseSeed: 9 });
    const other = await graded(200);
    const [a, b, c] = await Promise.all([phash(nina), phash(fatimah), phash(other)]);
    expect(a).toMatch(PHASH_PATTERN);
    expect(await phash(nina)).toBe(a);
    expect(hamming(a, b)).toBeLessThanOrEqual(loaded.gate.nearDuplicateDistance);
    expect(hamming(a, c)).toBeGreaterThan(loaded.gate.nearDuplicateDistance);
    expect(duplicateGate(a, [c, b], loaded.gate.nearDuplicateDistance)).toMatch(/^duplicate:phash-distance-\d+$/u);
    expect(duplicateGate(a, [c], loaded.gate.nearDuplicateDistance)).toBeNull();
  });

  it("counts hamming distance bit by bit", () => {
    expect(hamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming("000000000000000f", "0000000000000001")).toBe(3);
  });
});

describe("vision verdicts", () => {
  it("rejects on any person, face, body part, lettering or nsfw, and on an off-brief frame", () => {
    const clean = { people: false, faces: false, body_parts: false, text_or_logos: false, nsfw: false, matches_brief: true };
    expect(verdictReasons(clean)).toEqual([]);
    expect(verdictReasons({ ...clean, people: true, faces: true })).toEqual(["vision:people", "vision:faces"]);
    expect(verdictReasons({ ...clean, matches_brief: false })).toEqual(["vision:off-brief"]);
    expect(parseVerdict({ ...clean, people: "no" })).toBeNull();
    expect(parseVerdict(null)).toBeNull();
  });
});

describe("the OpenAI gates, from recorded responses", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

  const inspect = async (name: string) => {
    const { fetcher, calls } = scriptedFetch([json(await fixture(name))]);
    const reasons = await openaiGates(await config(), "test-key", fetcher).inspect(jpeg, "a latte");
    return { reasons, calls };
  };

  it("passes a clean verdict and sends the image at high detail to the configured model", async () => {
    const { reasons, calls } = await inspect("vision-clean.json");
    expect(reasons).toEqual([]);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(calls[0]!.init?.body)) as { model: string; messages: Array<{ content: unknown }> };
    expect(body.model).toBe((await config()).gate.visionModel);
    expect(JSON.stringify(body.messages)).toContain('"detail":"high"');
  });

  it("rejects the person, logo and hand fixtures with their reasons", async () => {
    expect((await inspect("vision-person.json")).reasons).toEqual(["vision:people", "vision:faces"]);
    expect((await inspect("vision-logo.json")).reasons).toEqual(["vision:text_or_logos"]);
    expect((await inspect("vision-hand-off-brief.json")).reasons).toEqual(["vision:body_parts", "vision:off-brief"]);
  });

  it("fails closed on a refusal, an HTTP error, a network error and a missing key", async () => {
    expect((await inspect("vision-refusal.json")).reasons).toEqual(["gate:vision-malformed"]);
    const loaded = await config();
    const http500 = scriptedFetch([json({ error: "boom" }, 500)]);
    expect(await openaiGates(loaded, "k", http500.fetcher).inspect(jpeg, "b")).toEqual(["gate:vision-unavailable"]);
    const offline = scriptedFetch([new TypeError("fetch failed")]);
    expect(await openaiGates(loaded, "k", offline.fetcher).inspect(jpeg, "b")).toEqual(["gate:vision-unavailable"]);
    expect(await openaiGates(loaded, undefined).inspect(jpeg, "b")).toEqual(["gate:vision-unavailable"]);
    expect(await openaiGates(loaded, undefined).moderate(jpeg)).toEqual(["gate:moderation-unavailable"]);
  });

  it("moderation passes clean, rejects flagged, and rejects a suggestive score under the flag", async () => {
    const loaded = await config();
    const run = async (name: string) => openaiGates(loaded, "k", scriptedFetch([json(await fixture(name))]).fetcher).moderate(jpeg);
    expect(await run("moderation-clean.json")).toEqual([]);
    expect(await run("moderation-flagged.json")).toEqual(["moderation:flagged", "moderation:sexual"]);
    expect(await run("moderation-suggestive.json")).toEqual(["moderation:sexual"]);
    expect(await openaiGates(loaded, "k", scriptedFetch([json({ results: [] })]).fetcher).moderate(jpeg)).toEqual(["gate:moderation-malformed"]);
  });
});
