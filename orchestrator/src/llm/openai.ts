import OpenAI from "openai";

export interface OpenAiTextRequest {
  model: string;
  system: string;
  input: string;
  maxOutputTokens: number;
}

export interface TextProviderResponse {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
}

export class OpenAiTextClient {
  private readonly client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    this.client = new OpenAI({ apiKey });
  }

  async generate(request: OpenAiTextRequest): Promise<TextProviderResponse> {
    const response = await this.client.responses.create({
      instructions: request.system,
      input: request.input,
      max_output_tokens: request.maxOutputTokens,
      model: request.model,
      reasoning: { effort: "none" },
      service_tier: "default",
      store: false
    });
    if (response.status === "incomplete") {
      const reason = response.incomplete_details?.reason ?? "unknown";
      throw new Error(`Response incomplete (${reason}) at the ${request.maxOutputTokens}-token cap for ${request.model}; raise maxOutputTokens`);
    }
    return {
      text: response.output_text,
      model: response.model,
      tokensIn: response.usage?.input_tokens ?? 0,
      tokensOut: response.usage?.output_tokens ?? 0,
      cachedTokensIn: response.usage?.input_tokens_details?.cached_tokens ?? 0
    };
  }
}

