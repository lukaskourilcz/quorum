import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BudgetLedgerEntry } from "../budget.js";
import { buildNoEditionPackage } from "./package.js";
import { BudgetedEditionModelGateway, AnthropicEditionModelGateway } from "./models.js";
import { loadEditionQualityConfig } from "./config.js";
import {
  produceEdition,
  type EditionProductionInput,
  type EditionProductionResult
} from "./production.js";
import { EditionRunReporter, type EditionRunReport } from "./report.js";
import type { EditionModelGateway } from "./types.js";
import type { EditionPackage } from "../contracts/edition-package.js";
import { validateEditionForDelivery } from "../delivery/validate.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { loadRuntimeBudgetLimits } from "../portfolio/limits.js";
import { newestTrendSnapshot } from "../portfolio/evidence.js";
import { runScrapersDetailed, type ScrapeRunResult } from "../sources/run.js";
import { createDigest } from "../sources/digest.js";
import { loadSourceRegistry } from "../sources/registry.js";
import type { SourceRegistry } from "../sources/types.js";
import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";
import { caughtUpBudgetMode } from "../finance/budget-plan.js";
import { ImageProgramBudget, readImageProgramSpendToday } from "../images/budget.js";
import { selectEditionHero, type HeroLadderResult } from "../images/ladder.js";
import type { VisualBrief } from "../images/visual-brief.js";
import { recordSkippedProviders } from "../images/skipped-providers.js";
import { imageProgramReadiness } from "../images/readiness.js";
import { storeImageSelection } from "../images/verdict-store.js";
import { loadFixedMonthlyUsd } from "../money/fixed-costs.js";
import { storeEditionCarouselSummary } from "../studio/carousel-summary-store.js";

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
  /**
   * Injected by tests. The failures this file now has to survive happen after the model
   * calls have been billed — package assembly, delivery validation — and the real gateway
   * cannot reach them without a provider and a network read of the picked article.
   */
  produce?: (input: EditionProductionInput) => Promise<EditionProductionResult>;
  /**
   * The image ladder. Injected by tests so none of the four archives is reached, the same reason
   * `produce` is: the ladder's own behaviour is covered where it lives, and what a run needs to
   * prove here is that its verdict reaches the report and the record beside the package.
   */
  selectHero?: (input: {
    subjectQuery: string;
    brief: VisualBrief | null;
    slug: string;
    article: { titleCs: string; dekCs: string };
  }) => Promise<HeroLadderResult>;
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
 * Every terminal day gets a public record, whether or not it produced an article.
 *
 * This used to queue a no-edition package for `budget_exhausted` and `source_gate:*` only.
 * `quality_block`, `content_invalid_after_regeneration`, `stet_block_after_rewrite`,
 * `curation_failed`, `production_failed` and `delivery_invalid` stayed inside BoardlessAI, so a
 * gated $0 day looked exactly like a crash on the magazine: nothing arrived and nothing said
 * why. 2 August has no board JSON at all for that reason.
 *
 * The old rule reasoned that a provider failure might be repaired by a later same-day run, so
 * publishing a notice would be premature. That is true of the notice's timing and not of its
 * existence: the aifirst consumer already accepts a provisional no-edition board being replaced
 * by a real edition the same day, the retry slot exists to attempt exactly that repair, and a
 * day that ends with nothing is a day the reader is owed a sentence about.
 */
