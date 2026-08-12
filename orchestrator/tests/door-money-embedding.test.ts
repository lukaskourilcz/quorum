import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BudgetLedgerEntrySchema,
  DEFAULT_BUDGET_LIMITS,
  estimateEmbeddingCall,
  type ReserveContext
} from "../src/budget.js";
import {
  guardedEmbeddingCall,
  type EmbeddingProvider
} from "../src/llm/embedding.js";
import { readJson } from "../src/state.js";

async function stateRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "door-money-embedding-"));
}

function budgetContext(cycleId: string, limits = DEFAULT_BUDGET_LIMITS): ReserveContext {
  return {
    now: new Date("2026-08-12T10:00:00.000Z"),
    cycleId,
    stage: "DISCOVERY",
    ledger: [],
    allInNonApiSpentUsd: 0,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    remainingScheduledCycles: 1,
    limits
  };
}

describe("guarded Door Money embeddings", () => {
  it("reserves, calls a provider double, and records cost without persisting vectors", async () => {
    const root = await stateRoot();
    try {
      const requests: Array<{ model: string; texts: string[] }> = [];
      const provider: EmbeddingProvider = {
        embed: async (input) => {
          requests.push(input);
          return {
            model: "text-embedding-3-small",
            tokensIn: 20,
            vectors: [[0.25, -0.5], [0.75, 0.125]]
          };
        }
      };
      const result = await guardedEmbeddingCall({
        stateRoot: root,
        cycleId: "fixture-embedding",
        items: [
          { id: "synthetic-chunk-1", text: "An invented scene about a paper route." },
          { id: "synthetic-chunk-2", text: "An invented scene about a quiet stage." }
        ],
        budgetContext: budgetContext("fixture-embedding"),
        provider
      });

      expect(requests).toEqual([{
        model: "text-embedding-3-small",
        texts: [
          "An invented scene about a paper route.",
          "An invented scene about a quiet stage."
        ]
      }]);
      expect(result).toMatchObject({
        model: "text-embedding-3-small",
        tokensIn: 20,
        usd: 4e-7,
        items: [
          { id: "synthetic-chunk-1", embedding: [0.25, -0.5] },
          { id: "synthetic-chunk-2", embedding: [0.75, 0.125] }
        ]
      });

      const ledgerRaw = await readFile(path.join(root, "budget/ledger.json"), "utf8");
      const ledger = JSON.parse(ledgerRaw) as { entries: unknown[] };
      expect(ledger.entries).toHaveLength(1);
      expect(BudgetLedgerEntrySchema.parse(ledger.entries[0])).toMatchObject({
        cycleId: "fixture-embedding",
        phase: "book-ingest",
        ventureId: "door-money",
        agent: "BOOK_INGEST",
        provider: "openai",
        model: "text-embedding-3-small",
        tokensIn: 20,
        tokensOut: 0,
        usd: 4e-7
      });
      expect(ledgerRaw).not.toContain("An invented scene");
      expect(ledgerRaw).not.toContain("0.25");

      await expect(guardedEmbeddingCall({
        stateRoot: root,
        cycleId: "fixture-embedding",
        items: [
          { id: "synthetic-chunk-1", text: "An invented scene about a paper route." },
          { id: "synthetic-chunk-2", text: "An invented scene about a quiet stage." }
        ],
        budgetContext: budgetContext("fixture-embedding"),
        provider
      })).rejects.toThrow(/already billed/);
      expect(requests).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the dated official small-embedding price", () => {
    expect(estimateEmbeddingCall({
      model: "text-embedding-3-small",
      inputChars: 3_500_000,
      at: new Date("2026-08-12T10:00:00.000Z")
    })).toMatchObject({
      estimatedInputTokens: 1_000_000,
      estimatedOutputTokens: 0,
      estimatedUsd: 0.02,
      priceVerifiedAt: "2026-08-12",
      priceSourceUrl: "https://developers.openai.com/api/docs/models/text-embedding-3-small"
    });
  });

  it("refuses an unreservable or dry call before reaching the provider", async () => {
    const root = await stateRoot();
    try {
      let providerCalls = 0;
      const provider: EmbeddingProvider = {
        embed: async () => {
          providerCalls += 1;
          return { model: "text-embedding-3-small", tokensIn: 1, vectors: [[0.1]] };
        }
      };
      await expect(guardedEmbeddingCall({
        stateRoot: root,
        cycleId: "fixture-embedding-cap",
        items: [{ id: "synthetic-chunk", text: "Synthetic input." }],
        budgetContext: budgetContext("fixture-embedding-cap", {
          ...DEFAULT_BUDGET_LIMITS,
          perTextCallUsd: 0
        }),
        provider
      })).rejects.toThrow(/Estimated embedding/);
      await expect(guardedEmbeddingCall({
        stateRoot: root,
        cycleId: "fixture-embedding-dry",
        items: [{ id: "synthetic-chunk", text: "Synthetic input." }],
        budgetContext: budgetContext("fixture-embedding-dry"),
        dry: true,
        provider
      })).rejects.toThrow(/dry cycle/);
      expect(providerCalls).toBe(0);
      expect(await readJson(root, "budget/ledger.json", null)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records a billed malformed response before rejecting its vectors", async () => {
    const root = await stateRoot();
    try {
      await expect(guardedEmbeddingCall({
        stateRoot: root,
        cycleId: "fixture-embedding-malformed",
        items: [
          { id: "synthetic-chunk-1", text: "First synthetic input." },
          { id: "synthetic-chunk-2", text: "Second synthetic input." }
        ],
        budgetContext: budgetContext("fixture-embedding-malformed"),
        provider: {
          embed: async () => ({
            model: "text-embedding-3-small",
            tokensIn: 9,
            vectors: [[0.5, 0.25]]
          })
        }
      })).rejects.toThrow(/1 vectors for 2 inputs/);
      const ledger = await readJson<{ entries: unknown[] }>(root, "budget/ledger.json", { entries: [] });
      expect(ledger.entries).toHaveLength(1);
      expect(BudgetLedgerEntrySchema.parse(ledger.entries[0])).toMatchObject({
        cycleId: "fixture-embedding-malformed",
        tokensIn: 9
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
