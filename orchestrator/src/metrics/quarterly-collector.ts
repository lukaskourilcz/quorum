import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BudgetLedgerEntrySchema } from "../budget.js";
import { ReleaseProofSchema } from "../contracts/autonomy.js";
import { KpiSetSchema, type KpiSet } from "../contracts/kpi-set.js";
import { IdeaLedgerEntrySchema } from "../contracts/idea-ledger.js";
import { ArticlePackageSchema } from "../contracts/mma-files.js";
import { BoutRecordSchema, EventCardSchema, FighterRecordSchema } from "../contracts/mma.js";
import { MarketingPlanSchema } from "../contracts/marketing-plan.js";
import { FixedCostRegistrySchema } from "../money/fixed-costs.js";
import type { MonetizationMeasurements } from "../money/monetization.js";
import type { KpiMeasurements } from "./quarterly.js";
import {
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  SEED_TEMPLATES,
  fixturePayload,
  renderCarouselSvg
} from "@boardlessai/carousel-studio";

const DAY_MS = 86_400_000;

const StoredMeasurementsSchema = z.object({
  schemaVersion: z.literal("quarterly-measurements/1"),
  values: z.record(z.string(), z.object({
    value: z.number().finite().nonnegative(),
    observedAt: z.iso.datetime({ offset: true }),
    verified: z.literal(true)
  }))
});

async function jsonFile(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function jsonFiles(directory: string, recursive = false): Promise<unknown[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const values: unknown[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && recursive) values.push(...await jsonFiles(file, true));
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const value = await jsonFile(file);
    if (value !== null) values.push(value);
  }
  return values;
}

/**
 * Like {@link jsonFiles}, but reports the files it could not read instead of dropping them.
 *
 * `jsonFile` returns null for a file that exists and will not parse, and `jsonFiles` then
 * skips it, so a corrupt input silently shrinks whatever denominator it belonged to. Any
 * rate built on these records has to be able to say "N inputs were unreadable" instead.
 */
async function jsonFilesCounted(
  directory: string
): Promise<{ values: unknown[]; unreadable: number }> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { values: [], unreadable: 0 };
    throw error;
  }
  const values: unknown[] = [];
  let unreadable = 0;
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const value = await jsonFile(path.join(directory, entry.name));
    if (value === null) unreadable += 1;
    else values.push(value);
  }
  return { values, unreadable };
}

const EditionStageSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["success", "failed", "skipped"])
});

/**
 * The subset of `EditionRunReport` (orchestrator/src/edition/report.ts) these measurements
 * read. Kept deliberately narrow: a run record carries far more, and widening this schema
 * would turn an unrelated field change into an unreadable-input spike.
 */
const EditionRunSchema = z.object({
  schemaVersion: z.literal(1),
  date: z.string().min(1),
  mode: z.enum(["dry_run", "production"]),
  status: z.enum(["edition", "no_edition", "failed"]),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  stages: z.array(EditionStageSchema),
  stetBlocks: z.number().int().nonnegative(),
  quality: z.object({
    metrics: z.object({
      signalStrength: z.number().finite(),
      successfulSources: z.number().int().nonnegative().optional()
    })
  }).optional(),
  stet: z.object({ passed: z.boolean() }).optional()
});

type EditionRun = z.infer<typeof EditionRunSchema>;

function stageCount(run: EditionRun, prefix: string): number {
  return run.stages.filter((stage) => stage.name.startsWith(prefix)).length;
}

function elapsedMinutes(run: EditionRun): number | null {
  const started = Date.parse(run.startedAt);
  const completed = Date.parse(run.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return null;
  return (completed - started) / 60_000;
}

async function jsonLines(file: string): Promise<unknown[]> {
  try {
    return (await readFile(file, "utf8"))
      .split("\n")
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as unknown];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function dateInPeriod(value: unknown, start: string, end: string): boolean {
  return typeof value === "string" && value.slice(0, 10) >= start && value.slice(0, 10) <= end;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(8));
}

function sum(values: readonly number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(8));
}