export function shouldQueueEditionDelivery(_editionPackage: EditionPackage): boolean {
  return true;
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

/** Receipts scanned back from today before the search for published editions gives up. */
const DELIVERY_RECEIPTS_SCANNED = 30;

/** Editions the repeated-topic window holds. */
const RECENT_EDITION_WINDOW = 4;

/**
 * The tags of the last few editions that actually published.
 *
 * A no-edition day gets a delivery receipt too, and it records `tags: []` (delivery/outbox.ts).
 * Reading the four newest receipts therefore let a run of quiet days fill the window with days
 * that carried no topics: the warm-up counted them as history, and each one displaced a real
 * edition the window was meant to hold. Only receipts with tags are collected, and the scan is
 * bounded so a long silence reads a fixed number of files rather than the whole archive.
 */
export async function recentEditionTags(root: string): Promise<string[][]> {
  const directory = path.join(root, "edition", "deliveries");
  let files: string[] = [];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort().reverse();
  } catch {
    return [];
  }
  const tags: string[][] = [];
  for (const file of files.slice(0, DELIVERY_RECEIPTS_SCANNED)) {
    if (tags.length >= RECENT_EDITION_WINDOW) break;
    // Tags before the cutover are a different vocabulary, not a different topic.
    //
    // The writer emitted English tags on 3 and 5 August and Czech ones on the 6th, so the same
    // subject appeared twice under two names: the freshness window read them as fresh, and the
    // magazine's /topics page split the topic in two. The Czech rule is now stated in
    // WRITE_SYSTEM; these earlier receipts stay on disk unchanged and are simply not counted,
    // so repeatedTopicShare measures one vocabulary against itself. Drop this guard once the
    // window has moved past the cutover, which needs no code change beyond deleting it.
    if (file.slice(0, 10) < CZECH_TAG_CUTOVER_DATE) continue;
    const value = JSON.parse(await readFile(path.join(directory, file), "utf8")) as { tags?: unknown };
    if (
      Array.isArray(value.tags) &&
      value.tags.length > 0 &&
      value.tags.every((tag) => typeof tag === "string")
    ) {
      tags.push(value.tags);
    }
  }
  return tags;
}

/**
 * The first Prague date whose delivered tags are Czech. Receipts before it are warm-up.
 */
export const CZECH_TAG_CUTOVER_DATE = "2026-08-06";

function sourceEvidence(sourceRun: ScrapeRunResult): string[] {
  return sourceRun.sources
    .filter((source) => source.status === "success")
    .map((source) => `source:${source.sourceId}`)
    .slice(0, 12);
}

