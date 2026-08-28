import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { auditSocialDistributionMigration, persistSocialDistributionMigrationAudit, SOCIAL_MIGRATION_AUDIT_PATH } from "../src/social/migration-audit.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Social Distribution compatibility migration audit", () => {
  it("retains legacy accounts, queue evidence and held provider boundaries", async () => {
    const audit = await auditSocialDistributionMigration({ repoRoot });
    expect(audit.counts).toEqual({ migrated: 13, unchanged: 3, held: 14, unavailable: 0, dropped: 0, malformed: 0 });
    expect(audit.breakdown).toEqual({ migratedLegacyProfiles: 3, migratedConnectionReferences: 6, migratedLegacyQueueItems: 4, unchangedActivationRecords: 3, heldFutureProfiles: 3, heldProviderBindings: 6, heldOptionalProviders: 5 });
    expect(audit.legacyQueue).toHaveLength(4);
    expect(audit.legacyQueue.every(({ attemptPreserved, receiptPreserved }) => attemptPreserved && receiptPreserved)).toBe(true);
    expect(Object.values(audit.invariants)).not.toContain(false);
    expect(audit).toMatchObject({ rollback: { sourceQueueMutated: false, previousReaders: ["QueueItemSchema", "SocialActivationSchema"] }, authorityGranted: false, publishingAuthorized: false });
    expect(JSON.stringify(audit)).not.toMatch(/accessToken|secret-value|nativeAccountIdValue|audienceIdentity|privateMessage/iu);
  });

  it("persists one deterministic receipt and does not duplicate it on rerun", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "social-migration-audit-")); roots.push(stateRoot);
    await cp(path.join(repoRoot, "state/social"), path.join(stateRoot, "social"), { recursive: true });
    const first = await persistSocialDistributionMigrationAudit({ repoRoot, stateRoot });
    const second = await persistSocialDistributionMigrationAudit({ repoRoot, stateRoot });
    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
    expect(second.audit).toEqual(first.audit);
    expect(JSON.parse(await readFile(path.join(stateRoot, SOCIAL_MIGRATION_AUDIT_PATH), "utf8"))).toEqual(first.audit);
  });
});
