import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { OwnerResultEntrySchema } from "../src/contracts/owner-result-entry.js";
import { VentureRecommendationSchema } from "../src/contracts/venture-recommendation.js";
import {
  PERFORMANCE_MAX_WEEKLY_DELTA,
  PERFORMANCE_MINIMUM_SAMPLES,
  PERFORMANCE_WEIGHT_FLOOR,
  PerformanceWeightsSchema,
  applyPerformanceWeightProposal,
  performanceIsoWeek,
  type PerformanceResultEvidence,
  type PerformanceWeightProposal
} from "../src/performance/weights.js";
import { repoRoot } from "../src/paths.js";
import {
  KVORUM_PERFORMANCE_WEIGHTS_PATH,
  KvorumPerformanceWeightsSchema,
  loadKvorumPerformanceWeights,
  writeKvorumPerformanceProposal
} from "../src/ventures/kvorum/performance.js";

const created: string[] = [];
const now = new Date("2026-08-13T10:00:00.000Z");
const resultIds = ["kv-result-01", "kv-result-02", "kv-result-03"];

async function committedState(): Promise<unknown> {
  return JSON.parse(await readFile(
    path.join(repoRoot, "state/ventures/kvorum/performance-weights.json"),
    "utf8"
  )) as unknown;
}

function proposal(overrides: Partial<PerformanceWeightProposal> = {}): PerformanceWeightProposal {
  return {
    schemaVersion: "performance-weight-proposal/1",
    id: "kv-performance-2026-w33",
    ventureId: "kvorum",
    week: "2026-W33",
    proposedAt: "2026-08-13T09:00:00.000Z",
    changes: [{
      axis: "format",
      key: "carousel",
      weight: 0.9,
      resultIds,
      reason: "Three owner-entered results support a small, reversible format adjustment."
    }],
    ...overrides
  };
}

