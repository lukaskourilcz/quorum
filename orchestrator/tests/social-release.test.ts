import { describe, expect, it } from "vitest";
import { SocialCampaignSchema } from "../src/contracts/social-distribution.js";
import { SocialProfileOperationSchema, SocialRoutineScopeSchema } from "../src/contracts/social-operations.js";
import { repoRoot } from "../src/paths.js";
import { CapabilityAwareQueueItemSchema } from "../src/social/queue.js";
import { auditSocialPrivacy, auditSocialRelease } from "../src/social/release-audit.js";

describe("Social Distribution final release gate", () => {
  it("passes every deterministic capability, autonomy, privacy and release check", async () => {
    const audit = await auditSocialRelease(repoRoot);
    expect(audit.status, audit.checks.filter(({ passed }) => !passed).map(({ id, detail }) => `${id}: ${detail}`).join("\n")).toBe("pass");
    expect(audit.checks.map(({ id }) => id)).toEqual([
      "owned-profile-topology", "exact-capability-and-isolation", "provider-and-queue-safety", "strategy-inventory-daily", "metrics-learning-health",
      "private-admin-complete", "implementation-program-boundary", "canonical-recovery-boundary", "idempotent-migration-rollback", "simulation-boundary",
      "privacy-and-redaction", "staged-release-and-owner-actions", "optional-absence-nonblocking"
    ]);
    expect(audit.auditHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("finds no private-value fields in production Social config or state", async () => {
    const privacy = await auditSocialPrivacy(repoRoot);
    expect(privacy.findings).toEqual([]);
    expect(privacy.scannedFiles).toBeGreaterThan(10);
  });

  it("structurally rejects sister targets, engagement actions, wildcard scope and hidden queue authority", () => {
    expect(SocialCampaignSchema.safeParse({ schemaVersion: "social-campaign/1", targets: [{ role: "sister" }] }).success).toBe(false);
    expect(CapabilityAwareQueueItemSchema.safeParse({ schemaVersion: 2, action: "follow" }).success).toBe(false);
    expect(SocialRoutineScopeSchema.safeParse({ schemaVersion: "social-routine-scope/1", allowedFormats: ["*"] }).success).toBe(false);
    expect(SocialProfileOperationSchema.safeParse({ schemaVersion: "social-profile-operation/1", publishingAuthorized: true }).success).toBe(false);
  });
});
