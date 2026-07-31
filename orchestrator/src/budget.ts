import { z } from "zod";
import {
  findTextPrice,
  IMAGE_PRICES,
  STAGE_CYCLE_CAPS,
  WEB_SEARCH_USD_PER_CALL,
  type ServiceTier
} from "./llm/prices.js";
import type { Stage } from "./types.js";
import { VentureIdSchema } from "./contracts/common.js";

export const BudgetLedgerEntrySchema = z.object({
  ts: z.string().datetime(),
  cycleId: z.string().min(1),
  requestHash: z.string().min(8),
  phase: z.string().min(1),
  ventureId: z.union([VentureIdSchema, z.literal("global")]).optional(),
  agent: z.string().min(1),
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().min(1),
  serviceTier: z.enum(["default", "batch", "flex", "priority"]),
  tokensIn: z.number().int().nonnegative(),
  cachedTokensIn: z.number().int().nonnegative().default(0),
  tokensOut: z.number().int().nonnegative(),
  toolUses: z.number().int().nonnegative().default(0),
  usd: z.number().nonnegative(),
  kind: z.enum(["text", "image"]),
  campaignId: z.string().nullable().optional(),
  experimentId: z.string().nullable().optional(),
  assetId: z.string().nullable().optional()
});
export type BudgetLedgerEntry = z.infer<typeof BudgetLedgerEntrySchema>;

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
  editionProductionUsd: 0.35,
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
  const uncachedInputTokens = estimatedInputTokens - cachedInputTokens;
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
          entry.kind === "image" &&
          isSameUtcDay(new Date(entry.ts), context.now)
      )
      .reduce((sum, entry) => sum + entry.usd, 0);
    const mediaMonth = context.ledger
      .filter(
        (entry) =>
          entry.kind === "image" &&
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
  const daySpend = context.ledger
    .filter((entry) => isSameUtcDay(new Date(entry.ts), context.now))
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
  if (daySpend + usd > limits.dailyUsd) {
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
