import Anthropic from "@anthropic-ai/sdk";
import { ModelResponseTruncatedError, type TextProviderResponse } from "./openai.js";

export interface AnthropicTextRequest {
  model: string;
  system: string;
  input: string;
  maxOutputTokens: number;
}

/** One picture handed to a model, already downscaled and encoded by the caller. */
export interface VisionImageBlock {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
  /** What the caller calls this picture, so the model can answer about it by name. */
  label: string;
}

export interface AnthropicVisionRequest {
  model: string;
  system: string;
  input: string;
  images: readonly VisionImageBlock[];
  maxOutputTokens: number;
  tool: { name: string; description: string; inputSchema: Record<string, unknown> };
}

export interface VisionProviderResponse {
  /** The tool payload, unparsed. The caller owns the contract it is checked against. */
  value: unknown;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
  cacheWriteTokensIn: number;
}

/**
 * A model call that carries pictures as well as words, and must answer through a tool.
 *
 * Separate from the text client because the two differ in more than a content block. A vision
 * call has no cacheable prefix worth marking — the pictures are different every time and they
 * are most of the prompt — and it is worthless without structured output, since the caller is
 * deciding which of twelve candidates ships and cannot parse that decision out of prose.
 *
 * The images arrive already downscaled. That is the caller's job rather than this one's because
 * the bound it enforces is on cost, and the only place that knows the budget is the caller.
 */
export class AnthropicVisionClient {
  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: AnthropicVisionRequest): Promise<VisionProviderResponse> {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const image of request.images) {
      // The label goes before its picture so the model reads "candidate 3" and then sees
      // candidate 3. Interleaved the other way round, a verdict list drifts by one.
      content.push({ type: "text", text: image.label });
      content.push({
        type: "image",
        source: { type: "base64", media_type: image.mediaType, data: image.base64 }
      });
    }
    content.push({ type: "text", text: request.input });
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxOutputTokens,
      system: [{ type: "text", text: request.system }],
      tools: [{
        name: request.tool.name,
        description: request.tool.description,
        input_schema: request.tool.inputSchema as Anthropic.Tool.InputSchema
      }],
      tool_choice: { type: "tool", name: request.tool.name },
      messages: [{ role: "user", content }]
    });
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`vision call did not return ${request.tool.name}`);
    }
    return {
      value: toolUse.input,
      model: response.model,
      tokensIn: response.usage.input_tokens ?? 0,
      tokensOut: response.usage.output_tokens ?? 0,
      cachedTokensIn: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokensIn: response.usage.cache_creation_input_tokens ?? 0
    };
  }
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
