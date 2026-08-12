import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminDoorMoney } from "./admin-door-money";

const roots: string[] = [];
const fixtureRoot = path.resolve(process.cwd(), "..");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(fixtureRoot, "contracts", "fixtures", name), "utf8")) as Record<string, unknown>;
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "admin-door-money-"));
  roots.push(root);
  return root;
}

async function json(root: string, relativePath: string, value: unknown): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(value));
}

async function installKnowledge(root: string): Promise<void> {
  const [index, styleProfile] = await Promise.all([
    fixture("book-kb-index.valid.json"),
    fixture("style-profile.valid.json")
  ]);
  const manuscriptHash = String(index.manuscriptHash);
  const version = manuscriptHash.slice("sha256:".length);
  const prefix = `state/ventures/door-money/knowledge/versions/${version}`;
  await Promise.all([
    json(root, `${prefix}/book-kb-index.json`, index),
    json(root, `${prefix}/style-profile.json`, styleProfile),
    json(root, "state/ventures/door-money/knowledge/current.json", {
      schemaVersion: "door-money-knowledge-current/1",
      manuscriptHash,
      bookKbIndexPath: `${prefix}/book-kb-index.json`,
      styleProfilePath: `${prefix}/style-profile.json`,
      generatedAt: "2026-08-12T10:15:00.000Z"
    })
  ]);
}

