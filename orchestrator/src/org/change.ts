import { z } from "zod";

export const OrgChangeTierSchema = z.enum(["A", "B", "C"]);
export type OrgChangeTier = z.infer<typeof OrgChangeTierSchema>;

export const OrgChangeSchema = z.object({
  id: z.string().min(1),
  proposedAt: z.string().datetime(),
  proposer: z.string().min(1),
  subjectAgent: z.string().min(1),
  tier: OrgChangeTierSchema,
  change: z.string().min(1).max(1_000),
  expectedMetric: z.string().min(1),
  baseline: z.number().finite().nullable(),
  expectedDelta: z.number().finite(),
  reviewCycle: z.number().int().positive(),
  approvers: z.array(z.string().min(1)),
  status: z.enum(["proposed", "approved", "rejected", "applied", "reverted"])
});
export type OrgChange = z.infer<typeof OrgChangeSchema>;

export function requiredOrgApprovers(tier: OrgChangeTier): readonly string[] {
  if (tier === "A") {
    return ["PEOPLE"];
  }
  if (tier === "B") {
    return ["PEOPLE", "AUDIT"];
  }
  return ["HUMAN_APPROVAL"];
}

export function assertOrgChangeApproved(change: OrgChange): void {
  const parsed = OrgChangeSchema.parse(change);
  if (parsed.proposer === parsed.subjectAgent) {
    throw new Error("An agent cannot approve or apply its own control change");
  }
  const required = requiredOrgApprovers(parsed.tier);
  for (const approver of required) {
    if (!parsed.approvers.includes(approver)) {
      throw new Error(`Org change tier ${parsed.tier} requires ${approver}`);
    }
  }
  if (parsed.status !== "approved") {
    throw new Error("Org change has not reached approved state");
  }
}
