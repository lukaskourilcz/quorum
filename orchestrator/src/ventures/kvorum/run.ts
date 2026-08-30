import { readFile } from "node:fs/promises";
import { renderQueuedKvorumDecks } from "../../studio/deck-queue.js";
import path from "node:path";
import {
  BudgetError,
  BudgetLedgerEntrySchema,
  type BudgetLimits,
  type BudgetLedgerEntry
} from "../../budget.js";
import type { KvorumEntityLexicon } from "../../contracts/kvorum-entities.js";
import {
  type KvorumMonitorReceipt
} from "../../contracts/kvorum-monitor.js";
import type { MeetingAgenda } from "../../contracts/meeting-agenda.js";
import {
  TribunDeskEnvelopeSchema,
  type KvorumFollowUpRequest,
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
import { loadKvorumEntityLexicon } from "./entities.js";
import {
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
import { writeKvorumRecommendationDay } from "./store.js";
import {
  loadKvorumPerformanceWeights,
  type KvorumPerformanceWeights
} from "./performance.js";
import { loadLatestKvorumGoViralContext } from "./goviral.js";
import { applyKvorumAgendaEffects, loadDueKvorumAgenda } from "./agenda.js";
import {
  buildRankedKvorumReceipt,
  loadDryKvorumDeskSource,
  readKvorumRecommendationHistory,
  type KvorumDeskSource
} from "./inputs.js";

export { readKvorumRecommendationHistory } from "./inputs.js";

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
  agenda: MeetingAgenda | null;
  followUpRequest: KvorumFollowUpRequest | null;
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

async function gateCandidates(
  receipt: KvorumMonitorReceipt,
  candidates: readonly unknown[],
  entityLexicon: KvorumEntityLexicon,
  performanceWeights: KvorumPerformanceWeights
): Promise<Pick<KvorumDeskResult, "status" | "reason" | "packages" | "droppedPackages" | "gateEvaluations">> {
  const gated = evaluateKvorumPackages({
    receipt,
    candidates,
    duplicateThreshold: await loadKvorumDuplicateThreshold(),
    entityLexicon,
    performanceWeights
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
  let agenda: MeetingAgenda | null = null;
  let source: KvorumDeskSource;
  if (input.dry) {
    source = await loadDryKvorumDeskSource(input.date);
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
      return { date: input.date, dry: false, status: "paused", reason: `Waiting for ${closed.join(" and ")}.`, packages: [], tribunRan: false, spendUsd: 0, receipt: null, droppedPackages: 0, gateEvaluations: [], agenda: null, followUpRequest: null, artifacts: [] };
    }
    const ledger = (await readJson<{ entries: BudgetLedgerEntry[] }>(root, "budget/ledger.json", { entries: [] }))
      .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
    const monthSpend = ledger.filter((entry) => entry.ts.slice(0, 7) === input.date.slice(0, 7))
      .reduce((sum, entry) => sum + entry.usd, 0);
    const allows = input.scheduleAllows
      ? await input.scheduleAllows(monthSpend)
      : phaseEnabled(await loadEffectivePortfolioSchedule(monthSpend), KVORUM_DESK_PHASE);
    if (!allows) {
      return { date: input.date, dry: false, status: "paused", reason: "The effective portfolio schedule does not fund kv-desk.", packages: [], tribunRan: false, spendUsd: 0, receipt: null, droppedPackages: 0, gateEvaluations: [], agenda: null, followUpRequest: null, artifacts: [] };
    }
    agenda = await loadDueKvorumAgenda({ root, date: input.date, now: input.now });
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

  const [performanceWeights, trendContext] = await Promise.all([
    loadKvorumPerformanceWeights(input.dry ? stateRoot : root),
    loadLatestKvorumGoViralContext({ stateRoot: root, asOfDate: input.date })
  ]);
  const receipt = buildRankedKvorumReceipt({
    date: input.date,
    now: input.now,
    performanceWeights,
    trendContext,
    ...source
  });
  const artifacts = [...new Set([
    ...source.fetched.artifactPaths,
    ...await writeKvorumMonitorReceipt({ root, receipt, now: input.now })
  ])].sort();
  const eligible = receipt.ranks.filter((rank) => rank.score > 0);
  if (eligible.length === 0) {
    return { date: input.date, dry: input.dry, status: "quiet", reason: "No non-repeating corroborated cluster was eligible.", packages: [], tribunRan: false, spendUsd: 0, receipt, droppedPackages: 0, gateEvaluations: [], agenda, followUpRequest: null, artifacts };
  }
  if (input.dry) {
    const output = fixtureTribunOutput(receipt);
    const gated = output.outcome === "recommendations"
      ? await gateCandidates(receipt, output.packages, source.lexicon, performanceWeights)
      : { status: "quiet" as const, reason: output.reason, packages: [], droppedPackages: 0, gateEvaluations: [] };
    return {
      date: input.date,
      dry: true,
      ...gated,
      tribunRan: true,
      spendUsd: 0,
      receipt,
      agenda,
      followUpRequest: output.followUpRequest,
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
      input: buildKvorumDeskPacket(receipt, agenda),
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
      ? await gateCandidates(receipt, response.value.packages, source.lexicon, performanceWeights)
      : { status: "quiet" as const, reason: response.value.reason, packages: [], droppedPackages: 0, gateEvaluations: [] };
    return {
      date: input.date,
      dry: false,
      ...gated,
      tribunRan: true,
      spendUsd: response.usd,
      receipt,
      agenda,
      followUpRequest: response.value.followUpRequest,
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
      agenda,
      followUpRequest: null,
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

  /*
   * Draw whatever the owner has already approved, before asking whether the room may open.
   *
   * Approval happens in the admin and sets `designLab.status: "queued"`; the desk's gates govern
   * whether new recommendations may be *produced*, not whether an approved one may be drawn. Left
   * behind the pause, a deck the owner approved would wait on a countersignature that has nothing
   * to do with it. It costs nothing, calls no model, and on a day with no queued approval it does
   * nothing at all.
   */
  const deckRenders = input.dry ? [] : await renderQueuedKvorumDecks({ root, now: input.now });
  const deckArtifacts = deckRenders.flatMap((outcome) => outcome.artifacts);

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
      agenda: null,
      followUpRequest: null,
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
      return { ...result, artifacts: [...recorded.artifacts, ...deckArtifacts] };
    }
    return { ...result, artifacts: [...result.artifacts, ...deckArtifacts] };
  }

  let recommendationArtifacts: string[] = [];
  if ((result.status === "packages" || result.status === "quiet") && result.receipt) {
    try {
      const stored = await writeKvorumRecommendationDay({
        root,
        date: input.date,
        now: input.now,
        receipt: result.receipt,
        packages: result.packages,
        gateEvaluations: result.gateEvaluations
      });
      recommendationArtifacts = stored.artifacts;
    } catch (error) {
      result = {
        ...result,
        status: "failed",
        reason: `Recommendation store failed: ${error instanceof Error ? error.message : "unknown error"}`.slice(0, 500),
        packages: [],
        droppedPackages: 0,
        gateEvaluations: []
      };
    }
  }
  if (result.status === "paused") return result;

  const recordArtifacts = await writeKvorumDeskMeetingRecord({
    root,
    cycleId: input.cycleId,
    date: input.date,
    now: input.now,
    stage: input.stage,
    dry: input.dry,
    agenda: result.agenda,
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
  const agendaArtifacts = input.dry
    ? []
    : await applyKvorumAgendaEffects({
        root,
        cycleId: input.cycleId,
        date: input.date,
        now: input.now,
        result
      });
  return {
    ...result,
    artifacts: [...new Set([
      ...result.artifacts,
      ...recommendationArtifacts,
      ...recordArtifacts,
      ...agendaArtifacts,
      ...deckArtifacts
    ])]
  };
}
