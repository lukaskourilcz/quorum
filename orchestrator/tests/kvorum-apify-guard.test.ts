import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  APIFY_MONTHLY_CREDIT_USD,
  currentKvorumApifyQuota,
  emptyKvorumApifyQuota,
  estimateKvorumActorUsd,
  mayRunKvorumApify,
  parseKvorumApifyApprovals,
  recordKvorumActorUsage,
  runKvorumApifySource
} from "../src/sources/apify.js";
import { loadKvorumSourceRegistry } from "../src/ventures/kvorum/sources.js";
import { atomicWriteJson } from "../src/state.js";

const now = new Date("2026-08-12T21:00:00.000Z");
const authority = { founding: true, budgetCapacity: true };
const approvals = { account: true, scope: true };
const signedInbox = [
  "- [x] HUMAN_APPROVAL APIFY-ACCOUNT-001 — owner resolved.",
  "- [x] HUMAN_APPROVAL KV-APIFY-001 — owner resolved."
].join("\n");
const signedFounding = [
  "Status: countersigned",
  "Signature / explicit approval reference: owner-test"
].join("\n");
const signedCapacity = [
  "Status: countersigned",
  "Signature / explicit approval reference: owner-test",
  "Freed worst-day capacity USD: $0.08"
].join("\n");

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("the third-tenant Kvórum Apify guard", () => {
  it("requires countersigned founding and budget-capacity authority before the four spend layers", () => {
    const quota = emptyKvorumApifyQuota("2026-08", now);
    const verdict = mayRunKvorumApify({
      quota,
      approvals,
      authority: { founding: false, budgetCapacity: false },
      token: "fixture-token",
      sharedAccountUsedUsd: 0
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("founding decision");
    expect(verdict.reason).toContain("budget-capacity decision");
    expect(verdict.reason).toContain("nothing was spent");
  });

  it("layer 1 accepts only checked parent-account and Kvórum scope approvals", () => {
    expect(parseKvorumApifyApprovals(signedInbox)).toEqual({ account: true, scope: true });
    expect(parseKvorumApifyApprovals(signedInbox.replace(
      "[x] HUMAN_APPROVAL KV-APIFY-001",
      "[ ] HUMAN_APPROVAL KV-APIFY-001"
    ))).toEqual({ account: true, scope: false });

    const quota = emptyKvorumApifyQuota("2026-08", now);
    expect(mayRunKvorumApify({
      quota,
      approvals: { account: false, scope: false },
      authority,
      token: "fixture-token",
      sharedAccountUsedUsd: 0
    })).toEqual({
      allowed: false,
      reason: "Kvórum Apify is waiting for APIFY-ACCOUNT-001 and KV-APIFY-001; no actor ran and nothing was spent."
    });
  });

  it("layers 2 and 3 require the token and reserve inside the local $2 share", () => {
    const quota = emptyKvorumApifyQuota("2026-08", now);
    expect(mayRunKvorumApify({
      quota,
      approvals,
      authority,
      token: undefined,
      sharedAccountUsedUsd: 0
    }).reason).toContain("APIFY_TOKEN");
    expect(mayRunKvorumApify({
      quota: {
        ...quota,
        estimatedUsedUsd: 1.9,
        perActorCounts: {
          historical: { runs: 13, items: 377, estimatedUsd: 1.9 }
        }
      },
      approvals,
      authority,
      token: "fixture-token",
      sharedAccountUsedUsd: 0
    }).reason).toContain("share is exhausted");
    expect(mayRunKvorumApify({
      quota,
      approvals,
      authority,
      token: "fixture-token",
      sharedAccountUsedUsd: 0
    }).allowed).toBe(true);
  });

  it("layer 4 refuses when provider-reported shared usage cannot cover the reservation", async () => {
    const root = await tempRoot("kvorum-apify-provider-");
    const runner = vi.fn();
    const usageFetcher = vi.fn(async () => APIFY_MONTHLY_CREDIT_USD - 0.1);
    try {
      const result = await runKvorumApifySource({
        root,
        date: "2026-08-12",
        now,
        inbox: signedInbox,
        token: "fixture-token",
        registry: await loadKvorumSourceRegistry(),
        foundingDecisionRaw: signedFounding,
        budgetCapacityDecisionRaw: signedCapacity,
        usageFetcher,
        actorRunner: runner
      });
      expect(result.sharedUsageSource).toBe("provider");
      expect(result.results[0]?.reason).toContain("shared Apify Free-plan credit");
      expect(usageFetcher).toHaveBeenCalledOnce();
      expect(runner).not.toHaveBeenCalled();
      expect(result.artifactPaths).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to all three local ledgers only when provider usage is unavailable", async () => {
    const root = await tempRoot("kvorum-apify-local-");
    const runner = vi.fn();
    try {
      await atomicWriteJson(root, "goviral/source-quota/apify.json", { estimatedUsedUsd: 2.5 });
      await atomicWriteJson(root, "mma/source-quota/apify.json", { estimatedUsedUsd: 2.4 });
      const result = await runKvorumApifySource({
        root,
        date: "2026-08-12",
        now,
        inbox: signedInbox,
        token: "fixture-token",
        registry: await loadKvorumSourceRegistry(),
        foundingDecisionRaw: signedFounding,
        budgetCapacityDecisionRaw: signedCapacity,
        usageFetcher: async () => null,
        actorRunner: runner
      });
      expect(result.sharedUsageSource).toBe("local-estimate");
      expect(result.results[0]?.reason).toContain("shared Apify Free-plan credit");
      expect(runner).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs the pinned build with a fixed credential-free payload and max charge, then records usage", async () => {
    const root = await tempRoot("kvorum-apify-success-");
    const runner = vi.fn(async () => [{ postId: "one" }, { postId: "two" }]);
    try {
      const registry = await loadKvorumSourceRegistry();
      const result = await runKvorumApifySource({
        root,
        date: "2026-08-12",
        now,
        inbox: signedInbox,
        token: "fixture-token",
        registry,
        foundingDecisionRaw: signedFounding,
        budgetCapacityDecisionRaw: signedCapacity,
        usageFetcher: async () => 0.4,
        actorRunner: runner
      });
      expect(result).toMatchObject({
        artifactPaths: ["kvorum/source-quota/apify.json"],
        sharedUsageSource: "provider",
        results: [{ sourceId: "stit-demokracie-facebook", status: "success" }]
      });
      expect(runner).toHaveBeenCalledWith({
        actor: {
          actorSlug: "apify/facebook-posts-scraper",
          actorBuildId: "laKrch6r0XAnxtAFh"
        },
        token: "fixture-token",
        payload: {
          startUrls: [{ url: "https://www.facebook.com/stitdemokracie" }],
          resultsLimit: 30
        },
        maxTotalChargeUsd: 0.151
      });
      expect(JSON.parse(await readFile(
        path.join(root, "kvorum/source-quota/apify.json"),
        "utf8"
      ))).toMatchObject({
        shareCapUsd: 2,
        estimatedUsedUsd: 0.011,
        sharedAccountUsedUsd: 0.4,
        reservedPerRun: 0.151,
        perActorCounts: {
          "stit-demokracie-facebook": { runs: 1, items: 2, estimatedUsd: 0.011 }
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records the full reservation when a launched actor fails", async () => {
    const root = await tempRoot("kvorum-apify-failure-");
    try {
      const result = await runKvorumApifySource({
        root,
        date: "2026-08-12",
        now,
        inbox: signedInbox,
        token: "fixture-token",
        registry: await loadKvorumSourceRegistry(),
        foundingDecisionRaw: signedFounding,
        budgetCapacityDecisionRaw: signedCapacity,
        usageFetcher: async () => 0,
        actorRunner: vi.fn(async () => { throw new Error("fixture failure"); })
      });
      expect(result.results[0]).toMatchObject({ status: "failed", items: [] });
      const quota = currentKvorumApifyQuota(JSON.parse(await readFile(
        path.join(root, "kvorum/source-quota/apify.json"),
        "utf8"
      )) as unknown, "2026-08", now);
      expect(quota.estimatedUsedUsd).toBe(0.151);
      expect(quota.perActorCounts["stit-demokracie-facebook"]).toEqual({
        runs: 1,
        items: 0,
        estimatedUsd: 0.151
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  /*
   * An unsigned decision blocks the actor even when everything else is ready.
   *
   * This used to read the repository's own decision files and assert that nothing ran, which was
   * true only while the owner had signed nothing: the test proved the state of the repository on
   * the day it was written rather than the behaviour of the guard, and it went red the moment the
   * owner countersigned Kvórum's founding — a passing test turning red because the product moved
   * forward correctly. Both decisions are injected now, so the guard is pinned to what it does and
   * the owner can sign anything without touching this file.
   */
  const pendingDecision = [
    "Status: pending countersignature",
    "Signature / explicit approval reference: ____________________"
  ].join("\n");

  it("refuses while either decision is unsigned, whatever the token and approvals say", async () => {
    // A temporary root, never the repository's own state. The previous version of this test
    // passed `stateRoot`, which was harmless only while the guard refused before reaching a
    // write: the moment the owner countersigned Kvorum's founding, the same test ran the mocked
    // actor, treated its empty return as a failure, and conservatively recorded a full $0.151
    // reservation into the real state/kvorum/source-quota/apify.json — a financial record of a
    // run that never happened, eating 7.5% of the venture's monthly share. A test must not be
    // able to spend the company's money by being run.
    const root = await tempRoot("kvorum-unsigned-");
    try {
    for (const [label, founding, capacity] of [
      ["neither", pendingDecision, pendingDecision],
      ["only the founding", signedFounding, pendingDecision],
      ["only the capacity", pendingDecision, signedCapacity]
    ] as const) {
      const runner = vi.fn();
      const usageFetcher = vi.fn();
      const result = await runKvorumApifySource({
        root,
        date: "2026-08-12",
        now,
        inbox: signedInbox,
        token: "token-that-must-not-be-used",
        registry: await loadKvorumSourceRegistry(),
        foundingDecisionRaw: founding,
        budgetCapacityDecisionRaw: capacity,
        usageFetcher,
        actorRunner: runner
      });
      const reason = result.results[0]?.reason ?? "";
      expect(reason, label).toContain("countersigned");
      if (founding === pendingDecision) expect(reason, label).toContain("founding decision");
      if (capacity === pendingDecision) expect(reason, label).toContain("budget-capacity decision");
      // Nothing reached the provider, so nothing was spent. That is the whole promise.
      expect(usageFetcher, label).not.toHaveBeenCalled();
      expect(runner, label).not.toHaveBeenCalled();
      expect(result.artifactPaths, label).toEqual([]);
    }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps estimates bounded by the actor ceiling and rolls quota at a month boundary", async () => {
    const actor = (await loadKvorumSourceRegistry()).actors[0]!;
    expect(estimateKvorumActorUsd(actor, 0)).toBe(0.001);
    expect(estimateKvorumActorUsd(actor, 30)).toBe(0.151);
    expect(estimateKvorumActorUsd(actor, 300)).toBe(0.151);
    const used = recordKvorumActorUsage({
      quota: emptyKvorumApifyQuota("2026-08", now),
      actor,
      items: 1,
      now,
      sharedAccountUsedUsd: 0
    });
    expect(used.estimatedUsedUsd).toBe(0.006);
    expect(currentKvorumApifyQuota(
      used,
      "2026-09",
      new Date("2026-09-01T00:00:00.000Z")
    ).estimatedUsedUsd).toBe(0);
  });
});
