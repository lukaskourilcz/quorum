import { z } from "zod";
import { atomicWriteJson, readJson, readText } from "../state.js";
import { repoRoot } from "../paths.js";
import { safeFetch } from "../security/url.js";
import {
  KVORUM_APIFY_MONTHLY_SHARE_USD,
  KVORUM_APIFY_RUN_RESERVATION_USD,
  KvorumApifyQuotaSchema,
  type KvorumApifyQuota
} from "../contracts/kvorum-apify-quota.js";
import type {
  KvorumActor,
  KvorumSourceRegistry
} from "../contracts/kvorum-sources.js";
import {
  kvorumBudgetCapacityDecision,
  signedOwnerDecision
} from "../portfolio/schedule.js";

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

/** FightAIQ's share of the same account-wide Free-plan credit. This is a ceiling, not spend authority. */
export const MMA_APIFY_MONTHLY_SHARE_USD = 3.0;

/** Four bounded source steps may reserve at most this much before the first actor request. */
export const MMA_APIFY_RUN_RESERVATION_USD = 0.75;

export const MmaApifyActorConfigSchema = z.object({
  actorSlug: z.string().regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i),
  actorBuildId: z.string().regex(/^[A-Za-z0-9]{17}$/),
  purpose: z.enum(["ufc-stats", "espn-mma", "oktagon-cards", "roster-profiles"]),
  targetHosts: z.array(z.string().min(1)).min(1).max(3),
  pricing: z.object({
    model: z.enum(["pay-per-result", "platform-usage"]),
    pricePerResultUsd: z.number().finite().nonnegative().optional(),
    maxRunUsd: z.number().finite().positive().max(MMA_APIFY_RUN_RESERVATION_USD)
  }),
  maxResults: z.number().int().positive().max(100),
  expectedMonthlyUsd: z.number().finite().nonnegative().max(MMA_APIFY_MONTHLY_SHARE_USD),
  cadence: z.enum(["weekly", "twice-monthly", "monthly", "owner-only"]),
  pricingEvidenceUrl: z.string().url(),
  input: z.record(z.string(), z.unknown())
}).superRefine((actor, context) => {
  const projected = (actor.pricing.pricePerResultUsd ?? 0) * actor.maxResults;
  if (actor.pricing.model === "pay-per-result" && actor.pricing.pricePerResultUsd === undefined) {
    context.addIssue({ code: "custom", message: "Pay-per-result actors need a result price", path: ["pricing", "pricePerResultUsd"] });
  }
  if (projected - actor.pricing.maxRunUsd > 0.000001) {
    context.addIssue({ code: "custom", message: "Actor result cap exceeds its per-run cost ceiling", path: ["maxResults"] });
  }
});

export type MmaApifyActorConfig = z.infer<typeof MmaApifyActorConfigSchema>;

export const MmaApifyQuotaSchema = z.object({
  schemaVersion: z.literal("mma-apify-quota/1"),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  shareCapUsd: z.literal(MMA_APIFY_MONTHLY_SHARE_USD),
  estimatedUsedUsd: z.number().finite().nonnegative(),
  sharedAccountUsedUsd: z.number().finite().nonnegative().nullable(),
  reservedPerRun: z.literal(MMA_APIFY_RUN_RESERVATION_USD),
  updatedAt: z.string(),
  perActorCounts: z.record(z.string(), z.object({
    runs: z.number().int().nonnegative(),
    items: z.number().int().nonnegative(),
    estimatedUsd: z.number().finite().nonnegative()
  }))
});

export type MmaApifyQuota = z.infer<typeof MmaApifyQuotaSchema>;

export interface MmaApifyApprovals {
  account: boolean;
  sources: boolean;
}

type TenantQuotaBlock = "token" | "share" | "shared-credit" | null;

/**
 * The arithmetic shared by every venture-specific Apify wrapper.
 *
 * Approval wording stays in each wrapper because its ids and audit sentence are part of that
 * venture's public boundary. Token, local-share and account-credit arithmetic do not vary.
 */
