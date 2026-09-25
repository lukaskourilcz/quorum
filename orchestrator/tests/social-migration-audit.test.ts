import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { auditSocialDistributionMigration, persistSocialDistributionMigrationAudit, SOCIAL_MIGRATION_AUDIT_PATH } from "../src/social/migration-audit.js";
import { configRoot } from "../src/paths.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";
import { enabledBrands, loadMarketingSharkConfig } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER } from "../src/ventures/marketingshark/ledger.js";
import { MarketingSharkPackage } from "../src/ventures/marketingshark/package.js";
import { buildQueueItems, marketingSharkCapabilityRef } from "../src/ventures/marketingshark/queue.js";
import { fixtureChumOutput, fixtureHookLines, planBrandDay, runBrandDay } from "../src/ventures/marketingshark/run.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Social Distribution compatibility migration audit", () => {
  it("retains legacy accounts, queue evidence and held provider boundaries", async () => {
    const audit = await auditSocialDistributionMigration({ repoRoot });
    // Held future profiles: WebDev Signal's Czech and English editions, and devShark's LinkedIn,
    // Instagram and Threads profiles with their three held bindings (quorum#569). Held is the
    // point — nothing migrated and nothing became publishable by their existing.
    expect(audit.counts).toEqual({ migrated: 13, unchanged: 3, held: 22, unavailable: 0, dropped: 0, malformed: 0 });
    expect(audit.breakdown).toEqual({ migratedLegacyProfiles: 3, migratedConnectionReferences: 6, migratedLegacyQueueItems: 4, unchangedActivationRecords: 3, heldFutureProfiles: 8, heldProviderBindings: 9, heldOptionalProviders: 5 });
    // Four queue v1 items. A queue v2 item in the same directory is read directly and counted as
    // itself, not as legacy (see the marketingShark case below), so the pin is on v1 alone.
    expect(audit.legacyQueue.filter(({ sourceSchemaVersion }) => sourceSchemaVersion === 1)).toHaveLength(4);
    expect(audit.legacyQueue.filter(({ sourceSchemaVersion }) => sourceSchemaVersion === 2)
      .every(({ sourceContentHash, resolvedContentHash }) => sourceContentHash === resolvedContentHash)).toBe(true);
    expect(audit.legacyQueue.every(({ attemptPreserved, receiptPreserved }) => attemptPreserved && receiptPreserved)).toBe(true);
    expect(Object.values(audit.invariants)).not.toContain(false);
    expect(audit).toMatchObject({ rollback: { sourceQueueMutated: false, previousReaders: ["QueueItemSchema", "SocialActivationSchema"] }, authorityGranted: false, publishingAuthorized: false });
    expect(JSON.stringify(audit)).not.toMatch(/accessToken|secret-value|nativeAccountIdValue|audienceIdentity|privateMessage/iu);
  });

  it("reads marketingShark's queue v2 drafts directly, beside the four legacy items (#568)", async () => {
    // The first drafted devShark package used to write queue v1 items for a venture with no
    // legacy mapping, and this audit threw on them inside the post-cycle gate. The drafts are queue
    // v2 now: the audit reads them as they are and migrates nothing.
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "social-migration-ms-")); roots.push(stateRoot);
    await cp(path.join(repoRoot, "state/social"), path.join(stateRoot, "social"), { recursive: true });
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;
    const draftRoot = await mkdtemp(path.join(os.tmpdir(), "social-migration-ms-draft-")); roots.push(draftRoot);
    await runBrandDay({
      config, brand, ledger: EMPTY_LEDGER, date: "2026-09-26", cycleId: "c", root: draftRoot, publicRoot: path.join(draftRoot, "public"), dry: true,
      call: async () => {
        const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-09-26", stateRoot: draftRoot });
        return { usd: 0, output: fixtureChumOutput({ brand, question: plan.question, ...fixtureHookLines(plan, brand) }) };
      }
    });
    const built = MarketingSharkPackage.parse(JSON.parse(await readFile(path.join(draftRoot, "ventures/marketingshark/packages/2026-09-26/devshark/package.json"), "utf8")));
    const drafts = buildQueueItems({
      built, brand, now: new Date("2026-09-26T07:00:00.000Z"),
      capabilityRef: marketingSharkCapabilityRef(await loadVentureCapabilityMap(configRoot))!
    });
    for (const { relative, item } of drafts) await writeFile(path.join(stateRoot, relative), JSON.stringify(item), "utf8");

    const [before, after] = await Promise.all([
      auditSocialDistributionMigration({ repoRoot }),
      auditSocialDistributionMigration({ repoRoot, stateRoot })
    ]);
    expect(after.counts).toEqual(before.counts);
    expect(after.legacyQueue.filter(({ sourceSchemaVersion }) => sourceSchemaVersion === 1)).toHaveLength(4);
    // Whatever v2 items the committed queue already holds, plus these three, each read as itself.
    const v2 = (audit: typeof after) => audit.legacyQueue.filter(({ sourceSchemaVersion }) => sourceSchemaVersion === 2)
      .map(({ id, sourceContentHash, resolvedContentHash, status }) => ({ id, sourceContentHash, resolvedContentHash, status }));
    expect(v2(after)).toHaveLength(v2(before).length + drafts.length);
    expect(v2(after)).toEqual(expect.arrayContaining(
      drafts.map(({ item }) => ({ id: item.id, sourceContentHash: item.content.contentHash, resolvedContentHash: item.content.contentHash, status: "draft" }))
    ));
    expect(Object.values(after.invariants)).not.toContain(false);
    expect(after).toMatchObject({ authorityGranted: false, publishingAuthorized: false });
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
