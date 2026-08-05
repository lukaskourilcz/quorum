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
      create: async () => ({ stop_reason: "max_tokens", model: "claude-sonnet-5", content: [], usage: {} })
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
});
