import Anthropic from "@anthropic-ai/sdk";
import { ModelResponseTruncatedError, type TextProviderResponse } from "./openai.js";

/** The effort levels the provider accepts as `output_config.effort`. */
export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * How a batch-tier call waits.
 *
 * `deadlineAt` is absolute rather than a duration so every seat in one room shares the room's
 * clock: the GitHub Actions job that hosts a cycle has a time limit, and four seats each waiting
 * their own fifty minutes would run past it. `clock` and `sleep` are test seams; the defaults are
 * the wall clock and a real timer.
 */
export interface AnthropicBatchOptions {
  deadlineAt: Date;
  /** How often to ask whether the batch ended. Batches are documented to take up to an hour. */
  pollIntervalMs?: number;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_BATCH_POLL_INTERVAL_MS = 60_000;

/** The batch did not end before the room's deadline. The room records the seat as a skip. */
export class AnthropicBatchDeadlineError extends Error {
  constructor(
    readonly batchId: string,
    readonly model: string,
    readonly deadlineAt: Date,
    /** Whether the provider accepted the cancel; a refused cancel is still a deadline. */
    readonly cancelled: boolean
  ) {
    super(`Batch ${batchId} for ${model} did not end before ${deadlineAt.toISOString()}; ${cancelled ? "cancelled" : "the cancel request failed"}`);
    this.name = "AnthropicBatchDeadlineError";
  }
}

/** The batch ended without a usable reply for the one request it carried. */
export class AnthropicBatchResultError extends Error {
  constructor(
    readonly batchId: string,
    readonly model: string,
    readonly resultType: "errored" | "canceled" | "expired" | "missing",
    detail: string | null
  ) {
    super(`Batch ${batchId} for ${model} ended ${resultType}${detail ? `: ${detail}` : ""}`);
    this.name = "AnthropicBatchResultError";
  }
}

export interface AnthropicTextRequest {
  model: string;
  system: string;
  input: string;
  maxOutputTokens: number;
  /**
   * `batch` submits the same request through the Message Batches API at the batch price and
   * waits for it under `batch.deadlineAt`. Omit for the default tier.
   */
  serviceTier?: "default" | "batch";
  batch?: AnthropicBatchOptions;
  /**
   * Whether the model may think before it answers.
   *
   * Sonnet 5 and its successors think adaptively unless told not to, and the thinking is billed
   * inside `maxOutputTokens`. A role with a small exact cap and a fixed JSON shape then has that
   * cap spent on reasoning nobody asked for: CHUM's bilingual carousel fits in about 1,500 output
   * tokens and was cut off at the 4,000 cap every morning from 8 to 12 September, billed in full
   * each time. Omit to keep the provider's default.
   */
  thinking?: "adaptive" | "disabled";
  /** Forwarded as `output_config.effort`. Omit to keep the provider's default. */
  effort?: AnthropicEffort;
  /** Server-side web-search calls permitted for this request. Omit to expose no tool. */
  webSearchUses?: number;
}

/** Highest search count any one guarded call may expose, before the budget guard tightens it. */
export const MAX_ANTHROPIC_WEB_SEARCH_USES = 8;

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
  /**
   * Whether the model ran out of output budget mid-answer.
   *
   * Reported rather than thrown because the provider has already billed for the tokens it did
   * produce. A throw here would lose both the ledger row and the budget record, which is how a
   * cut-off answer becomes a free call.
   */
  truncated: boolean;
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
    // A cut-off tool call, reported as one.
    //
    // The text client already refuses to let truncation masquerade as malformed JSON, and the
    // gate needed the same guard: a twelve-candidate verdict list runs to about 1,250 output
    // tokens against a 1,200 ceiling, so the reply arrived with its `verdicts` array half
    // written and the caller reported `unparsable`. Three DNESKAi editions fell to the plate
    // that way — 14, 18 and 28 August, every one of them billed at exactly the ceiling — and
    // the reason blamed the model for what was our own budget.
    const truncated = response.stop_reason === "max_tokens";
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      if (truncated) {
        return {
          value: null,
          model: response.model,
          tokensIn: response.usage.input_tokens ?? 0,
          tokensOut: response.usage.output_tokens ?? 0,
          cachedTokensIn: response.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokensIn: response.usage.cache_creation_input_tokens ?? 0,
          truncated
        };
      }
      throw new Error(`vision call did not return ${request.tool.name}`);
    }
    return {
      value: toolUse.input,
      model: response.model,
      tokensIn: response.usage.input_tokens ?? 0,
      tokensOut: response.usage.output_tokens ?? 0,
      cachedTokensIn: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokensIn: response.usage.cache_creation_input_tokens ?? 0,
      truncated
    };
  }
}

