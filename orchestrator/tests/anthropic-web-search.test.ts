import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUDGET_LIMITS, estimateTextCall } from "../src/budget.js";
import { AnthropicTextClient } from "../src/llm/anthropic.js";
import {
  ANTHROPIC_WEB_SEARCH_PROVIDER_ID,
  createAnthropicWebSearchRegistry,
  resolveResearchProvider
} from "../src/research/provider.js";

const sdk = vi.hoisted(() => ({ requests: [] as Array<Record<string, unknown>> }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (request: Record<string, unknown>) => {
        sdk.requests.push(request);
        return {
          stop_reason: "end_turn",
          model: "claude-haiku-4-5-20251001",
          content: [{ type: "text", text: '{"findings":["verified"]}' }],
          usage: {
            input_tokens: 1_000,
            output_tokens: 200,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 }
          }
        };
      }
    };
  }
}));

afterEach(() => {
  sdk.requests.length = 0;
  vi.unstubAllEnvs();
});

describe("anthropic-web-search research provider", () => {
  it("refuses a request above the eight-search design ceiling before reaching the SDK", async () => {
    const client = new AnthropicTextClient("test-key");
    await expect(client.generate({
      model: "claude-haiku-4-5-20251001",
      system: "Return JSON.",
      input: "Research one book.",
      maxOutputTokens: 100,
      webSearchUses: 9
    })).rejects.toThrow("integer from 1 to 8");
    expect(sdk.requests).toHaveLength(0);
  });

  it("reserves before the call, exposes the pinned tool, and records actual tool uses", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-research-provider-"));
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const now = vi.fn()
      .mockReturnValueOnce(new Date("2026-08-12T10:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-12T10:00:01.000Z"));
    try {
      const registry = createAnthropicWebSearchRegistry({
        stateRoot: root,
        cycleId: "bh-20260812-001",
        phase: "bh-research",
        ventureId: "booksofhistory",
        agent: "RESEARCH_GATHER",
        model: "claude-haiku-4-5-20251001",
        system: "Return source-grounded JSON.",
        maxOutputTokens: 4_000,
        webSearchUses: 5,
        maxSearchContentTokens: 20_000,
        budgetContext: {
          now: new Date("2026-08-12T10:00:00.000Z"),
          cycleId: "bh-20260812-001",
          stage: "VALIDATION",
          ledger: [],
          allInNonApiSpentUsd: 0,
          allInCommittedUsd: 0,
          knownMonthlyForecastUsd: 0,
          remainingScheduledCycles: 1,
          limits: DEFAULT_BUDGET_LIMITS
        },
        now
      });
      const provider = resolveResearchProvider(
        { providerId: ANTHROPIC_WEB_SEARCH_PROVIDER_ID },
        registry
      );

      const result = await provider.researchBook({
        bookRef: "ventures/booksofhistory/seed/library.json#book-001",
        brief: { objective: "Verify its publishing story" },
        envelopeUsd: 0.1
      });

      expect(sdk.requests).toHaveLength(1);
      expect(sdk.requests[0]).toMatchObject({
        tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 5 }]
      });
      expect(result).toMatchObject({
        response: { findings: ["verified"] },
        providerId: ANTHROPIC_WEB_SEARCH_PROVIDER_ID,
        searchUses: 2,
        startedAt: "2026-08-12T10:00:00.000Z",
        completedAt: "2026-08-12T10:00:01.000Z"
      });

      const ledger = JSON.parse(await readFile(path.join(root, "budget", "ledger.json"), "utf8")) as {
        entries: Array<{ toolUses: number; usd: number }>;
      };
      const expected = estimateTextCall({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        promptChars: 1_000 * 3.5,
        maxOutputTokens: 200,
        webSearchUses: 2,
        maxSearchContentTokens: 20_000
      });
      expect(ledger.entries).toEqual([{ toolUses: 2, usd: expected.estimatedUsd }].map((entry) =>
        expect.objectContaining(entry)
      ));
      expect(result.usd).toBe(expected.estimatedUsd);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses an over-envelope reservation before constructing the paid client", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-research-cap-"));
    try {
      const registry = createAnthropicWebSearchRegistry({
        stateRoot: root,
        cycleId: "bh-cap",
        phase: "bh-research",
        agent: "RESEARCH_GATHER",
        model: "claude-haiku-4-5-20251001",
        system: "Return JSON.",
        maxOutputTokens: 4_000,
        webSearchUses: 5,
        maxSearchContentTokens: 20_000,
        budgetContext: {
          now: new Date("2026-08-12T10:00:00.000Z"),
          cycleId: "bh-cap",
          stage: "VALIDATION",
          ledger: [],
          allInNonApiSpentUsd: 0,
          allInCommittedUsd: 0,
          knownMonthlyForecastUsd: 0,
          remainingScheduledCycles: 1
        }
      });
      const provider = resolveResearchProvider(
        { providerId: ANTHROPIC_WEB_SEARCH_PROVIDER_ID },
        registry
      );

      await expect(provider.researchBook({
        bookRef: "book-001",
        brief: {},
        envelopeUsd: 0.01
      })).rejects.toMatchObject({ code: "PER_CALL_CAP" });
      expect(sdk.requests).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
