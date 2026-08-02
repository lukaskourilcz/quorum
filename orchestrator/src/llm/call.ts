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
import { OpenAiTextClient, type TextProviderResponse } from "./openai.js";
import {
  readVentureRegistry,
  ventureIdForPhase
} from "../ventures/registry.js";
import { assertAgentPacketPresentationBarrier } from "../security/presentation-barrier.js";

export interface GuardedCallInput<T> {
  stateRoot: string;
  cycleId: string;
  phase: string;
  ventureId?: string;
  agent: string;
  provider: "openai" | "anthropic";
  model: string;
  system: string;
  input: string;
  maxOutputTokens: number;
  budgetContext: ReserveContext;
  parse: (text: string) => T;
  dry?: boolean;
}

/**
 * A provider response that was paid for but could not be parsed.
 *
 * Carries the recorded cost so a caller can decide whether to lose one contribution or the
 * whole room, without having to guess what the failure cost. The ledger entry is already
 * written by the time this is thrown.
 */
export class ModelOutputParseError extends Error {
  constructor(readonly agent: string, readonly usd: number, readonly reason: unknown) {
    super(`${agent} returned unparsable output (billed $${usd.toFixed(6)}): ${reason instanceof Error ? reason.message : String(reason)}`);
    this.name = "ModelOutputParseError";
  }
}

export async function guardedJsonCall<T>(
  request: GuardedCallInput<T>
): Promise<{ value: T; cached: boolean; usd: number }> {
  assertAgentPacketPresentationBarrier({
    input: request.input,
    system: request.system
  });
  const hash = requestHash({
    provider: request.provider,
    model: request.model,
    system: request.system,
    input: request.input,
    maxOutputTokens: request.maxOutputTokens
  });
  const cached = await readCachedResponse<T>(
    request.stateRoot,
    request.cycleId,
    request.phase,
    request.agent,
    hash
  );
  if (cached !== null) {
    return { value: cached, cached: true, usd: 0 };
  }
  const estimate = estimateTextCall({
    provider: request.provider,
    model: request.model,
    promptChars: request.system.length + request.input.length,
    maxOutputTokens: request.maxOutputTokens
  });
  assertTextReservation(estimate, request.budgetContext);
  if (request.dry) {
    throw new Error("A dry cycle attempted a paid LLM call");
  }
  const response: TextProviderResponse =
    request.provider === "openai"
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
          maxOutputTokens: request.maxOutputTokens
        });
  const actual = estimateTextCall({
    provider: request.provider,
    model: request.model,
    promptChars: response.tokensIn * 3.5,
    maxOutputTokens: response.tokensOut,
    cachedInputTokens: response.cachedTokensIn
  });
  const ledger = await readJson<{ entries: BudgetLedgerEntry[] }>(
    request.stateRoot,
    "budget/ledger.json",
    { entries: [] }
  );
  if (!hasLedgerEntry(ledger.entries, request.cycleId, hash)) {
    const entry = BudgetLedgerEntrySchema.parse({
      ts: new Date().toISOString(),
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
      toolUses: 0,
      usd: actual.estimatedUsd,
      kind: "text"
    });
    await atomicWriteJson(request.stateRoot, "budget/ledger.json", {
      schemaVersion: 1,
      entries: [...ledger.entries, entry]
    });
  }

  // Parse AFTER the ledger entry is durable. The provider has already billed for this
  // response, so a malformed body must not make the spend disappear: parsing first meant a
  // model returning bad JSON threw before the ledger write, and the call was paid for and
  // never recorded. That silently erodes the monthly cap, and it is exactly how a run can
  // cost money while the day's Results row shows nothing.
  let value: T;
  try {
    value = request.parse(response.text);
  } catch (error) {
    throw new ModelOutputParseError(request.agent, actual.estimatedUsd, error);
  }

  // Only a valid value is worth replaying.
  await writeCachedResponse(
    request.stateRoot,
    request.cycleId,
    request.phase,
    request.agent,
    hash,
    value
  );
  return { value, cached: false, usd: actual.estimatedUsd };
}