function tenantQuotaBlock(input: {
  token: string | undefined;
  estimatedUsedUsd: number;
  shareCapUsd: number;
  reservationUsd: number;
  sharedAccountUsedUsd: number | null;
}): TenantQuotaBlock {
  if (!input.token?.trim()) return "token";
  if (input.estimatedUsedUsd + input.reservationUsd > input.shareCapUsd) return "share";
  if (
    input.sharedAccountUsedUsd !== null
    && input.sharedAccountUsedUsd + input.reservationUsd > APIFY_MONTHLY_CREDIT_USD
  ) return "shared-credit";
  return null;
}

async function localTenantUsage(root: string, relativePath: string): Promise<number> {
  try {
    const stored = await readJson<{ estimatedUsedUsd?: unknown }>(root, relativePath, {});
    const value = stored.estimatedUsedUsd;
    // A malformed sibling counter is not permission to assume it spent zero. Treat the shared
    // credit as exhausted until provider usage can give the authoritative figure.
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : Object.keys(stored).length === 0 ? 0 : APIFY_MONTHLY_CREDIT_USD;
  } catch {
    return APIFY_MONTHLY_CREDIT_USD;
  }
}

export function parseMmaApifyApprovals(inbox: string): MmaApifyApprovals {
  const checked = (id: string) => new RegExp(`^- \\[x\\] HUMAN_APPROVAL ${id}\\b`, "imu").test(inbox);
  return { account: checked("APIFY-ACCOUNT-001"), sources: checked("APIFY-MMA-SOURCES-001") };
}

export function emptyMmaApifyQuota(month: string, now: Date): MmaApifyQuota {
  return {
    schemaVersion: "mma-apify-quota/1",
    month,
    shareCapUsd: MMA_APIFY_MONTHLY_SHARE_USD,
    estimatedUsedUsd: 0,
    sharedAccountUsedUsd: null,
    reservedPerRun: MMA_APIFY_RUN_RESERVATION_USD,
    updatedAt: now.toISOString(),
    perActorCounts: {}
  };
}

export function currentMmaApifyQuota(stored: unknown, month: string, now: Date): MmaApifyQuota {
  const parsed = MmaApifyQuotaSchema.safeParse(stored);
  if (!parsed.success || parsed.data.month !== month) return emptyMmaApifyQuota(month, now);
  return parsed.data;
}

export function mayRunMmaApify(input: {
  quota: MmaApifyQuota;
  approvals: MmaApifyApprovals;
  token: string | undefined;
  sharedAccountUsedUsd: number | null;
}): QuotaVerdict {
  const pending = [
    ...(!input.approvals.account ? ["APIFY-ACCOUNT-001"] : []),
    ...(!input.approvals.sources ? ["APIFY-MMA-SOURCES-001"] : [])
  ];
  if (pending.length > 0) {
    return { allowed: false, reason: `MMA Apify sources are waiting for ${pending.join(" and ")}; no actor ran and nothing was spent.` };
  }
  const block = tenantQuotaBlock({
    token: input.token,
    estimatedUsedUsd: input.quota.estimatedUsedUsd,
    shareCapUsd: MMA_APIFY_MONTHLY_SHARE_USD,
    reservationUsd: MMA_APIFY_RUN_RESERVATION_USD,
    sharedAccountUsedUsd: input.sharedAccountUsedUsd
  });
  if (block === "token") {
    return { allowed: false, reason: "APIFY_TOKEN is unavailable, so no MMA actor ran and nothing was spent." };
  }
  if (block === "share") {
    return { allowed: false, reason: "The MMA Apify share is exhausted, so no actor ran and nothing was spent." };
  }
  if (block === "shared-credit") {
    return { allowed: false, reason: "The shared Apify Free-plan credit cannot cover the MMA reservation, so no actor ran and nothing was spent." };
  }
  return { allowed: true, reason: "The approval, account, shared-credit and MMA-share guards allow this run." };
}

export function estimateMmaActorUsd(actor: MmaApifyActorConfig, items: number): number {
  const estimate = actor.pricing.model === "pay-per-result"
    ? (actor.pricing.pricePerResultUsd ?? 0) * items
    : actor.pricing.maxRunUsd;
  return Number(Math.min(estimate, actor.pricing.maxRunUsd).toFixed(6));
}

