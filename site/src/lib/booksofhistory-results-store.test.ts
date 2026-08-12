import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  BhResultPersistenceError,
  parseBhOwnerResultRequest,
  recordBhOwnerResult,
  type BhOwnerResultRequest
} from "./booksofhistory-results-store";
import { parseOwnerResultEntry } from "./owner-result-entry";

let root = "";

const input: BhOwnerResultRequest = {
  recommendationId: "rec-aaaaaaaaaaaaaaaaaaaa",
  locale: "cs",
  platform: "instagram",
  postUrl: "https://social.example/booksofhistory-cs",
  capturedAt: "2026-08-20T12:00:00.000Z",
  recordedAt: "2026-08-20T12:05:00.000Z",
  metrics: { views: 1200, likes: 84, comments: 7, shares: 13, saves: 31, follows: 5, linkTaps: null },
  note: "First owner-entered Czech lane result.",
  idempotencyKey: "result-cs-one"
};

async function recommendationFixture() {
  const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"), "utf8")) as Record<string, unknown>;
  return {
    ...fixture,
    status: "approved",
    updatedAt: "2026-08-20T12:00:00.000Z",
    designLab: {
      status: "ready",
      summaryRefs: {
        cs: "ventures/carousel-studio/summaries/booksofhistory/example-cs.json",
        en: "ventures/carousel-studio/summaries/booksofhistory/example-en.json"
      }
    },
    owner: {
      ...(fixture.owner as object),
      postedUrls: { cs: input.postUrl, en: null },
      editHistory: [{ at: "2026-08-20T11:55:00.000Z", action: "approve", locale: null, reason: null }]
    }
  };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-results-store-"));
  const recommendationPath = path.join(root, "state/ventures/booksofhistory/recommendations/feature.json");
  await mkdir(path.dirname(recommendationPath), { recursive: true });
  await writeFile(recommendationPath, `${JSON.stringify(await recommendationFixture(), null, 2)}\n`);
  await writeFile(path.join(root, "state/INBOX.md"), "- [ ] HUMAN_APPROVAL BH-RESULTS-004 — pending\n");
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("BOOKSOFHISTORY owner result store", () => {
  it("keeps manual results disabled behind BH-RESULTS-004 without writing state", async () => {
    await expect(recordBhOwnerResult(input)).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<BhResultPersistenceError>);
    await expect(readFile(path.join(root, "state/ventures/booksofhistory/results"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes and attaches one lane result, then replays its receipt idempotently", async () => {
    await writeFile(path.join(root, "state/INBOX.md"), "- [x] HUMAN_APPROVAL BH-RESULTS-004 — owner approved\n");

    const first = await recordBhOwnerResult(input);
    const second = await recordBhOwnerResult(input);

    expect(first).toMatchObject({ persistence: "filesystem", idempotent: false });
    expect(second).toMatchObject({ entry: { resultId: first.entry.resultId }, idempotent: true });
    const stored = parseOwnerResultEntry(JSON.parse(await readFile(
      path.join(root, `state/ventures/booksofhistory/results/${first.entry.resultId}.json`),
      "utf8"
    )));
    expect(stored).toEqual(first.entry);
    expect(stored).toMatchObject({ enteredBy: "owner", locale: "cs", metrics: { views: 1200, saves: 31 } });
    const recommendation = JSON.parse(await readFile(
      path.join(root, "state/ventures/booksofhistory/recommendations/feature.json"),
      "utf8"
    ));
    expect(recommendation.owner.resultRefs.cs).toEqual([
      `ventures/booksofhistory/results/${first.entry.resultId}.json`
    ]);
  });

  it("rejects absent metrics, negative counts, future capture and extra ingestion fields", () => {
    expect(parseBhOwnerResultRequest({ ...input, metrics: { ...input.metrics, views: null, likes: null, comments: null, shares: null, saves: null, follows: null } })).toBeNull();
    expect(parseBhOwnerResultRequest({ ...input, metrics: { ...input.metrics, views: -1 } })).toBeNull();
    expect(parseBhOwnerResultRequest({ ...input, capturedAt: "2026-08-21T12:00:00.000Z" })).toBeNull();
    expect(parseBhOwnerResultRequest({ ...input, ingestionSource: "api" })).toBeNull();
  });
});
