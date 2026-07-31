import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BudgetLedgerEntry } from "../budget.js";
import { buildNoEditionPackage } from "./package.js";
import { BudgetedEditionModelGateway, AnthropicEditionModelGateway } from "./models.js";
import { loadEditionQualityConfig } from "./config.js";
import { produceEdition } from "./production.js";
import { EditionRunReporter, type EditionRunReport } from "./report.js";
import type { EditionModelGateway } from "./types.js";
import type { EditionPackage } from "../contracts/edition-package.js";
import { validateEditionForDelivery } from "../delivery/validate.js";
import { configRoot, stateRoot } from "../paths.js";
import { runScrapersDetailed, type ScrapeRunResult } from "../sources/run.js";
import { createDigest } from "../sources/digest.js";
import { loadSourceRegistry } from "../sources/registry.js";
import type { SourceRegistry } from "../sources/types.js";
import { atomicWriteJson, readJson } from "../state.js";
import { caughtUpBudgetMode } from "../finance/budget-plan.js";

interface NetworkAllowlist {
  runtimeHosts: string[];
}

interface BudgetLedger {
  schemaVersion: 1;
  entries: BudgetLedgerEntry[];
}

export interface LiveEditionDependencies {
  loadRegistry?: () => Promise<SourceRegistry>;
  scrape?: (registry: SourceRegistry, now: Date, allowHosts: string[]) => Promise<ScrapeRunResult>;
  gateway?: EditionModelGateway;
}

export interface LiveEditionResult {
  package: EditionPackage;
  report: EditionRunReport;
  sourceRun: ScrapeRunResult;
  outboxPath: string;
  reportPath: string;
  monthApiUsd: number;
}

function sameUtcMonth(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth();
}

function sameUtcDay(left: Date, right: Date): boolean {
  return sameUtcMonth(left, right) && left.getUTCDate() === right.getUTCDate();
}

function envCap(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

async function recentEditionTags(root: string): Promise<string[][]> {
  const directory = path.join(root, "edition", "deliveries");
  let files: string[] = [];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort().reverse();
  } catch {
    return [];
  }
  const tags: string[][] = [];
  for (const file of files.slice(0, 4)) {
    const value = JSON.parse(await readFile(path.join(directory, file), "utf8")) as { tags?: unknown };
    if (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")) {
      tags.push(value.tags);
    }
  }
  return tags;
}

function sourceEvidence(sourceRun: ScrapeRunResult): string[] {
  return sourceRun.sources
    .filter((source) => source.status === "success")
    .map((source) => `source:${source.sourceId}`)
    .slice(0, 12);
}

function requestHash(cycleId: string, index: number, entry: { model: string; stage: string }): string {
  return createHash("sha256").update(`${cycleId}:${index}:${entry.model}:${entry.stage}`).digest("hex");
}

export async function appendEditionUsage(
  root: string,
  cycleId: string,
  now: Date,
  report: EditionRunReport
): Promise<number> {
  const ledger = await readJson<BudgetLedger>(root, "budget/ledger.json", {
    schemaVersion: 1,
    entries: []
  });
  const additions: BudgetLedgerEntry[] = report.usage.map((usage, index) => ({
    ts: now.toISOString(),
    cycleId,
    requestHash: requestHash(cycleId, index, usage),
    phase: "cu-edition",
    ventureId: "caught-up",
    agent: usage.stage === "curate"
      ? "HERALD"
      : usage.stage === "localize" || usage.stage === "localize_rewrite"
        ? "HACEK"
        : "STET",
    provider: "anthropic",
    model: usage.model,
    serviceTier: "default",
    tokensIn: usage.inputTokens,
    cachedTokensIn: usage.cacheReadTokens,
    tokensOut: usage.outputTokens,
    toolUses: 1,
    usd: usage.costUsd,
    kind: "text"
  }));
  const existing = new Set(ledger.entries.map((entry) => entry.requestHash));
  const entries = [...ledger.entries, ...additions.filter((entry) => !existing.has(entry.requestHash))];
  await atomicWriteJson(root, "budget/ledger.json", { schemaVersion: 1, entries });
  return Number(entries
    .filter((entry) => sameUtcMonth(new Date(entry.ts), now))
    .reduce((sum, entry) => sum + entry.usd, 0)
    .toFixed(8));
}