export function recordMmaActorUsage(
  quota: MmaApifyQuota,
  actorId: string,
  actor: MmaApifyActorConfig,
  items: number,
  now: Date,
  sharedAccountUsedUsd: number | null
): MmaApifyQuota {
  const usd = estimateMmaActorUsd(actor, items);
  const prior = quota.perActorCounts[actorId] ?? { runs: 0, items: 0, estimatedUsd: 0 };
  return MmaApifyQuotaSchema.parse({
    ...quota,
    estimatedUsedUsd: Number((quota.estimatedUsedUsd + usd).toFixed(6)),
    sharedAccountUsedUsd,
    updatedAt: now.toISOString(),
    perActorCounts: {
      ...quota.perActorCounts,
      [actorId]: {
        runs: prior.runs + 1,
        items: prior.items + items,
        estimatedUsd: Number((prior.estimatedUsd + usd).toFixed(6))
      }
    }
  });
}

export interface MmaApifySourceEntry {
  id: string;
  state: "wired" | "proposed" | "disabled" | "blocked";
  termsVerdict: "allowed-with-account" | "allowed" | "unclear" | "forbidden";
  apify?: MmaApifyActorConfig;
}

export interface MmaApifyRunResult {
  sourceId: string;
  status: "success" | "skipped" | "failed";
  reason: string | null;
  items: ApifyDatasetItem[];
}

/**
 * Approval-gated MMA actor sweep.
 *
 * The preliminary verdict happens before the platform usage request, so a pending approval or
 * missing token is a literal $0 path. The provider's account-wide usage then guards the shared
 * $5 credit, the local ledger guards FightAIQ's $3 share, and every actor request carries its own
 * max charge. No one layer substitutes for another.
 */
export async function runMmaApifySources(input: {
  root: string;
  date: string;
  now: Date;
  inbox: string;
  token: string | undefined;
  sources: readonly MmaApifySourceEntry[];
  usageFetcher?: (token: string) => Promise<number | null>;
  actorRunner?: typeof runApifyActor;
}): Promise<{ results: MmaApifyRunResult[]; artifactPaths: string[] }> {
  const quotaPath = "mma/source-quota/apify.json";
  const month = input.date.slice(0, 7);
  const quota = currentMmaApifyQuota(await readJson<unknown>(input.root, quotaPath, {}), month, input.now);
  const approvals = parseMmaApifyApprovals(input.inbox);
  const preliminary = mayRunMmaApify({ quota, approvals, token: input.token, sharedAccountUsedUsd: null });
  if (!preliminary.allowed) {
    return { results: [{ sourceId: "apify-mma", status: "skipped", reason: preliminary.reason, items: [] }], artifactPaths: [] };
  }

  const actors = input.sources.filter((source) =>
    (source.state === "wired" || source.state === "proposed")
    && (source.termsVerdict === "allowed" || source.termsVerdict === "allowed-with-account")
    && source.apify);
  if (actors.length === 0) {
    return { results: [{ sourceId: "apify-mma", status: "skipped", reason: "No terms-approved MMA actor is enabled; no actor ran and nothing was spent.", items: [] }], artifactPaths: [] };
  }

  const fetchUsage = input.usageFetcher ?? ((token: string) => fetchApifyMonthlyUsageUsd({ token }));
  const reported = await fetchUsage(input.token as string);
  const sharedUsed = reported ?? Number((
    await localTenantUsage(input.root, "goviral/source-quota/apify.json")
    + quota.estimatedUsedUsd
    + await localTenantUsage(input.root, "kvorum/source-quota/apify.json")
  ).toFixed(6));
  const verdict = mayRunMmaApify({ quota, approvals, token: input.token, sharedAccountUsedUsd: sharedUsed });
  if (!verdict.allowed) {
    return { results: [{ sourceId: "apify-mma", status: "skipped", reason: verdict.reason, items: [] }], artifactPaths: [] };
  }

  const runner = input.actorRunner ?? runApifyActor;
  let nextQuota: MmaApifyQuota = { ...quota, sharedAccountUsedUsd: sharedUsed };
  const results: MmaApifyRunResult[] = [];
  for (const source of actors) {
    const actor = source.apify!;
    try {
      const items = await runner({
        actor,
        token: input.token as string,
        payload: actor.input,
        maxTotalChargeUsd: actor.pricing.maxRunUsd
      });
      nextQuota = recordMmaActorUsage(nextQuota, source.id, actor, items.length, input.now, sharedUsed);
      results.push({
        sourceId: source.id,
        status: items.length > 0 ? "success" : "skipped",
        reason: items.length > 0 ? null : "The approved actor returned no rows.",
        items: items.slice(0, actor.maxResults)
      });
    } catch {
      results.push({ sourceId: source.id, status: "failed", reason: "The approved actor failed before producing a reviewed dataset.", items: [] });
    }
  }
  await atomicWriteJson(input.root, quotaPath, nextQuota);
  return { results, artifactPaths: [quotaPath] };
}

