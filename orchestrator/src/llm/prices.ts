import type { Stage } from "../types.js";

export type ServiceTier = "default" | "batch" | "flex" | "priority";

export interface TextPrice {
  provider: "openai" | "anthropic";
  model: string;
  serviceTier: ServiceTier;
  effectiveFrom: string;
  effectiveTo: string | null;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number | null;
  outputUsdPerMillion: number;
  sourceUrl: string;
  verifiedAt: string;
}

export interface ImagePrice {
  model: "gpt-image-2";
  quality: "low" | "medium" | "high";
  size: "1024x1024";
  outputUsd: number;
  inputUsdPerMillion: number;
  sourceUrl: string;
  verifiedAt: string;
}

const OPENAI_PRICING = "https://developers.openai.com/api/docs/pricing";
const ANTHROPIC_PRICING =
  "https://platform.claude.com/docs/en/about-claude/pricing";

export const TEXT_PRICES: readonly TextPrice[] = [
  {
    provider: "openai",
    model: "gpt-5.6-luna",
    serviceTier: "default",
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    outputUsdPerMillion: 6,
    sourceUrl: OPENAI_PRICING,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "openai",
    model: "gpt-5.6-terra",
    serviceTier: "default",
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
    inputUsdPerMillion: 2.5,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 15,
    sourceUrl: OPENAI_PRICING,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "openai",
    model: "gpt-5.6-sol",
    serviceTier: "default",
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30,
    sourceUrl: OPENAI_PRICING,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "openai",
    model: "gpt-5.4-mini",
    serviceTier: "default",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    inputUsdPerMillion: 0.75,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 4.5,
    sourceUrl: OPENAI_PRICING,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-7",
    serviceTier: "default",
    effectiveFrom: "2026-07-21",
    effectiveTo: null,
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 25,
    sourceUrl: ANTHROPIC_PRICING,
    verifiedAt: "2026-07-21"
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    serviceTier: "default",
    effectiveFrom: "2026-07-21",
    effectiveTo: null,
    inputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.3,
    outputUsdPerMillion: 15,
    sourceUrl: ANTHROPIC_PRICING,
    verifiedAt: "2026-07-21"
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    serviceTier: "default",
    effectiveFrom: "2026-06-09",
    effectiveTo: "2026-09-01",
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.2,
    outputUsdPerMillion: 10,
    sourceUrl: ANTHROPIC_PRICING,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    serviceTier: "default",
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
    inputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.3,
    outputUsdPerMillion: 15,
    sourceUrl: ANTHROPIC_PRICING,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    serviceTier: "default",
    effectiveFrom: "2025-10-01",
    effectiveTo: null,
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    outputUsdPerMillion: 5,
    sourceUrl: ANTHROPIC_PRICING,
    verifiedAt: "2026-07-23"
  }
] as const;

export const IMAGE_PRICES: readonly ImagePrice[] = [
  {
    model: "gpt-image-2",
    quality: "low",
    size: "1024x1024",
    outputUsd: 0.006,
    inputUsdPerMillion: 5,
    sourceUrl:
      "https://developers.openai.com/api/docs/guides/image-generation#calculating-costs",
    verifiedAt: "2026-07-23"
  },
  {
    model: "gpt-image-2",
    quality: "medium",
    size: "1024x1024",
    outputUsd: 0.053,
    inputUsdPerMillion: 5,
    sourceUrl:
      "https://developers.openai.com/api/docs/guides/image-generation#calculating-costs",
    verifiedAt: "2026-07-23"
  },
  {
    model: "gpt-image-2",
    quality: "high",
    size: "1024x1024",
    outputUsd: 0.211,
    inputUsdPerMillion: 5,
    sourceUrl:
      "https://developers.openai.com/api/docs/guides/image-generation#calculating-costs",
    verifiedAt: "2026-07-23"
  }
] as const;

export const WEB_SEARCH_USD_PER_CALL = 0.01;

export const STAGE_CYCLE_CAPS: Readonly<Record<Stage, number>> = {
  DISCOVERY: 0.12,
  VALIDATION: 0.18,
  AUDIENCE: 0.2,
  MONETIZATION: 0.2,
  OPTIMIZATION: 0.2
};

export function findTextPrice(
  provider: TextPrice["provider"],
  model: string,
  serviceTier: ServiceTier,
  at: Date
): TextPrice | null {
  const instant = at.toISOString();
  return (
    TEXT_PRICES.find(
      (price) =>
        price.provider === provider &&
        price.model === model &&
        price.serviceTier === serviceTier &&
        price.effectiveFrom <= instant &&
        (price.effectiveTo === null || instant < price.effectiveTo)
    ) ?? null
  );
}
