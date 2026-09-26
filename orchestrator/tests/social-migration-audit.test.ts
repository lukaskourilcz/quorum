import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { auditSocialDistributionMigration, persistSocialDistributionMigrationAudit, SOCIAL_MIGRATION_AUDIT_PATH } from "../src/social/migration-audit.js";
import { configRoot } from "../src/paths.js";
import { composeEditionSocialPack } from "../src/social/pack.js";
import { QueueItemSchema, queuePayloadHash } from "../src/social/queue.js";
import { auditSocialRelease, type SocialReleaseAudit } from "../src/social/release-audit.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";
import { enabledBrands, loadMarketingSharkConfig } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER } from "../src/ventures/marketingshark/ledger.js";
import { MarketingSharkPackage } from "../src/ventures/marketingshark/package.js";
import { buildQueueItems, marketingSharkCapabilityRef } from "../src/ventures/marketingshark/queue.js";
import { fixtureChumOutput, fixtureHookLines, planBrandDay, runBrandDay } from "../src/ventures/marketingshark/run.js";
import { caughtUpEditionMeeting, czechOnlyEdition } from "./fixtures/caught-up-edition.js";

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

  it("keeps its pins when DNESKAi's pack drafts land, and fails again on a v1 file (#583)", async () => {
    // From #563 until #583 the pack wrote its two drafts as queue v1. Every v1 file counts as a
    // migrated legacy item, so each published edition moved the pins above and the post-cycle gate
    // threw the day's records away (runs 1102 and 1105 on 2026-09-26). The drafts are queue v2 now.
    // This composes a real pack into a copy of state/ and asks both guards about the tree it leaves.
    const root = await mkdtemp(path.join(os.tmpdir(), "social-migration-cu-")); roots.push(root);
    const stateRoot = path.join(root, "state");
    await cp(path.join(repoRoot, "state"), stateRoot, { recursive: true });
    const composed = await composeEditionSocialPack({
      editionPackage: czechOnlyEdition(),
      meeting: caughtUpEditionMeeting,
      destinations: { cs: "https://caught-up.example/articles/2026-08-04-measured-model-price-cut" },
      repoRoot: root,
      stateRoot,
      now: new Date("2026-08-04T04:00:00.000Z"),
      // As in production while no channel is enabled: nothing is hosted.
      hostFrames: false
    });
    expect(composed!.queueItems.map(({ id }) => id).sort()).toEqual(["caught-up-2026-08-04-cs-instagram", "caught-up-2026-08-04-cs-threads"]);

    const rollback = (audit: SocialReleaseAudit) => audit.checks.find(({ id }) => id === "idempotent-migration-rollback")!;
    const [committed, withPack, gated] = await Promise.all([
      auditSocialDistributionMigration({ repoRoot }),
      auditSocialDistributionMigration({ repoRoot, stateRoot }),
      auditSocialRelease(repoRoot, { stateRoot })
    ]);
    expect(withPack.counts).toEqual({ migrated: 13, unchanged: 3, held: 22, unavailable: 0, dropped: 0, malformed: 0 });
    expect(withPack.counts).toEqual(committed.counts);
    expect(withPack.legacyQueue.filter(({ sourceSchemaVersion }) => sourceSchemaVersion === 1)).toHaveLength(4);
    expect(withPack.legacyQueue.filter(({ sourceSchemaVersion }) => sourceSchemaVersion === 2)).toEqual(expect.arrayContaining(
      composed!.queueItems.map((item) => expect.objectContaining({ id: item.id, sourceContentHash: item.content.contentHash, resolvedContentHash: item.content.contentHash, status: "draft" }))
    ));
    expect(Object.values(withPack.invariants)).not.toContain(false);
    expect(rollback(gated).passed).toBe(true);
    expect(gated.status, gated.checks.filter(({ passed }) => !passed).map(({ id }) => id).join(", ")).toBe("pass");

    // The pin keeps its teeth: one v1 file in the same tree, shaped like the 2026-08-06 pair the pack
    // used to write, and the check fails again.
    const legacy = QueueItemSchema.parse(JSON.parse(await readFile(path.join(repoRoot, "state/social/queue/2026-08-06-cs-threads.json"), "utf8")));
    const base = { ...legacy, id: "caught-up-2026-08-04-cs-threads-v1", campaignId: "caught-up-2026-08-04-cs", createdAt: "2026-08-04T04:00:00.000Z" };
    await writeFile(path.join(stateRoot, "social/queue/2026-08-04-cs-threads-v1.json"), JSON.stringify(QueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: queuePayloadHash(base) } })), "utf8");
    const [withV1, regated] = await Promise.all([auditSocialDistributionMigration({ repoRoot, stateRoot }), auditSocialRelease(repoRoot, { stateRoot })]);
    expect(withV1.counts.migrated).toBe(14);
    expect(rollback(regated).passed).toBe(false);
    expect(regated.status).toBe("fail");
  }, 90_000);

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
