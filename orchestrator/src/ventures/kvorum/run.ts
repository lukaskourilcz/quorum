import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  BudgetError,
  BudgetLedgerEntrySchema,
  type BudgetLimits,
  type BudgetLedgerEntry
} from "../../budget.js";
import { KvorumEntityLexiconSchema, type KvorumEntityLexicon } from "../../contracts/kvorum-entities.js";
import {
  KvorumMonitorItemSchema,
  KvorumMonitorReceiptSchema,
  type KvorumMonitorReceipt,
  type KvorumMonitorSourceResult
} from "../../contracts/kvorum-monitor.js";
import { VentureRecommendationSchema } from "../../contracts/venture-recommendation.js";
import {
  TribunDeskEnvelopeSchema,
  type KvorumPackageGateEvaluation,
  type TribunDeskEnvelope,
  type TribunPackage
} from "../../contracts/kvorum-desk.js";
import {
  guardedJsonCall,
  ModelOutputParseError,
  type GuardedCallInput
} from "../../llm/call.js";
import { loadFixedMonthlyUsd } from "../../money/fixed-costs.js";
import { configRoot, repoRoot, stateRoot } from "../../paths.js";
import { loadEffectivePortfolioSchedule, loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import {
  kvorumBudgetCapacityDecision,
  phaseEnabled,
  signedOwnerDecision
} from "../../portfolio/schedule.js";
import { readJson, readText } from "../../state.js";
import type { Stage } from "../../types.js";
import { remainingScheduledCycles } from "../../cycle/ledger.js";
import {
  clusterKvorumItems,
  rankKvorumClusters,
  type KvorumPriorRecommendation
} from "./cluster.js";
import { loadKvorumEntityLexicon } from "./entities.js";
import {
  buildKvorumMonitorReceipt,
  fetchKvorumMonitor,
  writeKvorumMonitorReceipt,
  type KvorumMonitorFetchResult
} from "./monitor.js";
import {
  TribunDeskOutputSchema,
  buildKvorumDeskPacket,
  fixtureTribunOutput,
  type TribunDeskOutput
} from "./desk-output.js";
import {
  evaluateKvorumPackages,
  loadKvorumDuplicateThreshold
} from "./gates.js";
import {
  writeKvorumDeskMeetingRecord,
  writeKvorumDeskSkip
} from "./record.js";

export {
  TribunDeskOutputSchema,
  buildKvorumDeskPacket,
  type TribunDeskOutput,
  type TribunPackage
} from "./desk-output.js";

export const KVORUM_DESK_PHASE = "kv-desk";

type KvorumGuardedCall = <T>(request: GuardedCallInput<T>) => Promise<{
  value: T;
  cached: boolean;
  usd: number;
}>;

export interface KvorumDeskResult {
  date: string;
  dry: boolean;
  status: "packages" | "quiet" | "paused" | "model-failed" | "failed";
  reason: string | null;
  packages: TribunPackage[];
  tribunRan: boolean;
  spendUsd: number;
  receipt: KvorumMonitorReceipt | null;
  droppedPackages: number;
  gateEvaluations: KvorumPackageGateEvaluation[];
  artifacts: string[];
}

export interface KvorumDeskInput {
  cycleId: string;
  dry: boolean;
  now: Date;
  date: string;
  stage: Stage;
  root?: string;
  env?: NodeJS.ProcessEnv;
  foundingDecisionRaw?: string;
  budgetCapacityDecisionRaw?: string;
  inbox?: string;
  token?: string;
  fetchMonitor?: typeof fetchKvorumMonitor;
  call?: KvorumGuardedCall;
  limits?: BudgetLimits;
  fixedMonthlyUsd?: number;
  scheduleAllows?: (monthApiSpentUsd: number) => Promise<boolean>;
}

async function dryMonitor(date: string): Promise<{
  fetched: KvorumMonitorFetchResult;
  lexicon: KvorumEntityLexicon;
  history: KvorumPriorRecommendation[];
}> {
  const [itemsRaw, historyRaw, lexiconRaw] = await Promise.all([
    readFile(path.join(repoRoot, "orchestrator/fixtures/kvorum/monitor-day.json"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/fixtures/kvorum/prior-recommendations.json"), "utf8"),
    readFile(path.join(configRoot, "kvorum-entities.json"), "utf8")
  ]);
  const items = (JSON.parse(itemsRaw) as unknown[]).map((item) => KvorumMonitorItemSchema.parse(item));
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.source.id, (counts.get(item.source.id) ?? 0) + 1);
  const sourceResults: KvorumMonitorSourceResult[] = [...counts].sort().map(([sourceId, count]) => ({
    sourceId,
    kind: sourceId === "stit-demokracie-facebook" ? "apify" : "feed",
    attempted: false,
    status: "fixture",
    count,
    reason: `Committed fixture rows for ${date}; no external source was contacted.`
  }));
  return {
    fetched: { items, sourceResults, artifactPaths: [], fixtureOnly: true },
    lexicon: KvorumEntityLexiconSchema.parse(JSON.parse(lexiconRaw) as unknown),
    history: JSON.parse(historyRaw) as KvorumPriorRecommendation[]
  };
}

export async function readKvorumRecommendationHistory(root: string): Promise<KvorumPriorRecommendation[]> {
  const directory = path.join(root, "ventures/kvorum/recommendations");
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const history: KvorumPriorRecommendation[] = [];
  for (const name of names.filter((entry) => /^\d{4}-\d{2}-\d{2}-.+\.json$/u.test(entry)).sort()) {
    const recommendation = VentureRecommendationSchema.parse(JSON.parse(
      await readFile(path.join(directory, name), "utf8")
    ) as unknown);
    if (recommendation.status === "rejected" || recommendation.evidence.kind !== "monitor-cluster") continue;
    const receipt = KvorumMonitorReceiptSchema.parse(await readJson<unknown>(
      root,
      recommendation.evidence.receiptRef.replace(/^state\//u, ""),
      null
    ));
    const cluster = receipt.clusters.find((candidate) => candidate.id === recommendation.evidence.clusterId);
    if (!cluster) throw new Error(`Recommendation ${recommendation.id} has no retained monitor cluster.`);
    history.push({
      recommendationId: recommendation.id,
      recommendedAt: recommendation.createdAt,
      entityIds: cluster.entityIds,
      topicTokens: cluster.topicTokens
    });
  }
  return history;
}

function rankedReceipt(input: {
  date: string;
  now: Date;
  fetched: KvorumMonitorFetchResult;
  lexicon: KvorumEntityLexicon;
  history: KvorumPriorRecommendation[];
}): KvorumMonitorReceipt {
  const labels = Object.fromEntries(input.lexicon.entities.map((entity) => [entity.id, entity.canonicalName]));
  const clusters = clusterKvorumItems(input.fetched.items, { entityLabels: labels });
  const ranked = rankKvorumClusters({
    clusters,
    items: input.fetched.items,
    lexicon: input.lexicon,
    priorRecommendations: input.history,
    now: input.now
  });
  return buildKvorumMonitorReceipt({
    date: input.date,
    now: input.now,
    fetched: input.fetched,
    clusters: ranked.clusters,
    ranks: ranked.ranks
  });
}

async function gateCandidates(
  receipt: KvorumMonitorReceipt,
  candidates: readonly unknown[],
  entityLexicon: KvorumEntityLexicon
): Promise<Pick<KvorumDeskResult, "status" | "reason" | "packages" | "droppedPackages" | "gateEvaluations">> {
  const gated = evaluateKvorumPackages({
    receipt,
    candidates,
    duplicateThreshold: await loadKvorumDuplicateThreshold(),
    entityLexicon
  });
  return {
    status: gated.accepted.length > 0 ? "packages" : "quiet",
    reason: gated.accepted.length > 0
      ? null
      : `All ${gated.droppedCount} candidate ${gated.droppedCount === 1 ? "package was" : "packages were"} dropped by deterministic gates.`,
    packages: gated.accepted,
    droppedPackages: gated.droppedCount,
    gateEvaluations: gated.evaluations
  };
}

async function executeKvorumDesk(input: KvorumDeskInput): Promise<KvorumDeskResult> {
  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp/dry-run/state") : stateRoot);
  let source: Awaited<ReturnType<typeof dryMonitor>>;
  if (input.dry) {
    source = await dryMonitor(input.date);
  } else {
    const [foundingRaw, capacityRaw, inbox] = await Promise.all([
      input.foundingDecisionRaw ?? readText(root, "decisions/2026-08-12-kvorum-founding.md"),
      input.budgetCapacityDecisionRaw ?? readText(root, "decisions/2026-08-12-kvorum-budget-capacity.md"),
      input.inbox ?? readText(root, "INBOX.md")
    ]);
    const closed = [
      ...((input.env ?? process.env).PORTFOLIO_LIVE_ENABLED !== "true" ? ["the portfolio live switch"] : []),
      ...(signedOwnerDecision(foundingRaw) !== "countersigned" ? ["the Kvórum founding decision"] : []),
      ...(kvorumBudgetCapacityDecision(capacityRaw) !== "countersigned" ? ["the Kvórum budget-capacity decision"] : [])
    ];
    if (closed.length > 0) {
      return { date: input.date, dry: false, status: "paused", reason: `Waiting for ${closed.join(" and ")}.`, packages: [], tribunRan: false, spendUsd: 0, receipt: null, droppedPackages: 0, gateEvaluations: [], artifacts: [] };
    }
    const ledger = (await readJson<{ entries: BudgetLedgerEntry[] }>(root, "budget/ledger.json", { entries: [] }))
      .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
    const monthSpend = ledger.filter((entry) => entry.ts.slice(0, 7) === input.date.slice(0, 7))
      .reduce((sum, entry) => sum + entry.usd, 0);
    const allows = input.scheduleAllows
      ? await input.scheduleAllows(monthSpend)
      : phaseEnabled(await loadEffectivePortfolioSchedule(monthSpend), KVORUM_DESK_PHASE);
    if (!allows) {
      return { date: input.date, dry: false, status: "paused", reason: "The effective portfolio schedule does not fund kv-desk.", packages: [], tribunRan: false, spendUsd: 0, receipt: null, droppedPackages: 0, gateEvaluations: [], artifacts: [] };
    }
    const fetched = await (input.fetchMonitor ?? fetchKvorumMonitor)({
      root,
      date: input.date,
      now: input.now,
      inbox,
      token: input.token ?? (input.env ?? process.env).APIFY_TOKEN,
      foundingDecisionRaw: foundingRaw,
      budgetCapacityDecisionRaw: capacityRaw
    });
    source = {
      fetched,
      lexicon: await loadKvorumEntityLexicon(),
      history: await readKvorumRecommendationHistory(root)
    };
  }

  const receipt = rankedReceipt({ date: input.date, now: input.now, ...source });
  const artifacts = [...new Set([
    ...source.fetched.artifactPaths,
    ...await writeKvorumMonitorReceipt({ root, receipt, now: input.now })
  ])].sort();
  const eligible = receipt.ranks.filter((rank) => rank.score > 0);
  if (eligible.length === 0) {
    return { date: input.date, dry: input.dry, status: "quiet", reason: "No non-repeating corroborated cluster was eligible.", packages: [], tribunRan: false, spendUsd: 0, receipt, droppedPackages: 0, gateEvaluations: [], artifacts };
  }
  if (input.dry) {
    const output = fixtureTribunOutput(receipt);
    const gated = output.outcome === "recommendations"
      ? await gateCandidates(receipt, output.packages, source.lexicon)
      : { status: "quiet" as const, reason: output.reason, packages: [], droppedPackages: 0, gateEvaluations: [] };
    return {
      date: input.date,
      dry: true,
      ...gated,
      tribunRan: true,
      spendUsd: 0,
      receipt,
      artifacts
    };
  }

  const [modelsRaw, tribunPrompt, craftPrompt, limits, fixedMonthlyUsd] = await Promise.all([
    readFile(path.join(configRoot, "models.json"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/prompts/kvorum/tribun.md"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/prompts/kvorum/craft.md"), "utf8"),
    input.limits ? Promise.resolve(input.limits) : loadRuntimeBudgetLimits(),
    input.fixedMonthlyUsd !== undefined
      ? Promise.resolve(input.fixedMonthlyUsd)
      : loadFixedMonthlyUsd(configRoot, input.now)
  ]);
  const models = JSON.parse(modelsRaw) as {
    roles: Record<string, { provider: "openai" | "anthropic"; model: string; maxOutputTokens: number }>;
  };
  const tribun = models.roles.TRIBUN;
  if (!tribun) throw new Error("config/models.json has no TRIBUN route");
  const ledger = (await readJson<{ entries: BudgetLedgerEntry[] }>(root, "budget/ledger.json", { entries: [] }))
    .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
  try {
    const response = await (input.call ?? guardedJsonCall)<TribunDeskEnvelope>({
      stateRoot: root,
      cycleId: input.cycleId,
      phase: KVORUM_DESK_PHASE,
      ventureId: "kvorum",
      agent: "TRIBUN",
      provider: tribun.provider,
      model: tribun.model,
      system: `${tribunPrompt}\n\n${craftPrompt}`,
      input: buildKvorumDeskPacket(receipt),
      maxOutputTokens: tribun.maxOutputTokens,
      budgetContext: {
        now: input.now,
        cycleId: input.cycleId,
        stage: input.stage,
        ledger,
        allInNonApiSpentUsd: fixedMonthlyUsd,
        allInCommittedUsd: 0,
        knownMonthlyForecastUsd: 0,
        remainingScheduledCycles: remainingScheduledCycles(input.now),
        limits
      },
      parse: (text) => TribunDeskEnvelopeSchema.parse(JSON.parse(text))
    });
    const gated = response.value.outcome === "recommendations"
      ? await gateCandidates(receipt, response.value.packages, source.lexicon)
      : { status: "quiet" as const, reason: response.value.reason, packages: [], droppedPackages: 0, gateEvaluations: [] };
    return {
      date: input.date,
      dry: false,
      ...gated,
      tribunRan: true,
      spendUsd: response.usd,
      receipt,
      artifacts
    };
  } catch (error) {
    if (error instanceof BudgetError) throw error;
    const cycleSpendBefore = ledger.filter((entry) => entry.cycleId === input.cycleId)
      .reduce((sum, entry) => sum + entry.usd, 0);
    const cycleSpendAfter = (await readJson<{ entries: BudgetLedgerEntry[] }>(root, "budget/ledger.json", { entries: [] }))
      .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry))
      .filter((entry) => entry.cycleId === input.cycleId)
      .reduce((sum, entry) => sum + entry.usd, 0);
    return {
      date: input.date,
      dry: false,
      status: "model-failed",
      reason: error instanceof Error ? error.message.slice(0, 500) : "TRIBUN failed.",
      packages: [],
      tribunRan: true,
      spendUsd: Number(Math.max(
        error instanceof ModelOutputParseError ? error.usd : 0,
        cycleSpendAfter - cycleSpendBefore
      ).toFixed(8)),
      receipt,
      droppedPackages: 0,
      gateEvaluations: [],
      artifacts
    };
  }
}

/**
 * Run the room and always leave the kind of record the room actually earned.
 *
 * A gate that closes before a scheduled room opens writes meeting-skip/1. Once the source step
 * starts, every productive, quiet or failed run writes meeting-record/2. Budget refusals are
 * deliberately rethrown: cycle.ts owns the shared budget-stop reason and exhaustion record.
 */
export async function runKvorumDesk(input: KvorumDeskInput): Promise<KvorumDeskResult> {
  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp/dry-run/state") : stateRoot);
  let result: KvorumDeskResult;
  try {
    result = await executeKvorumDesk(input);
  } catch (error) {
    if (error instanceof BudgetError) throw error;
    result = {
      date: input.date,
      dry: input.dry,
      status: "failed",
      reason: error instanceof Error ? error.message.slice(0, 500) : "The desk failed after opening.",
      packages: [],
      tribunRan: false,
      spendUsd: 0,
      receipt: null,
      droppedPackages: 0,
      gateEvaluations: [],
      artifacts: []
    };
  }

  if (result.status === "paused") {
    if (!input.dry && (input.env ?? process.env).MEETING_TRIGGER === "schedule") {
      const recorded = await writeKvorumDeskSkip({
        root,
        date: input.date,
        now: input.now,
        reason: `kv-desk did not open: ${result.reason ?? "a required gate was closed"}`
      });
      return { ...result, artifacts: recorded.artifacts };
    }
    return result;
  }

  const recordArtifacts = await writeKvorumDeskMeetingRecord({
    root,
    cycleId: input.cycleId,
    date: input.date,
    now: input.now,
    stage: input.stage,
    dry: input.dry,
    outcome: {
      status: result.status,
      reason: result.reason,
      packages: result.packages,
      tribunRan: result.tribunRan,
      spendUsd: result.spendUsd,
      hasMonitorReceipt: result.receipt !== null,
      droppedPackages: result.droppedPackages,
      gateEvaluations: result.gateEvaluations
    },
    ...(input.fixedMonthlyUsd !== undefined ? { fixedMonthlyUsd: input.fixedMonthlyUsd } : {})
  });
  return {
    ...result,
    artifacts: [...new Set([...result.artifacts, ...recordArtifacts])]
  };
}
