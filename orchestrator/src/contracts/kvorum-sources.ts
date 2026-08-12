import { z } from "zod";
import { DateSchema, HttpsUrlSchema } from "./common.js";

const ActorPricingSchema = z.object({
  model: z.literal("pay-per-event"),
  actorStartUsd: z.number().finite().nonnegative(),
  pricePerResultUsd: z.number().finite().positive(),
  maxRunUsd: z.number().finite().positive(),
  estimatedThirtyDayUsd: z.number().finite().positive(),
  worstCalendarMonthUsd: z.number().finite().positive(),
  monthlyShareCapUsd: z.literal(2)
});

export const KvorumActorSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  actorSlug: z.string().regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i),
  actorBuildId: z.string().regex(/^[A-Za-z0-9]{17}$/),
  credentialEnv: z.literal("APIFY_TOKEN"),
  freeLimit: z.string().trim().min(1).max(240),
  termsVerdict: z.enum(["allowed", "review-required", "refused"]),
  termsNote: z.string().trim().min(1).max(600),
  evidenceUrl: HttpsUrlSchema,
  buildEvidenceUrl: HttpsUrlSchema,
  pricingEvidenceUrl: HttpsUrlSchema,
  scheduled: z.boolean(),
  pricing: ActorPricingSchema,
  input: z.object({
    startUrls: z.array(z.object({ url: HttpsUrlSchema })).length(1),
    resultsLimit: z.literal(30)
  })
});

export const KvorumRecipeStepSchema = z.object({
  step: z.literal(1),
  actorId: z.string().min(1),
  mode: z.literal("public-page-monitor"),
  targetPage: HttpsUrlSchema,
  maxResults: z.literal(30),
  runsPerDay: z.literal(1),
  cadence: z.literal("daily"),
  maxTotalChargeUsd: z.number().finite().positive()
});

export const KvorumFeedSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  kind: z.literal("rss"),
  url: HttpsUrlSchema,
  host: z.string().regex(/^[a-z0-9.-]+$/),
  enabled: z.boolean(),
  approvalId: z.literal("KV-SOURCES-002"),
  sourceClass: z.enum(["news", "institutional", "discovery"]),
  maxItems: z.number().int().min(1).max(30),
  costUsd: z.literal(0),
  geo: z.literal("CZ").optional(),
  queryMode: z.literal("entity-lexicon").optional(),
  verificationEvidenceUrl: HttpsUrlSchema,
  note: z.string().trim().min(1).max(500)
});

export const KvorumSourceRegistrySchema = z.object({
  schemaVersion: z.literal("kvorum-sources/1"),
  verifiedAt: DateSchema,
  approvals: z.object({
    actor: z.literal("KV-APIFY-001"),
    feeds: z.literal("KV-SOURCES-002"),
    requiredBeforeLive: z.literal(true)
  }),
  actors: z.array(KvorumActorSchema).length(1),
  recipe: z.array(KvorumRecipeStepSchema).length(1),
  feeds: z.array(KvorumFeedSchema).length(7)
}).superRefine((registry, context) => {
  const actor = registry.actors[0]!;
  const step = registry.recipe[0]!;
  if (step.actorId !== actor.id) {
    context.addIssue({ code: "custom", message: "Recipe actorId must reference the pinned actor", path: ["recipe", 0, "actorId"] });
  }
  if (step.targetPage !== actor.input.startUrls[0]?.url) {
    context.addIssue({ code: "custom", message: "Recipe target must match the actor input", path: ["recipe", 0, "targetPage"] });
  }
  const expectedRun = actor.pricing.actorStartUsd + actor.pricing.pricePerResultUsd * step.maxResults;
  const checks: Array<[number, number, Array<string | number>, string]> = [
    [actor.pricing.maxRunUsd, expectedRun, ["actors", 0, "pricing", "maxRunUsd"], "maxRunUsd must price the full result ceiling"],
    [actor.pricing.estimatedThirtyDayUsd, expectedRun * 30, ["actors", 0, "pricing", "estimatedThirtyDayUsd"], "Thirty-day estimate must price daily full runs"],
    [actor.pricing.worstCalendarMonthUsd, expectedRun * 31, ["actors", 0, "pricing", "worstCalendarMonthUsd"], "Worst-month estimate must price 31 daily full runs"],
    [step.maxTotalChargeUsd, expectedRun, ["recipe", 0, "maxTotalChargeUsd"], "maxTotalChargeUsd must cover no more than the declared run ceiling"]
  ];
  for (const [actual, expected, path, message] of checks) {
    if (Math.abs(actual - expected) > 1e-9) context.addIssue({ code: "custom", message, path });
  }
  if (actor.termsVerdict !== "allowed" && actor.scheduled) {
    context.addIssue({ code: "custom", message: "A scheduled actor requires an allowed terms verdict", path: ["actors", 0, "termsVerdict"] });
  }

  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const [index, feed] of registry.feeds.entries()) {
    let parsed: URL;
    try {
      parsed = new URL(feed.url);
    } catch {
      continue;
    }
    if (parsed.hostname !== feed.host || parsed.username || parsed.password) {
      context.addIssue({ code: "custom", message: "Feed host must exactly match a credential-free URL", path: ["feeds", index, "host"] });
    }
    if (ids.has(feed.id)) context.addIssue({ code: "custom", message: "Feed ids must be unique", path: ["feeds", index, "id"] });
    if (urls.has(feed.url)) context.addIssue({ code: "custom", message: "Feed URLs must be unique", path: ["feeds", index, "url"] });
    ids.add(feed.id);
    urls.add(feed.url);
  }
});

export type KvorumSourceRegistry = z.infer<typeof KvorumSourceRegistrySchema>;
