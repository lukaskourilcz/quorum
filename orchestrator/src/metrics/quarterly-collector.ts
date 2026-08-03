import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BudgetLedgerEntrySchema } from "../budget.js";
import { ReleaseProofSchema } from "../contracts/autonomy.js";
import { KpiSetSchema, type KpiSet } from "../contracts/kpi-set.js";
import { ArticlePackageSchema } from "../contracts/mma-files.js";
import { BoutRecordSchema, EventCardSchema, FighterRecordSchema } from "../contracts/mma.js";
import { MarketingPlanSchema } from "../contracts/marketing-plan.js";
import { NicheProposalSchema } from "../contracts/niche-proposal.js";
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
    proposalsRaw,
    foundingReceipts,
    incubatorRatings,
    agendaRaw,
    priorityRaw,
    calendars,
    sourcesRaw,
    storedRaw,
    studioTemplatesRaw,
    studioObservationsRaw
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
    jsonFiles(path.join(input.stateRoot, "ventures", "incubator", "niche-proposals")),
    jsonFiles(path.join(input.stateRoot, "ventures"), true),
    jsonLines(path.join(input.stateRoot, "ratings", "incubator", "ledger.jsonl")),
    jsonFile(path.join(input.stateRoot, "meeting-agendas", "queue.json")),
    jsonFile(path.join(input.stateRoot, "priority-queue.json")),
    jsonFiles(path.join(input.stateRoot, "calendar")),
    jsonFile(path.join(input.repoRoot, "config", "sources.json")),
    jsonFile(path.join(input.stateRoot, "metrics", "quarterly.json")),
    jsonFiles(path.join(input.stateRoot, "ventures", "carousel-studio", "templates"), true),
    jsonFiles(path.join(input.stateRoot, "ventures", "carousel-studio", "observations"))
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
  measurements["state/metrics/quarterly#maximum_monthly_all_in_usd"] = budget.success && fixed.success && fixed.data.costs.length > 0
    ? (apiByMonth.size ? Math.max(...apiByMonth.values()) : 0) + sum(fixed.data.costs.map((cost) => cost.monthly_usd))
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
  const deliveredEditions = editions.filter((value) =>
    value.status === "delivered"
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
  measurements["receipts/mma-files#complete_article_rate"] = articles.length > 0 ? 1 : null;
  measurements["receipts/delivery#content_units"] = deliveredEditions + articles.length;

  const quarterProofs = proofs.map(record).filter((value): value is Record<string, unknown> => Boolean(value))
    .filter((value) => dateInPeriod(value.completedAt, periodStart, periodEnd));
  measurements["receipts/delivery#pass_within_one_retry_rate"] = ratio(
    quarterProofs.filter((proof) => proof.status === "passed" && typeof proof.retryCount === "number" && proof.retryCount <= 1).length,
    quarterProofs.length
  );
  const caughtUpProofs = proofs
    .map((value) => ReleaseProofSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((proof) => proof.venture === "caught-up" && proof.status === "passed" && dateInPeriod(proof.completedAt, periodStart, periodEnd));
  // Only an editon that really served both pages counts. english-route is emitted solely when
  // the package carried an English half, so a Czech-only edition scores zero here rather than
  // borrowing a pass from a check that was never run. The measure stays honest; whether the
  // company still wants this KPI once Czech-only is deliberate is the owner's call, and it is
  // raised in state/INBOX.md rather than quietly rewritten here.
  measurements["receipts/caught-up#bilingual_hero_rate"] = deliveredEditions > 0 && caughtUpProofs.length > 0
    ? Math.min(1, caughtUpProofs.filter((proof) =>
        ["english-route", "czech-route", "hero-image"].every((name) => proof.checks.some((check) => check.name === name && check.status === "pass"))
      ).length / deliveredEditions)
    : null;

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
  const iteratedBrands = new Set(studioObservationsRaw.flatMap((value) => {
    const observation = record(value);
    if (!dateInPeriod(observation?.retrievedAt, periodStart, periodEnd) || !Array.isArray(observation?.appliesTo)) return [];
    return observation.appliesTo.filter((brand): brand is string => typeof brand === "string" && brand in CAROUSEL_BRANDS);
  }));
  measurements["state/ventures/carousel-studio/observations#brand_iteration_count"] = iteratedBrands.size;

  const sourceConfig = record(sourcesRaw);
  const sources = Array.isArray(sourceConfig?.sources) ? sourceConfig.sources.map(record).filter(Boolean) : [];
  measurements["state/sources#caught_up_healthy_count"] = sources.filter((source) => source?.enabled === true).length;

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
  const quarterBouts = bouts.filter((bout) => dateInPeriod(bout.event.startsAtUtc, periodStart, periodEnd));
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
      .filter((event) => dateInPeriod(event.startsAtUtc, periodStart, periodEnd))
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
  measurements["state/ventures/titty-tuesdays#commerce_readiness_dossier_complete"] = 0;
  const proposals = proposalsRaw.map((value) => NicheProposalSchema.safeParse(value)).filter((result) => result.success).map((result) => result.data);
  measurements["state/ventures/incubator/proposals#complete_count"] = proposals.length;
  measurements["state/ratings/incubator#rated_proposal_count"] = incubatorRatings.map(record).filter((rating) =>
    rating?.objectKind === "niche-proposal" && typeof rating?.rating === "string" && dateInPeriod(rating.ratedAt, periodStart, periodEnd)
  ).length;
  const templateFounded = foundingReceipts.map(record).some((receipt) =>
    receipt?.schemaVersion === "template-founding-receipt/1"
    && receipt.compliance === "passed"
    && dateInPeriod(receipt.foundedAt, periodStart, periodEnd)
  );
  const ratedProposalCount = measurements["state/ratings/incubator#rated_proposal_count"] ?? 0;
  measurements["state/metrics/quarterly#founding_or_two_rated_proposals"] = templateFounded || ratedProposalCount >= 2 ? 1 : 0;

  const agendas = record(agendaRaw);
  const agendaList = Array.isArray(agendas?.agendas) ? agendas.agendas.map(record).filter(Boolean) : [];
  const consumed = agendaList.filter((agenda) => agenda?.status === "consumed");
  measurements["state/meeting-agendas#quarterly_review_consumed_count"] = 0;
  const closedStarvation = agendaList.filter((agenda) => ["consumed", "expired"].includes(String(agenda?.status)));
  measurements["state/meeting-agendas#starvation_resolution_rate"] = agendaList.length === 0
    ? 1
    : ratio(closedStarvation.length, agendaList.length);
  const priority = record(priorityRaw);
  const priorityItems = Array.isArray(priority?.items) ? priority.items.map(record).filter(Boolean) : [];
  measurements["state/priority-queue.json#missing_decision_count"] = priorityItems.filter((item) =>
    typeof item?.decision_at_stake !== "string" || !item.decision_at_stake.trim()
  ).length;

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
