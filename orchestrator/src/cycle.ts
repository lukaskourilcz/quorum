import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  BudgetError,
  DEFAULT_BUDGET_LIMITS,
  budgetStopReason,
  dailyBudgetStatus,
  estimateTextCall,
  type BudgetLedgerEntry,
  type BudgetLimits,
  type ReserveContext
} from "./budget.js";
import { loadRoutingConfig, routeBoardroom } from "./boardroom/router.js";
import { configRoot, repoRoot, stateRoot } from "./paths.js";
import {
  parseEvidenceJsonl
} from "./research/evidence.js";
import {
  OpportunitySchema,
  selectOpportunity,
  type OpportunityGate
} from "./research/opportunities.js";
import { atomicWriteJson, readJson, readText, withFileLock } from "./state.js";
import {
  buildCalendarFeed,
  loadArticleSlotOutcomes, loadMeetingRecords, loadMeetingSkips,
  mondayOfWeek,
  writeCalendarFeed
} from "./meetings/calendar.js";
import { isCaughtUpPhase, isPortfolioPhase } from "./meetings/clock.js";
import { EDITION_RETRY_HOUR, EDITION_RETRY_PHASE, pragueClockParts } from "./meetings/clock.js";
import {
  MEETING_AGENDA_PATH,
  loadMeetingPolicy,
  mayRequestMeeting,
  nextAgendaDate,
  phaseNeedsAgenda,
  readMeetingAgendaQueue,
  requestMeetingAgenda,
  starvationList,
  type MeetingPolicy
} from "./meetings/agenda.js";
import {
  createLiveEditionMeeting,
  createLiveProductMeeting,
  createOfflineCaughtUpMeeting,
  meetingRef
} from "./meetings/record.js";
import { appendEditionUsage, runLiveEdition } from "./edition/live.js";
import {
  GuardedVaultAdjudicator,
  PRODUCT_ROOM_RESERVE_USD,
  decideLiveProductRoom,
  prepareMorningIdea,
  toIdeaRoomVerdict
} from "./ideas/live.js";
import {
  CAUGHT_UP_IDEA_NAMESPACE,
  GLOBAL_IDEA_NAMESPACE,
  applyIdeaRoomVerdict,
  currentIdeaEntries,
  ensureIdeaInNamespace,
  ideaIndexPath,
  ideaLedgerPath,
  readIdeaLedger,
  readIdeaIndexSlice,
  regenerateIdeaIndex,
  screenAndRecordIdea,
  screeningWord
} from "./ideas/ledger.js";
import { buildOperationsPacket } from "./operations/packet.js";
import { resolveOperationsReview, writeOperationsDecision } from "./operations/review.js";
import { resolveRotationTarget } from "./operations/rotation.js";
import { MeetingRecordSchema } from "./contracts/meeting-record.js";
import {
  composeEditionSocialPack,
  recordMissingSocialPackConfiguration,
  recordSocialPackFailure
} from "./social/pack.js";
import { socialChannelsEnabled, socialContentGenerationEnabled } from "./social/activation.js";
import {
  COUNCIL_SEATS,
  collectLiveCouncil,
  createLiveStandup,
  type RecordedPosition
} from "./standup/live.js";
import { publicStandup } from "./standup/public.js";
import { createOfflineStandup } from "./standup/run.js";
import { StandupSchema, type Standup } from "./standup/schema.js";
import {
  getShiftDefinition,
  isShiftPhase
} from "./shifts.js";
import {
  composeMeetingRouteDefinition,
  getVentureMeetingDefinition,
  loadVentureRegistry,
  parseCadenceHour,
  ventureNamespace,
  type VentureMeetingDefinition
} from "./ventures/registry.js";
import type { VentureRegistry } from "./contracts/venture-registry.js";
import type { PriorityItem } from "./contracts/autonomy.js";
import {
  caughtUpSocialProductionEnabled,
  disabledAgentsForVenture,
  enabledAgentsForVenture,
  loadVentureAgentControls
} from "./ventures/agent-controls.js";
import { ScheduledPhaseSchema, type RunnablePhase, type Stage } from "./types.js";
import { findSlotRecord } from "./meetings/slot-record.js";
import { recordBudgetStop, runPortfolioCycle } from "./portfolio/run.js";
import { runMarketingSharkCycle } from "./ventures/marketingshark/run.js";
import { runBooksofHistoryCycle } from "./ventures/booksofhistory/run.js";
import { runTehdejsiSvetCycle } from "./ventures/tehdejsi-svet/run.js";
import { runDryArticleProduction } from "./mma-files/dry-run.js";
import {
  recordClosedArticleSlot,
  runLiveArticleProduction,
  type ClosedArticleSlotReason
} from "./mma-files/live.js";
import { signedOwnerDecision } from "./portfolio/schedule.js";
import { AUTONOMY_SNAPSHOT_PATH, refreshAutonomySnapshot } from "./autonomy/signals.js";
import { ensurePriorityItem, livePriorityItems, openPriorityItems, proposePriorityItem, readPriorityQueue, selectPriorityItem, skipPriorityItem, PriorityProposalRefused, PRIORITY_QUEUE_PATH } from "./priority/queue.js";
import { runDailyMoneyAndKpis } from "./money/daily.js";
import { loadFixedMonthlyUsd } from "./money/fixed-costs.js";
import { loadEffectivePortfolioSchedule, loadRuntimeBudgetLimits, tightenedBy } from "./portfolio/limits.js";
import { refreshEcosystemOperatingTruth } from "./docs/ecosystem.js";
import { imageProgramReadiness, type ImageProgramReadiness } from "./images/readiness.js";
import { contentGateEnabled, runContentGate } from "./quality/content-gate.js";
import { writeMonthlyReportIfDue, writeWeeklyReportIfDue } from "./reports/writers.js";
import { RETRO_ENVELOPE_USD, runWeeklyRetro, weeklyRetroEnabled } from "./reports/retro.js";
import { collectOwnerAttention } from "./org/owner-attention.js";



/*
 * The commission gate lives in `cycle/commissions.ts` now.
 *
 * Re-exported from here because `runCycle`'s callers and the tests import these names from this
 * module, and the extraction was a move rather than a redesign — changing every import path would
 * have made a pure move look like a rewrite.
 */
