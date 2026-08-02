import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { MarketingPlanSchema } from "../contracts/marketing-plan.js";
import { MeetingRecordSchema } from "../contracts/meeting-record.js";
import { ArticlePackageSchema, EditorialSlateSchema } from "../contracts/mma-files.js";
import { FighterRecordSchema } from "../contracts/mma.js";
import { CarouselTemplateSchema } from "../contracts/carousel-template.js";
import { NicheProposalSchema } from "../contracts/niche-proposal.js";
import { VentureRegistrySchema } from "../contracts/venture-registry.js";
import { configRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import { SEED_TEMPLATES } from "@boardlessai/carousel-studio";

export const AUTONOMY_SNAPSHOT_PATH = "autonomy/latest.json";

export interface CapabilitySignal {
  id: string;
  label: string;
  value: number;
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

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function signal(id: string, label: string, value: number, unit: CapabilitySignal["unit"], detail: string): CapabilitySignal {
  return { id, label, value, unit, detail };
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

export async function computeAutonomySnapshot(input: {
  repoRoot: string;
  stateRoot: string;
  now: Date;
}): Promise<AutonomySnapshot> {
  const registry = VentureRegistrySchema.parse(JSON.parse(await readFile(path.join(input.repoRoot, "config", "ventures.json"), "utf8")));
  const sourceConfig = JSON.parse(await readFile(path.join(input.repoRoot, "config", "sources.json"), "utf8")) as {
    sources?: Array<{ enabled?: unknown }>;
  };
  const [editionReceipts, articles, slates, fighters, plans, proposals, meetings, proofs, studioTemplates] = await Promise.all([
    files(path.join(input.stateRoot, "edition", "deliveries")).then(async (names) => Promise.all(names.map(async (file) => JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>))),
    validValues(path.join(input.stateRoot, "ventures", "mma-files", "articles"), ArticlePackageSchema),
    validValues(path.join(input.stateRoot, "ventures", "mma-files", "slates"), EditorialSlateSchema),
    validValues(path.join(input.stateRoot, "mma", "fighters"), FighterRecordSchema),
    validValues(path.join(input.stateRoot, "ventures", "titty-tuesdays", "plans"), MarketingPlanSchema),
    validValues(path.join(input.stateRoot, "ventures", "incubator", "niche-proposals"), NicheProposalSchema),
    validValues(path.join(input.stateRoot, "meetings"), MeetingRecordSchema),
    files(path.join(input.stateRoot, "release-proofs")).then(async (names) => Promise.all(names.map(async (file) => JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>))),
    studioTemplateFiles(path.join(input.stateRoot, "ventures", "carousel-studio", "templates"))
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

  const metricByComponent: Record<string, CapabilitySignal[]> = {
    "edition-cadence": [signal("edition-cadence", "Edition cadence", ratio(deliveredEditions, eligibleEditionDays), "ratio", `${deliveredEditions} delivered, ${failedEditions} failed; NO_EDITION is neutral.`)],
    "source-coverage": [signal("source-coverage", "Healthy source breadth", healthySources, "count", `${healthySources} enabled allowlisted sources.`)],
    "slot-fill": [signal("slot-fill", "Evidenced slot fill", ratio(publishedArticles.length, assignedSlots), "ratio", `${publishedArticles.length} published articles for ${assignedSlots} assigned slots.`)],
    "rendered-fightaiq-coverage": [signal("rendered-fightaiq-coverage", "FightAIQ files rendered", renderedFighterRefs.size, "count", `${renderedFighterRefs.size} distinct fighter references reached published articles.`)],
    "event-fighter-coverage": [signal("event-fighter-coverage", "Verified fighter files", fighters.length, "count", `${fighters.length} valid UFC or Oktagon fighter files.`)],
    "two-source-agreement": [signal("two-source-agreement", "Two-source agreement", ratio(corroboratedFields, allFighterFields), "ratio", `${corroboratedFields} of ${allFighterFields} fighter fields are corroborated.`)],
    "readiness-dossiers": [signal("readiness-dossiers", "Readiness dossiers", dossierCount, "count", `${dossierCount} completed-event review dossiers.`)],
    "campaign-inventory": [signal("campaign-inventory", "Launch-ready campaigns", completePlans, "count", `${completePlans} campaign plans pass the complete-plan checks.`)],
    "evidence-backed-proposals": [signal("evidence-backed-proposals", "Evidence-backed proposals", proposals.length, "count", `${proposals.length} valid incubator proposals.`)],
    // Carousel Studio declares this component in config/ventures.json and the registry
    // accepts it, but nothing implemented it, so the venture resolved to an empty signal
    // list while every other venture reported. Same predicate the quarterly collector uses.
    "live-template-library": [signal("live-template-library", "Live carousel templates", studioTemplates.filter((template) => template.status === "live").length, "count", `${studioTemplates.filter((template) => template.status === "live").length} templates passed every brand and format check.`)]
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
      signals: venture.growth_objective.components.flatMap((component) => metricByComponent[component] ?? [])
    })),
    quality: {
      killedSlotReasons,
      vetoRate: ratio(vetoes, meetings.length),
      firstPassRate: ratio(successfulProofs - retryProofs, proofs.length),
      retryRate: ratio(retryProofs, proofs.length),
      sourceAgreementRate: ratio(corroboratedFields, allFighterFields),
      verifierPassRate: ratio(successfulProofs, proofs.length)
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