export interface KvorumApifyApprovals {
  account: boolean;
  scope: boolean;
}

export function parseKvorumApifyApprovals(inbox: string): KvorumApifyApprovals {
  const checked = (id: string) => new RegExp(`^- \\[[xX]\\] HUMAN_APPROVAL ${id}\\b`, "mu").test(inbox);
  return { account: checked("APIFY-ACCOUNT-001"), scope: checked("KV-APIFY-001") };
}

export function emptyKvorumApifyQuota(month: string, now: Date): KvorumApifyQuota {
  return {
    schemaVersion: "kvorum-apify-quota/1",
    month,
    shareCapUsd: KVORUM_APIFY_MONTHLY_SHARE_USD,
    estimatedUsedUsd: 0,
    sharedAccountUsedUsd: null,
    reservedPerRun: KVORUM_APIFY_RUN_RESERVATION_USD,
    updatedAt: now.toISOString(),
    perActorCounts: {}
  };
}

export function currentKvorumApifyQuota(
  stored: unknown,
  month: string,
  now: Date
): KvorumApifyQuota {
  if (
    stored !== null
    && typeof stored === "object"
    && !Array.isArray(stored)
    && Object.keys(stored).length === 0
  ) return emptyKvorumApifyQuota(month, now);
  const parsed = KvorumApifyQuotaSchema.safeParse(stored);
  if (!parsed.success) throw new Error("Kvórum Apify quota state is invalid; no actor may run.");
  if (parsed.data.month !== month) return emptyKvorumApifyQuota(month, now);
  return parsed.data;
}

export function mayRunKvorumApify(input: {
  quota: KvorumApifyQuota;
  approvals: KvorumApifyApprovals;
  authority: { founding: boolean; budgetCapacity: boolean };
  token: string | undefined;
  sharedAccountUsedUsd: number | null;
}): QuotaVerdict {
  const authorityPending = [
    ...(!input.authority.founding ? ["the Kvórum founding decision"] : []),
    ...(!input.authority.budgetCapacity ? ["the Kvórum budget-capacity decision"] : [])
  ];
  if (authorityPending.length > 0) {
    return {
      allowed: false,
      reason: `Kvórum Apify is waiting for ${authorityPending.join(" and ")} to be countersigned; no actor ran and nothing was spent.`
    };
  }
  const pending = [
    ...(!input.approvals.account ? ["APIFY-ACCOUNT-001"] : []),
    ...(!input.approvals.scope ? ["KV-APIFY-001"] : [])
  ];
  if (pending.length > 0) {
    return {
      allowed: false,
      reason: `Kvórum Apify is waiting for ${pending.join(" and ")}; no actor ran and nothing was spent.`
    };
  }
  const block = tenantQuotaBlock({
    token: input.token,
    estimatedUsedUsd: input.quota.estimatedUsedUsd,
    shareCapUsd: input.quota.shareCapUsd,
    reservationUsd: input.quota.reservedPerRun,
    sharedAccountUsedUsd: input.sharedAccountUsedUsd
  });
  if (block === "token") {
    return { allowed: false, reason: "APIFY_TOKEN is unavailable, so no Kvórum actor ran and nothing was spent." };
  }
  if (block === "share") {
    return { allowed: false, reason: "The Kvórum Apify share is exhausted, so no actor ran and nothing was spent." };
  }
  if (block === "shared-credit") {
    return { allowed: false, reason: "The shared Apify Free-plan credit cannot cover the Kvórum reservation, so no actor ran and nothing was spent." };
  }
  return { allowed: true, reason: "The authority, approval, account, shared-credit and Kvórum-share guards allow this run." };
}