export {
  hasDeliveredPublishedEdition,
  type CycleOptions,
  type CycleResult
} from "./cycle/types.js";
import { hasDeliveredPublishedEdition } from "./cycle/types.js";
import type { CycleOptions, CycleResult } from "./cycle/types.js";
import {
  runCaughtUpDryCycle,
  runCaughtUpLiveEditionCycle,
  runCaughtUpLiveProductCycle
} from "./cycle/caught-up.js";
import {
  budgetLimitsFromEnvironment,
  currentBudgetLedger,
  exists,
  ledgerSpend,
  monthToDateLedger,
  previousPragueDate,
  remainingScheduledCycles,
  yesterdayEditionOutcome
} from "./cycle/ledger.js";
import {
  manualEditionOverride,
  publishableReason,
  resolveMorningCommissions,
  resolvePriorityProposal,
  schedulerBlockedReason
} from "./cycle/commissions.js";

export {
  councilVoteGate,
  manualEditionOverride,
  publishableReason,
  resolveMorningCommission,
  resolveMorningCommissions,
  resolvePriorityProposal,
  schedulerBlockedReason,
  type MorningCommission
} from "./cycle/commissions.js";




/**
 * Run one live phase and, if a cap refuses it, end the day quietly instead of exiting 1.
 *
 * Every runner below reserves before it calls a provider, so a BudgetError arriving here means
 * the refused call was never made and never billed. It used to travel out of runCycle, out of
 * index.ts and out of the process: the job exited 1 and the workflow's failure step wrote "The
 * run for this meeting failed before it finished" onto the slot. From today fourteen active
 * phases reserve about $1.74 against the $1.00 daily cap, so that sentence would have been the
 * headline on most of the afternoon. The cap, the reservation and the refusal are unchanged —
 * only what the run does afterwards is: it records the reason, leaves a "Skipped" slot, and
 * exits 0.
 *
 * Anything that is not a BudgetError still propagates. A real failure must still be a failure.
 */
export async function quietWhenBudgetStops(
  input: { phase: RunnablePhase; cycleId: string; now: Date; root: string },
  run: () => Promise<CycleResult>
): Promise<CycleResult> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof BudgetError)) throw error;
    const date = pragueClockParts(input.now).date;
    // loadRuntimeBudgetLimits is the one resolver for the enforced caps. Reading the day's
    // figures from it rather than restating them means the reason can never quote an amount
    // the runtime does not enforce.
    const [ledger, limits] = await Promise.all([
      currentBudgetLedger(input.root),
      loadRuntimeBudgetLimits()
    ]);
    const artifacts = await recordBudgetStop({
      phase: input.phase,
      date,
      now: input.now,
      root: input.root,
      reason: budgetStopReason({
        phase: input.phase,
        status: dailyBudgetStatus(ledger, input.now, limits),
        reservationUsd: null,
        code: error.code
      }),
      dailyCapReached: error.code === "DAILY_CAP"
    });
    return {
      cycleId: input.cycleId,
      phase: input.phase,
      dry: false,
      status: "paused",
      decision: "NO_ACTION",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [],
      artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(input.root, artifact)))
    };
  }
}

