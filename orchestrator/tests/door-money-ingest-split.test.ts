import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_BUDGET_LIMITS,
  type BudgetLedgerEntry,
  type ReserveContext
} from "../src/budget.js";
import { BookKbIndexSchema } from "../src/contracts/book-kb-index.js";
import { StyleProfileSchema } from "../src/contracts/style-profile.js";
import type { GuardedCallInput } from "../src/llm/call.js";
import {
  inspectDoorMoneyPublicArtifacts,
  type DoorMoneyPublicArtifact
} from "../src/ventures/door-money/public-boundary.js";
import { dryBookIngestCall } from "../src/ventures/door-money/ingest/dry-fixture.js";
import type { BookIngestCall } from "../src/ventures/door-money/ingest/annotate.js";
import { runBookIngest } from "../src/ventures/door-money/ingest/run.js";
import { LocalCloneBookIngestStore } from "../src/ventures/door-money/ingest/store.js";

const fixturePath = path.join(process.cwd(), "tests/fixtures/door-money/synthetic-diary.md");
let fixture = "";

beforeAll(async () => {
  fixture = await readFile(fixturePath, "utf8");
});

async function roots(): Promise<{ state: string; private: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(tmpdir(), "door-money-ingest-split-"));
  return {
    state: path.join(root, "public-state"),
    private: path.join(root, "private-clone"),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function reserveContext(now: Date) {
  return async (entries: readonly BudgetLedgerEntry[], cycleId: string): Promise<ReserveContext> => ({
    now,
    cycleId,
    stage: "DISCOVERY",
    ledger: entries,
    allInNonApiSpentUsd: 0,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    remainingScheduledCycles: 1,
    limits: { ...DEFAULT_BUDGET_LIMITS, dailyUsd: 1, monthlyApiUsd: 25, monthlyOperatingUsd: 50 }
  });
}

function versionPath(root: string, manuscriptHash: string, tail: string): string {
  return path.join(root, "kb", "versions", manuscriptHash.slice("sha256:".length), tail);
}

function publicVersionPath(root: string, manuscriptHash: string, tail: string): string {
  return path.join(
    root,
    "ventures",
    "door-money",
    "knowledge",
    "versions",
    manuscriptHash.slice("sha256:".length),
    tail
  );
}

async function artifact(filePath: string, stateRoot: string): Promise<DoorMoneyPublicArtifact> {
  return {
    path: `state/${path.relative(stateRoot, filePath).replaceAll(path.sep, "/")}`,
    content: await readFile(filePath, "utf8")
  };
}

describe("Door Money public/private ingestion split", () => {
  it("writes raw chunks and vectors only to the private clone and validates actual public shapes", async () => {
    const root = await roots();
    try {
      const now = new Date("2026-08-12T10:00:00.000Z");
      const store = new LocalCloneBookIngestStore(root.private, root.state);
      const report = await runBookIngest({
        source: fixture,
        stateRoot: root.state,
        privateRoot: root.private,
        privateStore: store,
        approved: false,
        dry: true,
        now,
        reserveContext: reserveContext(now)
      });
      expect(report.status).toBe("complete");
      const manuscriptHash = report.manuscriptHash!;

      const privateChunk = await readFile(
        versionPath(root.private, manuscriptHash, "chunks/ch01-s01-c001.json"),
        "utf8"
      );
      const privateEmbeddings = await readFile(
        versionPath(root.private, manuscriptHash, "embeddings.json"),
        "utf8"
      );
      expect(privateChunk).toContain("crossed out the clever shortcut");
      expect(privateChunk).toContain('"context"');
      expect(privateEmbeddings).toContain('"embedding"');

      const indexPath = publicVersionPath(root.state, manuscriptHash, "book-kb-index.json");
      const stylePath = publicVersionPath(root.state, manuscriptHash, "style-profile.json");
      const manifestPath = path.join(root.state, "ventures/door-money/knowledge/versions.json");
      const currentPath = path.join(root.state, "ventures/door-money/knowledge/current.json");
      const indexRaw = await readFile(indexPath, "utf8");
      const styleRaw = await readFile(stylePath, "utf8");
      const index = BookKbIndexSchema.parse(JSON.parse(indexRaw));
      const style = StyleProfileSchema.parse(JSON.parse(styleRaw));
      expect(index).toMatchObject({ manuscriptHash, chunkCount: 8, ingestionCostUsd: 0 });
      expect(index.chunks.every((chunk) => !("text" in chunk) && !("context" in chunk))).toBe(true);
      expect(style.exemplarBank).toHaveLength(8);
      expect(style.exemplarBank.every(({ text }) => text.length <= 280)).toBe(true);
      const privateEmbeddingIds = new Set((JSON.parse(privateEmbeddings) as {
        embeddings: Array<{ id: string }>;
      }).embeddings.map(({ id }) => id));
      expect(style.exemplarBank.every(({ embeddingId }) => privateEmbeddingIds.has(embeddingId))).toBe(true);
      expect(indexRaw).not.toMatch(/"embedding"\s*:\s*\[/u);

      const publicArtifacts = await Promise.all([
        artifact(indexPath, root.state),
        artifact(stylePath, root.state),
        artifact(manifestPath, root.state),
        artifact(currentPath, root.state)
      ]);
      expect(inspectDoorMoneyPublicArtifacts(publicArtifacts)).toEqual([]);
    } finally {
      await root.cleanup();
    }
  });

  it("reuses an identical hash without calls or duplicate writes and supersedes without mutating old files", async () => {
    const root = await roots();
    try {
      const now = new Date("2026-08-12T10:00:00.000Z");
      const store = new LocalCloneBookIngestStore(root.private, root.state);
      let calls = 0;
      const call: BookIngestCall = async <T>(request: GuardedCallInput<T>) => {
        calls += 1;
        return dryBookIngestCall(request);
      };
      const run = (source: string, at = now) => runBookIngest({
        source,
        stateRoot: root.state,
        privateRoot: root.private,
        privateStore: store,
        approved: false,
        dry: true,
        now: at,
        reserveContext: reserveContext(at),
        call
      });

      const first = await run(fixture);
      expect(first.status).toBe("complete");
      expect(calls).toBe(14);
      const oldHash = first.manuscriptHash!;
      const oldPrivatePath = versionPath(root.private, oldHash, "chunks/ch01-s01-c001.json");
      const oldPublicPath = publicVersionPath(root.state, oldHash, "book-kb-index.json");
      const oldPrivateBytes = await readFile(oldPrivatePath, "utf8");
      const oldPublicBytes = await readFile(oldPublicPath, "utf8");

      const replay = await run(fixture);
      expect(replay).toEqual({ ...first, reused: true });
      expect(calls).toBe(14);
      expect(await readFile(oldPrivatePath, "utf8")).toBe(oldPrivateBytes);
      expect(await readFile(oldPublicPath, "utf8")).toBe(oldPublicBytes);

      const changed = fixture.replace("Day 1 began", "Day one began");
      const second = await run(changed, new Date("2026-08-12T11:00:00.000Z"));
      expect(second.status).toBe("complete");
      expect(second.manuscriptHash).not.toBe(oldHash);
      expect(calls).toBe(28);
      expect(await readFile(oldPrivatePath, "utf8")).toBe(oldPrivateBytes);
      expect(await readFile(oldPublicPath, "utf8")).toBe(oldPublicBytes);

      const manifest = JSON.parse(await readFile(
        path.join(root.state, "ventures/door-money/knowledge/versions.json"),
        "utf8"
      )) as {
        currentManuscriptHash: string;
        versions: Array<{ manuscriptHash: string; status: string; supersededBy: string | null }>;
      };
      expect(manifest.currentManuscriptHash).toBe(second.manuscriptHash);
      expect(manifest.versions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          manuscriptHash: oldHash,
          status: "superseded",
          supersededBy: second.manuscriptHash
        }),
        expect.objectContaining({
          manuscriptHash: second.manuscriptHash,
          status: "current",
          supersededBy: null
        })
      ]));
    } finally {
      await root.cleanup();
    }
  });

  it("refuses overlapping private and public roots", async () => {
    const root = await roots();
    try {
      expect(() => new LocalCloneBookIngestStore(
        path.join(root.state, "ventures/door-money/private"),
        root.state
      )).toThrow(/must not overlap/);
    } finally {
      await root.cleanup();
    }
  });
});
