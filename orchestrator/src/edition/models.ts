import Anthropic from "@anthropic-ai/sdk";
import { findTextPrice } from "../llm/prices.js";
import type {
  EditionModelGateway,
  EditionUsage,
  StructuredToolRequest
} from "./types.js";

const EDITION_MODELS = ["claude-sonnet-4-6", "claude-opus-4-7"] as const;
type EditionModel = (typeof EDITION_MODELS)[number];

function isEditionModel(value: string): value is EditionModel {
  return EDITION_MODELS.includes(value as EditionModel);
}

export function editionUsageCost(
  model: EditionModel,
  usage: Omit<EditionUsage, "provider" | "model" | "stage" | "costUsd">,
  at = new Date()
): number {
  const price = findTextPrice("anthropic", model, "default", at);
  if (!price) throw new Error(`No dated default price for anthropic/${model}`);
  return Number((
    (
      usage.inputTokens * price.inputUsdPerMillion +
      usage.outputTokens * price.outputUsdPerMillion +
      usage.cacheWriteTokens * price.inputUsdPerMillion * 1.25 +
      usage.cacheReadTokens * (price.cachedInputUsdPerMillion ?? price.inputUsdPerMillion)
    ) / 1_000_000
  ).toFixed(8));
}

export class AnthropicEditionModelGateway implements EditionModelGateway {
  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
    this.client = new Anthropic({ apiKey });
  }

  async invoke<T>(request: StructuredToolRequest<T>): Promise<{ value: T; usage: EditionUsage }> {
    if (!isEditionModel(request.model)) {
      throw new Error(`Edition model is not pinned or priced: ${request.model}`);
    }
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxOutputTokens,
      system: [{
        type: "text",
        text: request.system,
        cache_control: { type: "ephemeral" }
      }],
      tools: [{
        name: request.tool.name,
        description: request.tool.description,
        input_schema: request.tool.inputSchema as Anthropic.Tool.InputSchema
      }],
      tool_choice: { type: "tool", name: request.tool.name },
      messages: [{ role: "user", content: request.user }]
    });
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`${request.stage}: model did not call ${request.tool.name}`);
    }
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = response.usage.cache_creation_input_tokens ?? 0;
    const model = request.model;
    return {
      value: request.parse(toolUse.input),
      usage: {
        provider: "anthropic",
        model,
        stage: request.stage,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        costUsd: editionUsageCost(model, {
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens
        })
      }
    };
  }
}