function evidence(overrides: Partial<PerformanceResultEvidence> = {}): PerformanceResultEvidence[] {
  return resultIds.map((resultId) => ({
    resultId,
    topics: ["public-media-funding"],
    formats: ["carousel", "thread"],
    ...overrides
  }));
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Kvórum bounded performance weights", () => {
  test("pins neutral committed weights and the non-collapsing policy", async () => {
    const state = KvorumPerformanceWeightsSchema.parse(await committedState());
    expect(state).toMatchObject({
      revision: 0,
      policy: {
        minimumSamples: PERFORMANCE_MINIMUM_SAMPLES,
        weightFloor: PERFORMANCE_WEIGHT_FLOOR,
        maxWeeklyDelta: PERFORMANCE_MAX_WEEKLY_DELTA
      },
      formats: { carousel: { weight: 1, sampleSize: 0, proposalId: null } }
    });
    expect(performanceIsoWeek(new Date("2026-08-13T09:00:00.000Z"))).toBe("2026-W33");
  });

  test("applies one cited weekly proposal and records its complete explanation", async () => {
    const applied = applyPerformanceWeightProposal({
      state: await committedState(),
      proposal: proposal(),
      evidence: evidence(),
      now
    });
    expect(applied.idempotent).toBe(false);
    expect(applied.state).toMatchObject({
      revision: 1,
      formats: {
        carousel: {
          weight: 0.9,
          sampleSize: 3,
          proposalId: "kv-performance-2026-w33",
          updatedAt: now.toISOString()
        }
      },
      proposals: [{
        id: "kv-performance-2026-w33",
        week: "2026-W33",
        changes: [{
          axis: "format",
          key: "carousel",
          before: 1,
          after: 0.9,
          sampleSize: 3,
          resultIds
        }]
      }]
    });
    expect(applyPerformanceWeightProposal({
      state: applied.state,
      proposal: proposal(),
      evidence: [],
      now: new Date("2026-08-13T11:00:00.000Z")
    })).toMatchObject({ idempotent: true, state: applied.state });
  });

  test("refuses small samples, irrelevant or missing citations, floor breaches and manual edits", async () => {
    const state = await committedState();
    expect(() => applyPerformanceWeightProposal({
      state,
      proposal: proposal({ changes: [{ ...proposal().changes[0]!, resultIds: resultIds.slice(0, 2) }] }),
      evidence: evidence(),
      now
    })).toThrow("at least 3 cited results");
    expect(() => applyPerformanceWeightProposal({
      state,
      proposal: proposal(),
      evidence: evidence({ formats: ["thread"] }),
      now
    })).toThrow("does not support format:carousel");
    expect(() => applyPerformanceWeightProposal({
      state,
      proposal: proposal(),
      evidence: evidence().slice(0, 2),
      now
    })).toThrow("cannot resolve result");
    expect(() => applyPerformanceWeightProposal({
      state,
      proposal: proposal({ changes: [{ ...proposal().changes[0]!, weight: PERFORMANCE_WEIGHT_FLOOR }] }),
      evidence: evidence(),
      now
    })).toThrow("weekly delta bound");

    const tampered = structuredClone(state) as Record<string, unknown> & {
      formats: Record<string, Record<string, unknown>>;
    };
    tampered.formats.carousel!.weight = 0.9;
    expect(PerformanceWeightsSchema.safeParse(tampered).success).toBe(false);
  });

  test("the one writer resolves stored owner receipts and is byte-idempotent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-performance-"));
    created.push(root);
    const resultRefs = resultIds.map((_, index) =>
      `state/ventures/kvorum/results/2026-08-13-00000000000${index + 1}.json`);
    const recommendationRef = "state/ventures/kvorum/recommendations/2026-08-12-public-media.json";
    const [recommendationRaw, resultRaw, monitorRaw, weightsRaw] = await Promise.all([
      readFile(path.join(repoRoot, "contracts/fixtures/venture-recommendation.valid.json"), "utf8"),
      readFile(path.join(repoRoot, "contracts/fixtures/owner-result-entry.valid.json"), "utf8"),
      readFile(path.join(repoRoot, "contracts/fixtures/kvorum-monitor.valid.json"), "utf8"),
      readFile(path.join(repoRoot, "state/ventures/kvorum/performance-weights.json"), "utf8")
    ]);
    const recommendation = JSON.parse(recommendationRaw) as Record<string, unknown>;
    recommendation.status = "posted";
    recommendation.updatedAt = "2026-08-13T08:03:00.000Z";
    recommendation.designLab = {
      status: "queued",
      requestedAt: "2026-08-12T21:30:00.000Z",
      resolvedAt: null,
      recipeRef: null,
      artifactRefs: [],
      failureReason: null
    };
    recommendation.owner = {
      ...(recommendation.owner as Record<string, unknown>),
      approvedAt: "2026-08-12T21:30:00.000Z",
      postedAt: "2026-08-12T22:00:00.000Z",
      postedUrl: "https://example.com/kvorum/public-media",
      resultRefs
    };
    VentureRecommendationSchema.parse(recommendation);

    const files: Record<string, string> = {
      [KVORUM_PERFORMANCE_WEIGHTS_PATH]: weightsRaw,
      "ventures/kvorum/recommendations/2026-08-12-public-media.json": `${JSON.stringify(recommendation, null, 2)}\n`,
      "ventures/kvorum/monitor/2026-08-12.json": monitorRaw
    };
    for (const [index, resultId] of resultIds.entries()) {
      const result = {
        ...(JSON.parse(resultRaw) as Record<string, unknown>),
        id: resultId,
        recommendationRef,
        capturedAt: `2026-08-13T08:00:0${index}.000Z`,
        enteredAt: `2026-08-13T08:01:0${index}.000Z`
      };
      OwnerResultEntrySchema.parse(result);
      files[resultRefs[index]!.slice("state/".length)] = `${JSON.stringify(result, null, 2)}\n`;
    }
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }

    const first = await writeKvorumPerformanceProposal({ root, proposal: proposal(), now });
    expect(first).toMatchObject({ idempotent: false, artifact: "state/ventures/kvorum/performance-weights.json" });
    expect(first.state.formats.carousel).toMatchObject({ weight: 0.9, sampleSize: 3 });
    const before = await readFile(path.join(root, KVORUM_PERFORMANCE_WEIGHTS_PATH), "utf8");
    const replay = await writeKvorumPerformanceProposal({
      root,
      proposal: proposal(),
      now: new Date("2026-08-13T11:00:00.000Z")
    });
    expect(replay.idempotent).toBe(true);
    expect(await readFile(path.join(root, KVORUM_PERFORMANCE_WEIGHTS_PATH), "utf8")).toBe(before);
    await expect(loadKvorumPerformanceWeights(root)).resolves.toEqual(first.state);
  });
});