export async function loadCurrentKpiSet(configRoot: string, now: Date): Promise<KpiSet> {
  const directory = path.join(configRoot, "kpis");
  const values = (await jsonFiles(directory))
    .map((value) => KpiSetSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((left, right) => left.quarter_start.localeCompare(right.quarter_start));
  if (values.length === 0) throw new Error("No valid quarterly KPI set is configured");
  const today = now.toISOString().slice(0, 10);
  return values.find((set) => {
    const closes = new Date(`${set.quarter_start}T00:00:00.000Z`).getTime() + (set.quarter_days * DAY_MS);
    return today >= set.quarter_start && now.getTime() < closes;
  }) ?? values.find((set) => set.quarter_start > today) ?? values.at(-1)!;
}

export async function collectQuarterlyMeasurements(input: {
  repoRoot: string;
  stateRoot: string;
  kpiSet: KpiSet;
  now: Date;
  metricsIngestionEnabled: boolean;
  mmaFilesIndexingEnabled: boolean;
}): Promise<{
  measurements: KpiMeasurements;
  monetization: MonetizationMeasurements;
}> {
  const periodEnd = input.now.toISOString().slice(0, 10);
  const periodStart = input.kpiSet.quarter_start;
  /**
   * The end of the quarter, not today.
   *
   * Fights are announced weeks ahead, and clamping their denominators at "now" excluded every
   * future bout from them: 32 announced bouts and 2 event cards were on file while
   * announced_event_coverage_rate, prediction_coverage_rate and the event-fighter completeness
   * KPI all read "unavailable", because their denominators were empty. Real coverage was 2 of 2.
   * A KPI about work that is scheduled has to look at the schedule.
   */
  const quarterEnd = new Date(
    new Date(`${input.kpiSet.quarter_start}T00:00:00.000Z`).getTime()
    + (input.kpiSet.quarter_days * DAY_MS)
  ).toISOString().slice(0, 10);
  const [
    budgetRaw,
    fixedRaw,
    editionDeliveries,
    articlesRaw,
    proofs,
    socialReceipts,
    fighterRaw,
    boutRaw,
    eventRaw,
    evaluationRaw,
    rosterStatusRaw,
    plansRaw,
    agendaRaw,
    priorityRaw,
    calendars,
    sourcesRaw,
    storedRaw,
    studioTemplatesRaw,
    studioObservationsRaw,
    editionRunFiles,
    ideaLedger,
    tittyTuesdaysIdeaLedger,
    goViralIdeaLedger,
    goViralPlansRaw,
    goViralTrends,
    mmaRunsRaw,
    deckReceiptsRaw,
    hookChannelsRaw
  ] = await Promise.all([
    jsonFile(path.join(input.stateRoot, "budget", "ledger.json")),
    jsonFile(path.join(input.repoRoot, "config", "fixed-costs.json")),
    jsonFiles(path.join(input.stateRoot, "edition", "deliveries")),
    jsonFiles(path.join(input.stateRoot, "ventures", "mma-files", "articles")),
    jsonFiles(path.join(input.stateRoot, "release-proofs"), true),
    // social/posts is where the publisher writes. Reading social/receipts, which nothing
    // has ever written, made published_count 0 and carousel_studio_render_rate null.
    jsonFiles(path.join(input.stateRoot, "social", "posts"), true),
    jsonFiles(path.join(input.stateRoot, "mma", "fighters")),
    jsonFiles(path.join(input.stateRoot, "mma", "bouts"), true),
    jsonFiles(path.join(input.stateRoot, "mma", "events"), true),
    jsonFile(path.join(input.stateRoot, "mma", "evaluation", "summary.json")),
    jsonFile(path.join(input.stateRoot, "mma", "roster", "status.json")),
    jsonFiles(path.join(input.stateRoot, "ventures", "titty-tuesdays", "plans")),
    jsonFile(path.join(input.stateRoot, "meeting-agendas", "queue.json")),
    jsonFile(path.join(input.stateRoot, "priority-queue.json")),
    jsonFiles(path.join(input.stateRoot, "calendar")),
    jsonFile(path.join(input.repoRoot, "config", "sources.json")),
    jsonFile(path.join(input.stateRoot, "metrics", "quarterly.json")),
    jsonFiles(path.join(input.stateRoot, "ventures", "carousel-studio", "templates"), true),
    jsonFiles(path.join(input.stateRoot, "ventures", "carousel-studio", "observations")),
    jsonFilesCounted(path.join(input.stateRoot, "edition", "runs")),
    jsonLines(path.join(input.stateRoot, "ideas", "caught-up", "ledger.jsonl")),
    jsonLines(path.join(input.stateRoot, "ideas", "titty-tuesdays", "ledger.jsonl")),
    jsonLines(path.join(input.stateRoot, "ideas", "goviral", "ledger.jsonl")),
    jsonFiles(path.join(input.stateRoot, "ventures", "goviral", "plans")),
    jsonFiles(path.join(input.stateRoot, "goviral", "trends")),
    jsonFiles(path.join(input.stateRoot, "ventures", "mma-files", "runs")),
    jsonFiles(path.join(input.stateRoot, "ventures", "carousel-studio", "deck-receipts")),
    jsonFile(path.join(input.stateRoot, "ventures", "carousel-studio", "hook-channels.json"))
  ]);

  const measurements: Record<string, number | null> = {};
  for (const kpi of input.kpiSet.kpis) measurements[kpi.metric_source] = null;

  const budget = z.object({
    schemaVersion: z.literal(1),
    entries: z.array(BudgetLedgerEntrySchema)
  }).safeParse(budgetRaw);
  const periodBudget = budget.success
    ? budget.data.entries.filter((entry) => dateInPeriod(entry.ts, periodStart, periodEnd))
    : [];
  const apiByMonth = new Map<string, number>();
  for (const entry of periodBudget) {
    const month = entry.ts.slice(0, 7);
    apiByMonth.set(month, (apiByMonth.get(month) ?? 0) + entry.usd);
  }
  measurements["state/metrics/quarterly#maximum_monthly_api_usd"] = budget.success
    ? (apiByMonth.size ? Math.max(...apiByMonth.values()) : 0)
    : null;
  const fixed = FixedCostRegistrySchema.safeParse(fixedRaw);
  // An empty cost list the owner has confirmed is fixed $0, not an unanswered question, so the
  // all-in figure is measurable: API spend plus nothing.
  measurements["state/metrics/quarterly#maximum_monthly_all_in_usd"] = budget.success && fixed.success && (fixed.data.costs.length > 0 || fixed.data.confirmedNoFixedCosts === true)
    ? (apiByMonth.size ? Math.max(...apiByMonth.values()) : 0) + sum(fixed.data.costs.map((cost) => cost.monthly_usd))
    : null;

  // Every model call is billed to the ledger with a kind, so image spend is separable from
  // text spend. Zero here is a measured zero over a ledger that is actively written, not an
  // absent counter: an image call charged to caught-up would land in this same file.
  measurements["receipts/caught-up#media_cost_usd"] = budget.success
    ? sum(periodBudget
        .filter((entry) => entry.kind === "image" && entry.ventureId === "caught-up")
        .map((entry) => entry.usd))
    : null;

  const dueSlots = calendars.flatMap((calendar) => {
    const value = record(calendar);
    return Array.isArray(value?.slots) ? value.slots.map(record).filter(Boolean) : [];
  }).filter((slot) => dateInPeriod(slot?.at, periodStart, periodEnd) && typeof slot?.at === "string" && Date.parse(slot.at) <= input.now.getTime());
  measurements["state/meetings#valid_result_rate"] = ratio(
    dueSlots.filter((slot) => ["held", "not-needed"].includes(String(slot?.status))).length,
    dueSlots.length
  );

  const editions = editionDeliveries.map(record).filter((value): value is Record<string, unknown> => Boolean(value))
    .filter((value) => dateInPeriod(value.date ?? value.deliveredAt, periodStart, periodEnd));
  // A delivered "no edition today" notice is a successful gated outcome and it is not an
  // edition. Counting it as one inflated editions_delivered to 4 against 3, made an edition
  // look $0.10 cheaper than it was, and pushed published_hero_rate down to 0.75 for the
  // hero a no-edition notice was never going to carry.
  const deliveredEditions = editions.filter((value) =>
    value.status === "delivered"
    && value.editionStatus !== "no_edition"
    && typeof value.date === "string"
    && /^[a-f0-9]{64}$/u.test(String(value.packageHash))
    && typeof value.targetRepository === "string"
    && typeof value.targetCommit === "string"
  ).length;
  measurements["receipts/caught-up#editions_delivered"] = deliveredEditions;

  const articles = articlesRaw
    .map((value) => ArticlePackageSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((article) => dateInPeriod(article.publishAt, periodStart, periodEnd) && article.status === "published");
  measurements["receipts/mma-files#articles_delivered"] = articles.length;
  // A real predicate, not "did anything ship". This used to be `articles.length > 0 ? 1 : null`:
  // a vanity 1.00 that could never fall, under a display name that still demanded an English
  // version the desk stopped writing. A complete article has the Czech telling a reader opens, a
  // picture, and at least one source behind it.
  measurements["receipts/mma-files#complete_article_rate"] = ratio(
    articles.filter((article) =>
      Boolean(article.localizations.cs?.bodyMDX?.trim())
      && Boolean(article.image?.hero_path)
      && article.sources.length >= 1
    ).length,
    articles.length
  );
  measurements["receipts/delivery#content_units"] = deliveredEditions + articles.length;

  const quarterProofs = proofs.map(record).filter((value): value is Record<string, unknown> => Boolean(value))
    .filter((value) => dateInPeriod(value.completedAt, periodStart, periodEnd));
  measurements["receipts/delivery#pass_within_one_retry_rate"] = ratio(
    quarterProofs.filter((proof) => proof.status === "passed" && typeof proof.retryCount === "number" && proof.retryCount <= 1).length,
    quarterProofs.length
  );
  // The same proofs without the retry qualifier: did the release pass at all. A release that
  // needed three retries counts here and not above, which is why these are two measures.
  const passedProofs = quarterProofs.filter((proof) => proof.status === "passed").length;
  measurements["receipts/delivery#release_pass_rate"] = ratio(passedProofs, quarterProofs.length);
  measurements["receipts/delivery#release_failure_rate"] = ratio(
    quarterProofs.length - passedProofs,
    quarterProofs.length
  );
  const caughtUpProofs = proofs
    .map((value) => ReleaseProofSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((proof) => proof.venture === "caught-up" && proof.status === "passed" && dateInPeriod(proof.completedAt, periodStart, periodEnd));
  // What the desk actually promises now: an edition that reached readers in Czech with a hero
  // image on it. This counted English too, and the day the desk stopped writing English the
  // measure would have gone on reporting success for a locale nobody was served — an
  // english-route check that passes because no English was asked for is not a delivery.
  measurements["receipts/caught-up#published_hero_rate"] = deliveredEditions > 0 && caughtUpProofs.length > 0
    ? Math.min(1, caughtUpProofs.filter((proof) =>
        ["czech-route", "hero-image"].every((name) => proof.checks.some((check) => check.name === name && check.status === "pass"))
      ).length / deliveredEditions)
    : null;

  // --- Caught Up edition pipeline ------------------------------------------------------
  // state/edition/runs is the only committed record of what the desk did on a given day.
  //
  // Every rate below picks its denominator from a run's TERMINAL status or from its stage
  // list, never from the presence of a reviewer verdict. EditionRunReporter.stet is a single
  // mutable field (orchestrator/src/edition/report.ts) that each attempt overwrites and
  // build() emits as-is, so a run whose attempt 0 cleared the copy review and whose later
  // rewrites all failed still ships a passing verdict next to status "no_edition".
  // state/edition/runs/2026-08-02-a7b2d656....json is exactly that record: a passing review
  // sitting on a run that produced nothing. A rate keyed on "has a verdict" would score it
  // as a delivered pass for copy the gate never saw in final form.
  const editionRunParses = editionRunFiles.values.map((value) => EditionRunSchema.safeParse(value));
  const editionRuns = editionRunParses
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((run) => run.mode === "production" && dateInPeriod(run.date, periodStart, periodEnd));
  const deliveredRuns = editionRuns.filter((run) => run.status === "edition");
  measurements["receipts/caught-up#no_edition_rate"] = ratio(
    editionRuns.filter((run) => run.status !== "edition").length,
    editionRuns.length
  );
  const scoredRuns = deliveredRuns.filter((run) => run.quality !== undefined);
  measurements["receipts/caught-up#edition_signal_strength_average"] = scoredRuns.length > 0
    ? Number((sum(scoredRuns.map((run) => run.quality!.metrics.signalStrength)) / scoredRuns.length).toFixed(8))
    : null;
  // Since the English and Czech reviews collapsed into one reviewCzechArticle pass, the stage
  // named stet_<attempt> IS the Czech copy review and stetBlocks IS its block count; nothing
  // increments hacekBlocks any more, so reading that field would report a flat, permanent 0.
  // STET and HACEK therefore measure one stage against two bars, not two stages.
  //
  // The denominator is reviews performed, not runs and not deliveries. Each loop iteration
  // records one stet_<attempt> stage and increments stetBlocks when that review failed, so
  // both counters accumulate across attempts and neither depends on the surviving verdict
  // field. Scoring delivered editions instead would read the publication decision rather than
  // the review: until 2026-08-04 every delivered run carried a passing verdict by construction
  // and the rate could only ever read 1, and since the switch in edition/publication-gate.ts a
  // delivered run may carry a failing one. stetBlocks counts the failed review either way, so
  // this rate answers "how often did the copy review fail" across both regimes.
  const reviewed = editionRuns
    .map((run) => ({ reviews: stageCount(run, "stet_"), blocks: run.stetBlocks }))
    // stetBlocks rises once per blocked review, so it can never exceed the reviews recorded.
    // A run that says otherwise is not readable as a review record.
    .filter((counts) => counts.blocks <= counts.reviews);
  const inconsistentReviewRuns = editionRuns.length - reviewed.length;
  const copyReviews = sum(reviewed.map((counts) => counts.reviews));
  const copyBlocks = sum(reviewed.map((counts) => counts.blocks));
  measurements["receipts/caught-up#czech_register_pass_rate"] = ratio(copyReviews - copyBlocks, copyReviews);
  measurements["receipts/caught-up#copy_block_rate"] = ratio(copyBlocks, copyReviews);
  // Unreadable inputs are reported, not absorbed. The first two terms cover the whole runs
  // directory, because a file that will not parse has no readable date to scope it by. The
  // last two are in-quarter runs that dropped out of a denominator above for want of the
  // field it needed - the shrinkage those metrics would otherwise have hidden.
  measurements["state/edition/runs#unreadable_count"] =
    editionRunFiles.unreadable
    + editionRunParses.filter((result) => !result.success).length
    + inconsistentReviewRuns
    + (deliveredRuns.length - scoredRuns.length);
  const rewriteStages = editionRuns.flatMap((run) =>
    run.stages.filter((stage) => stage.name.startsWith("rewrite_"))
  );
  measurements["receipts/caught-up#rewrite_pass_rate"] = ratio(
    rewriteStages.filter((stage) => stage.status === "success").length,
    rewriteStages.length
  );
  const publishMinutes = deliveredRuns.flatMap((run) => {
    const minutes = elapsedMinutes(run);
    return minutes === null ? [] : [minutes];
  });
  measurements["receipts/caught-up#time_to_publish_minutes"] = publishMinutes.length > 0
    ? Number((sum(publishMinutes) / publishMinutes.length).toFixed(8))
    : null;
  // RELAY delivers whatever the desk produced, including a no_edition marker; a delivered
  // marker is a successful delivery, so this reads delivery status and not editionStatus.
  measurements["receipts/caught-up#delivery_success_rate"] = ratio(
    editions.filter((value) => value.status === "delivered").length,
    editions.length
  );

  // VAULT writes similarTo on every idea it compares, so an empty similarTo is a recorded
  // "nothing matched" rather than a missing check. The denominator is ideas proposed in the
  // quarter, dated from the first statusHistory entry rather than the id, because the id is
  // only a slug.
  const caughtUpIdeas = ideaLedger
    .map((value) => IdeaLedgerEntrySchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((idea) => dateInPeriod(idea.statusHistory[0]?.at, periodStart, periodEnd));
  measurements["state/ideas/caught-up#novelty_rate"] = ratio(
    caughtUpIdeas.filter((idea) => idea.similarTo.length === 0).length,
    caughtUpIdeas.length
  );

  const publishedSocial = socialReceipts.map(record).filter((value): value is Record<string, unknown> => Boolean(value))
    .filter((value) => value.outcome === "published" && dateInPeriod(value.attemptedAt, periodStart, periodEnd));
  for (const venture of ["caught-up", "mma-files", "titty-tuesdays"] as const) {
    const count = publishedSocial.filter((receipt) => receipt.venture === venture).length;
    measurements[`receipts/social/${venture}#published_count`] = count;
    if (venture === "titty-tuesdays") measurements["receipts/social/titty-tuesdays#tuesday_published_count"] = count;
  }
  measurements["receipts/social#carousel_studio_render_rate"] = ratio(
    publishedSocial.filter((receipt) => receipt.rendererVersion === "carousel-studio-1").length,
    publishedSocial.length
  );

  const studioTemplates = studioTemplatesRaw
    .map((value) => CarouselTemplateSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);
  measurements["state/ventures/carousel-studio/templates#live_count"] =
    SEED_TEMPLATES.filter((template) => template.status === "live").length
    + studioTemplates.filter((template) => template.status === "live").length;
  measurements["state/ventures/carousel-studio/templates#passing_proposal_count"] = studioTemplates.filter((template) => template.status === "live").length;
  const deterministicSeed = SEED_TEMPLATES[0]!;
  const deterministicInput = {
    template: deterministicSeed,
    payload: fixturePayload(deterministicSeed, "cs"),
    brand: CAROUSEL_BRANDS["caught-up"],
    format: "instagram-square" as const
  };
  const firstRender = renderCarouselSvg(deterministicInput).map((slide) => slide.svgHash);
  const secondRender = renderCarouselSvg(deterministicInput).map((slide) => slide.svgHash);
  measurements["state/ventures/carousel-studio#determinism_check_green"] = JSON.stringify(firstRender) === JSON.stringify(secondRender) ? 1 : 0;

  /**
   * Every posted carousel carries a decision about slide 1, one way or the other.
   *
   * A gate-valid assignment and a logged `no-hook` fallback both count as covered: a fallback is
   * the correct outcome when nothing is eligible, and DNESKAi and MMA Files take it on every pack
   * until their libraries are written. What this measure exists to catch is the third state — a
   * post with no recorded decision at all, which means something rendered slide 1 outside the
   * brain. The ratio is over posts, so it stays at 1 while the magazines fall back and only moves
   * if a pack escapes the path.
   */
  const hookChannels = record(hookChannelsRaw);
  const hookPosts = Object.values((hookChannels?.channels ?? {}) as Record<string, unknown>)
    .flatMap((posts) => (Array.isArray(posts) ? posts : []))
    .map((post) => record(post))
    .filter((post): post is Record<string, unknown> => post !== null)
    .filter((post) => dateInPeriod(typeof post.date === "string" ? post.date : undefined, periodStart, periodEnd));
  const hookCovered = hookPosts.filter((post) =>
    (typeof post.hookId === "string" && post.hookId !== "none") || typeof post.fallback === "string");
  measurements["state/ventures/carousel-studio#hook_assignment_coverage"] =
    hookPosts.length === 0 ? 1 : hookCovered.length / hookPosts.length;
  const iteratedBrands = new Set(studioObservationsRaw.flatMap((value) => {
    const observation = record(value);
    if (!dateInPeriod(observation?.retrievedAt, periodStart, periodEnd) || !Array.isArray(observation?.appliesTo)) return [];
    return observation.appliesTo.filter((brand): brand is string => typeof brand === "string" && brand in CAROUSEL_BRANDS);
  }));
  measurements["state/ventures/carousel-studio/observations#brand_iteration_count"] = iteratedBrands.size;

  const sourceConfig = record(sourcesRaw);
  const sources = Array.isArray(sourceConfig?.sources) ? sourceConfig.sources.map(record).filter(Boolean) : [];
  // Sources that actually answered on the most recent production run, not sources someone
  // switched on in config. The old count read `enabled: true` flags, which is a statement about
  // intent that cannot fall when a feed goes down -- exactly the number a health KPI exists to
  // catch. The run's own scorecard already counts the ones that returned.
  const newestScoredRun = [...editionRuns]
    .filter((run) => run.quality?.metrics.successfulSources !== undefined)
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1);
  measurements["state/edition/runs#healthy_source_count"] =
    newestScoredRun?.quality?.metrics.successfulSources ?? null;

  const fighters = fighterRaw
    .map((value) => FighterRecordSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);
  const activeFighters = fighters.filter((fighter) => fighter.organizationHistory.at(-1)?.status === "active");
  const rosterStatus = record(rosterStatusRaw);
  const organizations = record(rosterStatus?.organizations);
  const rosterCounts = ["ufc", "oktagon"].map((org) => record(organizations?.[org]));
  const activeRosterCount = rosterCounts.every(Boolean)
    ? rosterCounts.reduce((total, counts) => total + (typeof counts?.active === "number" ? counts.active : 0), 0)
    : 0;
  const unknownRosterCount = rosterCounts.every(Boolean)
    ? rosterCounts.reduce((total, counts) => total + (typeof counts?.unknown === "number" ? counts.unknown : 0), 0)
    : 1;
  // Coverage counts unclassified fighters in the denominator. The previous denominator was
  // `activeRosterCount` alone, which excludes them, so a partly-reviewed roster reported
  // INFLATED coverage - it could read 100% while half the roster was unclassified. Guarding
  // that by reporting null kept the number honest but made the venture holding the most real
  // data report nothing until the last fighter was confirmed. Dividing by the full known
  // population is strictly conservative: it can only under-report, never over-report, and it
  // rises as unknowns are resolved. Still null when no roster has been reviewed at all, since
  // there is then no population to measure against.
  const knownRosterCount = activeRosterCount + unknownRosterCount;
  const rosterReviewed = rosterCounts.every(Boolean) && knownRosterCount > 0;
  measurements["state/mma/fighters#active_roster_coverage_rate"] = rosterReviewed
    ? Math.min(1, activeFighters.length / knownRosterCount)
    : null;
  measurements["state/mma/fighters#average_completeness"] = rosterReviewed && activeFighters.length > 0
    ? Number((sum(activeFighters.map((fighter) => fighter.completeness)) * 100 / activeFighters.length).toFixed(8))
    : null;

  const bouts = boutRaw
    .map((value) => BoutRecordSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);
  const quarterBouts = bouts.filter((bout) => dateInPeriod(bout.event.startsAtUtc, periodStart, quarterEnd));
  const covered = quarterBouts.filter((bout) => ["confirmed", "weigh-in", "completed"].includes(bout.status));
  measurements["stats/fightaiq#prediction_coverage_rate"] = ratio(
    covered.filter((bout) => bout.predictionRefs.length > 0).length,
    covered.length
  );
  const eventFighterIds = new Set(quarterBouts.flatMap((bout) => [bout.fighters.red, bout.fighters.blue]));
  const eventFighters = fighters.filter((fighter) => eventFighterIds.has(fighter.id));
  measurements["state/mma/fighters#quarter_event_minimum_completeness"] = eventFighterIds.size > 0 && eventFighters.length === eventFighterIds.size
    ? Math.min(...eventFighters.map((fighter) => fighter.completeness * 100))
    : null;
  const announcedEventRefs = new Set(
    quarterBouts
      .filter((bout) => ["announced", "confirmed", "weigh-in", "completed"].includes(bout.status))
      .map((bout) => bout.event.ref)
  );
  const renderedEventRefs = new Set(
    eventRaw
      .map((value) => EventCardSchema.safeParse(value))
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter((event) => dateInPeriod(event.startsAtUtc, periodStart, quarterEnd))
      .map((event) => event.id)
  );
  measurements["state/mma/events#announced_event_coverage_rate"] = announcedEventRefs.size > 0
    ? ratio([...announcedEventRefs].filter((eventRef) => renderedEventRefs.has(eventRef)).length, announcedEventRefs.size)
    : null;
  const evaluation = record(evaluationRaw);
  const eventsEvaluated = typeof evaluation?.eventsEvaluated === "number" && evaluation.eventsEvaluated >= 0
    ? evaluation.eventsEvaluated
    : null;
  measurements["stats/fightaiq#fully_evaluated_events"] = eventsEvaluated;
  const calibrationReports = await jsonFiles(path.join(input.stateRoot, "mma", "evaluation", "calibration"));
  measurements["state/mma/evaluation#monthly_calibration_reports"] = calibrationReports.length;

  const plans = plansRaw.map((value) => MarketingPlanSchema.safeParse(value)).filter((result) => result.success).map((result) => result.data);
  const launchReadyCampaigns = plans.filter((plan) => plan.tactics.length > 0 && plan.calendar.length > 0 && plan.audienceRefs.length > 0).length;
  measurements["state/ventures/titty-tuesdays/campaigns#launch_ready_count"] = launchReadyCampaigns;

  const agendas = record(agendaRaw);
  const agendaList = Array.isArray(agendas?.agendas) ? agendas.agendas.map(record).filter(Boolean) : [];
  const consumed = agendaList.filter((agenda) => agenda?.status === "consumed");
  // The list right above it was computed and thrown away, so this read 0 against a target of 20
  // for the whole quarter -- permanently off-track while four agendas had in fact been consumed.
  measurements["state/meeting-agendas#quarterly_review_consumed_count"] = consumed.length;
  const closedStarvation = agendaList.filter((agenda) => ["consumed", "expired"].includes(String(agenda?.status)));
  measurements["state/meeting-agendas#starvation_resolution_rate"] = agendaList.length === 0
    ? 1
    : ratio(closedStarvation.length, agendaList.length);
  const priority = record(priorityRaw);
  const priorityItems = Array.isArray(priority?.items) ? priority.items.map(record).filter(Boolean) : [];
  measurements["state/priority-queue.json#missing_decision_count"] = priorityItems.filter((item) =>
    typeof item?.decision_at_stake !== "string" || !item.decision_at_stake.trim()
  ).length;

  // --- What the owner manages by, all computable from state already on disk ---

  /**
   * Days elapsed in the quarter so far, at least one, as the denominator of a reliability rate.
   *
   * "Elapsed" and not "the whole quarter": a magazine that has published every day of its first
   * week is at 1.00, not at a twelfth of the way to it.
   */
  const elapsedDays = Math.max(
    1,
    Math.floor(
      (Date.parse(`${periodEnd}T00:00:00.000Z`) - Date.parse(`${periodStart}T00:00:00.000Z`)) / DAY_MS
    ) + 1
  );

  // A day counts when the reader got something: an edition, or an honest record saying there
  // wasn't one. That is the contract every terminal day now ends with, so this is the measure of
  // whether it holds -- not of how many articles were written.
  const editionDays = new Set(
    editionDeliveries
      .map(record)
      .filter((receipt) =>
        receipt?.status === "delivered"
        && typeof receipt.date === "string"
        && dateInPeriod(receipt.date, periodStart, periodEnd))
      .map((receipt) => String(receipt!.date))
  );
  measurements["receipts/caught-up#delivery_reliability_rate"] = ratio(editionDays.size, elapsedDays);

  const mmaRunDays = new Set(
    mmaRunsRaw
      .map(record)
      .filter((run) =>
        run?.status === "published"
        && typeof run.date === "string"
        && dateInPeriod(run.date, periodStart, periodEnd))
      .map((run) => String(run!.date))
  );
  measurements["receipts/mma-files#delivery_reliability_rate"] = ratio(mmaRunDays.size, elapsedDays);

  // What one delivered unit costs, from the ledger phases that produce it. The all-in monthly
  // figure says whether the company is inside its limit; this says whether a unit is worth what
  // it costs, which is the question a per-unit target answers.
  const phaseSpend = (phases: readonly string[]) =>
    sum(periodBudget.filter((entry) => phases.includes(entry.phase)).map((entry) => entry.usd));
  measurements["state/budget#caught_up_cost_per_edition_usd"] = deliveredEditions > 0
    ? Number((phaseSpend(["cu-edition"]) / deliveredEditions).toFixed(8))
    : null;
  measurements["state/budget#mma_files_cost_per_article_usd"] = articles.length > 0
    ? Number(
        // "article-production" is the phase the article run bills under (mma-files/live.ts).
        // "article-am"/"article-pm" are calendar slot names and have never appeared in the
        // ledger, so naming them here dropped 58% of the numerator and reported an article as
        // costing $0.0302 when it cost $0.0724.
        (phaseSpend(["article-production", "mag-editorial", "mag-desk"]) / articles.length).toFixed(8)
      )
    : null;

  // Titty Tuesdays is measured on ideas recorded and ideas that went somewhere, because that is
  // the whole of what the venture currently produces: the room writes into the ledger and the
  // owner rates them in /admin. The social KPIs it used to carry cannot move for about a month.
  // The ledger is append-only: one line per status change, not one line per idea. Counting
  // lines meant an idea that advanced was counted twice — precisely the event advanced_count
  // exists to measure. Last line per id wins, which is the idea's current state.
  const tittyIdeas = [
    ...tittyTuesdaysIdeaLedger
      .map(record)
      .filter((idea): idea is Record<string, unknown> => Boolean(idea) && typeof idea?.id === "string")
      .reduce((latest, idea) => latest.set(String(idea.id), idea), new Map<string, Record<string, unknown>>())
      .values()
  ];
  const ideaProposedAt = (idea: Record<string, unknown>): unknown =>
    Array.isArray(idea.statusHistory) ? record(idea.statusHistory[0])?.at : idea.createdAt;
  const quarterIdeas = tittyIdeas.filter((idea) =>
    dateInPeriod(ideaProposedAt(idea), periodStart, periodEnd));
  measurements["state/ideas/titty-tuesdays#ideas_per_week"] = Number(
    (quarterIdeas.length / Math.max(1, elapsedDays / 7)).toFixed(8)
  );
  measurements["state/ideas/titty-tuesdays#advanced_count"] = quarterIdeas.filter((idea) =>
    typeof idea.status === "string" && idea.status !== "proposed").length;

  // GoVIRAL is measured on what the Monday room leaves behind: a brief, a snapshot, ideas on the
  // ledger and the agendas it hands to other desks. All four are files this repository already
  // holds, so every reading is a count of committed artifacts rather than an estimate.
  const goViralBriefs = goViralPlansRaw
    .map(record)
    .filter((plan) => plan?.ventureId === "goviral" && dateInPeriod(plan?.createdAt ?? plan?.generatedAt, periodStart, periodEnd));
  const weeksElapsed = Math.max(1, elapsedDays / 7);
  measurements["state/ventures/goviral/plans#weekly_brief_rate"] = Number((goViralBriefs.length / weeksElapsed).toFixed(8));
  measurements["state/goviral/trends#snapshot_rate"] = Number((goViralTrends.length / weeksElapsed).toFixed(8));
  const goViralIdeas = [
    ...goViralIdeaLedger
      .map(record)
      .filter((idea): idea is Record<string, unknown> => Boolean(idea) && typeof idea?.id === "string")
      .reduce((latest, idea) => latest.set(String(idea.id), idea), new Map<string, Record<string, unknown>>())
      .values()
  ].filter((idea) => dateInPeriod(ideaProposedAt(idea), periodStart, periodEnd));
  measurements["state/ideas/goviral#ideas_per_week"] = Number((goViralIdeas.length / weeksElapsed).toFixed(8));
  measurements["state/meeting-agendas#goviral_sourced_count"] = agendaList.filter((agenda) =>
    agenda?.sourcePhase === "gv-brief" && dateInPeriod(agenda?.requestedAt, periodStart, periodEnd)).length;

  // Every released article should carry a receipt for the deck that was rendered from it. The
  // engine renders at $0 and deterministically, so anything short of every article is a
  // pipeline that did not run rather than a budget that ran out.
  const deckReceiptSlugs = new Set(
    deckReceiptsRaw
      .map(record)
      .filter((receipt) => dateInPeriod(receipt?.date, periodStart, periodEnd))
      .map((receipt) => String(receipt?.slug ?? ""))
      .filter(Boolean)
  );
  const releasedSlugs = articles.map((article) => article.slug);
  measurements["receipts/carousel-studio#released_deck_rate"] = ratio(
    releasedSlugs.filter((slug) => deckReceiptSlugs.has(slug)).length,
    releasedSlugs.length
  );

  const stored = StoredMeasurementsSchema.safeParse(storedRaw);
  if (stored.success) {
    for (const [source, observation] of Object.entries(stored.data.values)) {
      const monetizationPageviewSource = /^state\/metrics\/phase-3\/(?:caught-up|mma-files)#pageviews_week_[0-3]$/u.test(source);
      if (!(source in measurements) && !monetizationPageviewSource) continue;
      if (source.startsWith("state/metrics/phase-3/") && !input.metricsIngestionEnabled) continue;
      measurements[source] = observation.value;
    }
  }

  const value = (source: string) => measurements[source];
  return {
    measurements,
    monetization: {
      caughtUpWeeklyPageviews: input.metricsIngestionEnabled
        ? [0, 1, 2, 3].map((offset) => value(`state/metrics/phase-3/caught-up#pageviews_week_${offset}`) ?? null)
        : undefined,
      caughtUpFollowers: input.metricsIngestionEnabled ? value("state/metrics/phase-3/caught-up#combined_followers") : null,
      mmaFilesIndexingEnabled: input.mmaFilesIndexingEnabled,
      mmaFilesWeeklyPageviews: input.metricsIngestionEnabled
        ? [0, 1, 2, 3].map((offset) => value(`state/metrics/phase-3/mma-files#pageviews_week_${offset}`) ?? null)
        : undefined,
      tittyTuesdaysCampaigns: launchReadyCampaigns,
      tittyTuesdaysFollowers: input.metricsIngestionEnabled ? value("state/metrics/phase-3/titty-tuesdays#combined_followers") : null,
      fightAiQEvaluatedEvents: eventsEvaluated,
      fightAiQCalibrationPublished: calibrationReports.length > 0
    }
  };
}