/**
 * The request as the provider sees it, shared by the immediate and the batch path so the two
 * tiers can never drift apart in what they send.
 *
 * The system prompt is marked cacheable, not merely stable. A room sends the same system text
 * once per seat, and the code that builds it says so: it keeps `system` byte-identical for every
 * agent "so the room prompt and the shared packet form one cacheable prefix". That was true of
 * the text and false of the request — nothing ever asked for the cache, so every seat paid full
 * input price for the same bytes. Sixty ledger entries, one with a cache read.
 *
 * Marked on the system block only. The user turn carries the per-agent packet and differs every
 * call, so caching it would pay the write premium for a prefix nothing re-reads.
 */
function messageParams(request: AnthropicTextRequest): Anthropic.MessageCreateParamsNonStreaming {
  return {
    max_tokens: request.maxOutputTokens,
    messages: [{ role: "user", content: request.input }],
    model: request.model,
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    ...(request.thinking === undefined ? {} : {
      thinking: request.thinking === "disabled" ? { type: "disabled" as const } : { type: "adaptive" as const }
    }),
    ...(request.effort === undefined ? {} : { output_config: { effort: request.effort } }),
    ...(request.webSearchUses === undefined ? {} : {
      // Verified against @anthropic-ai/sdk@0.113.0's WebSearchTool20260318.
      tools: [{
        type: "web_search_20260318" as const,
        name: "web_search" as const,
        max_uses: request.webSearchUses
      }]
    })
  };
}

function textResponse(request: AnthropicTextRequest, response: Anthropic.Message): TextProviderResponse {
  const result: TextProviderResponse = {
    text: response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(""),
    model: response.model,
    tokensIn: response.usage.input_tokens ?? 0,
    tokensOut: response.usage.output_tokens ?? 0,
    cachedTokensIn: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokensIn: response.usage.cache_creation_input_tokens ?? 0,
    toolUses: response.usage.server_tool_use?.web_search_requests ?? 0
  };
  // A cut-off body is not a model mistake, it is our cap being too small, and it must not
  // masquerade as malformed JSON. Reporting it plainly is the difference between "raise the
  // cap" and hours spent hunting a syntax error at some byte offset.
  if (response.stop_reason === "max_tokens") {
    throw new ModelResponseTruncatedError(request.model, request.maxOutputTokens, "truncated", result);
  }
  return result;
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
    if (request.webSearchUses !== undefined && (
      !Number.isInteger(request.webSearchUses) ||
      request.webSearchUses < 1 ||
      request.webSearchUses > MAX_ANTHROPIC_WEB_SEARCH_USES
    )) {
      throw new Error(`Anthropic web search uses must be an integer from 1 to ${MAX_ANTHROPIC_WEB_SEARCH_USES}`);
    }
    const params = messageParams(request);
    const response = request.serviceTier === "batch"
      ? await this.generateThroughBatch(request, params)
      : await this.client.messages.create(params);
    return textResponse(request, response);
  }

  /**
   * One request through the Message Batches API: create, poll until the batch ends, read the
   * one result back. Same params, same cacheable system block, half the token price.
   *
   * On the deadline the batch is cancelled and the call fails typed. A request that finished
   * inside the provider between the last poll and the cancel is billed and never read; that is
   * the bounded price of a hard deadline, and the room's skip record is what accounts for it.
   */
  private async generateThroughBatch(
    request: AnthropicTextRequest,
    params: Anthropic.MessageCreateParamsNonStreaming
  ): Promise<Anthropic.Message> {
    const options = request.batch;
    if (!options) throw new Error("A batch-tier call needs a deadline and none was configured");
    const clock = options.clock ?? Date.now;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_BATCH_POLL_INTERVAL_MS;
    const customId = "seat";
    const batches = this.client.messages.batches;
    const created = await batches.create({ requests: [{ custom_id: customId, params }] });
    let current = created;
    while (current.processing_status !== "ended") {
      const remainingMs = options.deadlineAt.getTime() - clock();
      if (remainingMs <= 0) {
        const cancelled = await batches.cancel(created.id).then(() => true, () => false);
        throw new AnthropicBatchDeadlineError(created.id, request.model, options.deadlineAt, cancelled);
      }
      await sleep(Math.min(pollIntervalMs, remainingMs));
      current = await batches.retrieve(created.id);
    }
    for await (const entry of await batches.results(created.id)) {
      if (entry.custom_id !== customId) continue;
      if (entry.result.type === "succeeded") return entry.result.message;
      throw new AnthropicBatchResultError(
        created.id,
        request.model,
        entry.result.type,
        entry.result.type === "errored" ? entry.result.error.error.message : null
      );
    }
    throw new AnthropicBatchResultError(created.id, request.model, "missing", null);
  }
}
