import { z } from "zod";
import { PersonalGrowthProviderConfigSchema, type PersonalGrowthProviderConfig } from "../../contracts/personal-growth-results.js";
import type { PersonalGrowthThreadsPacket } from "../../contracts/personal-growth-recommendations.js";
import type { PersonalGrowthFoundation } from "../../contracts/personal-growth-foundation.js";

export const PersonalGrowthBufferResultSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-buffer-result/1"),
  status: z.enum(["held", "unavailable"]),
  reason: z.enum([
    "adapter-disabled", "owner-approval-missing", "buffer-mode-inactive", "queue-gate-disabled", "publishing-disabled", "recommendation-unavailable"
  ]),
  externalRequestMade: z.literal(false),
  purchaseMade: z.literal(false),
  recommendationPreserved: z.literal(true)
});

export function evaluatePersonalGrowthBufferQueue(input: {
  config: PersonalGrowthProviderConfig;
  foundation: PersonalGrowthFoundation;
  recommendation: PersonalGrowthThreadsPacket | null;
  ownerApproved: boolean;
}) {
  const config = PersonalGrowthProviderConfigSchema.parse(input.config);
  const reason = !config.buffer.adapterEnabled ? "adapter-disabled" as const
    : !input.ownerApproved ? "owner-approval-missing" as const
      : input.foundation.budget.activeMode !== "buffer" ? "buffer-mode-inactive" as const
        : !input.foundation.featureGates.bufferQueue ? "queue-gate-disabled" as const
          : !input.foundation.featureGates.publishing ? "publishing-disabled" as const
            : input.recommendation?.decision !== "RECOMMEND" ? "recommendation-unavailable" as const
              : "publishing-disabled" as const;
  return PersonalGrowthBufferResultSchema.parse({
    schemaVersion: "personal-growth-buffer-result/1",
    status: reason === "adapter-disabled" || reason === "recommendation-unavailable" ? "unavailable" : "held",
    reason,
    externalRequestMade: false,
    purchaseMade: false,
    recommendationPreserved: true
  });
}
