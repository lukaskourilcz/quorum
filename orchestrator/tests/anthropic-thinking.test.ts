import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AnthropicTextClient } from "../src/llm/anthropic.js";
import { configRoot } from "../src/paths.js";

type CreateParams = Record<string, unknown>;

/** The text client with the SDK swapped for a recorder, so the request it builds can be read. */
function recordingClient(): { client: AnthropicTextClient; requests: CreateParams[] } {
  const client = new AnthropicTextClient("test-key");
  const requests: CreateParams[] = [];
  (client as unknown as { client: unknown }).client = {
    messages: {
      create: async (params: CreateParams) => {
        requests.push(params);
        return {
          content: [{ type: "text", text: "{}" }],
          model: "claude-sonnet-5",
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: "end_turn"
        };
      }
    }
  };
  return { client, requests };
}

const request = {
  model: "claude-sonnet-5",
  system: "Return JSON.",
  input: "{}",
  maxOutputTokens: 400
};

/**
 * Sonnet 5 thinks adaptively unless told not to, and bills that thinking inside max_tokens. A
 * role with a small exact cap and a fixed JSON shape then has the cap spent before the answer
 * starts: CHUM was cut off at 4,000 tokens every morning from 8 to 12 September 2026 while its
 * package fits in about 1,500. The route has to be able to say so, and the client has to pass it on.
 */
describe("what the text client tells the provider about thinking", () => {
  it("passes a disabled thinking setting through as the provider's own parameter", async () => {
    const { client, requests } = recordingClient();
    await client.generate({ ...request, thinking: "disabled" });
    expect(requests[0]?.thinking).toEqual({ type: "disabled" });
  });

  it("passes an adaptive thinking setting through the same way", async () => {
    const { client, requests } = recordingClient();
    await client.generate({ ...request, thinking: "adaptive" });
    expect(requests[0]?.thinking).toEqual({ type: "adaptive" });
  });

  it("forwards effort as output_config and sends nothing when the route is silent", async () => {
    const { client, requests } = recordingClient();
    await client.generate({ ...request, effort: "low" });
    await client.generate(request);
    expect(requests[0]?.output_config).toEqual({ effort: "low" });
    expect(requests[1]).not.toHaveProperty("thinking");
    expect(requests[1]).not.toHaveProperty("output_config");
    expect(requests[1]?.max_tokens).toBe(400);
  });
});

describe("CHUM's route", () => {
  it("does not let the reply cap be spent thinking", async () => {
    const models = JSON.parse(await readFile(path.join(configRoot, "models.json"), "utf8")) as {
      roles: Record<string, { thinking?: string; maxOutputTokens: number }>;
    };
    expect(models.roles.CHUM?.thinking).toBe("disabled");
    expect(models.roles.CHUM?.maxOutputTokens).toBeGreaterThanOrEqual(4000);
  });
});