export async function runLiveEdition(input: {
  cycleId: string;
  date: string;
  now: Date;
  meetingRef: string;
  roomUrl: string;
  root?: string;
  dependencies?: LiveEditionDependencies;
}): Promise<LiveEditionResult> {
  const root = input.root ?? stateRoot;
  const [registry, allowlist, config, ledger] = await Promise.all([
    (input.dependencies?.loadRegistry ?? loadSourceRegistry)(),
    readFile(path.join(configRoot, "network-allowlist.json"), "utf8").then(
      (raw) => JSON.parse(raw) as NetworkAllowlist
    ),
    loadEditionQualityConfig(),
    readJson<BudgetLedger>(root, "budget/ledger.json", { schemaVersion: 1, entries: [] })
  ]);
  const scrape = input.dependencies?.scrape ?? ((sourceRegistry: SourceRegistry, now: Date, allowHosts: string[]) =>
    runScrapersDetailed(sourceRegistry.sources, { now, allowHosts }));
  const sourceRun = await scrape(registry, input.now, allowlist.runtimeHosts);
  const digest = createDigest(sourceRun.items, 80);
  const monthApiUsd = Number(ledger.entries
    .filter((entry) => sameUtcMonth(new Date(entry.ts), input.now))
    .reduce((sum, entry) => sum + entry.usd, 0)
    .toFixed(8));
  const dayApiUsd = Number(ledger.entries
    .filter((entry) => sameUtcDay(new Date(entry.ts), input.now))
    .reduce((sum, entry) => sum + entry.usd, 0)
    .toFixed(8));
  const monthlyCap = envCap("MONTHLY_BUDGET_USD", 15);
  const dailyCap = envCap("DAILY_BUDGET_USD", 0.7);
  const productionCap = envCap("EDITION_PRODUCTION_BUDGET_USD", 0.35);
  const reporter = new EditionRunReporter(input.date, "production");
  const successfulSources = sourceRun.sources.filter((source) => source.status === "success").length;
  const sourceGateReason = successfulSources < config.quality.minimumSuccessfulSources
    ? `source_gate:successful_sources_${successfulSources}`
    : digest.length < config.quality.minimumCandidateItems
      ? `source_gate:candidate_items_${digest.length}`
      : null;
  const budgetMode = caughtUpBudgetMode(Math.max(0, monthlyCap - monthApiUsd));
  const budgetBlocked =
    productionCap < config.budgets.editionProductionUsd ||
    dayApiUsd + config.budgets.editionProductionUsd > dailyCap ||
    monthApiUsd + config.budgets.editionProductionUsd > monthlyCap ||
    budgetMode === "no_edition";
  let editionPackage: EditionPackage;
  let report: EditionRunReport;
  if (budgetBlocked || sourceGateReason) {
    const reason = budgetBlocked ? "budget_exhausted" : sourceGateReason!;
    reporter.warn(reason);
    editionPackage = buildNoEditionPackage({
      date: input.date,
      meetingRef: input.meetingRef,
      roomUrl: input.roomUrl,
      reason,
      config
    });
    report = reporter.build("no_edition", "no_edition");
  } else {
    const gateway = new BudgetedEditionModelGateway(
      input.dependencies?.gateway ?? new AnthropicEditionModelGateway(),
      productionCap
    );
    const produced = await produceEdition({
      date: input.date,
      now: input.now,
      items: digest,
      sources: registry.sources,
      sourceResults: sourceRun.sources,
      recentEditionTags: await recentEditionTags(root),
      meetingRef: input.meetingRef,
      roomUrl: input.roomUrl,
      whyThisStory: "The live digest cleared source coverage; HERALD commissioned the strongest independently supported story, STET cleared English and HACEK cleared Czech.",
      deriveWhyThisStory: true,
      mode: "production",
      config,
      gateway,
      reporter
    });
    editionPackage = produced.package;
    report = produced.report;
  }
  validateEditionForDelivery(editionPackage);
  const hash = editionPackage.idempotencyKey;
  const outboxPath = `edition/outbox/${input.date}-${hash}.json`;
  const reportPath = `edition/runs/${input.date}-${hash}.json`;
  await Promise.all([
    atomicWriteJson(root, outboxPath, editionPackage),
    atomicWriteJson(root, reportPath, {
      ...report,
      sourceSummary: {
        successfulSources,
        candidateItems: digest.length,
        evidenceRefs: sourceEvidence(sourceRun)
      }
    })
  ]);
  return { package: editionPackage, report, sourceRun, outboxPath, reportPath, monthApiUsd };
}