/** One line of our own error text, bounded, so a warning stays readable in the run report. */
function failureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown error";
  return message.replace(/\s+/gu, " ").trim().slice(0, 200) || "unknown error";
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
  // restating it. This resolves to $25 / $1.00 / $30 / $0.50 today. envCap still runs on top, so a
  // malformed env value is rejected outright rather than silently falling back to these.
  // The $0.35 in that sentence is now $0.50; the cap and edition-quality.json move together,
  // because a resolved cap under the configured one blocks every run.
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
    // The ladder is walked inside production now, after the article exists. It used to run
    // here, which is before HERALD has chosen anything: the only basis available at this point
    // is the whole day's digest, so every archive was asked what the morning was about rather
    // than what the article is about, and the writer then picked from captions. The keys, the
    // network and the money stay here; the moment of asking, and the look before attaching,
    // moved to where the article is.
    const imageReadiness = await imageProgramReadiness({ stateRoot: root, now: input.now });
    reporter.imageProgram = { readiness: imageReadiness, verdicts: [] };
    const imageBudget = new ImageProgramBudget(await readImageProgramSpendToday(root, input.now));
    let imageSelection: { slug: string; result: HeroLadderResult } | null = null;
    const walkLadder = input.dependencies?.selectHero;
    const selectHero: NonNullable<EditionProductionInput["selectHero"]> = async (request) => {
      const result = walkLadder ? await walkLadder(request) : await selectEditionHero({
        venture: "caught-up",
        stateRoot: root,
        cycleId: input.cycleId,
        budget: imageBudget,
        article: request.article,
        brief: request.brief,
        seed: input.date,
        illustrationSlug: request.slug,
        subjectQuery: request.subjectQuery
      });
      imageSelection = { slug: request.slug, result };
      reporter.imageProgram = {
        readiness: imageReadiness,
        rung: result.rung,
        verdicts: result.verdicts
      };
      await recordSkippedProviders(result.skippedProviders);
      return result;
    };
    const gateway = new BudgetedEditionModelGateway(
      input.dependencies?.gateway ?? new AnthropicEditionModelGateway(),
      productionCap
    );
    const produce = input.dependencies?.produce ?? produceEdition;
    const trending = (await newestTrendSnapshot(root, input.date))?.forMagazines.ai ?? [];
    const productionInput: EditionProductionInput = {
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
      ...(input.licensedImageSearchEnabled ? { selectHero } : {}),
      // A tiebreaker for the editor, and nothing more. Absent when no scout has run, which is
      // the normal state until the owner adds APIFY_TOKEN; the editor's gates are identical
      // either way.
      ...(trending.length > 0 ? { trending } : {})
    };
    try {
      const produced = await produce(productionInput);
      editionPackage = produced.package;
      report = produced.report;
    } catch (error) {
      // Everything produceEdition can name, it catches, and it pays for: curation, writing,
      // budget and quality failures all come back as a stated no-edition carrying
      // reporter.totalCostUsd(). What reaches here is the rest — package assembly, the
      // schema parse after it — and it used to leave runLiveEdition entirely. Nothing below
      // ran, so the run report was never written; and cycle.ts appends this run's usage to
      // budget/ledger.json from the value this function returns, so the calls the provider
      // had already billed left no ledger entry either and the next run believed it still
      // had that headroom. The reporter is constructed in this function and handed to
      // produceEdition, so it survives the throw holding every usage record the run accrued:
      // state the failure and build the no-edition from it instead of losing both.
      reporter.warn(`production_failed:${failureDetail(error)}`);
      const costUsd = reporter.totalCostUsd();
      editionPackage = buildNoEditionPackage({
        date: input.date,
        meetingRef: input.meetingRef,
        roomUrl: input.roomUrl,
        reason: "production_failed",
        config,
        ...(costUsd === undefined ? {} : { costUsd })
      });
      report = reporter.build("failed", editionPackage.status);
    }
    // Recorded whether or not a photograph won, and recorded even when production failed after
    // the ladder ran. The interesting case for an owner is the one where nothing shipped: this
    // is where the reasons live.
    if (imageSelection) {
      const selection: { slug: string; result: HeroLadderResult } = imageSelection;
      await storeImageSelection(root, {
        schemaVersion: "image-selection/1",
        venture: "caught-up",
        slug: selection.slug,
        date: input.date,
        rung: selection.result.rung,
        selected: selection.result.candidate?.id ?? null,
        verdicts: selection.result.verdicts,
        skippedProviders: [...selection.result.skippedProviders],
        recordedAt: input.now.toISOString()
      }).catch(() => undefined);
    }
  }
  // Delivery validation rejects a package the site cannot serve, and rejecting it is right —
  // but it threw before the report was written, so the run that paid for the package left no
  // record of the spend and no statement that an edition had been assembled at all. Downgrade
  // to a stated no-edition instead. This direction only: an edition can become a no-edition
  // here, and nothing in this branch can turn content a gate rejected into content that ships.
  try {
    validateEditionForDelivery(editionPackage);
  } catch (error) {
    reporter.warn(`delivery_invalid:${failureDetail(error)}`);
    if (editionPackage.status === "edition") {
      // Say what the money bought. The article is unpublishable, not unmentionable, and its
      // slug is what makes the run report point at a specific piece of work.
      reporter.warn(`delivery_invalid_article:${editionPackage.article.cs.frontmatter.slug}`);
    }
    const costUsd = reporter.totalCostUsd();
    // buildNoEditionPackage parses the schema and sets idempotencyKey to its own hash of the
    // result, and validateEditionForDelivery checks exactly those two things for a no-edition
    // package and then returns. So this replacement is deliverable by construction.
    editionPackage = buildNoEditionPackage({
      date: input.date,
      meetingRef: input.meetingRef,
      roomUrl: input.roomUrl,
      reason: "delivery_invalid",
      config,
      ...(costUsd === undefined ? {} : { costUsd })
    });
    report = reporter.build("failed", editionPackage.status);
  }
  const hash = editionPackage.idempotencyKey;
  const outboxPath = shouldQueueEditionDelivery(editionPackage)
    ? `edition/outbox/${input.date}-${hash}.json`
    : null;
  const reportPath = `edition/runs/${input.date}-${hash}.json`;
  // Report before outbox rather than alongside it: if the delivery write fails, the spend and
  // the reason are still on disk, where the other order can lose them.
  await atomicWriteJson(root, reportPath, {
    ...report,
    sourceSummary: {
      successfulSources,
      candidateItems: digest.length,
      evidenceRefs: sourceEvidence(sourceRun)
    }
  });
  if (outboxPath) await atomicWriteJson(root, outboxPath, editionPackage);
  // The edition also reaches Carousel Studio, as a summary rather than as the edition: the
  // headline, the standfirst and the editor's own points, in the order they made them. A
  // `no_edition` package writes nothing, because an edition that did not go out has nothing to
  // put on a slide, and its reason is already recorded above.
  await storeEditionCarouselSummary(root, editionPackage);
  return { package: editionPackage, report, sourceRun, outboxPath, reportPath, monthApiUsd };
}