export function estimateKvorumActorUsd(actor: KvorumActor, items: number): number {
  const boundedItems = Math.min(Math.max(Math.floor(items), 0), actor.input.resultsLimit);
  return Number(Math.min(
    actor.pricing.actorStartUsd + actor.pricing.pricePerResultUsd * boundedItems,
    actor.pricing.maxRunUsd
  ).toFixed(6));
}

export function recordKvorumActorUsage(input: {
  quota: KvorumApifyQuota;
  actor: KvorumActor;
  items: number;
  now: Date;
  sharedAccountUsedUsd: number;
  conservativeFailure?: boolean;
}): KvorumApifyQuota {
  const usd = input.conservativeFailure
    ? input.quota.reservedPerRun
    : estimateKvorumActorUsd(input.actor, input.items);
  const prior = input.quota.perActorCounts[input.actor.id] ?? { runs: 0, items: 0, estimatedUsd: 0 };
  return KvorumApifyQuotaSchema.parse({
    ...input.quota,
    estimatedUsedUsd: Number((input.quota.estimatedUsedUsd + usd).toFixed(6)),
    sharedAccountUsedUsd: input.sharedAccountUsedUsd,
    updatedAt: input.now.toISOString(),
    perActorCounts: {
      ...input.quota.perActorCounts,
      [input.actor.id]: {
        runs: prior.runs + 1,
        items: prior.items + Math.min(Math.max(Math.floor(input.items), 0), input.actor.input.resultsLimit),
        estimatedUsd: Number((prior.estimatedUsd + usd).toFixed(6))
      }
    }
  });
}

export interface KvorumApifyRunResult {
  sourceId: string;
  status: "success" | "skipped" | "failed";
  reason: string | null;
  items: ApifyDatasetItem[];
}

export interface KvorumApifyRunOutcome {
  results: KvorumApifyRunResult[];
  artifactPaths: string[];
  sharedUsageSource: "provider" | "local-estimate" | null;
}

/**
 * The one approved Kvórum public-page actor behind every authority and quota gate.
 *
 * Its payload is reconstructed field by field so no login, cookie or unreviewed actor option can
 * flow from configuration. A failed request records the full reservation conservatively: once
 * the provider call starts, a network failure is not evidence that it charged zero.
 */
