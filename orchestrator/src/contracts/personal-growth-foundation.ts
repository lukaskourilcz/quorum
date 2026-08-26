import { z } from "zod";

const AllocationModeSchema = z.strictObject({
  id: z.enum(["default", "buffer"]),
  synthesisUsd: z.number().finite().nonnegative(),
  researchUsd: z.number().finite().nonnegative(),
  schedulingUsd: z.number().finite().nonnegative(),
  reserveUsd: z.number().finite().nonnegative()
}).superRefine((mode, context) => {
  const total = mode.synthesisUsd + mode.researchUsd + mode.schedulingUsd + mode.reserveUsd;
  if (total !== 20) {
    context.addIssue({ code: "custom", message: "Each allocation mode must total exactly $20" });
  }
  if (mode.id === "default" && (mode.synthesisUsd !== 12 || mode.researchUsd !== 5 || mode.schedulingUsd !== 0 || mode.reserveUsd !== 3)) {
    context.addIssue({ code: "custom", message: "The default allocation must remain $12 synthesis, $5 research and $3 reserve" });
  }
  if (mode.id === "buffer" && (mode.synthesisUsd !== 8 || mode.researchUsd !== 0 || mode.schedulingUsd !== 10 || mode.reserveUsd !== 2)) {
    context.addIssue({ code: "custom", message: "The Buffer allocation must remain $10 scheduling, $8 synthesis and $2 reserve" });
  }
});

export const PersonalGrowthFoundationSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-foundation/1"),
  ventureId: z.literal("personal-growth"),
  visibility: z.literal("owner-only"),
  authority: z.strictObject({
    foundingDecisionRef: z.literal("state/decisions/2026-08-26-personal-growth-founding.md"),
    budgetDecisionRef: z.literal("state/decisions/2026-08-26-budget-personal-growth.md")
  }),
  budget: z.strictObject({
    monthlyAllInUsd: z.literal(20),
    activeMode: z.enum(["default", "buffer"]),
    modes: z.array(AllocationModeSchema).length(2)
  }).superRefine((budget, context) => {
    const ids = budget.modes.map((mode) => mode.id);
    if (new Set(ids).size !== 2 || !ids.includes("default") || !ids.includes("buffer")) {
      context.addIssue({ code: "custom", message: "The two mutually exclusive allocation modes must both be present", path: ["modes"] });
    }
    if (!ids.includes(budget.activeMode)) {
      context.addIssue({ code: "custom", message: "The active allocation mode must identify one configured mode", path: ["activeMode"] });
    }
  }),
  featureGates: z.strictObject({
    projectLive: z.boolean(),
    paidSynthesis: z.boolean(),
    insightsIngestion: z.boolean(),
    instagramInsights: z.boolean(),
    threadsInsights: z.boolean(),
    threadsSearch: z.boolean(),
    providerLive: z.boolean(),
    tokenRefresh: z.boolean(),
    bufferQueue: z.boolean(),
    publishing: z.literal(false)
  }),
  degradation: z.strictObject({
    healthyBelowRatio: z.literal(0.5),
    reducedBelowRatio: z.literal(0.7),
    lowBelowRatio: z.literal(0.85)
  })
});

export type PersonalGrowthFoundation = z.infer<typeof PersonalGrowthFoundationSchema>;
