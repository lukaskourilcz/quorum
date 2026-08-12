import { z } from "zod";

const Sha1Schema = z.string().regex(/^[a-f0-9]{40}$/);
const RefTextSchema = z.strictObject({
  text: z.string().trim().min(1).max(2_000),
  refs: z.array(Sha1Schema).min(1).max(20)
});
const TribunClaimSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  type: z.enum(["fact-multi", "fact-single", "commentary"]),
  text: z.string().trim().min(1).max(1_000),
  refs: z.array(Sha1Schema).min(1).max(20)
});

export const TribunPackageSchema = z.strictObject({
  clusterId: Sha1Schema,
  headline: z.string().trim().min(1).max(240),
  summary: RefTextSchema,
  whyItMatters: RefTextSchema,
  whyThisIsWorthIt: z.string().trim().min(1).max(1_000),
  ourAngle: z.string().trim().min(1).max(2_000),
  ourAngleDiffers: z.string().trim().min(1).max(2_000),
  stitAttribution: z.strictObject({
    summary: z.string().trim().min(1).max(1_000),
    itemRefs: z.array(Sha1Schema).min(1).max(30)
  }).nullable(),
  targets: z.array(z.strictObject({
    platform: z.enum(["instagram", "facebook", "threads", "x"]),
    format: z.enum(["carousel", "single-image", "thread", "caption"]),
    reason: z.string().trim().min(1).max(800),
    copy: z.string().trim().min(1).max(12_000),
    altText: z.string().trim().min(1).max(2_000).nullable()
  })).min(1).max(8),
  claims: z.array(TribunClaimSchema).min(1).max(80)
}).superRefine((candidate, context) => {
  const claimIds = new Set<string>();
  for (const [claimIndex, claim] of candidate.claims.entries()) {
    if (claimIds.has(claim.id)) {
      context.addIssue({ code: "custom", message: "Claim ids must be unique", path: ["claims", claimIndex, "id"] });
    }
    claimIds.add(claim.id);
    if (new Set(claim.refs).size !== claim.refs.length) {
      context.addIssue({ code: "custom", message: "Claim refs must be unique", path: ["claims", claimIndex, "refs"] });
    }
  }
});

export const TribunDeskOutputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("recommendations"),
    packages: z.array(TribunPackageSchema).min(1).max(2)
  }),
  z.strictObject({
    outcome: z.literal("quiet"),
    reason: z.string().trim().min(1).max(1_000),
    packages: z.tuple([])
  })
]);

/** The paid boundary checks the envelope; deterministic gates validate each package separately. */
export const TribunDeskEnvelopeSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("recommendations"),
    packages: z.array(z.unknown()).min(1).max(2)
  }),
  z.strictObject({
    outcome: z.literal("quiet"),
    reason: z.string().trim().min(1).max(1_000),
    packages: z.tuple([])
  })
]);

const GateSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
export const KvorumGateResultSchema = z.strictObject({
  gate: GateSlugSchema,
  verdict: z.enum(["pass", "fail"]),
  message: z.string().trim().min(1).max(800),
  claimIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80)).max(80)
});

export const KvorumPackageGateEvaluationSchema = z.strictObject({
  candidateIndex: z.number().int().min(0).max(1),
  clusterId: Sha1Schema.nullable(),
  passed: z.boolean(),
  results: z.array(KvorumGateResultSchema).min(1).max(20)
}).superRefine((evaluation, context) => {
  const gates = new Set<string>();
  for (const [index, result] of evaluation.results.entries()) {
    if (gates.has(result.gate)) {
      context.addIssue({ code: "custom", message: "Gate ids must be unique per package", path: ["results", index, "gate"] });
    }
    gates.add(result.gate);
    if (new Set(result.claimIds).size !== result.claimIds.length) {
      context.addIssue({ code: "custom", message: "Gate claim ids must be unique", path: ["results", index, "claimIds"] });
    }
  }
  if (evaluation.passed !== evaluation.results.every((result) => result.verdict === "pass")) {
    context.addIssue({ code: "custom", message: "passed must summarize every gate result", path: ["passed"] });
  }
});

export type TribunDeskOutput = z.infer<typeof TribunDeskOutputSchema>;
export type TribunDeskEnvelope = z.infer<typeof TribunDeskEnvelopeSchema>;
export type TribunPackage = z.infer<typeof TribunPackageSchema>;
export type KvorumGateResult = z.infer<typeof KvorumGateResultSchema>;
export type KvorumPackageGateEvaluation = z.infer<typeof KvorumPackageGateEvaluationSchema>;
