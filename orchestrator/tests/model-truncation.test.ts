import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * A cut-off reply must be its own typed error, not a plain one.
 *
 * The council seat loop retries a truncated seat and, failing twice, drops it — but only because
 * it can recognise the error with `instanceof ModelResponseTruncatedError`. On 5 August the
 * adapters threw a plain Error, the seat loop's catch (which only knew ModelOutputParseError) let
 * it through, and one seat over the 400-token cap killed the whole 04:00 board. These pin the
 * class so a revert to a plain Error fails here rather than in production at 04:00.
 */

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => ({
        stop_reason: "max_tokens",
        model: "claude-sonnet-5",
        content: [{ type: "text", text: '{"partial":' }],
        usage: {
          input_tokens: 100,
          output_tokens: 400,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0
        }
      })
    };
  }
}));

vi.mock("openai", () => ({
  default: class {
    responses = {
      create: async () => ({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "", usage: {} })
    };
  }
}));

describe("a reply the provider cut off", () => {
  it("throws a typed truncation error from the Anthropic adapter", async () => {
    const { AnthropicTextClient } = await import("../src/llm/anthropic.js");
    const { ModelResponseTruncatedError } = await import("../src/llm/call.js");
    const client = new AnthropicTextClient("test-key");
    await expect(client.generate({ model: "claude-sonnet-5", system: "s", input: "i", maxOutputTokens: 400 }))
      .rejects.toBeInstanceOf(ModelResponseTruncatedError);
  });

  it("throws a typed truncation error from the OpenAI adapter", async () => {
    const { OpenAiTextClient } = await import("../src/llm/openai.js");
    const { ModelResponseTruncatedError } = await import("../src/llm/call.js");
    const client = new OpenAiTextClient("test-key");
    await expect(client.generate({ model: "gpt-5", system: "s", input: "i", maxOutputTokens: 400 }))
      .rejects.toBeInstanceOf(ModelResponseTruncatedError);
  });

  it("is an Error the seat loop can catch and names the cap to raise", async () => {
    const { ModelResponseTruncatedError } = await import("../src/llm/call.js");
    const error = new ModelResponseTruncatedError("claude-sonnet-5", 400, "truncated");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("400");
    expect(error.message).toContain("claude-sonnet-5");
  });

  it("records billable usage before the guarded call rethrows a cutoff", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-truncation-ledger-"));
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    try {
      const { guardedJsonCall, ModelResponseTruncatedError } = await import("../src/llm/call.js");
      await expect(guardedJsonCall({
        stateRoot: root,
        cycleId: "cycle-truncated",
        phase: "tt-marketing",
        ventureId: "titty-tuesdays",
        agent: "ANGLE",
        provider: "anthropic",
        model: "claude-sonnet-5",
        system: "Return JSON.",
        input: "Generate one idea.",
        maxOutputTokens: 400,
        budgetContext: {
          now: new Date("2026-08-05T11:00:00.000Z"),
          cycleId: "cycle-truncated",
          stage: "VALIDATION",
          ledger: [],
          allInNonApiSpentUsd: 0,
          allInCommittedUsd: 0,
          knownMonthlyForecastUsd: 0,
          remainingScheduledCycles: 1
        },
        parse: JSON.parse
      })).rejects.toBeInstanceOf(ModelResponseTruncatedError);
      const ledger = JSON.parse(await readFile(path.join(root, "budget", "ledger.json"), "utf8")) as {
        entries: Array<{ agent: string; tokensIn: number; tokensOut: number; usd: number }>;
      };
      expect(ledger.entries).toEqual([
        expect.objectContaining({ agent: "ANGLE", tokensIn: 100, tokensOut: 400, usd: expect.any(Number) })
      ]);
      expect(ledger.entries[0]?.usd).toBeGreaterThan(0);
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });
});
