import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetError } from "../src/budget.js";
import { hasDeliveredPublishedEdition } from "../src/cycle.js";
import { oldestPendingDelivery, recordDelivery } from "../src/delivery/outbox.js";
import { validateEditionForDelivery } from "../src/delivery/validate.js";
import { loadEditionQualityConfig } from "../src/edition/config.js";
import { runLiveEdition, shouldQueueEditionDelivery } from "../src/edition/live.js";
import { BudgetedEditionModelGateway } from "../src/edition/models.js";
import { buildNoEditionPackage, noEditionSentence } from "../src/edition/package.js";
import type { EditionModelGateway, StructuredToolRequest } from "../src/edition/types.js";
import { caughtUpBudgetMode } from "../src/finance/budget-plan.js";
import { repoRoot } from "../src/paths.js";
import { loadSourceRegistry } from "../src/sources/registry.js";
import { SourceItemSchema } from "../src/sources/types.js";

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(() => vi.unstubAllEnvs());

describe("Caught Up production budget", () => {
  it("queues an honest no-edition for every terminal day, gate or failure", async () => {
    const config = await loadEditionQualityConfig();
    const technical = buildNoEditionPackage({
      date: "2026-08-04",
      meetingRef: "meetings/2026-08-04-cu-edition",
      roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
      reason: "content_invalid_after_regeneration",
      config
    });
    const sourceGate = buildNoEditionPackage({
      date: "2026-08-04",
      meetingRef: "meetings/2026-08-04-cu-edition",
      roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
      reason: "source_gate:successful_sources_2",
      config
    });
    // A technical failure used to stay inside BoardlessAI, on the reasoning that a later
    // same-day run might repair it. That is true of the notice's timing and not of its
    // existence: a gated $0 day looked identical on the magazine to a crash, and 2 August has no
    // board JSON at all because of it. The retry slot is what attempts the repair, and the
    // aifirst consumer already replaces a provisional no-edition board with a real edition.
    expect(shouldQueueEditionDelivery(technical)).toBe(true);
    expect(shouldQueueEditionDelivery(sourceGate)).toBe(true);
  });

  it("applies the owner-approved degradation thresholds", () => {
    expect(caughtUpBudgetMode(2.5)).toBe("full");
    expect(caughtUpBudgetMode(2.49)).toBe("minimal_transcript");
    expect(caughtUpBudgetMode(0.5)).toBe("minimal_transcript");
    expect(caughtUpBudgetMode(0.49)).toBe("no_edition");
  });

  it("rejects an over-cap model reservation before calling the provider", async () => {
    let calls = 0;
    const delegate: EditionModelGateway = {
      async invoke<T>(request: StructuredToolRequest<T>) {
        calls += 1;
        return {
          value: request.parse({}),
          usage: {
            provider: "anthropic" as const,
            model: request.model,
            stage: request.stage,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            costUsd: 0
          }
        };
      }
    };
    const gateway = new BudgetedEditionModelGateway(delegate, 0.35);
    await expect(gateway.invoke({
      model: "claude-opus-4-7",
      stage: "write",
      maxOutputTokens: 100_000,
      system: "system",
      user: "user",
      tool: { name: "fixture", description: "fixture", inputSchema: {} },
      parse: (value) => value
    })).rejects.toBeInstanceOf(BudgetError);
    expect(calls).toBe(0);
  });

  it("prevalidates the exact serialized MDX scalar types", async () => {
    const editionPackage = JSON.parse(await readFile(
      path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "golden-package.json"),
      "utf8"
    ));
    expect(validateEditionForDelivery(editionPackage).status).toBe("edition");
  });

  it("records budget_exhausted without any provider call", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-live-budget-"));
    const now = new Date("2026-08-04T03:00:00.000Z");
    await writeJson(path.join(root, "budget", "ledger.json"), {
      schemaVersion: 1,
      entries: [{
        ts: "2026-08-01T03:00:00.000Z",
        cycleId: "prior",
        requestHash: "a".repeat(64),
        phase: "morning",
        agent: "VIZE",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        serviceTier: "default",
        tokensIn: 1,
        cachedTokensIn: 0,
        tokensOut: 1,
        toolUses: 0,
        usd: 14.6,
        kind: "text"
      }]
    });
    const rawItems = JSON.parse(await readFile(
      path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "source-items.json"),
      "utf8"
    )) as unknown[];
    const items = rawItems.map((item) => SourceItemSchema.parse(item));
    const registry = await loadSourceRegistry();
    let calls = 0;
    const gateway: EditionModelGateway = {
      async invoke<T>(): Promise<{ value: T; usage: never }> {
        calls += 1;
        throw new Error("provider must not be called");
      }
    };
    vi.stubEnv("MONTHLY_BUDGET_USD", "15");
    const result = await runLiveEdition({
      cycleId: "20260804030000-cu-edition",
      date: "2026-08-04",
      now,
      meetingRef: "meetings/2026-08-04-cu-edition",
      roomUrl: "https://quorum-site-chi.vercel.app/meetings/2026-08-04-cu-edition",
      root,
      dependencies: {
        loadRegistry: async () => registry,
        scrape: async () => ({
          items,
          sources: registry.sources.slice(0, 10).map((source) => ({
            sourceId: source.id,
            status: "success" as const,
            candidateItems: 1,
            durationMs: 0,
            errorCode: null,
            errorMessage: null
          }))
        }),
        gateway
      }
    });
    expect(result.package.status).toBe("no_edition");
    if (result.package.status === "no_edition") {
      expect(result.package.board.noEditionReason).toBe(noEditionSentence("budget_exhausted"));
    }
    expect(calls).toBe(0);
  });
});

