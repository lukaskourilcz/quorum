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
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { loadRuntimeBudgetLimits } from "../portfolio/limits.js";
import { runScrapersDetailed, type ScrapeRunResult } from "../sources/run.js";
import { createDigest } from "../sources/digest.js";
import { loadSourceRegistry } from "../sources/registry.js";
import type { SourceRegistry } from "../sources/types.js";
import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";
import { caughtUpBudgetMode } from "../finance/budget-plan.js";
import { discoverLicensedPhotos, type LicensedPhotoCandidate } from "../images/licensed.js";
import { imageSubjectQuery } from "../images/subject-query.js";
import { loadFixedMonthlyUsd } from "../money/fixed-costs.js";

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
  outboxPath: string | null;
  reportPath: string;
  monthApiUsd: number;
}

/**
 * A no-edition outcome is only public when it reflects a deterministic
 * editorial/budget gate. Provider or local validation failures stay inside
 * BoardlessAI, so a repaired same-day run can still publish a real edition.
 */
export function shouldQueueEditionDelivery(editionPackage: EditionPackage): boolean {
  if (editionPackage.status === "edition") return true;
  const reason = editionPackage.board.noEditionReason;
  return reason === "budget_exhausted" || reason.startsWith("source_gate:");
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
    // HERALD curates; STET writes and pays for its own regeneration. The HACEK branch that used
    // to sit here charged the retired `localize` stages, so the ledger described a second call
    // that no longer runs. Every stage in EDITION_USAGE_STAGES lands on one of these two.
    agent: usage.stage === "curate" ? "HERALD" : "STET",
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
  socialPackEnabled?: boolean;
  licensedImageSearchEnabled?: boolean;
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
  // The fallbacks a run uses when the environment sets nothing come from the newest countersigned
  // decision, not from literals here. They were literals: $50 all-in, which is budget-2026-08d's
  // figure, superseded on 2 August by budget-2026-08e at $30; and $15 a month API with $0.70 a day,
  // which predate that raise entirely against 08e's $25 and $1.00. So an unconfigured run enforced
  // an all-in limit $20 looser than the owner approved and a daily pace tighter than it. That is
  // the drift portfolio/limits.ts exists to stop: one resolver, and phases tighten it rather than
  // restating it. This resolves to $25 / $1.00 / $30 / $0.35 today. envCap still runs on top, so a
  // malformed env value is rejected outright rather than silently falling back to these.
  const resolved = await loadRuntimeBudgetLimits();
  const monthlyCap = envCap("MONTHLY_BUDGET_USD", resolved.monthlyApiUsd);
  const dailyCap = envCap("DAILY_BUDGET_USD", resolved.dailyUsd);
  const productionCap = envCap("EDITION_PRODUCTION_BUDGET_USD", resolved.editionProductionUsd);
  const operatingCap = envCap("MONTHLY_OPERATING_CAP_USD", resolved.monthlyOperatingUsd);
  const fixedMonthlyUsd = await loadFixedMonthlyUsd(configRoot, input.now);
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
    monthApiUsd + fixedMonthlyUsd + config.budgets.editionProductionUsd > operatingCap ||
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
    let imageCandidates: LicensedPhotoCandidate[] = [];
    if (input.licensedImageSearchEnabled) {
      const imageSearch = await discoverLicensedPhotos({
        // The subject the day is about, not its headlines. See imageSubjectQuery.
        query: imageSubjectQuery(digest.slice(0, 12).map((item) => item.tags)),
        pexelsKey: process.env.PEXELS_API_KEY,
        pixabayKey: process.env.PIXABAY_API_KEY
      });
      imageCandidates = imageSearch.candidates;
      if (imageSearch.skippedProviders.length > 0) {
        const relative = "NEEDS_YOUR_HELP_NOW.md";
        const current = await readText(repoRoot, relative, "# Needs your help now\n");
        const additions = imageSearch.skippedProviders
          .filter(({ provider }) => !current.includes(`${provider.toUpperCase()}_API_KEY`))
          .map(({ provider }) => `- [ ] Add \`${provider.toUpperCase()}_API_KEY\` to GitHub Actions so the licensed-photo search can use ${provider}. Openverse and Wikimedia remain active without it.`);
        if (additions.length > 0) {
          await atomicWriteText(repoRoot, relative, `${current.trimEnd()}\n\n${additions.join("\n")}\n`);
        }
      }
    }
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
      // `deriveWhyThisStory` is on, so `produceEdition` throws this string away and writes the
      // note from the article it actually produced (`articleRationale` in production.ts). The
      // field is required by the input type, so it stays — but it stays defensible, because
      // flipping the flag would publish it. It no longer claims "STET cleared English and HACEK
      // cleared Czech": STET reviews the one Czech article the desk writes, and HACEK has had
      // nothing to adapt since the second writing call was removed. What is left is true of this
      // branch — it runs only when `sourceGateReason` is null and HERALD's curation call picked
      // the story.
      whyThisStory: "The live digest cleared source coverage and HERALD commissioned the strongest independently supported story.",
      deriveWhyThisStory: true,
      mode: "production",
      config,
      gateway,
      reporter,
      socialPackEnabled: input.socialPackEnabled,
      imageCandidates
    });
    editionPackage = produced.package;
    report = produced.report;
  }
  validateEditionForDelivery(editionPackage);
  const hash = editionPackage.idempotencyKey;
  const outboxPath = shouldQueueEditionDelivery(editionPackage)
    ? `edition/outbox/${input.date}-${hash}.json`
    : null;
  const reportPath = `edition/runs/${input.date}-${hash}.json`;
  await Promise.all([
    ...(outboxPath ? [atomicWriteJson(root, outboxPath, editionPackage)] : []),
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
