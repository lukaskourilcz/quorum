import { z } from "zod";
import { readText } from "../state.js";
import { repoRoot } from "../paths.js";
import { safeFetch } from "../security/url.js";

/**
 * The Apify side of GoVIRAL's trend scouting.
 *
 * Everything here is Free-plan only, and that is the budget control rather than a preference:
 * the Free plan carries $5 of platform credit a month, actors simply stop when it is spent, and
 * no card is on file, so an overspend is not possible. Starter is $29/mo, which alone would eat
 * the whole $30 all-in operating cap — upgrading is an owner decision with its own approval, and
 * nothing in this file or its config may assume a paid plan.
 *
 * The guard below is the same shape as the Cito one in portfolio/evidence.ts: a counter file,
 * a per-run reservation, and a refusal *before* the first request rather than an apology after
 * the last one. It is deliberately conservative — Apify prices per result and the actual item
 * count is only known after the call, so the reservation is a run's worst case.
 */
export const APIFY_HOST = "api.apify.com";

/** The Free plan's monthly platform credit. Not a limit we chose; a limit the plan enforces. */
export const APIFY_MONTHLY_CREDIT_USD = 5.0;

/** One weekly recipe's worst case, reserved up front so a run can never start what it cannot finish. */
export const APIFY_RUN_RESERVATION_USD = 1.4;

export const ApifyQuotaSchema = z.object({
  schemaVersion: z.literal("goviral-apify-quota/1"),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  estimatedUsedUsd: z.number().finite().nonnegative(),
  reservedPerRun: z.number().finite().nonnegative(),
  updatedAt: z.string(),
  perActorCounts: z.record(z.string(), z.object({
    runs: z.number().int().nonnegative(),
    items: z.number().int().nonnegative(),
    estimatedUsd: z.number().finite().nonnegative()
  }))
});

export type ApifyQuota = z.infer<typeof ApifyQuotaSchema>;

export const GoViralActorSchema = z.object({
  id: z.string().min(1),
  actorSlug: z.string().regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i),
  credentialEnv: z.literal("APIFY_TOKEN"),
  pricePer1000Usd: z.number().finite().nonnegative().optional(),
  startUsd: z.number().finite().nonnegative().optional(),
  pricePerResultUsd: z.number().finite().nonnegative().optional(),
  freeLimit: z.string().min(1),
  termsVerdict: z.enum(["allowed", "allowed-with-account", "refused"]),
  termsNote: z.string().min(1),
  evidenceUrl: z.string().url(),
  scheduled: z.boolean()
});

export const GoViralTopicSetSchema = z.object({
  label: z.string().min(1),
  keywords: z.array(z.string().min(1)).max(12),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).max(12)
});

export const GoViralRecipeStepSchema = z.object({
  step: z.number().int().min(1),
  actorId: z.string().min(1),
  mode: z.enum(["reels", "hashtag", "search-top", "profile-monitor", "explore"]),
  inputs: z.enum(["keyword", "hashtag", "account", "none"]),
  perInput: z.number().int().min(1).max(200),
  maxResults: z.number().int().min(1).max(500),
  cadence: z.enum(["weekly", "monthly"])
});

export const GoViralSourceRegistrySchema = z.object({
  schemaVersion: z.literal("goviral-sources/1"),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actors: z.array(GoViralActorSchema).min(1),
  recipe: z.array(GoViralRecipeStepSchema).min(1),
  trackedAccounts: z.array(z.string().trim().min(1).max(80)).max(40),
  topicSets: z.record(z.string(), GoViralTopicSetSchema)
});

export type GoViralActor = z.infer<typeof GoViralActorSchema>;
export type GoViralRecipeStep = z.infer<typeof GoViralRecipeStepSchema>;
export type GoViralTopicSet = z.infer<typeof GoViralTopicSetSchema>;
export type GoViralSourceRegistry = z.infer<typeof GoViralSourceRegistrySchema>;

export async function loadGoViralSourceRegistry(root = repoRoot): Promise<GoViralSourceRegistry> {
  const raw = await readText(root, "config/goviral-sources.json");
  if (!raw) throw new Error("config/goviral-sources.json is missing");
  return GoViralSourceRegistrySchema.parse(JSON.parse(raw));
}

export function emptyApifyQuota(month: string, now: Date): ApifyQuota {
  return {
    schemaVersion: "goviral-apify-quota/1",
    month,
    estimatedUsedUsd: 0,
    reservedPerRun: APIFY_RUN_RESERVATION_USD,
    updatedAt: now.toISOString(),
    perActorCounts: {}
  };
}

