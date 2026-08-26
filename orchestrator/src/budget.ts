import { z } from "zod";
import {
  EMBEDDING_PRICES,
  findTextPrice,
  IMAGE_PRICES,
  STAGE_CYCLE_CAPS,
  WEB_SEARCH_USD_PER_CALL,
  type ServiceTier
} from "./llm/prices.js";
import type { Stage } from "./types.js";
import { VentureIdSchema } from "./contracts/common.js";

export const BudgetLedgerKindSchema = z.enum(["text", "image", "embedding"]);
export type BudgetLedgerKind = z.infer<typeof BudgetLedgerKindSchema>;

export function isMediaBudgetKind(kind: BudgetLedgerKind): boolean {
  return kind === "image";
}

export function budgetLedgerCostCategory(kind: BudgetLedgerKind): "model" | "media" {
  return isMediaBudgetKind(kind) ? "media" : "model";
}

export const BudgetLedgerEntrySchema = z.object({
  ts: z.string().datetime(),
  cycleId: z.string().min(1),
  requestHash: z.string().min(8),
  phase: z.string().min(1),
  ventureId: z.union([VentureIdSchema, z.literal("global")]).optional(),
  agent: z.string().min(1),
  // "fal" joined on 2026-08-09 with the generated-illustration rung, which is the first thing
  // this company bills that is neither of the two text providers. A ledger row that named the
  // wrong provider would misattribute the one kind of spend the owner most wants separated.
  provider: z.enum(["openai", "anthropic", "fal"]),
  model: z.string().min(1),
  serviceTier: z.enum(["default", "batch", "flex", "priority"]),
  tokensIn: z.number().int().nonnegative(),
  cachedTokensIn: z.number().int().nonnegative().default(0),
  tokensOut: z.number().int().nonnegative(),
  toolUses: z.number().int().nonnegative().default(0),
  usd: z.number().nonnegative(),
  kind: BudgetLedgerKindSchema,
  campaignId: z.string().nullable().optional(),
  experimentId: z.string().nullable().optional(),
  assetId: z.string().nullable().optional()
});
export type BudgetLedgerEntry = z.infer<typeof BudgetLedgerEntrySchema>;

/**
 * The monthly all-in limit the owner countersigned, and the only one a record may publish.
 *
 * Every meeting page prints "Spent this month $X of $Y", and Y was a literal written into each
 * builder: 20 in the new-idea rooms, 30 in the Caught Up rooms, 50 in one portfolio record. A
 * visitor reading two meetings from the same week saw two different budgets for the same company.
 * `state/FINANCE.md` has one answer: "Effective countersigned monthly all-in cap: $50.00 under
 * `budget-2026-08f`." This is it, so a record can no longer disagree with the company.
 *
 * It is a published figure, not a spending guard: `DEFAULT_BUDGET_LIMITS.monthlyOperatingUsd`
 * below is what the runtime refuses calls against when the environment sets nothing, and it is
 * deliberately lower.
 */
export const COUNTERSIGNED_MONTHLY_OPERATING_USD = 50;

export interface BudgetLimits {
  perTextCallUsd: number;
  maxCycleUsd: number;
  caughtUpMeetingUsd: number;
  editionProductionUsd: number;
  dailyUsd: number;
  monthlyApiUsd: number;
  monthlyOperatingUsd: number;
  maxMediaAssetUsd: number;
  dailyMediaUsd: number;
  monthlyMediaUsd: number;
}

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  perTextCallUsd: 0.1,
  maxCycleUsd: 0.2,
  caughtUpMeetingUsd: 0.08,
  // Kept equal to config/edition-quality.json's editionProductionUsd on purpose: live.ts blocks
  // the run when the resolved cap is below the configured one, so a default lower than the
  // config makes an unconfigured run refuse every edition before it starts.
  editionProductionUsd: 0.5,
  dailyUsd: 0.7,
  monthlyApiUsd: 15,
  monthlyOperatingUsd: 20,
  maxMediaAssetUsd: 0.1,
  dailyMediaUsd: 0.1,
  monthlyMediaUsd: 2
};

