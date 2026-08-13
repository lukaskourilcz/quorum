import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { MarketingPlanSchema } from "../contracts/marketing-plan.js";
import { MeetingRecordSchema } from "../contracts/meeting-record.js";
import { ArticlePackageSchema, EditorialSlateSchema } from "../contracts/mma-files.js";
import { FighterRecordSchema } from "../contracts/mma.js";
import { CarouselTemplateSchema } from "../contracts/carousel-template.js";
import { VentureRegistrySchema } from "../contracts/venture-registry.js";
import { BhResearchLedgerEntrySchema } from "../contracts/bh-dossier.js";
import { TsResearchLedgerEntrySchema } from "../contracts/ts-research.js";
import { configRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import { SEED_TEMPLATES } from "@boardlessai/carousel-studio";

export const AUTONOMY_SNAPSHOT_PATH = "autonomy/latest.json";

export interface CapabilitySignal {
  id: string;
  label: string;
  value: number | null;
  unit: "count" | "ratio";
  detail: string;
}

export interface VentureGrowthSnapshot {
  venture: string;
  objective: string;
  signals: CapabilitySignal[];
}

export interface InternalQualitySnapshot {
  killedSlotReasons: Record<string, number>;
  vetoRate: number;
  firstPassRate: number;
  retryRate: number;
  sourceAgreementRate: number;
  verifierPassRate: number;
  /**
   * What each rate above was divided by.
   *
   * `ratio()` returns 0 for an empty denominator, which is the only sane number to store but is
   * indistinguishable from a real zero once written down: the admin printed "Releases that passed
   * 0%" on a day when nothing had been released at all. A reader needs the denominator to tell a
   * failure from an absence, so the snapshot records it rather than leaving it to be guessed.
   */
  denominators: {
    meetings: number;
    proofs: number;
    fighterFields: number;
  };
}

export interface AutonomySnapshot {
  schemaVersion: "autonomy-snapshot/1";
  generatedAt: string;
  metricsIngestionEnabled: false;
  growth: VentureGrowthSnapshot[];
  quality: InternalQualitySnapshot;
}

async function files(directory: string, suffix = ".json"): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter((name) => name.endsWith(suffix))
      .sort()
      .map((name) => path.join(directory, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function validValues<T>(directory: string, parser: { safeParse(value: unknown): { success: true; data: T } | { success: false } }): Promise<T[]> {
  const values: T[] = [];
  for (const file of await files(directory)) {
    try {
      const parsed = parser.safeParse(JSON.parse(await readFile(file, "utf8")));
      if (parsed.success) values.push(parsed.data);
    } catch {
      // An unreadable artifact is excluded. It never becomes a positive signal.
    }
  }
  return values;
}

async function validJsonLines<T>(
  file: string,
  parser: { safeParse(value: unknown): { success: true; data: T } | { success: false } }
): Promise<{ values: T[]; unreadable: number }> {
  let raw: string;
  try { raw = await readFile(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { values: [], unreadable: 0 };
    throw error;
  }
  const values: T[] = [];
  let unreadable = 0;
  for (const line of raw.split(/\r?\n/u).filter((entry) => entry.trim())) {
    try {
      const parsed = parser.safeParse(JSON.parse(line));
      if (parsed.success) values.push(parsed.data); else unreadable += 1;
    } catch { unreadable += 1; }
  }
  return { values, unreadable };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

/** One completed feature at most per completed cycle; retries cannot inflate cadence. */
export function evaluateFeatureCadence(input: {
  completedCycleIds: readonly string[];
  featuredCycleIds: readonly string[];
}): number | null {
  const completed = new Set(input.completedCycleIds);
  if (completed.size === 0) return null;
  const featured = new Set(input.featuredCycleIds.filter((cycleId) => completed.has(cycleId)));
  return ratioOrNull(featured.size, completed.size);
}

/** Paid dossiers that became features divided by paid dossiers, deduplicated by dossier id. */
export function evaluateResearchEfficiency(input: {
  paidDossierIds: readonly string[];
  usedDossierIds: readonly string[];
}): number | null {
  const paid = new Set(input.paidDossierIds);
  if (paid.size === 0) return null;
  const used = new Set(input.usedDossierIds.filter((dossierId) => paid.has(dossierId)));
  return ratioOrNull(used.size, paid.size);
}

function signal(id: string, label: string, value: number | null, unit: CapabilitySignal["unit"], detail: string): CapabilitySignal {
  return { id, label, value, unit, detail };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function doorMoneyActionCounts(root: string): Promise<{ completed: number; issued: number }> {
  let completed = 0;
  let issued = 0;
  for (const file of await files(root)) {
    const packet = await readFile(file, "utf8")
      .then((raw) => record(JSON.parse(raw)))
      .catch(() => null);
    if (packet?.schemaVersion !== "action-packet/1" || packet.ventureId !== "door-money" || !Array.isArray(packet.tasks)) {
      continue;
    }
    const tasks = packet.tasks.map(record);
    if (tasks.some((task) => !task || typeof task.id !== "string" || task.id.length === 0)) continue;
    issued += tasks.length;
    for (const task of tasks) {
      const completion = record(task?.completion);
      if (typeof completion?.completedAt === "string" && completion.completedAt.length > 0) completed += 1;
    }
  }
  return { completed, issued };
}

async function doorMoneyRecommendationCount(root: string): Promise<number> {
  let complete = 0;
  for (const file of await files(root)) {
    const recommendation = await readFile(file, "utf8")
      .then((raw) => record(JSON.parse(raw)))
      .catch(() => null);
    if (
      recommendation?.schemaVersion === "venture-recommendation/1" &&
      recommendation.ventureId === "door-money" &&
      typeof recommendation.id === "string" &&
      recommendation.id.length > 0
    ) complete += 1;
  }
  return complete;
}

function killedCategory(reason: string): string {
  const value = reason.toLowerCase();
  if (/source|evidence|file|complete/u.test(value)) return "evidence";
  if (/repeat|duplicate|fresh/u.test(value)) return "repetition";
  if (/style|language|copy|translation/u.test(value)) return "editorial";
  if (/budget|cost|spend/u.test(value)) return "budget";
  return "other";
}

/**
 * Live carousel templates, counted where the lifecycle actually writes them.
 *
 * processStudioContribution stores each accepted layout at templates/<id>/<version>.json, so
 * a flat readdir of the parent sees only directories and counts zero forever. The seed
 * library ships with the code rather than living in state, and the quarterly collector counts
 * it too, so the venture's signal and its KPI agree.
 */
async function studioTemplateFiles(directory: string): Promise<Array<{ status?: unknown }>> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const found: Array<{ status?: unknown }> = [];
  for (const entry of entries) {
    const child = path.join(directory, entry.name);
    const names = entry.isDirectory()
      ? (await readdir(child).catch(() => [])).map((name) => path.join(child, name))
      : [child];
    for (const file of names.filter((name) => name.endsWith(".json"))) {
      const parsed = CarouselTemplateSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
      if (parsed.success) found.push(parsed.data);
    }
  }
  return [...SEED_TEMPLATES, ...found];
}

/**
 * Complete marketingShark packages on disk, counted without importing the package schema.
 *
 * They nest two levels — `packages/<date>/<brand>/package.json` — which `files` does not walk, and
 * a shape check here rather than a zod parse keeps the autonomy snapshot from failing closed on a
 * single malformed day. Complete means what the growth objective claims: both carousels present
 * and a render recorded. A package missing either is not cadence, it is a half-finished morning.
 */
async function marketingSharkPackages(root: string): Promise<number> {
  const dates = await readdir(root, { withFileTypes: true }).catch(() => []);
  let complete = 0;
  for (const date of dates.filter((entry) => entry.isDirectory())) {
    const brands = await readdir(path.join(root, date.name), { withFileTypes: true }).catch(() => []);
    for (const brand of brands.filter((entry) => entry.isDirectory())) {
      const parsed = await readFile(path.join(root, date.name, brand.name, "package.json"), "utf8")
        .then((raw) => JSON.parse(raw) as Record<string, unknown>)
        .catch(() => null);
      const carousels = parsed?.carousels as { cs?: unknown; en?: unknown } | undefined;
      const render = parsed?.render as { summaryPaths?: unknown } | undefined;
      if (carousels?.cs && carousels.en && Array.isArray(render?.summaryPaths) && render.summaryPaths.length > 0) {
        complete += 1;
      }
    }
  }
  return complete;
}

/**
 * Recommendation approval is a cohort ratio, not an activity counter.
 *
 * A record remains one drafted recommendation after it moves out of `draft`; approved, posted and
 * archived records count in the numerator, while rejected records only count in the denominator.
 * Until the shared recommendation contract lands, the version and closed status are the smallest
 * conservative recognition boundary available. Unreadable and unfamiliar records never become a
 * positive signal. Most importantly, an empty directory is no evidence at all, so it yields null.
 */
async function recommendationApproval(directory: string, ventureId: string): Promise<{
  approved: number;
  drafted: number;
  value: number | null;
}> {
  const statuses = new Set(["draft", "approved", "posted", "archived", "rejected"]);
  let drafted = 0;
  let approved = 0;
  for (const file of await files(directory)) {
    const record = await readFile(file, "utf8")
      .then((raw) => JSON.parse(raw) as Record<string, unknown>)
      .catch(() => null);
    if (record?.schemaVersion !== "venture-recommendation/1" || record.ventureId !== ventureId || !statuses.has(String(record.status))) continue;
    drafted += 1;
    if (record.status === "approved" || record.status === "posted" || record.status === "archived") approved += 1;
  }
  return {
    approved,
    drafted,
    value: drafted === 0 ? null : ratio(approved, drafted)
  };
}

export async function computeAutonomySnapshot(input: {
  repoRoot: string;
  stateRoot: string;
  now: Date;
}): Promise<AutonomySnapshot> {
  const registry = VentureRegistrySchema.parse(JSON.parse(await readFile(path.join(input.repoRoot, "config", "ventures.json"), "utf8")));
  const sourceConfig = JSON.parse(await readFile(path.join(input.repoRoot, "config", "sources.json"), "utf8")) as {
    sources?: Array<{ enabled?: unknown }>;
  };
  const [editionReceipts, articles, slates, fighters, plans, meetings, proofs, studioTemplates, marketingSharkPackageCount, bhResearchLedger, tsResearchLedger, doorMoneyActions, doorMoneyRecommendationPackages, kvorumApproval] = await Promise.all([
    files(path.join(input.stateRoot, "edition", "deliveries")).then(async (names) => Promise.all(names.map(async (file) => JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>))),
    validValues(path.join(input.stateRoot, "ventures", "mma-files", "articles"), ArticlePackageSchema),
    validValues(path.join(input.stateRoot, "ventures", "mma-files", "slates"), EditorialSlateSchema),
    validValues(path.join(input.stateRoot, "mma", "fighters"), FighterRecordSchema),
    validValues(path.join(input.stateRoot, "ventures", "titty-tuesdays", "plans"), MarketingPlanSchema),
    validValues(path.join(input.stateRoot, "meetings"), MeetingRecordSchema),
    files(path.join(input.stateRoot, "release-proofs")).then(async (names) => Promise.all(names.map(async (file) => JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>))),
    studioTemplateFiles(path.join(input.stateRoot, "ventures", "carousel-studio", "templates")),
    marketingSharkPackages(path.join(input.stateRoot, "ventures", "marketingshark", "packages")),
    validJsonLines(path.join(input.stateRoot, "ventures", "booksofhistory", "research-ledger.jsonl"), BhResearchLedgerEntrySchema),
    validJsonLines(path.join(input.stateRoot, "ventures", "tehdejsi-svet", "research-ledger.jsonl"), TsResearchLedgerEntrySchema),
    doorMoneyActionCounts(path.join(input.stateRoot, "ventures", "door-money", "actions")),
    doorMoneyRecommendationCount(path.join(input.stateRoot, "ventures", "door-money", "recommendations")),
    recommendationApproval(path.join(input.stateRoot, "ventures", "kvorum", "recommendations"), "kvorum")
  ]);

  const deliveredEditions = editionReceipts.filter((receipt) => receipt.status === "delivered" && receipt.editionStatus === "edition").length;
  const failedEditions = editionReceipts.filter((receipt) => receipt.status === "needs_reconciliation").length;
  const eligibleEditionDays = deliveredEditions + failedEditions;
  const healthySources = sourceConfig.sources?.filter((source) => source.enabled === true).length ?? 0;
  const publishedArticles = articles.filter((article) => article.status === "published");
  const assignedSlots = slates.flatMap((slate) => slate.slots).filter((slot) => slot.status === "assigned").length;
  const renderedFighterRefs = new Set(publishedArticles.flatMap((article) => article.fighterRefs));
  const corroboratedFields = fighters.flatMap((fighter) => Object.values(fighter.fields)).filter((field) => field.corroborated).length;
  const allFighterFields = fighters.flatMap((fighter) => Object.values(fighter.fields)).length;
  const dossierCount = (await files(path.join(input.stateRoot, "mma", "readiness-dossiers"))).length;
  const completePlans = plans.filter((plan) => plan.tactics.length > 0 && plan.calendar.length > 0 && plan.audienceRefs.length > 0).length;
  const paidBhDossiers = new Set(bhResearchLedger.values.filter(({ costUsd }) => costUsd > 0).map(({ dossierRef }) => dossierRef));
  const usedBhDossiers = new Set(bhResearchLedger.values.filter(({ used, dossierRef }) => used && paidBhDossiers.has(dossierRef)).map(({ dossierRef }) => dossierRef));
  const researchEfficiency = evaluateResearchEfficiency({ paidDossierIds: [...paidBhDossiers], usedDossierIds: [...usedBhDossiers] });
  const unreadableBhLedgerDetail = bhResearchLedger.unreadable
    ? `; ${bhResearchLedger.unreadable} unreadable ledger ${bhResearchLedger.unreadable === 1 ? "line was" : "lines were"} excluded`
    : "";
  const paidTsResearch = new Set(tsResearchLedger.values
    .filter((entry) => entry.kind === "purchase" && entry.costUsd > 0)
    .map((entry) => `${entry.topicKey}:${entry.briefHash}`));
  const usedTsResearch = new Set(tsResearchLedger.values
    .filter((entry) => entry.kind === "use")
    .map((entry) => `${entry.topicKey}:${entry.briefHash}`)
    .filter((key) => paidTsResearch.has(key)));
  const tsResearchEfficiency = evaluateResearchEfficiency({
    paidDossierIds: [...paidTsResearch],
    usedDossierIds: [...usedTsResearch]
  });

  const metricByComponent: Record<string, CapabilitySignal[]> = {
    "edition-cadence": [signal("edition-cadence", "Edition cadence", ratio(deliveredEditions, eligibleEditionDays), "ratio", `${deliveredEditions} delivered, ${failedEditions} failed; NO_EDITION is neutral.`)],
    "source-coverage": [signal("source-coverage", "Healthy source breadth", healthySources, "count", `${healthySources} enabled allowlisted sources.`)],
    "slot-fill": [signal("slot-fill", "Evidenced slot fill", ratio(publishedArticles.length, assignedSlots), "ratio", `${publishedArticles.length} published articles for ${assignedSlots} assigned slots.`)],
    "rendered-fightaiq-coverage": [signal("rendered-fightaiq-coverage", "FightAIQ files rendered", renderedFighterRefs.size, "count", `${renderedFighterRefs.size} distinct fighter references reached published articles.`)],
    "event-fighter-coverage": [signal("event-fighter-coverage", "Verified fighter files", fighters.length, "count", `${fighters.length} valid UFC or Oktagon fighter files.`)],
    "two-source-agreement": [signal("two-source-agreement", "Two-source agreement", ratio(corroboratedFields, allFighterFields), "ratio", `${corroboratedFields} of ${allFighterFields} fighter fields are corroborated.`)],
    "readiness-dossiers": [signal("readiness-dossiers", "Readiness dossiers", dossierCount, "count", `${dossierCount} completed-event review dossiers.`)],
    "campaign-inventory": [signal("campaign-inventory", "Launch-ready campaigns", completePlans, "count", `${completePlans} campaign plans pass the complete-plan checks.`)],
    // Carousel Studio declares this component in config/ventures.json and the registry
    // accepts it, but nothing implemented it, so the venture resolved to an empty signal
    // list while every other venture reported. Same predicate the quarterly collector uses.
    "live-template-library": [signal("live-template-library", "Live carousel templates", studioTemplates.filter((template) => template.status === "live").length, "count", `${studioTemplates.filter((template) => template.status === "live").length} templates passed every brand and format check.`)],
    "package-cadence": [signal("package-cadence", "Drafted carousel packages", marketingSharkPackageCount, "count", `${marketingSharkPackageCount} packages carry both carousels and a recorded render.`)],
    // The cycle and dossier contracts arrive later in the founding sequence. Until their files
    // exist there is no denominator to infer, so the registry-visible signal is explicitly null.
    // BH-05/BH-20 feed these same exported evaluators from parsed state; no placeholder zero is
    // allowed to masquerade as a measured failure in the meantime.
    "feature-cadence": [signal("feature-cadence", "Features per completed cycle", evaluateFeatureCadence({ completedCycleIds: [], featuredCycleIds: [] }), "ratio", "No completed BOOKSOFHISTORY cycles are recorded yet.")],
    "research-efficiency": [signal(
      "research-efficiency",
      "Paid dossiers used",
      researchEfficiency,
      "ratio",
      paidBhDossiers.size === 0
        ? `No paid BOOKSOFHISTORY dossiers are recorded yet${unreadableBhLedgerDetail}.`
        : `${usedBhDossiers.size} of ${paidBhDossiers.size} paid dossiers became owner-posted features${unreadableBhLedgerDetail}.`
    )],
    "action-completion": [signal(
      "action-completion",
      "Owner action completion",
      doorMoneyActions.issued === 0 ? null : Number((doorMoneyActions.completed / doorMoneyActions.issued).toFixed(4)),
      "ratio",
      doorMoneyActions.issued === 0
        ? "No owner actions have been issued; completion is not measured."
        : `${doorMoneyActions.completed} of ${doorMoneyActions.issued} issued owner actions are recorded complete.`
    )]
  };
  const metricsFor = (ventureId: string, component: string): CapabilitySignal[] => {
    if (ventureId === "door-money" && component === "package-cadence") {
      return [signal(
        "package-cadence",
        "Draft recommendation packages",
        doorMoneyRecommendationPackages,
        "count",
        `${doorMoneyRecommendationPackages} complete evidence-linked recommendation packages were recorded.`
      )];
    }
    if (ventureId === "tehdejsi-svet" && component === "feature-cadence") {
      return [signal("feature-cadence", "Features per completed cycle", null, "ratio", "No completed Tehdejsi svet cycles are recorded yet.")];
    }
    if (ventureId === "tehdejsi-svet" && component === "research-efficiency") {
      const unreadable = tsResearchLedger.unreadable
        ? `; ${tsResearchLedger.unreadable} unreadable ledger ${tsResearchLedger.unreadable === 1 ? "line was" : "lines were"} excluded`
        : "";
      return [signal(
        "research-efficiency",
        "Paid briefs used",
        tsResearchEfficiency,
        "ratio",
        paidTsResearch.size === 0
          ? `No paid Tehdejsi svet briefs are recorded yet${unreadable}.`
          : `${usedTsResearch.size} of ${paidTsResearch.size} paid briefs supported recorded recommendations${unreadable}.`
      )];
    }
    if (ventureId === "kvorum" && component === "recommendation-approval") {
      return [signal(
        "recommendation-approval",
        "Recommendation approval",
        kvorumApproval.value,
        "ratio",
        kvorumApproval.drafted === 0
          ? "No Kvórum recommendations are recorded; approval is not measured."
          : `${kvorumApproval.approved} of ${kvorumApproval.drafted} recorded recommendations were owner-approved.`
      )];
    }
    return metricByComponent[component] ?? [];
  };

  const killedSlotReasons: Record<string, number> = {};
  for (const slot of slates.flatMap((slate) => slate.slots).filter((slot) => slot.status === "killed")) {
    const category = killedCategory(slot.killedReason ?? "other");
    killedSlotReasons[category] = (killedSlotReasons[category] ?? 0) + 1;
  }
  const vetoes = meetings.filter((meeting) => meeting.decision.outcome === "VETO" || meeting.roomTranscript.turns.some((turn) => turn.mode === "veto")).length;
  const successfulProofs = proofs.filter((proof) => proof.status === "passed").length;
  const retryProofs = proofs.filter((proof) => typeof proof.retryCount === "number" && proof.retryCount > 0).length;

  return {
    schemaVersion: "autonomy-snapshot/1",
    generatedAt: input.now.toISOString(),
    metricsIngestionEnabled: false,
    growth: registry.ventures.map((venture) => ({
      venture: venture.id,
      objective: venture.growth_objective.label,
      signals: venture.growth_objective.components.flatMap((component) => metricsFor(venture.id, component))
    })),
    quality: {
      killedSlotReasons,
      vetoRate: ratio(vetoes, meetings.length),
      firstPassRate: ratio(successfulProofs - retryProofs, proofs.length),
      retryRate: ratio(retryProofs, proofs.length),
      sourceAgreementRate: ratio(corroboratedFields, allFighterFields),
      verifierPassRate: ratio(successfulProofs, proofs.length),
      denominators: {
        meetings: meetings.length,
        proofs: proofs.length,
        fighterFields: allFighterFields
      }
    }
  };
}

export async function refreshAutonomySnapshot(input: {
  repoRoot: string;
  stateRoot: string;
  now: Date;
}): Promise<AutonomySnapshot> {
  const snapshot = await computeAutonomySnapshot(input);
  await atomicWriteJson(input.stateRoot, AUTONOMY_SNAPSHOT_PATH, snapshot);
  return snapshot;
}

export async function refreshRepositoryAutonomySnapshot(stateRoot: string, now = new Date()): Promise<AutonomySnapshot> {
  return refreshAutonomySnapshot({ repoRoot: path.dirname(configRoot), stateRoot, now });
}
