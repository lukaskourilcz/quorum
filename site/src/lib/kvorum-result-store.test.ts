import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseKvorumResultInput,
  writeKvorumOwnerResult
} from "./kvorum-result-store";

const recommendationRef = "state/ventures/kvorum/recommendations/2026-08-12-public-media.json";
const now = new Date("2026-08-13T08:05:00.000Z");
let root = "";

async function seed(status: "draft" | "posted" = "posted"): Promise<void> {
  const recommendation = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  if (status === "posted") {
    recommendation.status = "posted";
    recommendation.updatedAt = "2026-08-12T22:00:00.000Z";
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
      postedUrl: "https://example.com/kvorum/public-media"
    };
  }
  const target = path.join(root, recommendationRef);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(recommendation, null, 2)}\n`, "utf8");
}

function input(overrides: Record<string, unknown> = {}) {
  return parseKvorumResultInput({
    recommendationRef,
    platform: "instagram",
    capturedAt: "2026-08-13T08:00:00.000Z",
    metrics: {
      impressions: 1840,
      reach: 1512,
      saves: 43,
      shares: 31,
      comments: 18,
      follows: 7
    },
    note: "Copied manually from post insights.",
    ...overrides
  })!;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-results-"));
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("VERCEL", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("the Kvórum owner-result store", () => {
  it("writes one immutable result, links it to the recommendation and replays byte-for-byte", async () => {
    await seed();
    const first = await writeKvorumOwnerResult(input(), { root, now });
    expect(first).toMatchObject({ idempotent: false, persistence: "filesystem" });
    const saved = JSON.parse(await readFile(path.join(root, first.resultRef), "utf8")) as Record<string, unknown>;
    expect(saved).toMatchObject({
      schemaVersion: "owner-result-entry/1",
      enteredBy: "owner",
      recommendationId: "kv-2026-08-12-public-media",
      postUrl: "https://example.com/kvorum/public-media",
      metrics: { saves: 43, shares: 31 }
    });
    const recommendation = JSON.parse(await readFile(path.join(root, recommendationRef), "utf8")) as {
      owner: { resultRefs: string[] };
    };
    expect(recommendation.owner.resultRefs).toEqual([first.resultRef]);

    const before = await Promise.all([first.resultRef, recommendationRef].map((ref) => readFile(path.join(root, ref), "utf8")));
    const replay = await writeKvorumOwnerResult(input(), { root, now: new Date("2026-08-13T09:00:00.000Z") });
    expect(replay).toMatchObject({ idempotent: true, resultRef: first.resultRef });
    expect(await Promise.all([first.resultRef, recommendationRef].map((ref) => readFile(path.join(root, ref), "utf8"))))
      .toEqual(before);
  });

  it("refuses unposted intent, undeclared platforms, future captures and changed same-time numbers", async () => {
    await seed("draft");
    await expect(writeKvorumOwnerResult(input(), { root, now }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await seed();
    await expect(writeKvorumOwnerResult(input({ platform: "facebook" }), { root, now }))
      .rejects.toMatchObject({ code: "INVALID" });
    await expect(writeKvorumOwnerResult(input({ capturedAt: "2026-08-14T08:00:00.000Z" }), { root, now }))
      .rejects.toMatchObject({ code: "INVALID" });
    await writeKvorumOwnerResult(input(), { root, now });
    await expect(writeKvorumOwnerResult(input({
      metrics: { impressions: 1, reach: null, saves: null, shares: null, comments: null, follows: null }
    }), { root, now }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("parses only exact, nonnegative owner payloads with at least one metric", () => {
    expect(input()).not.toBeNull();
    expect(parseKvorumResultInput({
      ...input(),
      metrics: { impressions: null, reach: null, saves: null, shares: null, comments: null, follows: null }
    })).toBeNull();
    expect(parseKvorumResultInput({ ...input(), automated: true })).toBeNull();
  });
});