/**
 * A month's counter, rolled over when the month changes.
 *
 * Apify's own credit resets monthly and does not roll over, so a counter carried across a month
 * boundary would refuse runs the platform would have allowed. Anything unparseable is treated as
 * a fresh month rather than as a reason to stop: the platform's hard stop is the real guard, and
 * this counter exists to keep us from reaching it, not to be the only thing that can.
 */
export function currentMonthQuota(stored: unknown, month: string, now: Date): ApifyQuota {
  const parsed = ApifyQuotaSchema.safeParse(stored);
  if (!parsed.success || parsed.data.month !== month) return emptyApifyQuota(month, now);
  return parsed.data;
}

export interface QuotaVerdict {
  allowed: boolean;
  reason: string;
}

/** Whether a run may start, asked before the first request rather than after the last. */
export function mayRunApify(quota: ApifyQuota, token: string | undefined): QuotaVerdict {
  if (!token?.trim()) {
    return { allowed: false, reason: "APIFY_TOKEN is unavailable, so no scout ran and nothing was spent." };
  }
  const projected = quota.estimatedUsedUsd + APIFY_RUN_RESERVATION_USD;
  if (projected > APIFY_MONTHLY_CREDIT_USD) {
    return {
      allowed: false,
      reason: `This month's Apify credit is spent: ${quota.estimatedUsedUsd.toFixed(2)} of ${APIFY_MONTHLY_CREDIT_USD.toFixed(2)} used and a run reserves ${APIFY_RUN_RESERVATION_USD.toFixed(2)}.`
    };
  }
  return { allowed: true, reason: "Within this month's Apify credit." };
}

/** What an actor call costs, from the pricing shape its registry entry declares. */
export function estimateActorUsd(actor: GoViralActor, items: number): number {
  const perResult = actor.pricePerResultUsd ?? (actor.pricePer1000Usd ?? 0) / 1000;
  return Number(((actor.startUsd ?? 0) + perResult * items).toFixed(6));
}

export function recordActorUsage(
  quota: ApifyQuota,
  actor: GoViralActor,
  items: number,
  now: Date
): ApifyQuota {
  const usd = estimateActorUsd(actor, items);
  const prior = quota.perActorCounts[actor.id] ?? { runs: 0, items: 0, estimatedUsd: 0 };
  return {
    ...quota,
    estimatedUsedUsd: Number((quota.estimatedUsedUsd + usd).toFixed(6)),
    updatedAt: now.toISOString(),
    perActorCounts: {
      ...quota.perActorCounts,
      [actor.id]: {
        runs: prior.runs + 1,
        items: prior.items + items,
        estimatedUsd: Number((prior.estimatedUsd + usd).toFixed(6))
      }
    }
  };
}

/**
 * Apify's own view of the month, when it will give one.
 *
 * The estimate above is arithmetic on published prices and can drift; the platform knows the
 * truth. This follows the Odds API precedent — prefer the provider's number, fall back to ours
 * rather than failing, because a usage endpoint that is down is not a reason to skip a $0 run.
 */
export async function fetchApifyMonthlyUsageUsd(input: {
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<number | null> {
  try {
    const response = await safeFetch("https://api.apify.com/v2/users/me/usage/monthly", {
      allowHosts: [APIFY_HOST],
      headers: { authorization: `Bearer ${input.token}`, accept: "application/json" },
      timeoutMs: 8_000,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });
    const payload = JSON.parse(new TextDecoder().decode(response.body)) as unknown;
    const total = (payload as { data?: { monthlyUsageUsd?: unknown } })?.data?.monthlyUsageUsd;
    return typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : null;
  } catch {
    return null;
  }
}

export interface ApifyDatasetItem {
  [key: string]: unknown;
}

/**
 * One actor run, synchronously, returning its dataset.
 *
 * `run-sync-get-dataset-items` waits up to 300s and hands back the items, which removes a polling
 * loop and the state it would need. The timeout here is shorter than Apify's: a scout that has
 * not answered in two minutes is not worth holding a runner for, and a failed scout is a stale-
 * data outcome, never an error.
 */
export async function runApifyActor(input: {
  actor: GoViralActor;
  token: string;
  payload: Record<string, unknown>;
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<ApifyDatasetItem[]> {
  const path = input.actor.actorSlug.replace("/", "~");
  const response = await safeFetch(`https://api.apify.com/v2/acts/${path}/run-sync-get-dataset-items`, {
    allowHosts: [APIFY_HOST],
    method: "POST",
    headers: {
      authorization: `Bearer ${input.token}`,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(input.payload),
    maxBytes: input.maxBytes ?? 1_000_000,
    timeoutMs: input.timeoutMs ?? 120_000,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
  });
  const parsed = JSON.parse(new TextDecoder().decode(response.body)) as unknown;
  return Array.isArray(parsed) ? parsed as ApifyDatasetItem[] : [];
}
