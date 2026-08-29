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
  /** Tokens written to the provider's prompt cache, billed above the input rate. */
  cacheWriteTokensIn: number;
  /** Paid server-side tool invocations reported by the provider. */
  toolUses: number;
}

/**
 * A reply the provider cut off at the output cap.
 *
 * Its own class, not a plain Error, because a caller has to be able to tell a truncation apart
 * from a transport failure: a truncated seat is a usable-in-principle reply that our cap was too
 * small for, and the council must retry it and, failing twice, drop that one seat — never let it
 * throw away the whole morning. On 5 August a council seat crossed the 400-token cap the moment
 * the prompt started asking seats to propose a new question, the plain Error propagated past the
 * seat retry (which only caught parse failures), and the 04:00 board never opened.
 */
export class ModelResponseTruncatedError extends Error {
  constructor(
    readonly model: string,
    readonly cap: number,
    reason: string,
    /** The provider still bills a cut-off reply; carry its usage to the guarded ledger. */
    readonly response?: TextProviderResponse,
    /**
     * What the cut-off reply was billed, once the guarded call has priced it.
     *
     * `ModelOutputParseError` has carried this from the start and callers add it to their own
     * spend; truncation did not, so a room that hit its output cap wrote the charge to the ledger
     * and then reported spending nothing. marketingShark's 29 August record says
     * `actualCycleUsd: 0` against $0.035154 in the same run's ledger entry, and had said so
     * nineteen times. Optional because only the guarded path knows the price.
     */
    readonly usd?: number
  ) {
    super(`Response ${reason} at the ${cap}-token cap for ${model}; raise maxOutputTokens`);
    this.name = "ModelResponseTruncatedError";
  }
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
    const result: TextProviderResponse = {
      text: response.output_text,
      model: response.model,
      tokensIn: response.usage?.input_tokens ?? 0,
      tokensOut: response.usage?.output_tokens ?? 0,
      cachedTokensIn: response.usage?.input_tokens_details?.cached_tokens ?? 0,
      // OpenAI does not bill a separate cache write.
      cacheWriteTokensIn: 0,
      toolUses: 0
    };
    if (response.status === "incomplete") {
      const reason = response.incomplete_details?.reason ?? "unknown";
      throw new ModelResponseTruncatedError(request.model, request.maxOutputTokens, `incomplete (${reason})`, result);
    }
    return result;
  }
}