export type BudgetErrorCode =
  | "UNKNOWN_PRICE"
  | "PER_CALL_CAP"
  | "STAGE_CAP"
  | "CYCLE_CAP"
  | "DAILY_CAP"
  | "MONTHLY_API_CAP"
  | "MONTHLY_OPERATING_CAP"
  | "MEDIA_ASSET_CAP"
  | "DAILY_MEDIA_CAP"
  | "MONTHLY_MEDIA_CAP"
  | "PACING";

export class BudgetError extends Error {
  constructor(
    readonly code: BudgetErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BudgetError";
  }
}

export interface TextEstimateInput {
  provider: "openai" | "anthropic";
  model: string;
  serviceTier?: ServiceTier;
  promptChars: number;
  maxOutputTokens: number;
  cachedInputTokens?: number;
  /**
   * Tokens written to the provider's prompt cache on this call.
   *
   * Anthropic bills a write at 1.25x the input rate and a read at 0.1x, and reports the three
   * counts separately: `input_tokens` already excludes both. Charging a write as ordinary
   * input would under-report every first call of a room by a quarter of its prompt, so the
   * premium is priced rather than assumed away.
   */
  cacheWriteInputTokens?: number;
  webSearchUses?: number;
  maxSearchContentTokens?: number;
  at?: Date;
}

export interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedUsd: number;
  toolUsd: number;
  priceVerifiedAt: string;
  priceSourceUrl: string;
}

/** Anthropic bills a cache write at 1.25x the ordinary input rate. */
const CACHE_WRITE_MULTIPLIER = 1.25;

export function estimateTextCall(input: TextEstimateInput): CostEstimate {
  const at = input.at ?? new Date();
  const serviceTier = input.serviceTier ?? "default";
  const price = findTextPrice(input.provider, input.model, serviceTier, at);
  if (!price) {
    throw new BudgetError(
      "UNKNOWN_PRICE",
      `No dated ${serviceTier} price for ${input.provider}/${input.model}`
    );
  }
  const estimatedInputTokens = Math.ceil(input.promptChars / 3.5);
  const cachedInputTokens = Math.min(
    input.cachedInputTokens ?? 0,
    estimatedInputTokens
  );
  const cacheWriteInputTokens = Math.max(0, input.cacheWriteInputTokens ?? 0);
  const uncachedInputTokens = Math.max(0, estimatedInputTokens - cachedInputTokens - cacheWriteInputTokens);
  const maxSearchContentTokens = input.maxSearchContentTokens ?? 0;
  const searchUses = input.webSearchUses ?? 0;
  if (searchUses > 0 && maxSearchContentTokens <= 0) {
    throw new BudgetError(
      "UNKNOWN_PRICE",
      "Web search requires an explicit search-content token reservation"
    );
  }
  const cachedRate =
    price.cachedInputUsdPerMillion ?? price.inputUsdPerMillion;
  const tokenUsd =
    (uncachedInputTokens / 1_000_000) * price.inputUsdPerMillion +
    (cachedInputTokens / 1_000_000) * cachedRate +
    (cacheWriteInputTokens / 1_000_000) * price.inputUsdPerMillion * CACHE_WRITE_MULTIPLIER +
    (maxSearchContentTokens / 1_000_000) * price.inputUsdPerMillion +
    (input.maxOutputTokens / 1_000_000) * price.outputUsdPerMillion;
  const toolUsd = searchUses * WEB_SEARCH_USD_PER_CALL;
  return {
    estimatedInputTokens,
    estimatedOutputTokens: input.maxOutputTokens,
    estimatedUsd: Number((tokenUsd + toolUsd).toFixed(8)),
    toolUsd,
    priceVerifiedAt: price.verifiedAt,
    priceSourceUrl: price.sourceUrl
  };
}

export interface ImageEstimateInput {
  model: "gpt-image-2";
  quality: "low" | "medium" | "high";
  size: "1024x1024";
  promptChars: number;
}

