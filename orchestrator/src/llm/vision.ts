import { createHash } from "node:crypto";
import { atomicWriteJson, readJson } from "../state.js";
import {
  BudgetLedgerEntrySchema,
  estimateTextCall,
  hasLedgerEntry,
  type BudgetLedgerEntry
} from "../budget.js";
import { readCachedResponse, requestHash, writeCachedResponse } from "./cache.js";
import {
  AnthropicVisionClient,
  type AnthropicVisionRequest,
  type VisionImageBlock,
  type VisionProviderResponse
} from "./anthropic.js";
import type { ImageProgramBudget } from "../images/budget.js";

export type { VisionImageBlock };

/**
 * What one picture costs to look at, in input tokens, for the reservation only.
 *
 * The provider bills an image by its area. The gate hands over nothing larger than 512px on the
 * long edge, so the worst case is a square one and this is that case rounded up. The reservation
 * is deliberately pessimistic: the measured usage the provider returns is what reaches the
 * ledger, and a reservation that under-guesses is a cap that does not hold.
 */
export const VISION_TOKENS_PER_IMAGE = 400;

export interface VisionCallInput<T> {
  stateRoot: string;
  cycleId: string;
  /** The ledger phase. The image programme's own, so a finance line can separate this spend. */
  phase: string;
  ventureId: string;
  agent: string;
  model: string;
  system: string;
  input: string;
  images: readonly VisionImageBlock[];
  maxOutputTokens: number;
  /**
   * What the answer is actually expected to cost in output tokens, for the reservation only.
   *
   * Separate from `maxOutputTokens`, which is the ceiling that stops a runaway answer. Reserving
   * the ceiling charged every gate call for output it has never once used: 1,200 tokens at
   * $5/MTok is $0.006, thirty per cent of a two-cent article cap, against a real one-candidate
   * verdict of about 130 tokens. The article cap then refused the rungs below — on 21 August it
   * refused the illustration gate for a render that had already been billed. Omit it and the
   * ceiling is reserved, which is the old behaviour.
   */
  expectedOutputTokens?: number;
  tool: AnthropicVisionRequest["tool"];
  parse: (value: unknown) => T;
  budget: ImageProgramBudget;
  dry?: boolean;
  /** Injected by tests so no request reaches a provider. */
  client?: { generate: (request: AnthropicVisionRequest) => Promise<VisionProviderResponse> };
}

/**
 * The result of a guarded vision call: an answer, or a reason to descend.
 *
 * Never a throw. Every caller of this is choosing a photograph, and the ladder below them always
 * has another rung — ultimately the FRAME plate, which needs no model and no network. A gate that
 * threw would turn "we could not check this picture" into "the article does not publish", which
 * is the one outcome the decision forbids.
 */
export type VisionCallResult<T> =
  | { ok: true; value: T; cached: boolean; usd: number }
  | { ok: false; reason: string; usd: number };

/** A short, stable name for one image, so a cache key changes when the pictures do. */
function imageFingerprint(images: readonly VisionImageBlock[]): string {
  return createHash("sha256")
    .update(images.map((image) => `${image.mediaType}:${image.base64.length}:${image.base64.slice(0, 64)}`).join("|"))
    .digest("hex")
    .slice(0, 32);
}

export async function guardedVisionCall<T>(
  request: VisionCallInput<T>
): Promise<VisionCallResult<T>> {
  const hash = requestHash({
    provider: "anthropic",
    model: request.model,
    system: request.system,
    input: request.input,
    images: imageFingerprint(request.images),
    maxOutputTokens: request.maxOutputTokens
  });
  const cached = await readCachedResponse<T>(
    request.stateRoot,
    request.cycleId,
    request.phase,
    request.agent,
    hash
  );
  // A recorded verdict wins over a re-derived one, the same rule the Design Lab summary follows:
  // it is what was actually decided, and a re-run that asked again could answer differently.
  if (cached !== null) return { ok: true, value: cached, cached: true, usd: 0 };

  const estimate = estimateTextCall({
    provider: "anthropic",
    model: request.model,
    // The images are priced through the same per-token rate as the words, so they are converted
    // into the estimator's own unit rather than given a second cost path to drift from.
    promptChars: request.system.length + request.input.length
      + request.images.length * VISION_TOKENS_PER_IMAGE * 3.5,
    maxOutputTokens: request.expectedOutputTokens ?? request.maxOutputTokens
  });
  const refusal = request.budget.reserve(estimate.estimatedUsd);
  // Refused here, before any socket is opened. That is the whole of the guarantee: an over-cap
  // gate request costs nothing at all, and the caller is told to descend rather than to stop.
  if (refusal) return { ok: false, reason: `cap:${refusal}`, usd: 0 };
  if (request.dry) return { ok: false, reason: "dry_run", usd: 0 };

  let response: VisionProviderResponse;
  try {
    const client = request.client ?? new AnthropicVisionClient();
    response = await client.generate({
      model: request.model,
      system: request.system,
      input: request.input,
      images: request.images,
      maxOutputTokens: request.maxOutputTokens,
      tool: request.tool
    });
  } catch (error) {
    return {
      ok: false,
      reason: `call_failed:${error instanceof Error ? error.message : "unknown"}`,
      usd: 0
    };
  }

  const promptTokens = response.tokensIn + response.cachedTokensIn + response.cacheWriteTokensIn;
  const actual = estimateTextCall({
    provider: "anthropic",
    model: request.model,
    promptChars: promptTokens * 3.5,
    maxOutputTokens: response.tokensOut,
    cachedInputTokens: response.cachedTokensIn,
    cacheWriteInputTokens: response.cacheWriteTokensIn
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
      ventureId: request.ventureId,
      agent: request.agent,
      provider: "anthropic",
      model: response.model,
      serviceTier: "default",
      tokensIn: response.tokensIn,
      cachedTokensIn: response.cachedTokensIn,
      tokensOut: response.tokensOut,
      toolUses: 1,
      usd: actual.estimatedUsd,
      kind: "text"
    });
    await atomicWriteJson(request.stateRoot, "budget/ledger.json", {
      schemaVersion: 1,
      entries: [...ledger.entries, entry]
    });
  }
  // Recorded before the payload is checked. The provider has billed for this answer whether or
  // not it matches the contract, and a verdict that fails to parse must still close the budget
  // it consumed, or a malformed reply becomes a way to make free calls.
  request.budget.record(actual.estimatedUsd);

  // Truncation is checked before parsing, because a half-written tool payload fails the contract
  // for a reason the contract cannot express. Reported separately so the receipt says "the answer
  // did not fit" rather than "the model broke its schema" — the first is ours to size, the second
  // would be theirs to fix, and for three weeks the record claimed the wrong one.
  if (response.truncated) {
    return {
      ok: false,
      reason: `truncated:${response.tokensOut}-of-${request.maxOutputTokens}`,
      usd: actual.estimatedUsd
    };
  }

  let value: T;
  try {
    value = request.parse(response.value);
  } catch (error) {
    return {
      ok: false,
      reason: `unparsable:${error instanceof Error ? error.message : "unknown"}`,
      usd: actual.estimatedUsd
    };
  }
  await writeCachedResponse(
    request.stateRoot,
    request.cycleId,
    request.phase,
    request.agent,
    hash,
    value
  );
  return { ok: true, value, cached: false, usd: actual.estimatedUsd };
}
