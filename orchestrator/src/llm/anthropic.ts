import Anthropic from "@anthropic-ai/sdk";
import type { TextProviderResponse } from "./openai.js";

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
    const response = await this.client.messages.create({
      max_tokens: request.maxOutputTokens,
      messages: [{ role: "user", content: request.input }],
      model: request.model,
      system: request.system
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      text,
      model: response.model,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      cachedTokensIn: response.usage.cache_read_input_tokens ?? 0
    };
  }
}

