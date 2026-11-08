import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { missingSecrets, parseInputs, summarize } from "../src/cli.js";
import type { GateModels } from "../src/gates.js";
import type { IngestMetadata } from "../src/ingest.js";
import { mockGates, mockRenderer } from "../src/mock.js";
import type { Renderer } from "../src/providers.js";
import { runAmbient, type RunOptions } from "../src/run.js";
import { config, ledger } from "./helpers.js";

/** A mock renderer that charges like fal does, so caps have something to count. */
const paid = async (usd = 0.05): Promise<Renderer> => ({ ...mockRenderer(await config()), estimateUsd: () => usd });

const failing: Renderer = {
  name: "fal",
  model: "fal-ai/flux/dev",
  estimateUsd: () => 0.05,
  render: async () => {
    throw new Error("fal is down");
  }
};

const options = async (overrides: Partial<RunOptions> = {}): Promise<RunOptions> => ({
  config: await config(),
  ledger: ledger(),
  date: "2026-11-08",
  personas: ["nina"],
  count: 1,
  dryRun: true,
  capUsd: 1,
  renderers: [await paid()],
  gates: mockGates(),
  stockSeed: async () => null,
  upload: null,
  outDir: null,
  ...overrides
});

describe("runAmbient", () => {
  it("renders each picked shot natively at every aspect it lists and passes clean frames", async () => {
    const report = await runAmbient(await options({ personas: ["nina", "fatimah"] }));
    expect(report.frames).toHaveLength(4);
    expect(report.frames.every((frame) => frame.outcome === "dry-run")).toBe(true);
    expect(new Set(report.frames.map((frame) => frame.aspect))).toEqual(new Set(["4:5", "9:16"]));
    // Two personas x two aspects x (render 0.05 + vision 0.002).
    expect(report.runSpentUsd).toBeCloseTo(4 * 0.052, 6);
    expect(report.frames[0]!.costUsd).toBeCloseTo(0.052, 6);
  });

  it("stops at the cap and records every frame it could not afford as skipped", async () => {
    const run = await options({ personas: ["nina", "teresa"], capUsd: 0.08 });
    const report = await runAmbient(run);
    expect(report.capReached).toBe(true);
    expect(report.spentTodayUsd).toBeLessThanOrEqual(0.08);
    expect(report.frames.map((frame) => frame.outcome)).toEqual(["dry-run", "skipped-cap", "skipped-cap", "skipped-cap"]);
    // The cap counts what earlier runs today already spent.
    const again = await runAmbient({ ...run, capUsd: 0.08 });
    expect(again.frames.every((frame) => frame.outcome === "skipped-cap")).toBe(true);
  });

  it("gives a refused frame a second attempt and records both attempts' reasons when it fails twice", async () => {
    let calls = 0;
    const gates: GateModels = {
      moderate: async () => [],
      inspect: async () => (++calls <= 2 ? ["vision:people"] : [])
    };
    const report = await runAmbient(await options({ gates }));
    const [first, second] = report.frames;
    expect(first!.outcome).toBe("rejected");
    expect(first!.reasons).toEqual(["a1:vision:people", "a2:vision:people"]);
    expect(second!.outcome).toBe("dry-run");
    // A rejection still costs what it rendered and inspected.
    expect(first!.costUsd).toBeCloseTo(2 * 0.052, 6);
  });

  it("falls through to the next provider when one fails, and rejects without spending a gate when none renders", async () => {
    const fallback = { ...(await paid(0.015)), name: "openai" as const, model: "gpt-image-1-mini" };
    const report = await runAmbient(await options({ renderers: [failing, fallback] }));
    expect(report.frames[0]!.outcome).toBe("dry-run");
    expect(report.frames[0]!.provider).toBe("fal"); // the mock labels its output as fal
    expect(report.frames[0]!.reasons).toEqual(["a1:fal:render-failed"]);

    const none = await runAmbient(await options({ renderers: [failing] }));
    expect(none.frames[0]!.outcome).toBe("rejected");
    expect(none.frames[0]!.reasons).toContain("a1:no-renderer");
    expect(none.frames[0]!.costUsd).toBeCloseTo(0.05, 6);
  });

  it("refuses a near-duplicate of a frame already uploaded", async () => {
    const run = await options({ dryRun: false, upload: async () => ({ kind: "stored", id: "x" }) });
    // One attempt: a second attempt renders a new seed, which is a different picture.
    run.config.caps.maxAttemptsPerFrame = 1;
    const first = await runAmbient(run);
    expect(first.frames.every((frame) => frame.outcome === "uploaded")).toBe(true);
    // Same picks again: clear the rotation, so the mock paints the same pixels.
    run.ledger.rotation.nina = { used: [] };
    const second = await runAmbient(run);
    expect(second.frames.every((frame) => frame.outcome === "rejected")).toBe(true);
    expect(second.frames[0]!.reasons.some((reason) => reason.includes("duplicate:phash-distance-0"))).toBe(true);
  });

  it("uploads with the frame's metadata, advances the rotation, and counts a failed upload", async () => {
    const sent: IngestMetadata[] = [];
    const run = await options({
      dryRun: false,
      upload: async (_jpeg, meta) => {
        sent.push(meta);
        return sent.length === 1 ? { kind: "stored", id: "id-1" } : { kind: "failed", status: 503, code: "AMBIENT_STORAGE" };
      }
    });
    const report = await runAmbient(run);
    expect(sent.map((meta) => meta.aspect)).toEqual(["4:5", "9:16"]);
    expect(sent[0]).toMatchObject({ persona_key: "nina", provider: "fal", phash: expect.stringMatching(/^[0-9a-f]{16}$/u) });
    expect(sent[0]!.cost_usd).toBeCloseTo(0.052, 6);
    expect(report.frames.map((frame) => frame.outcome)).toEqual(["uploaded", "upload-failed"]);
    expect(report.frames[0]!.ingestId).toBe("id-1");
    expect(report.uploadFailures).toBe(1);
    expect(run.ledger.rotation.nina!.used).toHaveLength(1);
    expect(run.ledger.frames).toHaveLength(2);
  });

  it("writes a dry run's frames for the artifact and leaves the rotation alone", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "ambient-out-"));
    const run = await options({ outDir });
    await runAmbient(run);
    expect((await readdir(path.join(outDir, "nina"))).sort()).toEqual([
      expect.stringMatching(/^accepted-nina-.+-4x5\.jpg$/u),
      expect.stringMatching(/^accepted-nina-.+-9x16\.jpg$/u)
    ]);
    expect(run.ledger.rotation.nina!.used).toEqual([]);
  });

  it("summarizes a run as a table without any secret", async () => {
    const report = await runAmbient(await options());
    const text = summarize(report);
    expect(text).toContain("| nina |");
    expect(text).toContain("(dry run)");
  });
});

