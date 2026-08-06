import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EditionPackage } from "../src/contracts/edition-package.js";
import { noEditionSentence } from "../src/edition/package.js";
import { appendEditionUsage, runLiveEdition } from "../src/edition/live.js";
import type { EditionProductionInput, EditionProductionResult } from "../src/edition/production.js";
import type { EditionRunReport } from "../src/edition/report.js";
import type { EditionModelGateway, EditionUsage } from "../src/edition/types.js";
import { repoRoot } from "../src/paths.js";
import { loadSourceRegistry } from "../src/sources/registry.js";
import { SourceItemSchema } from "../src/sources/types.js";

/**
 * The 4 August run billed three calls for $0.25 and returned nothing
 * (state/edition/runs/2026-08-04-18f2f821b302….json). It did leave a record, because every
 * failure it hit is one produceEdition catches. These are the failures it does not: they used
 * to leave runLiveEdition, and everything that records a run — the report file, and the ledger
 * append cycle.ts makes from the returned report — sits after the call that threw.
 */

// The billed call these tests stand in for. One curation call at 4 August prices.
const BILLED: EditionUsage = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  stage: "curate",
  inputTokens: 11_919,
  outputTokens: 818,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0.048027
};

const CAP_ENV = [
  "DAILY_BUDGET_USD",
  "MONTHLY_BUDGET_USD",
  "MONTHLY_OPERATING_CAP_USD",
  "EDITION_PRODUCTION_BUDGET_USD"
] as const;

const savedEnv = { ...process.env };
afterEach(() => {
  Object.assign(process.env, savedEnv);
});

async function goldenPackage(): Promise<EditionPackage> {
  return JSON.parse(await readFile(
    path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "golden-package.json"),
    "utf8"
  )) as EditionPackage;
}

/** A live run whose source gate and budget both clear, with production injected. */
async function liveRun(produce: (input: EditionProductionInput) => Promise<EditionProductionResult>) {
  for (const name of CAP_ENV) delete process.env[name];
  const root = await mkdtemp(path.join(os.tmpdir(), "edition-run-record-"));
  const rawItems = JSON.parse(await readFile(
    path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "source-items.json"),
    "utf8"
  )) as unknown[];
  const items = rawItems.map((item) => SourceItemSchema.parse(item));
  const registry = await loadSourceRegistry();
  const gateway: EditionModelGateway = {
    invoke: async () => {
      throw new Error("the provider is reached through the injected production step, not directly");
    }
  };
  const result = await runLiveEdition({
    cycleId: "20260804050000-cu-edition",
    date: "2026-08-04",
    now: new Date("2026-08-04T05:00:00.000Z"),
    meetingRef: "meetings/2026-08-04-cu-edition",
    roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
    root,
    dependencies: {
      loadRegistry: async () => registry,
      scrape: async () => ({
        items,
        sources: registry.sources.slice(0, 12).map((source) => ({
          sourceId: source.id,
          status: "success" as const,
          candidateItems: 1,
          durationMs: 0,
          errorCode: null,
          errorMessage: null
        }))
      }),
      gateway,
      produce
    }
  });
  const written = JSON.parse(
    await readFile(path.join(root, result.reportPath), "utf8")
  ) as EditionRunReport;
  return { root, result, written };
}

describe("a live edition run that spent money leaves a record of it", () => {
  it("states a failure produceEdition cannot catch instead of throwing the run away", async () => {
    // Package assembly and the schema parse after it are outside every catch in production.ts.
    const { root, result, written } = await liveRun(async (input) => {
      input.reporter!.addUsage(BILLED);
      throw new Error("edition package: article has no cs locale");
    });

    expect(result.package.status).toBe("no_edition");
    if (result.package.status === "no_edition") {
      expect(result.package.board.noEditionReason).toBe(noEditionSentence("production_failed"));
    }
    // What the run cost is on the package the desk publishes its no-edition from...
    expect(result.package.generation.costUsd).toBe(BILLED.costUsd);
    // ...on the run report, with the reason...
    expect(written.status).toBe("failed");
    expect(written.measuredCostUsd).toBe(BILLED.costUsd);
    expect(written.usage).toEqual([BILLED]);
    expect(written.warnings).toContain(
      "production_failed:edition package: article has no cs locale"
    );
    // ...and in the budget ledger, which cycle.ts fills from the returned report. A throw
    // skipped that append, so the next run counted the spend as headroom it still had.
    expect(await appendEditionUsage(
      root,
      "20260804050000-cu-edition",
      new Date("2026-08-04T05:04:00.000Z"),
      result.report
    )).toBe(BILLED.costUsd);
    // The day still ends with something the reader can see. A local failure used to stay inside
    // BoardlessAI, which made a gated $0 day indistinguishable on the magazine from a crash.
    expect(result.outboxPath).not.toBeNull();
  });

  it("downgrades an undeliverable package to a stated no-edition and queues that", async () => {
    const golden = await goldenPackage();
    if (golden.status !== "edition") throw new Error("golden-package.json is not an edition");
    // Schema-valid and hash-invalid: exactly what delivery validation exists to refuse.
    const tampered = {
      ...golden,
      article: {
        ...golden.article,
        cs: {
          ...golden.article.cs,
          frontmatter: { ...golden.article.cs.frontmatter, dek: "Edited after the hash was taken." }
        }
      }
    } as EditionPackage;

    const { result, written } = await liveRun(async (input) => {
      input.reporter!.addUsage(BILLED);
      return { package: tampered, report: input.reporter!.build("edition", "edition") };
    });

    expect(result.package.status).toBe("no_edition");
    if (result.package.status === "no_edition") {
      expect(result.package.board.noEditionReason).toBe(noEditionSentence("delivery_invalid"));
    }
    expect(result.outboxPath).not.toBeNull();
    expect(written.status).toBe("failed");
    expect(written.measuredCostUsd).toBe(BILLED.costUsd);
    expect(written.warnings).toContain(
      "delivery_invalid:Package hash does not match canonical bytes"
    );
    // The article is unpublishable, not unmentionable: the record names what was produced.
    expect(written.warnings).toContain(
      "delivery_invalid_article:2026-08-04-production-inference-price-cut"
    );
  });
});
