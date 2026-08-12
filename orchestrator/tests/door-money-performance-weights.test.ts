import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerResultEntrySchema } from "../src/contracts/owner-result-entry.js";
import { PerformanceWeightsSchema } from "../src/contracts/performance-weights.js";
import { VentureRecommendationSchema } from "../src/contracts/venture-recommendation.js";
import {
  commitDoorMoneyPerformanceWeights,
  loadDoorMoneyPerformanceWeights,
  loadDoorMoneyResultDimensions,
  prepareDoorMoneyPerformanceWeights
} from "../src/ventures/door-money/performance-weights.js";
import { repoRoot } from "../src/paths.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "door-money-weights-"));
  roots.push(root);
  return root;
}

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", name), "utf8")) as Record<string, unknown>;
}

async function json(root: string, relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function installCitedResult(root: string) {
  const recommendationRaw = await fixture("venture-recommendation.valid.json");
  const manuscriptHash = String((recommendationRaw.evidence as { manuscriptHash: string }).manuscriptHash);
  const originalHistory = recommendationRaw.statusHistory as unknown[];
  const recommendation = VentureRecommendationSchema.parse({
    ...recommendationRaw,
    status: "posted",
    designLab: {
      eligible: true,
      summaryPath: "state/ventures/carousel-studio/summaries/door-money/2026-08-12-fixture-radio-carousel.json",
      readyAt: "2026-08-12T11:00:00.000Z"
    },
    owner: {
      ...(recommendationRaw.owner as object),
      approvedAt: "2026-08-12T11:00:00.000Z",
      postedAt: "2026-08-12T12:00:00.000Z",
      postedUrl: "https://example.test/posts/fixture-radio-carousel"
    },
    statusHistory: [
      ...originalHistory,
      { from: "draft", to: "approved", at: "2026-08-12T11:00:00.000Z", actor: "owner", reason: null },
      { from: "approved", to: "posted", at: "2026-08-12T12:00:00.000Z", actor: "owner", reason: null }
    ],
    updatedAt: "2026-08-12T12:00:00.000Z"
  });
  const result = OwnerResultEntrySchema.parse({
    ...(await fixture("owner-result-entry.valid.json")),
    id: "owner-result-fixture-weight",
    postUrl: recommendation.owner.postedUrl,
    capturedAt: "2026-08-13T13:00:00.000Z"
  });
  await Promise.all([
    json(root, `ventures/door-money/recommendations/${recommendation.id}.json`, recommendation),
    json(root, `ventures/door-money/results/${result.id}.json`, result),
    json(root, `ventures/door-money/knowledge/versions/${manuscriptHash.slice("sha256:".length)}/book-kb-index.json`,
      await fixture("book-kb-index.valid.json"))
  ]);
  return { recommendation, result };
}

describe("Door Money performance weights", () => {
  it("keeps missing and malformed state neutral while naming the state honestly", async () => {
    const missingRoot = await temporaryRoot();
    await expect(loadDoorMoneyPerformanceWeights(missingRoot)).resolves.toMatchObject({
      state: "missing",
      weights: { formatPriors: { carousel: 1 }, themePriors: {}, hookStylePriors: { "quote-led": 1 } }
    });
    const invalidRoot = await temporaryRoot();
    await json(invalidRoot, "ventures/door-money/performance-weights.json", {
      schemaVersion: "performance-weights/1", formatPriors: { carousel: 0.1 }
    });
    await expect(loadDoorMoneyPerformanceWeights(invalidRoot)).resolves.toMatchObject({
      state: "invalid",
      record: null,
      weights: { formatPriors: { carousel: 1 }, themePriors: {}, hookStylePriors: { "narrative-led": 1 } }
    });
  });

  it("derives format, theme and hook style from the cited recommendation and public KB", async () => {
    const root = await temporaryRoot();
    const { recommendation, result } = await installCitedResult(root);
    await expect(loadDoorMoneyResultDimensions(root, result)).resolves.toEqual({
      formats: ["carousel"],
      themes: ["community-memory", "resourcefulness"],
      hookStyles: ["narrative-led"]
    });
    await expect(loadDoorMoneyResultDimensions(root, {
      ...result,
      platform: "x"
    })).resolves.toBeNull();
    await json(root, `ventures/door-money/recommendations/${result.recommendationId}.json`, {
      ...recommendation,
      id: "fixture-mismatched-carousel"
    });
    await expect(loadDoorMoneyResultDimensions(root, result)).resolves.toBeNull();
  });

  it("records one deterministic weekly proposal and replays every current prior from its citation", async () => {
    const root = await temporaryRoot();
    const { result } = await installCitedResult(root);
    const dimensions = await loadDoorMoneyResultDimensions(root, result);
    const input = {
      root,
      cycleId: "fixture-growth-weight-1",
      now: new Date("2026-08-13T14:00:00.000Z"),
      proposal: {
        rationale: "The synthetic owner result supports one bounded selection adjustment.",
        evidenceResultIds: [result.id],
        changes: {
          formatPriors: { carousel: 1.2 },
          themePriors: { "community-memory": 1.1 },
          hookStylePriors: { "narrative-led": 1.15 }
        }
      },
      availableResults: [{ id: result.id, selectionDimensions: dimensions }]
    };
    const first = await prepareDoorMoneyPerformanceWeights(input);
    await commitDoorMoneyPerformanceWeights(root, first);
    const retry = await prepareDoorMoneyPerformanceWeights(input);
    expect(retry.changed).toBe(false);
    expect(retry.record).toEqual(first.record);
    const loaded = await loadDoorMoneyPerformanceWeights(root);
    expect(loaded).toMatchObject({
      state: "present",
      weights: {
        formatPriors: { carousel: 1.2 },
        themePriors: { "community-memory": 1.1 },
        hookStylePriors: { "narrative-led": 1.15 }
      },
      record: { revisions: [{ sourceCycleId: "fixture-growth-weight-1", evidenceResultIds: [result.id] }] }
    });
  });

  it("rejects uncited, unsupported, out-of-floor and directly mutated adjustments", async () => {
    const root = await temporaryRoot();
    const { result } = await installCitedResult(root);
    const selectionDimensions = await loadDoorMoneyResultDimensions(root, result);
    const base = {
      root, cycleId: "fixture-growth-invalid", now: new Date("2026-08-13T14:00:00.000Z"),
      availableResults: [{ id: result.id, selectionDimensions }]
    };
    await expect(prepareDoorMoneyPerformanceWeights({
      ...base,
      proposal: { rationale: "No citation.", evidenceResultIds: [], changes: {
        formatPriors: { carousel: 1.1 }, themePriors: {}, hookStylePriors: {}
      } }
    })).rejects.toThrow();
    await expect(prepareDoorMoneyPerformanceWeights({
      ...base,
      proposal: { rationale: "Unsupported dimension.", evidenceResultIds: [result.id], changes: {
        formatPriors: { thread: 1.1 }, themePriors: {}, hookStylePriors: {}
      } }
    })).rejects.toThrow(/do not support/u);
    await expect(prepareDoorMoneyPerformanceWeights({
      ...base,
      proposal: { rationale: "Below floor.", evidenceResultIds: [result.id], changes: {
        formatPriors: { carousel: 0.49 }, themePriors: {}, hookStylePriors: {}
      } }
    })).rejects.toThrow();

    const directMutation = await fixture("performance-weights.valid.json");
    (directMutation.formatPriors as Record<string, number>).carousel = 1.3;
    expect(PerformanceWeightsSchema.safeParse(directMutation).success).toBe(false);
    await json(root, "ventures/door-money/performance-weights.json", directMutation);
    await expect(prepareDoorMoneyPerformanceWeights({
      ...base,
      proposal: { rationale: "Would overwrite drift.", evidenceResultIds: [result.id], changes: {
        formatPriors: { carousel: 1.1 }, themePriors: {}, hookStylePriors: {}
      } }
    })).rejects.toThrow(/invalid and were not overwritten/u);
  });

  it("keeps the canonical state path writable only from the Thursday growth module", async () => {
    const sourceRoot = path.join(repoRoot, "orchestrator", "src", "ventures", "door-money");
    const files = ["run.ts", "growth.ts", "growth-booker.ts", "growth-playbooks.ts", "performance-weights.ts"];
    const sources = await Promise.all(files.map(async (name) => [name, await readFile(path.join(sourceRoot, name), "utf8")] as const));
    expect(sources.filter(([, source]) => source.includes("atomicWriteJson(root, plan.relative, plan.record)"))
      .map(([name]) => name)).toEqual(["performance-weights.ts"]);
    expect(sources.filter(([, source]) => source.includes("commitDoorMoneyPerformanceWeights(root"))
      .map(([name]) => name)).toEqual(["growth.ts"]);
    const runSource = sources.find(([name]) => name === "run.ts")![1];
    expect(runSource).toContain("loadDoorMoneyPerformanceWeights(root)");
    expect(runSource).not.toContain("(weightsRaw ?? {}) as SelectionPerformanceWeights");
  });
});
