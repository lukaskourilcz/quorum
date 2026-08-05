import Anthropic from "@anthropic-ai/sdk";
import { ModelResponseTruncatedError, type TextProviderResponse } from "./openai.js";

export interface AnthropicTextRequest {
  model: string;
  system: string;
  input: string;
  maxOutputTokens: number;
}

export class AnthropicTextClient {
  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: AnthropicTextRequest): Promise<TextProviderResponse> {
    // The system prompt is marked cacheable, not merely stable.
    //
    // A room sends the same system text once per seat, and the code that builds it says so:
    // it keeps `system` byte-identical for every agent "so the room prompt and the shared
    // packet form one cacheable prefix". That was true of the text and false of the request —
    // nothing ever asked for the cache, so every seat paid full input price for the same
    // bytes. Sixty ledger entries, one with a cache read.
    //
    // Marked on the system block only. The user turn carries the per-agent packet and differs
    // every call, so caching it would pay the write premium for a prefix nothing re-reads.
    const response = await this.client.messages.create({
      max_tokens: request.maxOutputTokens,
      messages: [{ role: "user", content: request.input }],
      model: request.model,
      system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }]
    });
    const result: TextProviderResponse = {
      text: response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(""),
      model: response.model,
      tokensIn: response.usage.input_tokens ?? 0,
      tokensOut: response.usage.output_tokens ?? 0,
      cachedTokensIn: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokensIn: response.usage.cache_creation_input_tokens ?? 0
    };
    // A cut-off body is not a model mistake, it is our cap being too small, and it must not
    // masquerade as malformed JSON. Reporting it plainly is the difference between "raise the
    // cap" and hours spent hunting a syntax error at some byte offset.
    if (response.stop_reason === "max_tokens") {
      throw new ModelResponseTruncatedError(request.model, request.maxOutputTokens, "truncated", result);
    }
    return result;
  }
}