export async function runKvorumApifySource(input: {
  root: string;
  date: string;
  now: Date;
  inbox: string;
  token: string | undefined;
  registry: KvorumSourceRegistry;
  foundingDecisionRaw?: string;
  budgetCapacityDecisionRaw?: string;
  usageFetcher?: (token: string) => Promise<number | null>;
  actorRunner?: typeof runApifyActor;
}): Promise<KvorumApifyRunOutcome> {
  const quotaPath = "kvorum/source-quota/apify.json";
  const actor = input.registry.actors[0]!;
  const [foundingRaw, capacityRaw] = await Promise.all([
    input.foundingDecisionRaw !== undefined
      ? Promise.resolve(input.foundingDecisionRaw)
      : readText(input.root, "decisions/2026-08-12-kvorum-founding.md"),
    input.budgetCapacityDecisionRaw !== undefined
      ? Promise.resolve(input.budgetCapacityDecisionRaw)
      : readText(input.root, "decisions/2026-08-12-kvorum-budget-capacity.md")
  ]);
  const authority = {
    founding: signedOwnerDecision(foundingRaw) === "countersigned",
    budgetCapacity: kvorumBudgetCapacityDecision(capacityRaw) === "countersigned"
  };
  const approvals = parseKvorumApifyApprovals(input.inbox);
  let quota: KvorumApifyQuota;
  try {
    quota = currentKvorumApifyQuota(
      await readJson<unknown>(input.root, quotaPath, {}),
      input.date.slice(0, 7),
      input.now
    );
  } catch (error) {
    return {
      results: [{
        sourceId: actor.id,
        status: "skipped",
        reason: error instanceof Error ? error.message : "Kvórum Apify quota state is invalid; no actor may run.",
        items: []
      }],
      artifactPaths: [],
      sharedUsageSource: null
    };
  }
  const preliminary = mayRunKvorumApify({
    quota,
    approvals,
    authority,
    token: input.token,
    sharedAccountUsedUsd: null
  });
  if (!preliminary.allowed) {
    return {
      results: [{ sourceId: actor.id, status: "skipped", reason: preliminary.reason, items: [] }],
      artifactPaths: [],
      sharedUsageSource: null
    };
  }
  if (!actor.scheduled || actor.termsVerdict !== "allowed") {
    return {
      results: [{
        sourceId: actor.id,
        status: "skipped",
        reason: "The pinned Kvórum actor is not terms-approved and scheduled; no actor ran and nothing was spent.",
        items: []
      }],
      artifactPaths: [],
      sharedUsageSource: null
    };
  }

  const fetchUsage = input.usageFetcher ?? ((token: string) => fetchApifyMonthlyUsageUsd({ token }));
  const reported = await fetchUsage(input.token as string);
  const sharedUsageSource = reported === null ? "local-estimate" : "provider";
  const sharedUsed = reported ?? Number((
    await localTenantUsage(input.root, "goviral/source-quota/apify.json")
    + await localTenantUsage(input.root, "mma/source-quota/apify.json")
    + quota.estimatedUsedUsd
  ).toFixed(6));
  const verdict = mayRunKvorumApify({
    quota,
    approvals,
    authority,
    token: input.token,
    sharedAccountUsedUsd: sharedUsed
  });
  if (!verdict.allowed) {
    return {
      results: [{ sourceId: actor.id, status: "skipped", reason: verdict.reason, items: [] }],
      artifactPaths: [],
      sharedUsageSource
    };
  }

  const runner = input.actorRunner ?? runApifyActor;
  const payload = {
    startUrls: actor.input.startUrls.map((entry) => ({ url: entry.url })),
    resultsLimit: actor.input.resultsLimit
  };
  let nextQuota: KvorumApifyQuota;
  let result: KvorumApifyRunResult;
  try {
    const rows = await runner({
      actor: { actorSlug: actor.actorSlug, actorBuildId: actor.actorBuildId },
      token: input.token as string,
      payload,
      maxTotalChargeUsd: actor.pricing.maxRunUsd
    });
    const items = rows.slice(0, actor.input.resultsLimit);
    nextQuota = recordKvorumActorUsage({
      quota,
      actor,
      items: items.length,
      now: input.now,
      sharedAccountUsedUsd: sharedUsed
    });
    result = {
      sourceId: actor.id,
      status: items.length > 0 ? "success" : "skipped",
      reason: items.length > 0 ? null : "The approved Kvórum actor returned no rows.",
      items
    };
  } catch {
    nextQuota = recordKvorumActorUsage({
      quota,
      actor,
      items: 0,
      now: input.now,
      sharedAccountUsedUsd: sharedUsed,
      conservativeFailure: true
    });
    result = {
      sourceId: actor.id,
      status: "failed",
      reason: "The approved Kvórum actor failed after launch; the full reservation was recorded conservatively.",
      items: []
    };
  }
  await atomicWriteJson(input.root, quotaPath, nextQuota);
  return { results: [result], artifactPaths: [quotaPath], sharedUsageSource };
}

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
  /** Free-only sets are consumed by keyless sources and are never expanded into actor calls. */
  sourceMode: z.enum(["apify", "free"]).default("apify"),
  keywords: z.array(z.string().min(1)).max(12),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).max(12),
  /** An explicit false keeps a context-only set out of actor payloads without enrolling it in free collection. */
  apify: z.boolean().optional()
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
  /** Decided and closed. Kept in the config so a future session finds the reason, not the gap. */
  rejected: z.array(z.object({
    what: z.string().min(1).max(160),
    why: z.string().min(1).max(400)
  })).default([]),
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
  actor: Pick<GoViralActor, "actorSlug"> & { actorBuildId?: string };
  token: string;
  payload: Record<string, unknown>;
  maxTotalChargeUsd?: number;
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<ApifyDatasetItem[]> {
  const actorPath = input.actor.actorBuildId
    ? `actor-builds/${input.actor.actorBuildId}`
    : `acts/${input.actor.actorSlug.replace("/", "~")}`;
  const endpoint = new URL(`https://api.apify.com/v2/${actorPath}/run-sync-get-dataset-items`);
  if (input.maxTotalChargeUsd !== undefined) endpoint.searchParams.set("maxTotalChargeUsd", String(input.maxTotalChargeUsd));
  const response = await safeFetch(endpoint.toString(), {
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