export interface EmbeddingEstimateInput {
  model: "text-embedding-3-small";
  inputChars: number;
  at?: Date;
}

export function estimateEmbeddingCall(input: EmbeddingEstimateInput): CostEstimate {
  const at = input.at ?? new Date();
  const price = EMBEDDING_PRICES.find((candidate) =>
    candidate.model === input.model &&
    candidate.effectiveFrom <= at.toISOString().slice(0, 10) &&
    (candidate.effectiveTo === null || candidate.effectiveTo > at.toISOString().slice(0, 10))
  );
  if (!price) {
    throw new BudgetError("UNKNOWN_PRICE", `No dated embedding price for ${input.model}`);
  }
  const estimatedInputTokens = Math.ceil(input.inputChars / 3.5);
  return {
    estimatedInputTokens,
    estimatedOutputTokens: 0,
    estimatedUsd: Number(((estimatedInputTokens / 1_000_000) * price.inputUsdPerMillion).toFixed(8)),
    toolUsd: 0,
    priceVerifiedAt: price.verifiedAt,
    priceSourceUrl: price.sourceUrl
  };
}

export function estimateImageCall(input: ImageEstimateInput): CostEstimate {
  const price = IMAGE_PRICES.find(
    (candidate) =>
      candidate.model === input.model &&
      candidate.quality === input.quality &&
      candidate.size === input.size
  );
  if (!price) {
    throw new BudgetError("UNKNOWN_PRICE", "Unknown image model/size/quality");
  }
  const estimatedInputTokens = Math.ceil(input.promptChars / 3.5);
  const inputUsd =
    (estimatedInputTokens / 1_000_000) * price.inputUsdPerMillion;
  return {
    estimatedInputTokens,
    estimatedOutputTokens: 0,
    estimatedUsd: Number((price.outputUsd + inputUsd).toFixed(8)),
    toolUsd: 0,
    priceVerifiedAt: price.verifiedAt,
    priceSourceUrl: price.sourceUrl
  };
}