describe("CLI inputs", () => {
  const defaults = { capUsd: 1, maxCount: 4 };

  it("defaults to all personas, one shot, a real run and the configured cap", () => {
    const inputs = parseInputs({}, defaults);
    expect(inputs).toMatchObject({ personas: ["nina", "fatimah", "teresa", "michaela"], count: 1, dryRun: false, capUsd: 1, mock: false });
  });

  it("refuses an unknown persona, a bad count, a silly cap and mock outside a dry run", () => {
    expect(() => parseInputs({ AMBIENT_PERSONA: "karel" }, defaults)).toThrow(/AMBIENT_PERSONA/u);
    expect(() => parseInputs({ AMBIENT_COUNT: "0" }, defaults)).toThrow(/AMBIENT_COUNT/u);
    expect(() => parseInputs({ AMBIENT_COUNT: "5" }, defaults)).toThrow(/AMBIENT_COUNT/u);
    expect(() => parseInputs({ AMBIENT_DAILY_USD: "50" }, defaults)).toThrow(/AMBIENT_DAILY_USD/u);
    expect(() => parseInputs({ AMBIENT_DAILY_USD: "-1" }, defaults)).toThrow(/AMBIENT_DAILY_USD/u);
    expect(() => parseInputs({ AMBIENT_DRY_RUN: "yes" }, defaults)).toThrow(/true or false/u);
    expect(() => parseInputs({ AMBIENT_MOCK: "true" }, defaults)).toThrow(/AMBIENT_MOCK/u);
    expect(parseInputs({ AMBIENT_PERSONA: "teresa", AMBIENT_DRY_RUN: "true", AMBIENT_MOCK: "true", AMBIENT_DAILY_USD: "0.4" }, defaults))
      .toMatchObject({ personas: ["teresa"], dryRun: true, mock: true, capUsd: 0.4 });
  });

  it("names the missing secrets, requires the ingest pair only for a real run, and never needs Gemini", () => {
    expect(missingSecrets({}, { dryRun: false, mock: false })).toEqual([
      "FAL_KEY (or OPENAI_API_KEY / GEMINI_API_KEY)",
      "OPENAI_API_KEY",
      "HEYDARLINK_INGEST_URL",
      "HEYDARLINK_INGEST_TOKEN"
    ]);
    const providers = { FAL_KEY: "x", OPENAI_API_KEY: "y" };
    expect(missingSecrets(providers, { dryRun: true, mock: false })).toEqual([]);
    expect(missingSecrets(providers, { dryRun: false, mock: false })).toEqual(["HEYDARLINK_INGEST_URL", "HEYDARLINK_INGEST_TOKEN"]);
    expect(missingSecrets({ ...providers, HEYDARLINK_INGEST_URL: "u", HEYDARLINK_INGEST_TOKEN: "t" }, { dryRun: false, mock: false })).toEqual([]);
    expect(missingSecrets({}, { dryRun: true, mock: true })).toEqual([]);
  });
});