describe("Door Money admin loader", () => {
  it("names absent stores without inventing records or unreadables", async () => {
    const root = await temporaryRoot();
    await expect(readAdminDoorMoney(root)).resolves.toEqual({
      recommendations: { state: "missing", items: [], unreadable: 0 },
      knowledge: { state: "missing", index: null, styleProfile: null, unreadable: 0 },
      unreadable: 0
    });
  });

  it("loads fixture state through a path-free, public-derivative boundary", async () => {
    const root = await temporaryRoot();
    await Promise.all([
      json(
        root,
        "state/ventures/door-money/recommendations/fixture-radio-carousel.json",
        await fixture("venture-recommendation.valid.json")
      ),
      installKnowledge(root)
    ]);

    const snapshot = await readAdminDoorMoney(root);
    expect(snapshot.recommendations).toMatchObject({
      state: "present",
      unreadable: 0,
      items: [{ id: "fixture-radio-carousel", evidence: { excerptChunkId: "ch01-s01-c001" } }]
    });
    expect(snapshot.knowledge).toMatchObject({
      state: "present",
      unreadable: 0,
      index: { chunkCount: 1, ingestionCostUsd: 0 },
      styleProfile: { chapterNoteCount: 3 }
    });
    const publicJson = JSON.stringify(snapshot);
    for (const privateField of [
      "state/", "summaryPath", "ratingRef", "recommendationPath", "bookKbIndexPath",
      "styleProfilePath", "byteOffsets", "embeddingId", "fullText", '"embeddings"'
    ]) expect(publicJson).not.toContain(privateField);
    expect(snapshot.recommendations.items[0]?.evidence.excerpt.length).toBeLessThanOrEqual(600);
    expect(snapshot.knowledge.styleProfile?.exemplars.every(({ text }) => text.length <= 280)).toBe(true);
  });

  it("drops malformed recommendations independently and counts each dropped file", async () => {
    const root = await temporaryRoot();
    await Promise.all([
      json(
        root,
        "state/ventures/door-money/recommendations/valid.json",
        await fixture("venture-recommendation.valid.json")
      ),
      json(
        root,
        "state/ventures/door-money/recommendations/poison.json",
        await fixture("venture-recommendation.poison.json")
      )
    ]);
    const mixed = await readAdminDoorMoney(root);
    expect(mixed.recommendations).toMatchObject({ state: "present", unreadable: 1 });
    expect(mixed.recommendations.items.map(({ id }) => id)).toEqual(["fixture-radio-carousel"]);

    await rm(path.join(root, "state/ventures/door-money/recommendations/valid.json"));
    const allMalformed = await readAdminDoorMoney(root);
    expect(allMalformed.recommendations).toEqual({ state: "unreadable", items: [], unreadable: 1 });
  });

  it("pins rating history to stored recommendation bytes and counts malformed rating lines", async () => {
    const root = await temporaryRoot();
    const stored = await fixture("venture-recommendation.valid.json");
    const raw = JSON.stringify(stored);
    const contentHash = `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
    await json(root, "state/ventures/door-money/recommendations/fixture-radio-carousel.json", stored);
    const ledgerPath = path.join(root, "state/ratings/door-money/ledger.jsonl");
    await mkdir(path.dirname(ledgerPath), { recursive: true });
    await writeFile(ledgerPath, `${JSON.stringify({
      schemaVersion: "rating/1",
      id: "r-2026-08-12-abcd",
      ventureId: "door-money",
      objectKind: "recommendation",
      objectRef: { id: "fixture-radio-carousel", contentHash },
      rating: "good",
      ratedAt: "2026-08-12T11:00:00.000Z"
    })}\n{not-json\n`);

    const snapshot = await readAdminDoorMoney(root);
    expect(snapshot.recommendations).toMatchObject({
      state: "present",
      unreadable: 1,
      items: [{
        id: "fixture-radio-carousel",
        contentHash,
        ratings: [{ objectKind: "recommendation", rating: "good" }]
      }]
    });
  });

  it("withholds partial knowledge when the current pointer or a linked artifact is unreadable", async () => {
    const root = await temporaryRoot();
    await json(root, "state/ventures/door-money/knowledge/current.json", {
      schemaVersion: "door-money-knowledge-current/1",
      manuscriptHash: `sha256:${"a".repeat(64)}`,
      bookKbIndexPath: "state/ventures/door-money/knowledge/../../private.json",
      styleProfilePath: "state/ventures/door-money/knowledge/style-profile.json",
      generatedAt: "2026-08-12T10:15:00.000Z"
    });
    expect((await readAdminDoorMoney(root)).knowledge).toEqual({
      state: "unreadable", index: null, styleProfile: null, unreadable: 1
    });

    const missingArtifactsRoot = await temporaryRoot();
    const manuscriptHash = `sha256:${"b".repeat(64)}`;
    const prefix = `state/ventures/door-money/knowledge/versions/${"b".repeat(64)}`;
    await json(missingArtifactsRoot, "state/ventures/door-money/knowledge/current.json", {
      schemaVersion: "door-money-knowledge-current/1",
      manuscriptHash,
      bookKbIndexPath: `${prefix}/book-kb-index.json`,
      styleProfilePath: `${prefix}/style-profile.json`,
      generatedAt: "2026-08-12T10:15:00.000Z"
    });
    expect((await readAdminDoorMoney(missingArtifactsRoot)).knowledge).toEqual({
      state: "unreadable", index: null, styleProfile: null, unreadable: 2
    });
  });

  it("rejects a public index whose byte ranges exceed the recorded manuscript size", async () => {
    const root = await temporaryRoot();
    const index = await fixture("book-kb-index.valid.json");
    const chunks = index.chunks as Array<Record<string, unknown>>;
    chunks[0] = { ...chunks[0], byteOffsets: { start: 0, end: 1_201 } };
    const styleProfile = await fixture("style-profile.valid.json");
    const manuscriptHash = String(index.manuscriptHash);
    const version = manuscriptHash.slice("sha256:".length);
    const prefix = `state/ventures/door-money/knowledge/versions/${version}`;
    await Promise.all([
      json(root, `${prefix}/book-kb-index.json`, index),
      json(root, `${prefix}/style-profile.json`, styleProfile),
      json(root, "state/ventures/door-money/knowledge/current.json", {
        schemaVersion: "door-money-knowledge-current/1",
        manuscriptHash,
        bookKbIndexPath: `${prefix}/book-kb-index.json`,
        styleProfilePath: `${prefix}/style-profile.json`,
        generatedAt: "2026-08-12T10:15:00.000Z"
      })
    ]);
    expect((await readAdminDoorMoney(root)).knowledge).toEqual({
      state: "unreadable", index: null, styleProfile: null, unreadable: 1
    });
  });
});