function isSameUtcDay(left: Date, right: Date): boolean {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

/**
 * Model-API spend already on the ledger for `now`'s UTC day.
 *
 * assertSharedReservation enforces the daily cap against exactly this slice, and the
 * pre-checks below read it through the same function, so a caller that asks "will today's
 * cap take this?" before opening a room gets the answer the reservation itself would give.
 */
export function daySpendUsd(
  ledger: readonly BudgetLedgerEntry[],
  now: Date
): number {
  return ledger
    .filter((entry) => isSameUtcDay(new Date(entry.ts), now))
    .reduce((sum, entry) => sum + entry.usd, 0);
}

export interface DailyBudgetStatus {
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
}

/** Today's spend against the daily cap in force. Reads a cap; it never sets or moves one. */
export function dailyBudgetStatus(
  ledger: readonly BudgetLedgerEntry[],
  now: Date,
  limits: BudgetLimits = DEFAULT_BUDGET_LIMITS
): DailyBudgetStatus {
  const spentUsd = Number(daySpendUsd(ledger, now).toFixed(8));
  return {
    spentUsd,
    capUsd: limits.dailyUsd,
    remainingUsd: Number(Math.max(0, limits.dailyUsd - spentUsd).toFixed(8))
  };
}

/**
 * Whether reserving `usd` today would be refused by the daily cap.
 *
 * assertSharedReservation calls this to decide whether to throw DAILY_CAP, so asking first
 * and being refused later are the same test on the same numbers. Asking is the only thing
 * this adds: the cap's value, its slice of the ledger and its verdict are untouched.
 */
export function exceedsDailyCap(
  usd: number,
  ledger: readonly BudgetLedgerEntry[],
  now: Date,
  limits: BudgetLimits = DEFAULT_BUDGET_LIMITS
): boolean {
  return daySpendUsd(ledger, now) + usd > limits.dailyUsd;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * What a room says on the calendar when a cap stopped it, in plain English.
 *
 * MeetingSkipSchema rejects a reason over 240 characters and the week board prints the first
 * 180, so the phase, the cap and the two amounts come first and only the closing clause is at
 * risk of being cut. A refused reservation is not a failure and this is the sentence that has
 * to say so — the alternative the owner was reading is "the run failed before it finished".
 */
export function budgetStopReason(input: {
  phase: string;
  status: DailyBudgetStatus;
  /** The room's reservation when it was refused before opening; null once seats were called. */
  reservationUsd: number | null;
  code?: BudgetErrorCode;
}): string {
  if (input.reservationUsd !== null) {
    return `The day's spending limit was reached, so this meeting was postponed. ${money(input.status.remainingUsd)} of the day's ${money(input.status.capUsd)} limit is left and it needs ${money(input.reservationUsd)}. Nothing was spent; spending resumes tomorrow.`;
  }
  return `The day's spending limit was reached part-way through, so this meeting stopped early. ${money(input.status.spentUsd)} of the day's ${money(input.status.capUsd)} limit is spent; nobody left to speak was asked.`;
}

function isSameUtcMonth(left: Date, right: Date): boolean {
  return left.toISOString().slice(0, 7) === right.toISOString().slice(0, 7);
}

export interface ReserveContext {
  now: Date;
  cycleId: string;
  stage: Stage;
  ledger: readonly BudgetLedgerEntry[];
  allInNonApiSpentUsd: number;
  allInCommittedUsd: number;
  knownMonthlyForecastUsd: number;
  remainingScheduledCycles: number;
  limits?: BudgetLimits;
}

export function assertTextReservation(
  estimate: CostEstimate,
  context: ReserveContext
): void {
  const limits = context.limits ?? DEFAULT_BUDGET_LIMITS;
  if (estimate.estimatedUsd > limits.perTextCallUsd) {
    throw new BudgetError(
      "PER_CALL_CAP",
      `Estimated call ${estimate.estimatedUsd} exceeds ${limits.perTextCallUsd}`
    );
  }
  assertSharedReservation(estimate.estimatedUsd, false, context, limits);
}

export function assertEmbeddingReservation(
  estimate: CostEstimate,
  context: ReserveContext
): void {
  const limits = context.limits ?? DEFAULT_BUDGET_LIMITS;
  if (estimate.estimatedUsd > limits.perTextCallUsd) {
    throw new BudgetError(
      "PER_CALL_CAP",
      `Estimated embedding ${estimate.estimatedUsd} exceeds ${limits.perTextCallUsd}`
    );
  }
  assertSharedReservation(estimate.estimatedUsd, false, context, limits);
}

export function assertImageReservation(
  estimate: CostEstimate,
  context: ReserveContext,
  avatar = false
): void {
  const limits = context.limits ?? DEFAULT_BUDGET_LIMITS;
  const perAssetCap = avatar ? 0.3 : limits.maxMediaAssetUsd;
  if (estimate.estimatedUsd > perAssetCap) {
    throw new BudgetError(
      "MEDIA_ASSET_CAP",
      `Estimated image ${estimate.estimatedUsd} exceeds ${perAssetCap}`
    );
  }
  if (avatar) {
    const monthSpend = context.ledger
      .filter((entry) => isSameUtcMonth(new Date(entry.ts), context.now))
      .reduce((sum, entry) => sum + entry.usd, 0);
    if (monthSpend + estimate.estimatedUsd > limits.monthlyApiUsd) {
      throw new BudgetError("MONTHLY_API_CAP", "Monthly API cap exceeded");
    }
    const allIn =
      monthSpend +
      estimate.estimatedUsd +
      context.allInNonApiSpentUsd +
      context.allInCommittedUsd +
      context.knownMonthlyForecastUsd;
    if (allIn > limits.monthlyOperatingUsd) {
      throw new BudgetError(
        "MONTHLY_OPERATING_CAP",
        "Hard monthly all-in operating cap exceeded"
      );
    }
    return;
  }
  if (!avatar) {
    const mediaToday = context.ledger
      .filter(
        (entry) =>
          isMediaBudgetKind(entry.kind) &&
          isSameUtcDay(new Date(entry.ts), context.now)
      )
      .reduce((sum, entry) => sum + entry.usd, 0);
    const mediaMonth = context.ledger
      .filter(
        (entry) =>
          isMediaBudgetKind(entry.kind) &&
          isSameUtcMonth(new Date(entry.ts), context.now)
      )
      .reduce((sum, entry) => sum + entry.usd, 0);
    if (mediaToday + estimate.estimatedUsd > limits.dailyMediaUsd) {
      throw new BudgetError("DAILY_MEDIA_CAP", "Daily media cap exceeded");
    }
    if (mediaMonth + estimate.estimatedUsd > limits.monthlyMediaUsd) {
      throw new BudgetError("MONTHLY_MEDIA_CAP", "Monthly media cap exceeded");
    }
  }
  assertSharedReservation(estimate.estimatedUsd, true, context, limits);
}

export function assertAvatarSetReservation(
  estimates: readonly CostEstimate[],
  maxSetUsd = 5
): number {
  const total = Number(
    estimates.reduce((sum, estimate) => sum + estimate.estimatedUsd, 0).toFixed(8)
  );
  if (total > maxSetUsd) {
    throw new BudgetError(
      "MEDIA_ASSET_CAP",
      `Avatar set estimate ${total} exceeds ${maxSetUsd}`
    );
  }
  return total;
}

function assertSharedReservation(
  usd: number,
  image: boolean,
  context: ReserveContext,
  limits: BudgetLimits
): void {
  const cycleSpend = context.ledger
    .filter((entry) => entry.cycleId === context.cycleId)
    .reduce((sum, entry) => sum + entry.usd, 0);
  const monthSpend = context.ledger
    .filter((entry) => isSameUtcMonth(new Date(entry.ts), context.now))
    .reduce((sum, entry) => sum + entry.usd, 0);
  const stageCap = Math.min(
    limits.maxCycleUsd,
    STAGE_CYCLE_CAPS[context.stage]
  );
  if (cycleSpend + usd > stageCap) {
    throw new BudgetError("STAGE_CAP", "Stage cycle cap exceeded");
  }
  if (cycleSpend + usd > limits.maxCycleUsd) {
    throw new BudgetError("CYCLE_CAP", "Cycle cap exceeded");
  }
  if (exceedsDailyCap(usd, context.ledger, context.now, limits)) {
    throw new BudgetError("DAILY_CAP", "Daily API cap exceeded");
  }
  if (monthSpend + usd > limits.monthlyApiUsd) {
    throw new BudgetError("MONTHLY_API_CAP", "Monthly API cap exceeded");
  }
  const allIn =
    monthSpend +
    usd +
    context.allInNonApiSpentUsd +
    context.allInCommittedUsd +
    context.knownMonthlyForecastUsd;
  if (allIn > limits.monthlyOperatingUsd) {
    throw new BudgetError(
      "MONTHLY_OPERATING_CAP",
      "Hard monthly all-in operating cap exceeded"
    );
  }
  const remainingApiBudget = Math.max(0, limits.monthlyApiUsd - monthSpend);
  const pacingAllowance =
    remainingApiBudget / Math.max(1, context.remainingScheduledCycles);
  const reserveCall = image ? 0 : Math.min(0.02, limits.perTextCallUsd);
  if (
    context.remainingScheduledCycles > 1 &&
    cycleSpend + usd + reserveCall > Math.max(stageCap, pacingAllowance)
  ) {
    throw new BudgetError(
      "PACING",
      "Reservation would consume the incident/repair pacing reserve"
    );
  }
}

export function hasLedgerEntry(
  ledger: readonly BudgetLedgerEntry[],
  cycleId: string,
  requestHash: string
): boolean {
  return ledger.some(
    (entry) => entry.cycleId === cycleId && entry.requestHash === requestHash
  );
}