export async function runCycle(options: CycleOptions): Promise<CycleResult> {
  const now = options.now ?? new Date();
  const cycleId = `${now.toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}-${options.phase}`;
  if (await exists(path.join(stateRoot, "PAUSED"))) {
    return {
      cycleId,
      phase: options.phase,
      dry: options.dry,
      status: "paused",
      decision: "PAUSED",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [],
      artifacts: []
    };
  }
  if (!options.dry && options.phase === "founding") {
    throw new Error("A live founding cycle is not permitted; Caught Up was adopted by owner decision");
  }
  // Two schedules now reach for the same slot: GitHub's `schedule` trigger and the Vercel cron
  // that dispatches this workflow punctually. Both will exist through the transition, so a slot
  // can be fired for twice — two paid councils, two records, a day that reads as if the meeting
  // happened twice. This is where that stops, before any provider is called.
  //
  // What makes it un-raceable is not this read. It is `concurrency: guarded-cycle-<ref>` with
  // `cancel-in-progress: false` in cycle.yml: GitHub grants that group to one run at a time and
  // grants it BEFORE the job's first step, so the second run's `actions/checkout` happens after
  // the first has committed and pushed its record.
  //
  // This read sees the checkout and only the checkout, which is `github.sha` — fixed when the run
  // was created, not when it started. A firing that sat in a queue can therefore be looking at a
  // tree from before the other schedule committed. cycle.yml asks the same question of the branch
  // tip as well, before it gets this far, which is what covers that case; this is the layer that
  // covers every other caller — a local `pnpm cycle`, a future workflow — and the one that
  // guarantees no provider is called even if the step above is bypassed.
  //
  // What neither layer covers, stated rather than implied:
  //   - A run in flight. No record exists until the run commits, so two firings that somehow
  //     execute concurrently both see nothing. Only the concurrency group prevents that, and
  //     only for runs in the same group — a job run outside this workflow is not covered.
  //   - A first run that produced no record: one that failed before writing, or whose push was
  //     dropped after three retries. The second firing then correctly holds the meeting.
  //   - Anything but the current Prague day. Yesterday's record never blocks today's slot.
  //   - Manual work. The gate is MEETING_TRIGGER, so only a firing that claims a slot is
  //     stopped; an owner dispatching a phase deliberately still gets the run they asked for.
  //   - The edition slot's same-day retry, which is a second firing of cu-edition on purpose.
  //     Every delivered edition except 6 August needed a second run and every second run that
  //     ran succeeded, so EDITION_RETRY_HOUR exists to give the day one more attempt. The 05:00
  //     firing always leaves a meeting record, so this guard would refuse the retry before it
  //     could read anything; hasDeliveredPublishedEdition is what decides instead, and a morning
  //     that already published costs $0 and writes nothing.
  const scheduledPhase = ScheduledPhaseSchema.safeParse(options.phase);
  const editionRetry = scheduledPhase.success
    && scheduledPhase.data === EDITION_RETRY_PHASE
    && pragueClockParts(now).hour === EDITION_RETRY_HOUR;
  if (!options.dry && !editionRetry && scheduledPhase.success && process.env.MEETING_TRIGGER === "schedule") {
    const recorded = await findSlotRecord(stateRoot, scheduledPhase.data, now);
    // A no-op, not a failure. A second firing for a slot that already ran is the transition
    // working, so it exits the way a healthy run does and says what it found.
    if (recorded) {
      return {
        cycleId,
        phase: options.phase,
        dry: false,
        status: "already_recorded",
        decision: "NO_ACTION",
        estimatedWorstCaseUsd: 0,
        selectedAgents: [],
        skippedAgents: [],
        // Empty, because this run wrote nothing. The record it found is named separately: the
        // artifact list means "what this cycle produced" everywhere else and must keep meaning it.
        artifacts: [],
        alreadyRecordedAt: path.relative(repoRoot, path.join(stateRoot, recorded))
      };
    }
  }
  // The quiet-day wrapper sits inside the lock, so the skip record and the calendar it rebuilds
  // are written under the same exclusion as the records of a room that ran.
  const quietly = (run: () => Promise<CycleResult>) => () =>
    quietWhenBudgetStops({ phase: options.phase, cycleId, now, root: stateRoot }, run);
  if (isCaughtUpPhase(options.phase)) {
    if (options.dry) return runCaughtUpDryCycle(options, cycleId, now);
    if (options.phase === "cu-edition") {
      return withFileLock(stateRoot, ".lock", quietly(() =>
        runCaughtUpLiveEditionCycle(options, cycleId, now)
      ));
    }
    return withFileLock(stateRoot, ".lock", quietly(() =>
      runCaughtUpLiveProductCycle(options, cycleId, now)
    ));
  }
  if (options.phase === "bh-desk") {
    const run = () => runBooksofHistoryCycle({
      executionCycleId: cycleId,
      dry: options.dry,
      now
    });
    return options.dry ? run() : withFileLock(stateRoot, ".lock", quietly(run));
  }
  if (options.phase === "ts-desk") {
    const run = () => runTehdejsiSvetCycle({
      executionCycleId: cycleId,
      dry: options.dry,
      now
    });
    return options.dry ? run() : withFileLock(stateRoot, ".lock", quietly(run));
  }
  if (isPortfolioPhase(options.phase)) {
    const phase = options.phase;
    const run = () => runPortfolioCycle({
      phase,
      cycleId,
      dry: options.dry,
      explainBudget: options.explainBudget,
      explainRouting: options.explainRouting,
      now
    });
    // runPortfolioCycle handles its own cap stops and returns a skip rather than throwing; the
    // wrapper is the backstop for a refusal on a path inside it that this change did not reach.
    return options.dry ? run() : withFileLock(stateRoot, ".lock", quietly(run));
  }
  if (options.phase === "ms-daily") {
    const stages = JSON.parse(await readFile(path.join(configRoot, "stages.json"), "utf8")) as { current: Stage };
    const run = async (): Promise<CycleResult> => {
      const result = await runMarketingSharkCycle({
        cycleId,
        dry: options.dry,
        now,
        date: pragueClockParts(now).date,
        stage: stages.current
      });
      const drafted = result.brands.filter((brand) => brand.status === "drafted").length;
      const aborted = result.brands.filter((brand) => brand.status === "aborted").length;
      return {
        cycleId,
        phase: options.phase,
        dry: options.dry,
        status: options.dry ? "dry_complete" : result.skipped ? "paused" : "live_complete",
        decision: result.skipped ? "PAUSED" : drafted > 0 ? "PLAN" : "NO_ACTION",
        estimatedWorstCaseUsd: result.spendUsd,
        // A brand that aborted is a seat that produced nothing, and the record says so rather
        // than reporting a room that ran clean.
        selectedAgents: drafted > 0 ? ["MAKO", "CHUM", "AUDIT"] : [],
        skippedAgents: aborted > 0 || result.skipped ? ["CHUM"] : [],
        artifacts: result.artifacts.map((artifact) =>
          path.relative(repoRoot, path.join(options.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot, artifact)))
      };
    };
    return options.dry ? run() : withFileLock(stateRoot, ".lock", quietly(run));
  }
  if (options.phase === "article-am" || options.phase === "article-pm") {
    const slot = options.phase === "article-am" ? "am" : "pm";
    if (!options.dry) {
      const budgetFifty = await readFile(path.join(stateRoot, "decisions", "2026-08-04-budget-fifty.md"), "utf8");
      const closedBy: ClosedArticleSlotReason | null =
        signedOwnerDecision(budgetFifty) !== "countersigned"
          ? "budget_decision_not_countersigned"
          : process.env.PORTFOLIO_LIVE_ENABLED !== "true"
            ? "portfolio_gate_closed"
            : process.env.MMA_FILES_LIVE_ENABLED !== "true"
              ? "mma_files_gate_closed"
              : null;
      if (closedBy) {
        // A closed gate used to return here with artifacts: [] and write nothing, so the slot
        // was indistinguishable on the calendar from one nobody reached — the shape of an empty
        // day that took a full audit to explain. Only a scheduled wake-up leaves the record,
        // exactly as portfolio/run.ts does for the rooms it closes: a manual or local
        // invocation of a shut slot is not a missed meeting and must not write one.
        const recorded = process.env.MEETING_TRIGGER === "schedule"
          ? await recordClosedArticleSlot({ cycleId, slot, now, reason: closedBy })
          : null;
        // Null when the slot already had a record and this run left it alone, so the artifact
        // list names only what this cycle actually wrote.
        const artifacts = recorded ? [recorded] : [];
        return {
          cycleId,
          phase: options.phase,
          dry: false,
          status: "paused",
          decision: "PAUSED",
          estimatedWorstCaseUsd: 0,
          selectedAgents: [],
          skippedAgents: [],
          artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(stateRoot, artifact)))
        };
      }
      return quietWhenBudgetStops({ phase: options.phase, cycleId, now, root: stateRoot }, async () => {
        const result = await runLiveArticleProduction({ cycleId, slot, now });
        const articleAgents = ["JAB", "HACEK", "STET", "REACH", "FRAME"] as const;
        const controls = await loadVentureAgentControls();
        const enabledArticleAgents = enabledAgentsForVenture(controls, "mma-files", articleAgents);
        const disabledArticleAgents = articleAgents.filter((agent) => !enabledArticleAgents.includes(agent));
        return {
          cycleId,
          phase: options.phase,
          dry: false,
          status: "live_complete",
          decision: "PLAN",
          estimatedWorstCaseUsd: result.estimatedWorstCaseUsd,
          selectedAgents: result.status === "killed" ? [] : enabledArticleAgents,
          skippedAgents: result.status === "killed" ? [...articleAgents] : disabledArticleAgents,
          artifacts: result.artifacts.map((artifact) => path.relative(repoRoot, path.join(stateRoot, artifact)))
        };
      });
    }
    const root = path.join(repoRoot, "tmp", "dry-run", "state");
    const result = await runDryArticleProduction({ root, slot, now });
    return {
      cycleId,
      phase: options.phase,
      dry: true,
      status: "dry_complete",
      decision: "PLAN",
      estimatedWorstCaseUsd: 0,
      selectedAgents: ["JAB", "HACEK", "STET", "REACH", "FRAME"],
      skippedAgents: [],
      artifacts: [result.articlePath, ...(result.socialPath ? [result.socialPath] : []), ...result.mediaPaths].map((artifact) => path.relative(repoRoot, path.join(root, artifact)))
    };
  }
  if (options.phase !== "founding" && !isShiftPhase(options.phase)) {
    throw new Error(`Unsupported venture phase: ${options.phase}`);
  }
  const venturePhase = options.phase;
  const deterministicCheckpoint = venturePhase === "afternoon" || venturePhase === "night";
  const execute = async (): Promise<CycleResult> => {
    const modelConfig = JSON.parse(
      await readFile(path.join(configRoot, "models.json"), "utf8")
    ) as {
      roles: Record<
        string,
        {
          provider: "openai" | "anthropic";
          model: string;
          maxOutputTokens: number;
        }
      >;
    };
    const callRoles = venturePhase === "morning"
      ? ["VIZE", "FORGE", "PULSE", "AUDIT"]
      : [];
    const callGraph = callRoles.map((role) => {
      const model = modelConfig.roles[role];
      if (!model) {
        throw new Error(`Missing model config for ${role}`);
      }
      return {
        role,
        model: model.model,
        estimate: estimateTextCall({
          provider: model.provider,
          model: model.model,
          promptChars: 8_000,
          maxOutputTokens: Math.min(model.maxOutputTokens, 400),
          at: now
        })
      };
    });
    if (venturePhase === "morning") {
      for (const [role, configRole, maxOutputTokens] of [
        ["SPARK", "OPENAI_SPECIALIST", 280],
        ["VAULT", "DIGEST", 240]
      ] as const) {
        const model = modelConfig.roles[configRole];
        if (!model) throw new Error(`Missing model config for ${configRole}`);
        callGraph.push({
          role,
          model: model.model,
          estimate: estimateTextCall({
            provider: model.provider,
            model: model.model,
            promptChars: 12_000,
            maxOutputTokens,
            at: now
          })
        });
      }
    }
    const estimatedWorstCaseUsd = Number(
      callGraph
        .reduce((sum, call) => sum + call.estimate.estimatedUsd, 0)
        .toFixed(8)
    );
    const routing = await loadRoutingConfig(
      path.join(configRoot, "agent-routing.json")
    );
    const room = routeBoardroom(routing, {
      roomId: `ROOM-${cycleId.toUpperCase()}`,
      topicType: "council",
      objective:
        venturePhase === "founding"
          ? "Choose up to three evidence-backed operating tasks or NO_ACTION"
          : getShiftDefinition(venturePhase).objective,
      evidenceRefs: [],
      decisionNeeded: "NO_ACTION",
      riskTags: [],
      budgetImpactUsd: estimatedWorstCaseUsd,
      preset: venturePhase === "morning" ? "venture-morning" : "daily-standup",
      now
    });
    const stages = JSON.parse(
      await readFile(path.join(configRoot, "stages.json"), "utf8")
    ) as { current: Stage };
    const evidence = parseEvidenceJsonl(
      await readFile(path.join(stateRoot, "EVIDENCE.jsonl"), "utf8")
    );
    const opportunityState = JSON.parse(
      await readFile(path.join(stateRoot, "OPPORTUNITIES.json"), "utf8")
    ) as { opportunities: unknown[] };
    const opportunityGate: OpportunityGate = selectOpportunity(
      opportunityState.opportunities.map((value) =>
        OpportunitySchema.parse(value)
      ),
      evidence
    );
    const decision =
      venturePhase === "founding"
        ? opportunityGate.passed
          ? "NO_ACTION"
          : "INSUFFICIENT_EVIDENCE"
        : "NO_ACTION";
    const artifactRoot = options.dry
      ? path.join(repoRoot, "tmp", "dry-run", "state")
      : stateRoot;
    const morningContext = venturePhase === "morning"
      ? await (async () => {
          const moneyAndKpis = await runDailyMoneyAndKpis({
            repoRoot,
            stateRoot: artifactRoot,
            now,
            writeOwnerNotices: !options.dry
          });
          const [autonomy, meetingPolicy, ventureRegistry, agendaQueue, priorityQueue] = await Promise.all([
            refreshAutonomySnapshot({ repoRoot, stateRoot: artifactRoot, now }),
            loadMeetingPolicy(),
            loadVentureRegistry(),
            readMeetingAgendaQueue(artifactRoot, now),
            readPriorityQueue(artifactRoot, now)
          ]);
          const agendaVentures = [...new Set(ventureRegistry.ventures
            .filter((venture) => venture.meetings.some((meeting) => phaseNeedsAgenda(meetingPolicy, meeting.kind)))
            .map((venture) => venture.id))];

          // Bootstrap the priority queue so the agenda loop can start on its own.
          //
          // An agenda-gated room needs a due agenda; an agenda needs an open priority item;
          // and the council may only request a room against an item that already exists. The
          // sole writer of the queue was the admin UI, so with an empty queue no agent could
          // ever open incubator synthesis, mma-analysis, mag-desk or studio. The loop could not
          // be entered from inside the system. Titty Tuesdays now carries a standing agenda and
          // does not depend on this bootstrap path.
          //
          // The seed is not invented: each venture states its own growth objective in
          // config/ventures.json, and that is what the queue is for. ensurePriorityItem is
          // idempotent on (venture, question, decision), so a venture that already has an
          // open item is left alone and a re-run adds nothing. Agents refine from here by
          // requesting rooms against the item, which is the behaviour that was designed.
          let seededQueue = priorityQueue;
          if (!options.dry) {
            let seeded = false;
            for (const ventureId of agendaVentures) {
              // One live generation per venture, not one selectable one.
              //
              // The guard used to read openPriorityItems, which excludes "selected": a venture
              // whose standing question had just been commissioned looked empty the next morning
              // and was seeded a second copy of the same sentence. The queue on disk carries five
              // such pairs. livePriorityItems is everything short of archived, so a question that
              // is being worked on, or was declined and can still be picked up again, counts as
              // the venture's generation and no second one is written beside it.
              if (livePriorityItems(seededQueue, ventureId).length > 0) continue;
              const venture = ventureRegistry.ventures.find((candidate) => candidate.id === ventureId);
              if (!venture || venture.status === "paused") continue;
              const objective = venture.growth_objective;
              const result = await ensurePriorityItem({
                root: artifactRoot,
                venture: ventureId,
                question: `What is currently blocking this objective: ${objective.label}?`,
                decisionAtStake: `Which next bounded action moves ${objective.components.join(", ")} for ${venture.name}.`,
                evidenceNeeded: [...objective.components],
                requestedBy: "VIZE",
                now,
                // One week, matching the admin control, and shorter than a quarter so a
                // stale objective expires rather than pinning the queue open forever.
                expires: new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))
              });
              if (result.created) seeded = true;
            }
            if (seeded) seededQueue = await readPriorityQueue(artifactRoot, now);
          }

          return {
            moneyAndKpis,
            autonomy,
            priorityQueue: seededQueue,
            openPriorities: openPriorityItems(seededQueue),
            starvation: starvationList({ queue: agendaQueue, ventureIds: agendaVentures, now })
          };
        })()
      : null;
    /**
     * Yesterday, in Prague terms, and the morning before this one.
     *
     * The review is about the day that finished, not the one starting: at 06:00 today's slots have
     * not run. `since` bounds the rating window to exactly the gap between the two boards, so a
     * rating is counted once and by the meeting that could first have seen it.
     */
    const operationsPacket = venturePhase === "morning"
      ? await (async () => {
          const local = pragueClockParts(now);
          const yesterday = new Date(`${local.date}T12:00:00Z`);
          yesterday.setUTCDate(yesterday.getUTCDate() - 1);
          const reviewDate = yesterday.toISOString().slice(0, 10);
          const limits = budgetLimitsFromEnvironment();
          return buildOperationsPacket({
            repoRoot,
            stateRoot: artifactRoot,
            reviewDate,
            since: reviewDate,
            autonomy: morningContext?.autonomy ?? null,
            ledger: (await currentBudgetLedger(artifactRoot)),
            dayCapUsd: limits.dailyUsd,
            monthCapUsd: limits.monthlyOperatingUsd
          });
        })()
      : null;
    const liveCouncil = !options.dry && venturePhase === "morning"
      ? await collectLiveCouncil({
          cycleId,
          phase: venturePhase,
          stage: stages.current,
          now,
          ...(operationsPacket ? { operations: { packet: operationsPacket } } : {}),
          businessContext: {
            autonomy: morningContext!.autonomy,
            openPriorities: morningContext!.openPriorities,
            starvation: morningContext!.starvation,
            quarterlyKpis: morningContext!.moneyAndKpis.summary
          },
          budgetContext: (ledger): ReserveContext => ({
            now,
            cycleId,
            stage: stages.current,
            ledger,
            allInNonApiSpentUsd: morningContext!.moneyAndKpis.fixedMonthlyUsd,
            allInCommittedUsd: 0,
            knownMonthlyForecastUsd: 0,
            remainingScheduledCycles: remainingScheduledCycles(now),
            limits: budgetLimitsFromEnvironment()
          })
        })
      : null;
    // Which venture gets today's idea. Caught Up used to get every one of them because the
    // namespace was hardcoded here; the rotation is deterministic on the date, so a re-run of the
    // same morning proposes into the same ledger.
    const rotation = venturePhase === "morning"
      ? await resolveRotationTarget({ stateRoot: artifactRoot, now })
      : null;
    const morningIdea = venturePhase === "morning"
      ? await prepareMorningIdea({
          context: {
            root: artifactRoot,
            ideaNamespace: rotation?.ledgerNamespace ?? CAUGHT_UP_IDEA_NAMESPACE,
            cycleId,
            stage: stages.current,
            now,
            limits: budgetLimitsFromEnvironment(),
            remainingScheduledCycles: remainingScheduledCycles(now),
            fixedMonthlyUsd: morningContext!.moneyAndKpis.fixedMonthlyUsd
          },
          dry: options.dry,
          rotation,
          councilSummary: liveCouncil
            ? liveCouncil.positions.map((position) => position.publicSummary).join(" ")
            : "Deterministic dry morning fixture; no live council position was called."
        })
      : undefined;
    const ideaNamespace = rotation?.ledgerNamespace ?? CAUGHT_UP_IDEA_NAMESPACE;
    const caughtUpIdea = morningIdea;
    let measuredCouncil = liveCouncil;
    if (liveCouncil && caughtUpIdea) {
      const ledger = await currentBudgetLedger(artifactRoot);
      const month = now.toISOString().slice(0, 7);
      measuredCouncil = {
        ...liveCouncil,
        actualCycleUsd: ledgerSpend(ledger, (entry) => entry.cycleId === cycleId),
        monthAllInUsd: ledgerSpend(ledger, (entry) => entry.ts.slice(0, 7) === month)
      };
    }
    const meetingAgendaIds: string[] = [];
    let meetingAgendaStateChanged = false;
    let priorityStateChanged = false;
    // Which priority item each venture had commissioned this morning, at most one per venture.
    const selectedPriorityByVenture = new Map<string, string>();
    // Why no room was commissioned, in words, so the standup can say it instead of a console line
    // nobody reads. Both blocks below overwrite it — resolveMorningCommissions for every way the
    // gate itself declines, schedulerBlockedReason for a commission the agenda queue refuses — so
    // this default is only ever published by a morning that called no live council, which means a
    // dry run.
    let commissionBlockedReason = "No live council was called this morning, so nothing reached the commission gate.";
    // The one new question a seat asked for this morning, and what became of it. Stays null on a
    // morning where no seat proposed, which is most of them, so the record says nothing rather
    // than printing a daily "nobody proposed anything".
    let priorityProposalRecord: NonNullable<Standup["priorityProposal"]> | null = null;
    if (measuredCouncil && venturePhase === "morning") {
      const [meetingPolicy, ventureRegistry] = await Promise.all([
        loadMeetingPolicy(),
        loadVentureRegistry()
      ]);
      const resolved = resolveMorningCommissions({
        positions: measuredCouncil.positions,
        openPriorities: morningContext?.openPriorities ?? [],
        policy: meetingPolicy,
        registry: ventureRegistry,
        sourcePhase: venturePhase
      });
      if (resolved.commissions.length === 0) {
        commissionBlockedReason = resolved.blockedReason;
        console.warn(commissionBlockedReason);
      }
      for (const commission of resolved.commissions) {
        const { request, target, priority } = commission;
        const local = pragueClockParts(now);
        // Only the agenda write is guarded here, and only because the agenda queue declining a
        // commission is a normal published outcome. Marking the item selected used to sit inside
        // the same try, so when the queue refused a why-not → selected transition the cycle
        // published "the agenda queue refused it" over a commission the queue had already
        // accepted: the 2026-08-06 standup names an agenda that is sitting pending on disk. A
        // failure to record the selection is a contract failure, not a refusal, and now says so
        // by taking the cycle down instead of being dressed as the board's own decision.
        let scheduledAgendaId: string | null = null;
        try {
          const scheduled = await requestMeetingAgenda({
            root: artifactRoot,
            policy: meetingPolicy,
            ventureId: target.ventureId,
            phase: request.phase,
            requestedBy: commission.requestedBy,
            sourcePhase: venturePhase,
            sourceMeetingRef: `standups/${local.date}-morning`,
            summary: request.summary,
            evidenceRefs: request.evidenceRefs,
            notBefore: nextAgendaDate({
              currentDate: local.date,
              currentHour: local.hour,
              targetHour: parseCadenceHour(target.meeting.cadence)
            }),
            now
          });
          meetingAgendaIds.push(scheduled.agenda.id);
          meetingAgendaStateChanged = meetingAgendaStateChanged || scheduled.created;
          scheduledAgendaId = scheduled.agenda.id;
        } catch (error) {
          commissionBlockedReason = schedulerBlockedReason(request.phase, error);
          console.warn(commissionBlockedReason);
        }
        if (scheduledAgendaId) {
          await selectPriorityItem({
            root: artifactRoot,
            itemId: priority.id,
            meetingRef: `standups/${local.date}-morning`,
            now
          });
          selectedPriorityByVenture.set(priority.venture, priority.id);
          priorityStateChanged = true;
        }
      }
      // The proposal is resolved after the commission and before the skip loop below.
      //
      // After, because a question proposed this morning was not on the list the board just voted
      // over, so it cannot be the question this morning commissions — it is answerable from
      // tomorrow. Before, because the skip loop walks the snapshot taken before the council ran;
      // a new item is not in that snapshot and so is left "open" rather than being told on its
      // first morning that it lost a selection it was never in.
      const proposal = resolvePriorityProposal({ positions: measuredCouncil.positions });
      if (proposal.kind !== "none") {
        const local = pragueClockParts(now);
        const meetingRef = `standups/${local.date}-morning`;
        const base = {
          proposedBy: proposal.proposedBy,
          venture: proposal.request.venture,
          question: proposal.request.question,
          decisionAtStake: proposal.request.decisionAtStake
        };
        if (proposal.kind === "refuse") {
          priorityProposalRecord = {
            ...base,
            outcome: "refused" as const,
            reason: proposal.reason,
            priorityItemId: null
          };
        } else {
          try {
            const added = await proposePriorityItem({
              root: artifactRoot,
              venture: proposal.request.venture,
              question: proposal.request.question,
              decisionAtStake: proposal.request.decisionAtStake,
              evidenceNeeded: proposal.request.evidenceNeeded,
              proposedBy: proposal.proposedBy,
              meetingRef,
              now,
              // The same week the seed gives its items, so a question the board invented expires
              // on the same terms as one the config handed it and cannot outlive its own answer.
              expires: new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))
            });
            priorityStateChanged = true;
            priorityProposalRecord = {
              ...base,
              outcome: "accepted" as const,
              reason: publishableReason(`${proposal.proposedBy} proposed it at the ${local.date} morning board and the meeting carried.${proposal.alsoProposed > 0 ? ` ${proposal.alsoProposed} further proposal${proposal.alsoProposed === 1 ? " was" : "s were"} not taken; a meeting adds one question.` : ""}`),
              priorityItemId: added.id
            };
          } catch (error) {
            // A queue guard refusing the board is a normal outcome and is published. Anything
            // else — a disk failure, a contract violation — is not the board's doing and must
            // still take the cycle down rather than be recorded as a polite refusal.
            if (!(error instanceof PriorityProposalRefused)) throw error;
            priorityProposalRecord = {
              ...base,
              outcome: "refused" as const,
              reason: publishableReason(error.message),
              priorityItemId: null
            };
          }
        }
        console.warn(JSON.stringify({
          event: "council_priority_proposal",
          phase: venturePhase,
          outcome: priorityProposalRecord.outcome,
          agent: priorityProposalRecord.proposedBy,
          venture: priorityProposalRecord.venture,
          reason: priorityProposalRecord.reason
        }));
      }
      const selectedPriorityIds = new Set(selectedPriorityByVenture.values());
      for (const item of morningContext?.openPriorities ?? []) {
        if (selectedPriorityIds.has(item.id)) continue;
        await skipPriorityItem({
          root: artifactRoot,
          itemId: item.id,
          // "Not selected" is only true when something else was. On a morning that commissioned
          // nothing, every item was told its turn went elsewhere — the same false framing the
          // starvation review carried until this morning. commissionBlockedReason is the sentence
          // that says what actually stopped the board.
          reason: selectedPriorityIds.size === 0
            ? commissionBlockedReason
            : selectedPriorityByVenture.has(item.venture)
              ? "The 06:00 board commissioned this project's other open question today."
              : "The 06:00 board did not commission a room for this project today.",
          now
        });
        priorityStateChanged = true;
      }
    }
    /*
     * The operations review, resolved from the seats and written down.
     *
     * The verdicts and the fix tasks are a record of what the board said. The growth ideas are the
     * one part that also writes somewhere else, so they go through `screenAndRecordIdea` — the
     * same VAULT dedup every other idea passes — and each one records what became of it. An idea
     * the ledger already holds is a duplicate, not a failure, and says so.
     */
    let operationsReview: Standup["operationsReview"] | undefined;
    let operationsDecisionRef: string | null = null;
    const growthIdeaArtifacts: string[] = [];
    if (measuredCouncil && operationsPacket && venturePhase === "morning") {
      const resolved = resolveOperationsReview(measuredCouncil.positions);
      const local = pragueClockParts(now);
      const recordedIdeas: NonNullable<Standup["operationsReview"]>["growthIdeas"] = [];

      for (const idea of resolved.growthIdeas) {
        const namespace = ventureNamespace(await loadVentureRegistry(), idea.ventureId);
        if (!namespace) {
          recordedIdeas.push({
            ...idea,
            outcome: "refused",
            ideaId: null,
            reason: `No idea ledger belongs to ${idea.ventureId}.`
          });
          continue;
        }
        const screened = await screenAndRecordIdea({
          root: artifactRoot,
          namespace,
          proposal: {
            title: idea.title,
            summary: idea.summary,
            origin: { agent: "SPARK", meetingRef: `standups/${local.date}-morning` },
            proposedAt: now.toISOString()
          },
          evidence: parseEvidenceJsonl(await readFile(path.join(artifactRoot, "EVIDENCE.jsonl"), "utf8").catch(() => "")),
          adjudicator: options.dry
            ? { async adjudicate() { return { verdict: "novel" as const, reason: "Dry run: no adjudicator was called." }; } }
            : new GuardedVaultAdjudicator({
              root: artifactRoot,
              ideaNamespace: namespace,
              cycleId,
              stage: stages.current,
              now,
              limits: budgetLimitsFromEnvironment(),
              remainingScheduledCycles: remainingScheduledCycles(now),
              fixedMonthlyUsd: morningContext!.moneyAndKpis.fixedMonthlyUsd
            })
        });
        growthIdeaArtifacts.push(ideaLedgerPath(namespace), ideaIndexPath(namespace));
        recordedIdeas.push({
          ...idea,
          outcome: screened.entry.status === "vetoed" ? "duplicate" : "recorded",
          ideaId: screened.entry.id,
          reason: screeningWord(screened.verdict)
        });
      }

      operationsDecisionRef = options.dry
        ? null
        : await writeOperationsDecision({
          stateRoot: artifactRoot,
          date: local.date,
          review: resolved,
          packet: operationsPacket
        });

      operationsReview = {
        reviewDate: operationsPacket.reviewDate,
        perVentureVerdicts: resolved.perVentureVerdicts,
        fixTasks: resolved.fixTasks,
        growthIdeas: recordedIdeas,
        meetings: {
          scheduled: operationsPacket.meetings.scheduled,
          held: operationsPacket.meetings.held,
          skipped: operationsPacket.meetings.skipped.map((skip) => ({
            phase: skip.phase,
            reason: skip.reason.slice(0, 280)
          })),
          unaccounted: operationsPacket.meetings.unaccounted.map((slot) => slot.kind)
        },
        decisionFileRef: operationsDecisionRef
      };
      for (const entry of resolved.dropped) {
        measuredCouncil.droppedRequests.push({ agent: entry.agent, field: "operations", reason: entry.reason });
      }
    }
    const agentsParticipated = Boolean(measuredCouncil) || (options.dry && !deterministicCheckpoint);
    const standup = measuredCouncil
      ? createLiveStandup({
          cycleId,
          phase: venturePhase as Exclude<typeof venturePhase, "founding">,
          stage: stages.current,
          room,
          estimatedCycleUsd: estimatedWorstCaseUsd,
          now,
          council: measuredCouncil,
          ...(morningContext ? { autonomy: morningContext.autonomy } : {}),
          ...(morningContext ? { quarterlyKpis: morningContext.moneyAndKpis.summary } : {}),
          ...(caughtUpIdea ? { caughtUpIdea, morningIdeaNamespace: ideaNamespace } : {}),
          ...(priorityProposalRecord ? { priorityProposal: priorityProposalRecord } : {}),
          ...(operationsReview ? { operationsReview } : {}),
          // Absent on a meeting that lost nothing: a clean council records no ceremony.
          ...(measuredCouncil.droppedSeats.length ? { droppedSeats: measuredCouncil.droppedSeats } : {}),
          ...(measuredCouncil.droppedRequests.length ? { droppedRequests: measuredCouncil.droppedRequests } : {})
        })
      : createOfflineStandup({
          cycleId,
          phase: venturePhase,
          stage: stages.current,
          fixture: options.dry,
          status: decision,
          room,
          estimatedCycleUsd: estimatedWorstCaseUsd,
          now,
          evidenceRefs: opportunityGate.evidenceRefs,
          agentsParticipated,
          ledger: await monthToDateLedger(artifactRoot, now),
          ...(morningContext ? { autonomy: morningContext.autonomy } : {}),
          ...(morningContext ? { quarterlyKpis: morningContext.moneyAndKpis.summary } : {}),
          ...(caughtUpIdea ? { caughtUpIdea, morningIdeaNamespace: ideaNamespace } : {})
        });
    const recordedStandup = morningContext
      ? StandupSchema.parse({
          ...standup,
          starvationReview: morningContext.starvation.map((entry) => ({
            ventureId: entry.ventureId,
            outcome: selectedPriorityByVenture.has(entry.ventureId) ? "commissioned" as const : "why-not" as const,
            reason: selectedPriorityByVenture.has(entry.ventureId)
              ? "The board opened a meeting on this project's open job."
              // Only true when a commission actually happened. On 3 August the board commissioned
              // nothing and every venture was still told its turn had gone to a higher priority —
              // wording that reads as accountability while recording the opposite of what
              // occurred. When no room was commissioned, the reason is why the board could not.
              : selectedPriorityByVenture.size === 0
                ? commissionBlockedReason
                : morningContext.openPriorities.some((item) => item.venture === entry.ventureId)
                  ? "This project had open jobs, but the morning's meetings went to more urgent ones."
                  : "Nothing open on this project needed a decision that a meeting could settle.",
            priorityItemId: selectedPriorityByVenture.get(entry.ventureId) ?? null
          }))
        })
      : standup;
    const artifacts = [
      `standups/${recordedStandup.date}-${options.phase}.json`,
      `meetings/${cycleId}.json`,
      `scorecards/${cycleId}.json`,
      `decisions/${cycleId}.json`,
      ...(caughtUpIdea
        ? [ideaLedgerPath(ideaNamespace), ideaIndexPath(ideaNamespace)]
        : []),
      ...(operationsDecisionRef ? [operationsDecisionRef] : []),
      ...growthIdeaArtifacts,
      ...(meetingAgendaStateChanged ? [MEETING_AGENDA_PATH] : []),
      ...(morningContext ? [AUTONOMY_SNAPSHOT_PATH] : []),
      ...(morningContext ? morningContext.moneyAndKpis.artifacts : []),
      ...(priorityStateChanged ? [PRIORITY_QUEUE_PATH] : [])
    ];
    await Promise.all([
      atomicWriteJson(
        artifactRoot,
        artifacts[0]!,
        publicStandup(recordedStandup)
      ),
      atomicWriteJson(artifactRoot, artifacts[1]!, {
        schemaVersion: 1,
        fixture: options.dry,
        cycleId,
        room,
        summary: recordedStandup.decision.summary,
        generatedAt: now.toISOString()
      }),
      atomicWriteJson(artifactRoot, artifacts[2]!, {
        schemaVersion: 1,
        fixture: options.dry,
        cycleId,
        stage: stages.current,
        opportunityGate,
        estimatedWorstCaseUsd,
        actualUsd: recordedStandup.ledger.actualCycleUsd,
        socialDecision: "NO_POST",
        ...(caughtUpIdea ? {
          caughtUpIdeaRef: caughtUpIdea.entry.id,
          growthIdeaNovelty: caughtUpIdea.autoRejected ? 0 : 1,
          vaultVerdict: caughtUpIdea.verdict
        } : {}),
        meetingAgendaIds,
        generatedAt: now.toISOString()
      }),
      atomicWriteJson(artifactRoot, artifacts[3]!, {
        schemaVersion: 1,
        fixture: options.dry,
        cycleId,
        outcome: decision,
        selectedOpportunityId: opportunityGate.passed
          ? opportunityGate.opportunityId
          : null,
        reasons: opportunityGate.reasons,
        evidenceRefs: opportunityGate.evidenceRefs,
        ...(caughtUpIdea ? { caughtUpIdeaRef: caughtUpIdea.entry.id } : {}),
        meetingAgendaIds,
        generatedAt: now.toISOString()
      })
    ]);
    const ecosystemArtifact = !options.dry && venturePhase === "night"
      ? (await refreshEcosystemOperatingTruth({ repoRoot })).path
      : null;
    /*
     * The night scores what the day published.
     *
     * Behind `CONTENT_GATE_ENABLED`, which is off by default and silent when off. It runs after
     * every artifact above is written, so a gate that fails cannot take a delivery record with it,
     * and it swallows its own failures — the worst it can do is record a day as unscored.
     */
    const contentGateArtifacts = !options.dry && venturePhase === "night" && contentGateEnabled()
      && (await loadEffectivePortfolioSchedule(
        ledgerSpend(await currentBudgetLedger(artifactRoot), (entry) => entry.ts.slice(0, 7) === now.toISOString().slice(0, 7))
      )).contentGateAffordable
      ? (await runContentGate({
        stateRoot: artifactRoot,
        cycleId,
        now,
        budgetContext: {
          now,
          cycleId,
          stage: stages.current,
          ledger: await currentBudgetLedger(artifactRoot),
          allInNonApiSpentUsd: await loadFixedMonthlyUsd(configRoot, now),
          allInCommittedUsd: 0,
          knownMonthlyForecastUsd: 0,
          remainingScheduledCycles: remainingScheduledCycles(now),
          limits: budgetLimitsFromEnvironment()
        }
      })).artifacts
      : [];
    /*
     * The weekly and monthly reports, written the night a period closes.
     *
     * Deterministic and free — every figure is read off a record the runtime already wrote, so
     * this sits outside the model share exactly like the dataset appends. Monday writes the week
     * that finished; the 1st writes the month before it. Any other night writes nothing.
     */
    /*
     * What is waiting on the owner, rebuilt every cycle.
     *
     * Deterministic and free. It runs on every phase rather than one, because an approval that
     * appears at 09:00 should not wait for the night to become visible, and rebuilding it costs
     * two file reads.
     */
    const ownerAttentionArtifacts = options.dry
      ? []
      : [(await collectOwnerAttention({ repoRoot, stateRoot: artifactRoot, now })).path];
    const reportArtifacts: string[] = [];
    if (!options.dry && venturePhase === "night") {
      const today = pragueClockParts(now).date;
      const ledger = await currentBudgetLedger(artifactRoot);
      const capUsd = budgetLimitsFromEnvironment().monthlyOperatingUsd;
      const weekly = await writeWeeklyReportIfDue({ stateRoot: artifactRoot, today, now, ledger, capUsd });
      const monthly = await writeMonthlyReportIfDue({ stateRoot: artifactRoot, today, now, ledger, capUsd });
      for (const due of [weekly, monthly]) {
        if (due) reportArtifacts.push(due.path);
      }
      // The retro is the judgement layer over the week the writer just measured, so it runs after
      // it and only when there is a report to complete. Off by default; a budget refusal writes a
      // skip record and the night continues.
      if (weekly && weeklyRetroEnabled()) {
        reportArtifacts.push(...(await runWeeklyRetro({
          stateRoot: artifactRoot,
          cycleId,
          today,
          report: weekly.report,
          now,
          budgetContext: {
            now,
            cycleId,
            stage: stages.current,
            ledger,
            allInNonApiSpentUsd: await loadFixedMonthlyUsd(configRoot, now),
            allInCommittedUsd: 0,
            knownMonthlyForecastUsd: 0,
            remainingScheduledCycles: remainingScheduledCycles(now),
            limits: tightenedBy(budgetLimitsFromEnvironment(), { maxCycleUsd: RETRO_ENVELOPE_USD })
          }
        })).artifacts);
      }
    }
    if (options.explainBudget) {
      console.log(
        JSON.stringify(
          {
            cycleId,
            callGraph: callGraph.map((call) => ({
              role: call.role,
              model: call.model,
              estimatedUsd: call.estimate.estimatedUsd,
              pricingVerifiedAt: call.estimate.priceVerifiedAt
            })),
            estimatedWorstCaseUsd
          },
          null,
          2
        )
      );
    }
    if (options.explainRouting) {
      console.log(
        JSON.stringify(
          {
            selected: room.selectedParticipants,
            skipped: room.skippedParticipants,
            caps: {
              rounds: room.maxRounds,
              turns: room.maxTurns,
              tokens: room.maxTotalTokens
            }
          },
          null,
          2
        )
      );
    }
    return {
      cycleId,
      phase: options.phase,
      dry: options.dry,
      status: options.dry ? "dry_complete" : "live_complete",
      decision:
        standup.status === "PLAN"
          ? "PLAN"
          : standup.status === "INSUFFICIENT_EVIDENCE"
            ? "INSUFFICIENT_EVIDENCE"
            : "NO_ACTION",
      estimatedWorstCaseUsd,
      selectedAgents: agentsParticipated
        ? room.selectedParticipants.map(({ agent }) => agent)
        : [],
      skippedAgents: agentsParticipated
        ? room.skippedParticipants.map(({ agent }) => agent)
        : [...room.selectedParticipants, ...room.skippedParticipants].map(({ agent }) => agent),
      artifacts: [
        ...[...artifacts, ...contentGateArtifacts, ...reportArtifacts, ...ownerAttentionArtifacts]
          .map((artifact) => path.relative(repoRoot, path.join(artifactRoot, artifact))),
        ...(ecosystemArtifact ? [ecosystemArtifact] : [])
      ],
      // Read from the committed ledger and the live environment, so a dry run reports the same
      // readiness a real one would meet. Nothing here is a key; presence only.
      imageProgram: await imageProgramReadiness({ stateRoot, now })
    };
  };
  if (options.dry) {
    return execute();
  }
  return withFileLock(stateRoot, ".lock", quietly(execute));
}
