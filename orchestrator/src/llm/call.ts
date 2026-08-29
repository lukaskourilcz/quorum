import { atomicWriteJson, readJson } from "../state.js";
import {
  assertTextReservation,
  BudgetLedgerEntrySchema,
  estimateTextCall,
  hasLedgerEntry,
  type BudgetLedgerEntry,
  type ReserveContext
} from "../budget.js";
import {
  readCachedResponse,
  requestHash,
  writeCachedResponse
} from "./cache.js";
import { AnthropicTextClient } from "./anthropic.js";
import { ModelResponseTruncatedError, OpenAiTextClient, type TextProviderResponse } from "./openai.js";

export { ModelResponseTruncatedError };
import {
  readVentureRegistry,
  ventureIdForPhase
} from "../ventures/registry.js";
import { assertAgentPacketPresentationBarrier } from "../security/presentation-barrier.js";

export interface GuardedCallInput<T> {
  stateRoot: string;
  cycleId: string;
  phase: string;
  /** 2 for a retry of a call whose first reply would not parse. Keeps the two apart in the ledger. */
  attempt?: number;
  ventureId?: string;
  agent: string;
  provider: "openai" | "anthropic";
  model: string;
  system: string;
  input: string;
  maxOutputTokens: number;
  webSearch?: {
    maxUses: number;
    maxSearchContentTokens: number;
  };
  budgetContext: ReserveContext;
  parse: (text: string) => T;
  dry?: boolean;
  /** Keep a parsed response in state/model-cache. Disable for sensitive output until its gates run. */
  cacheResponse?: boolean;
}

export interface GuardedCallResult<T> {
  value: T;
  cached: boolean;
  usd: number;
  /** Present on the real guarded path; optional so existing injected test calls stay small. */
  usage?: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    toolUses: number;
  };
}

export interface GuardedCallDeps {
  /** Test seam at the provider boundary; reservation, ledger and cache logic still run unchanged. */
  generate?: (request: {
    provider: "openai" | "anthropic";
    model: string;
    system: string;
    input: string;
    maxOutputTokens: number;
  }) => Promise<TextProviderResponse>;
}

/**
 * A provider response that was paid for but could not be parsed.
 *
 * Carries the recorded cost so a caller can decide whether to lose one contribution or the
 * whole room, without having to guess what the failure cost. The ledger entry is already
 * written by the time this is thrown.
 */
/**
 * What a reply looked like, without saying what it said.
 *
 * A parse failure is only actionable if you know whether the model wrote prose, wrapped the
 * object, stopped mid-object or answered a different shape entirely — and the one thing this
 * system will not do is copy provider prose into a record. So the probe is structural: how long
 * the reply was, what kind of character it opens with, whether it was fenced, and whether it
 * looks like a complete object. None of that reproduces a sentence, and all of it separates
 * "the ceiling was too small" from "the model ignored the contract".
 *
 * marketingShark needed exactly this and did not have it: nineteen consecutive failures recorded
 * as `model-output-invalid`, and no way to tell from the record which of those two it was.
 */
export function describeReplyShape(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "empty reply";
  const fenced = trimmed.startsWith("```");
  const body = unfenceModelJson(text).trim();
  const opensObject = body.startsWith("{");
  const closesObject = body.endsWith("}");
  const braces = `${[...body].filter((c) => c === "{").length}/${[...body].filter((c) => c === "}").length}`;
  return [
    `${trimmed.length} chars`,
    fenced ? "fenced" : "unfenced",
    opensObject ? "opens with {" : `opens with ${JSON.stringify(body.slice(0, 1))}`,
    closesObject ? "closes with }" : "does not close",
    `braces ${braces}`
  ].join(", ");
}

export class ModelOutputParseError extends Error {
  constructor(readonly agent: string, readonly usd: number, readonly reason: unknown, readonly shape?: string) {
    super(`${agent} returned unparsable output (billed $${usd.toFixed(6)}${shape ? `; reply was ${shape}` : ""}): ${reason instanceof Error ? reason.message : String(reason)}`);
    this.name = "ModelOutputParseError";
  }
}

/**
 * Strip a markdown code fence from a model's reply before the caller parses it.
 *
 * Every guarded call asks for JSON and every caller parses it as JSON, but a model will
 * sometimes wrap the object in ```json anyway. Two call sites stripped it and five did not,
 * so on 3 August VAULT answered the morning company meeting with a fenced object, JSON.parse
 * threw on the backtick, and the whole board died on a reply that was correct in every way
 * except its wrapper — billed, and nothing produced. Doing it here rather than at each call
 * site is the point: a new caller cannot forget.
 *
 * Only an outer fence is removed. Text that is not fenced is returned untouched, so a reply
 * that is genuinely malformed still fails exactly as before.
 */
export function unfenceModelJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return text;
  return trimmed
    .replace(/^```[a-z]*\s*/iu, "")
    .replace(/\s*```$/u, "");
}