describe("delivery outbox", () => {
  it("allows a provisional no-edition receipt to be upgraded once, then closes the date", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-provisional-delivery-"));
    const config = await loadEditionQualityConfig();
    const provisional = buildNoEditionPackage({
      date: "2026-08-04",
      meetingRef: "meetings/2026-08-04-cu-edition",
      roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
      reason: "content_invalid_after_regeneration",
      config
    });
    const finalPackage = JSON.parse(await readFile(
      path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "golden-package.json"),
      "utf8"
    ));
    const provisionalPath = `edition/outbox/2026-08-04-${provisional.idempotencyKey}.json`;
    const finalPath = `edition/outbox/2026-08-04-${finalPackage.idempotencyKey}.json`;
    await writeJson(path.join(root, provisionalPath), provisional);
    await recordDelivery({ root, packagePath: provisionalPath, status: "delivered" });
    expect(await hasDeliveredPublishedEdition("2026-08-04", root)).toBe(false);

    await writeJson(path.join(root, finalPath), finalPackage);
    await recordDelivery({ root, packagePath: finalPath, status: "delivered" });
    const receipt = JSON.parse(await readFile(
      path.join(root, "edition", "deliveries", "2026-08-04.json"),
      "utf8"
    ));
    expect(receipt).toMatchObject({
      packageHash: finalPackage.idempotencyKey,
      editionStatus: "edition",
      supersededPackageHashes: [provisional.idempotencyKey]
    });
    expect(await hasDeliveredPublishedEdition("2026-08-04", root)).toBe(true);
  });

  it("drains oldest-first and records a successful replay exactly once", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-outbox-"));
    const config = await loadEditionQualityConfig();
    const first = buildNoEditionPackage({
      date: "2026-08-04",
      meetingRef: "meetings/2026-08-04-cu-edition",
      roomUrl: "https://quorum-site-chi.vercel.app/meetings/2026-08-04-cu-edition",
      reason: "source_gate:candidate_items_2",
      config
    });
    const second = buildNoEditionPackage({
      date: "2026-08-05",
      meetingRef: "meetings/2026-08-05-cu-edition",
      roomUrl: "https://quorum-site-chi.vercel.app/meetings/2026-08-05-cu-edition",
      reason: "source_gate:candidate_items_1",
      config
    });
    await writeJson(path.join(root, "edition", "outbox", `2026-08-05-${second.idempotencyKey}.json`), second);
    await writeJson(path.join(root, "edition", "outbox", `2026-08-04-${first.idempotencyKey}.json`), first);
    const pending = await oldestPendingDelivery(root, "2026-08-04");
    expect(pending?.package.date).toBe("2026-08-04");
    await recordDelivery({
      root,
      packagePath: pending!.packagePath,
      status: "delivered",
      targetCommit: "b".repeat(40),
      now: new Date("2026-08-04T04:00:00.000Z")
    });
    expect((await oldestPendingDelivery(root, "2026-08-05"))?.package.date).toBe("2026-08-05");

    // A "no edition today" notice is only true on its own day. Both of these are no-edition
    // packages, so on a later day the queue is empty rather than publishing a stale notice
    // and holding every real edition behind it.
    expect(await oldestPendingDelivery(root, "2026-08-06")).toBeNull();
    const receipt = JSON.parse(await readFile(
      path.join(root, "edition", "deliveries", "2026-08-04.json"),
      "utf8"
    ));
    expect(receipt).toMatchObject({ status: "delivered", packageHash: first.idempotencyKey });
  });

  it("marks a hash conflict for reconciliation and raises one inbox item", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-conflict-"));
    const editionPackage = JSON.parse(await readFile(
      path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "golden-package.json"),
      "utf8"
    ));
    validateEditionForDelivery(editionPackage);
    const packagePath = `edition/outbox/2026-08-04-${editionPackage.idempotencyKey}.json`;
    await writeJson(path.join(root, packagePath), editionPackage);
    await writeJson(
      path.join(root, "meetings", "2026-08-04-cu-edition.json"),
      JSON.parse(await readFile(path.join(repoRoot, "state", "meetings", "2026-08-04-cu-edition.json"), "utf8"))
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await recordDelivery({
        root,
        packagePath,
        status: "needs_reconciliation",
        code: "hash_conflict",
        detail: "Target date already contains another package"
      });
    }
    const meeting = JSON.parse(await readFile(
      path.join(root, "meetings", "2026-08-04-cu-edition.json"),
      "utf8"
    ));
    expect(meeting.status).toBe("NEEDS_RECONCILIATION");
    const inbox = await readFile(path.join(root, "INBOX.md"), "utf8");
    expect(inbox.match(/CAUGHT-UP-DELIVERY-2026-08-04/g)).toHaveLength(1);
  });
});
