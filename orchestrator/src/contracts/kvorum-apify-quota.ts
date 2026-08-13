import { z } from "zod";
import { DateTimeSchema } from "./common.js";

export const KVORUM_APIFY_MONTHLY_SHARE_USD = 2 as const;
export const KVORUM_APIFY_RUN_RESERVATION_USD = 0.151 as const;

const ActorUsageSchema = z.object({
  runs: z.number().int().nonnegative(),
  items: z.number().int().nonnegative(),
  estimatedUsd: z.number().finite().nonnegative()
});

export const KvorumApifyQuotaSchema = z.object({
  schemaVersion: z.literal("kvorum-apify-quota/1"),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  shareCapUsd: z.literal(KVORUM_APIFY_MONTHLY_SHARE_USD),
  estimatedUsedUsd: z.number().finite().min(0).max(KVORUM_APIFY_MONTHLY_SHARE_USD),
  sharedAccountUsedUsd: z.number().finite().nonnegative().nullable(),
  reservedPerRun: z.literal(KVORUM_APIFY_RUN_RESERVATION_USD),
  updatedAt: DateTimeSchema,
  perActorCounts: z.record(
    z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ActorUsageSchema
  )
}).superRefine((quota, context) => {
  const actorTotal = Object.values(quota.perActorCounts)
    .reduce((sum, actor) => sum + actor.estimatedUsd, 0);
  if (Math.abs(actorTotal - quota.estimatedUsedUsd) > 0.000001) {
    context.addIssue({
      code: "custom",
      message: "Per-actor estimates must reconcile to estimatedUsedUsd",
      path: ["perActorCounts"]
    });
  }
});

export type KvorumApifyQuota = z.infer<typeof KvorumApifyQuotaSchema>;