export async function guardedJsonCall<T>(
  request: GuardedCallInput<T>,
  deps: GuardedCallDeps = {}
): Promise<GuardedCallResult<T>> {
  if (request.webSearch && request.provider !== "anthropic") {
    throw new Error("Guarded web search is available only through the registered Anthropic adapter");
  }
  assertAgentPacketPresentationBarrier({
    input: request.input,
    system: request.system
  });
  const hash = requestHash({
    provider: request.provider,
    model: request.model,
    system: request.system,
    input: request.input,
    maxOutputTokens: request.maxOutputTokens,
    ...(request.webSearch ? { webSearch: request.webSearch } : {}),
    // A retry of a seat whose reply would not parse sends byte-identical arguments, so without
    // this it hashes to the first attempt, hits the response cache and — worse — never reaches
    // the ledger, because the ledger is deduplicated on the same hash. The provider bills both
    // calls either way; only the record of the second one went missing.
    ...(request.attempt && request.attempt > 1 ? { attempt: request.attempt } : {})
  });
  const cached = request.cacheResponse === false
    ? null
    : await readCachedResponse<T>(
      request.stateRoot,
      request.cycleId,
      request.phase,
      request.agent,
      hash
    );
  if (cached !== null) {
    return {
      value: cached,
      cached: true,
      usd: 0,
      usage: { model: request.model, tokensIn: 0, tokensOut: 0, toolUses: 0 }
    };
  }
  if (request.cacheResponse === false && hasLedgerEntry(
    request.budgetContext.ledger,
    request.cycleId,
    hash
  )) {
    throw new Error(`${request.agent} response was already billed but deliberately not cached`);
  }
  const estimate = estimateTextCall({
    provider: request.provider,
    model: request.model,
    promptChars: request.system.length + request.input.length,
    maxOutputTokens: request.maxOutputTokens,
    webSearchUses: request.webSearch?.maxUses,
    maxSearchContentTokens: request.webSearch?.maxSearchContentTokens
  });
  assertTextReservation(estimate, request.budgetContext);
  if (request.dry) {
    throw new Error("A dry cycle attempted a paid LLM call");
  }
  let truncation: ModelResponseTruncatedError | null = null;
  let response: TextProviderResponse;
  try {
    response = deps.generate
      ? await deps.generate({
          provider: request.provider,
          model: request.model,
          system: request.system,
          input: request.input,
          maxOutputTokens: request.maxOutputTokens
        })
      : request.provider === "openai"
      ? await new OpenAiTextClient().generate({
          model: request.model,
          system: request.system,
          input: request.input,
          maxOutputTokens: request.maxOutputTokens
        })
      : await new AnthropicTextClient().generate({
          model: request.model,
          system: request.system,
          input: request.input,
          maxOutputTokens: request.maxOutputTokens,
          webSearchUses: request.webSearch?.maxUses
        });
  } catch (error) {
    if (!(error instanceof ModelResponseTruncatedError) || !error.response) throw error;
    truncation = error;
    response = error.response;
  }
  // input_tokens, cache_read_input_tokens and cache_creation_input_tokens are disjoint counts,
  // so the prompt is their sum. Passing tokensIn alone and then subtracting the cached share
  // would have discounted tokens the provider had already left out, under-reporting the spend
  // the daily and monthly caps are computed from.
  const promptTokens = response.tokensIn + response.cachedTokensIn + response.cacheWriteTokensIn;
  const actual = estimateTextCall({
    provider: request.provider,
    model: request.model,
    promptChars: promptTokens * 3.5,
    maxOutputTokens: response.tokensOut,
    cachedInputTokens: response.cachedTokensIn,
    cacheWriteInputTokens: response.cacheWriteTokensIn,
    webSearchUses: response.toolUses,
    maxSearchContentTokens: request.webSearch?.maxSearchContentTokens
  });
  const ledger = await readJson<{ entries: BudgetLedgerEntry[] }>(
    request.stateRoot,
    "budget/ledger.json",
    { entries: [] }
  );
  if (!hasLedgerEntry(ledger.entries, request.cycleId, hash)) {
    const entry = BudgetLedgerEntrySchema.parse({
      ts: request.budgetContext.now.toISOString(),
      cycleId: request.cycleId,
      requestHash: hash,
      phase: request.phase,
      ventureId: request.ventureId ?? ventureIdForPhase(
        readVentureRegistry(),
        request.phase
      ),
      agent: request.agent,
      provider: request.provider,
      model: response.model,
      serviceTier: "default",
      tokensIn: response.tokensIn,
      cachedTokensIn: response.cachedTokensIn,
      tokensOut: response.tokensOut,
      toolUses: response.toolUses,
      usd: actual.estimatedUsd,
      kind: "text"
    });
    await atomicWriteJson(request.stateRoot, "budget/ledger.json", {
      schemaVersion: 1,
      entries: [...ledger.entries, entry]
    });
  }

  // A provider-reported cutoff is unusable, but it is not free. The adapters attach the
  // partial response's usage so the same durable ledger path records it before callers retry,
  // skip the seat or fail the room.
  if (truncation) {
    throw new ModelResponseTruncatedError(
      truncation.model,
      truncation.cap,
      truncation.message,
      truncation.response,
      actual.estimatedUsd
    );
  }

  // Parse AFTER the ledger entry is durable. The provider has already billed for this
  // response, so a malformed body must not make the spend disappear: parsing first meant a
  // model returning bad JSON threw before the ledger write, and the call was paid for and
  // never recorded. That silently erodes the monthly cap, and it is exactly how a run can
  // cost money while the day's Results row shows nothing.
  let value: T;
  try {
    value = request.parse(unfenceModelJson(response.text));
  } catch (error) {
    throw new ModelOutputParseError(request.agent, actual.estimatedUsd, error, describeReplyShape(response.text));
  }

  // Only a valid value is worth replaying.
  if (request.cacheResponse !== false) {
    await writeCachedResponse(
      request.stateRoot,
      request.cycleId,
      request.phase,
      request.agent,
      hash,
      value
    );
  }
  return {
    value,
    cached: false,
    usd: actual.estimatedUsd,
    usage: {
      model: response.model,
      tokensIn: promptTokens,
      tokensOut: response.tokensOut,
      toolUses: response.toolUses
    }
  };
}
