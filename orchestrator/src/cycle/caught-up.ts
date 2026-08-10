import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadRoutingConfig, routeBoardroom } from "../boardroom/router.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { atomicWriteJson, readText } from "../state.js";
import {
  buildCalendarFeed,
  loadArticleSlotOutcomes, loadMeetingRecords, loadMeetingSkips,
  mondayOfWeek,
  writeCalendarFeed
} from "../meetings/calendar.js";
import { isCaughtUpPhase } from "../meetings/clock.js";
import { pragueClockParts } from "../meetings/clock.js";
import {
  createLiveEditionMeeting,
  createLiveProductMeeting,
  createOfflineCaughtUpMeeting,
  meetingRef
} from "../meetings/record.js";
import { appendEditionUsage, runLiveEdition } from "../edition/live.js";
import { PRODUCT_ROOM_RESERVE_USD, decideLiveProductRoom, toIdeaRoomVerdict } from "../ideas/live.js";
import { CAUGHT_UP_IDEA_NAMESPACE, GLOBAL_IDEA_NAMESPACE, applyIdeaRoomVerdict, currentIdeaEntries, ensureIdeaInNamespace, ideaIndexPath, ideaLedgerPath, readIdeaLedger, readIdeaIndexSlice, regenerateIdeaIndex } from "../ideas/ledger.js";
import {
  composeEditionSocialPack,
  recordMissingSocialPackConfiguration,
  recordSocialPackFailure
} from "../social/pack.js";
import { socialChannelsEnabled, socialContentGenerationEnabled } from "../social/activation.js";
import { StandupSchema } from "../standup/schema.js";
import { composeMeetingRouteDefinition, loadVentureRegistry } from "../ventures/registry.js";
import { caughtUpSocialProductionEnabled, disabledAgentsForVenture, loadVentureAgentControls } from "../ventures/agent-controls.js";
import { type Stage } from "../types.js";
import { loadFixedMonthlyUsd } from "../money/fixed-costs.js";

import { hasDeliveredPublishedEdition } from "./types.js";
import type { CycleOptions, CycleResult } from "./types.js";
import {
  budgetLimitsFromEnvironment,
  currentBudgetLedger,
  ledgerSpend,
  remainingScheduledCycles,
  yesterdayEditionOutcome
} from "./ledger.js";

/**
 * The three DNESKAi room runners, moved verbatim out of `cycle.ts`.
 *
 * The edition room, the product room and the dry fixture that stands in for both were six hundred
 * lines in the middle of the cycle dispatcher, and none of them is about dispatching: each is one
 * venture's own day. `runCycle` calls them exactly as it did.
 *
 * Nothing here changed in the move.
 */

export async function runCaughtUpDryCycle(
  options: CycleOptions,
  cycleId: string,
  now: Date
): Promise<CycleResult> {
  if (!isCaughtUpPhase(options.phase)) {
    throw new Error(`Not a Caught Up phase: ${options.phase}`);
  }
  if (!options.dry) {
    throw new Error("Caught Up scheduled phases remain dry until the Phase 9 cutover");
  }
  const [routing, stages, ventureRegistry, agentControls] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry(),
    loadVentureAgentControls()
  ]);
  const definition = composeMeetingRouteDefinition(
    ventureRegistry,
    options.phase,
    "dry"
  );
  const meetingCap = Math.min(
    definition.envelopeUsd,
    budgetLimitsFromEnvironment().caughtUpMeetingUsd
  );
  const estimatedWorstCaseUsd = options.phase === "cu-product"
    ? PRODUCT_ROOM_RESERVE_USD
    : meetingCap;
  if (estimatedWorstCaseUsd > meetingCap) {
    throw new Error(`Caught Up ${options.phase} reserve exceeds the meeting cap`);
  }
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: definition.objective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: estimatedWorstCaseUsd,
    ventureId: definition.ventureId,
    preset: definition.preset,
    requiredParticipants: definition.requiredParticipants,
    disabledParticipants: [...disabledAgentsForVenture(agentControls, definition.ventureId)],
    now
  });
  const artifactRoot = path.join(repoRoot, "tmp", "dry-run", "state");
  let fixtureIdea = null;
  let fixtureVerdict: "veto" | "defer" = "defer";
  if (options.phase === "cu-product") {
    const morningRaw = await readText(artifactRoot, `standups/${pragueClockParts(now).date}-morning.json`);
    const morning = morningRaw ? StandupSchema.parse(JSON.parse(morningRaw)) : null;
    // Only an idea raised for Caught Up. The morning's ideation rotates across the portfolio now,
    // so most days the idea belongs to another venture and this room has nothing to pick up —
    // which is a normal day, not a missing record. A standup written before the namespace was
    // recorded has no field, and on those days the idea was always Caught Up's.
    const morningNamespace = morning?.morningIdeaNamespace ?? CAUGHT_UP_IDEA_NAMESPACE;
    if (morning?.caughtUpIdeaRef && morningNamespace === CAUGHT_UP_IDEA_NAMESPACE) {
      await ensureIdeaInNamespace(
        artifactRoot,
        CAUGHT_UP_IDEA_NAMESPACE,
        morning.caughtUpIdeaRef
      );
      const current = currentIdeaEntries(
        await readIdeaLedger(artifactRoot, CAUGHT_UP_IDEA_NAMESPACE)
      );
      const morningIdea = current.find((candidate) => candidate.id === morning.caughtUpIdeaRef);
      if (!morningIdea) throw new Error(`Dry morning handoff references unknown idea ${morning.caughtUpIdeaRef}`);
      fixtureVerdict = morningIdea.status === "vetoed" || morningIdea.status === "killed" ? "veto" : "defer";
      fixtureIdea = await applyIdeaRoomVerdict({
        root: artifactRoot,
        namespace: CAUGHT_UP_IDEA_NAMESPACE,
        ideaId: morningIdea.id,
        verdict: fixtureVerdict === "veto"
          ? { verdict: "veto", reason: "VAULT hard-stopped the fixture duplicate before deliberation." }
          : {
              verdict: "defer",
              reason: "Dry product rooms cannot authorize product action.",
              deferred: { condition: "A live bounded product room reviews the idea." }
            },
        meetingRef: meetingRef(morning.date, "cu-product"),
        at: now.toISOString()
      });
    }
  }
  const record = await createOfflineCaughtUpMeeting({
    cycleId,
    phase: options.phase,
    stage: stages.current,
    room,
    now,
    estimatedCycleUsd: estimatedWorstCaseUsd,
    ...(fixtureIdea ? { idea: fixtureIdea, verdict: fixtureVerdict } : {})
  });
  const meetingPath = `meetings/${record.date}-${options.phase}.json`;
  const decisionPath = `decisions/${cycleId}.json`;
  const scorecardPath = `scorecards/${cycleId}.json`;
  const priorRecords = await loadMeetingRecords(artifactRoot);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(record.date),
    records: [...priorRecords, record],
    skips: await loadMeetingSkips(artifactRoot),
    articleSlots: await loadArticleSlotOutcomes(artifactRoot),
    now
  });
  const calendarPath = await writeCalendarFeed(artifactRoot, calendar);
  await Promise.all([
    atomicWriteJson(artifactRoot, meetingPath, record),
    atomicWriteJson(artifactRoot, decisionPath, {
      schemaVersion: 1,
      fixture: true,
      cycleId,
      phase: options.phase,
      outcome: record.decision.outcome,
      summary: record.decision.summary,
      evidenceRefs: record.decision.evidenceRefs,
      generatedAt: record.generatedAt
    }),
    atomicWriteJson(artifactRoot, scorecardPath, {
      schemaVersion: 1,
      fixture: true,
      cycleId,
      phase: options.phase,
      estimatedWorstCaseUsd,
      actualUsd: record.ledger.actualCycleUsd,
      participants: room.selectedParticipants.map((participant) => participant.agent),
      ...(fixtureIdea ? { ideaId: fixtureIdea.id, vaultScreening: fixtureIdea.statusHistory[0]?.reason } : {}),
      generatedAt: record.generatedAt
    })
  ]);
  if (options.explainBudget) {
    console.log(JSON.stringify({ cycleId, callGraph: [], estimatedWorstCaseUsd }, null, 2));
  }
  if (options.explainRouting) {
    console.log(JSON.stringify({
      selected: room.selectedParticipants,
      skipped: room.skippedParticipants,
      caps: { rounds: room.maxRounds, turns: room.maxTurns, tokens: room.maxTotalTokens }
    }, null, 2));
  }
  const artifacts = [
    meetingPath,
    decisionPath,
    scorecardPath,
    calendarPath,
    ...(fixtureIdea
      ? [ideaLedgerPath(CAUGHT_UP_IDEA_NAMESPACE), ideaIndexPath(CAUGHT_UP_IDEA_NAMESPACE)]
      : [])
  ];
  return {
    cycleId,
    phase: options.phase,
    dry: true,
    status: "dry_complete",
    decision: options.phase === "cu-edition"
      ? "NO_EDITION"
      : fixtureVerdict === "veto"
        ? "VETO"
        : "DEFER",
    estimatedWorstCaseUsd,
    selectedAgents: room.selectedParticipants.map((participant) => participant.agent),
    skippedAgents: room.skippedParticipants.map((participant) => participant.agent),
    artifacts: artifacts.map((artifact) =>
      path.relative(repoRoot, path.join(artifactRoot, artifact))
    )
  };
}

export async function runCaughtUpLiveEditionCycle(
  options: CycleOptions,
  cycleId: string,
  now: Date
): Promise<CycleResult> {
  if (options.phase !== "cu-edition" || options.dry) {
    throw new Error("Live Caught Up edition runner requires a non-dry cu-edition phase");
  }
  const [routing, stages, ventureRegistry, agentControls] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry(),
    loadVentureAgentControls()
  ]);
  const definition = composeMeetingRouteDefinition(
    ventureRegistry,
    "cu-edition",
    "live"
  );
  const meetingBudgetUsd = Math.min(
    definition.envelopeUsd,
    budgetLimitsFromEnvironment().caughtUpMeetingUsd
  );
  const productionBudgetUsd = budgetLimitsFromEnvironment().editionProductionUsd;
  const estimatedWorstCaseUsd = Number((meetingBudgetUsd + productionBudgetUsd).toFixed(8));
  const date = pragueClockParts(now).date;
  if (await hasDeliveredPublishedEdition(date)) {
    return {
      cycleId,
      phase: "cu-edition",
      dry: false,
      status: "preflight_complete",
      decision: "NO_ACTION",
      estimatedWorstCaseUsd,
      selectedAgents: [],
      skippedAgents: [],
      artifacts: [`state/edition/deliveries/${date}.json`]
    };
  }
  const reference = meetingRef(date, "cu-edition");
  const baseUrl = (process.env.PUBLIC_SITE_URL || "https://boardless-ai.vercel.app").replace(/\/$/, "");
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: definition.objective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: estimatedWorstCaseUsd,
    ventureId: definition.ventureId,
    preset: definition.preset,
    requiredParticipants: definition.requiredParticipants,
    disabledParticipants: [...disabledAgentsForVenture(agentControls, definition.ventureId)],
    now
  });
  const socialContentEnabled = caughtUpSocialProductionEnabled(agentControls) &&
    await socialContentGenerationEnabled(stateRoot, "caught-up") &&
    // And somewhere for it to go. Composing frames no channel can consume filled
    // site/public/social/ with megabytes of committed inventory that the admin decks tab
    // re-renders on request anyway.
    await socialChannelsEnabled(configRoot);
  const produced = await runLiveEdition({
    cycleId,
    date,
    now,
    meetingRef: reference,
    roomUrl: `${baseUrl}/${reference}`,
    socialPackEnabled: socialContentEnabled,
    licensedImageSearchEnabled: true
  });
  const monthAllInUsd = await appendEditionUsage(stateRoot, cycleId, now, produced.report);
  const evidenceRefs = produced.package.status === "edition"
    ? produced.package.article.cs.frontmatter.sources.map(
        (source) => `source:${source.source_id ?? source.id}`
      )
    : produced.sourceRun.sources
        .filter((source) => source.status === "success")
        .map((source) => `source:${source.sourceId}`)
        .slice(0, 12);
  const record = await createLiveEditionMeeting({
    cycleId,
    stage: stages.current,
    room,
    now,
    estimatedCycleUsd: estimatedWorstCaseUsd,
    monthAllInUsd,
    editionPackage: produced.package,
    evidenceRefs,
    report: produced.report
  });
  const meetingPath = `meetings/${date}-cu-edition.json`;
  const decisionPath = `decisions/${cycleId}.json`;
  const scorecardPath = `scorecards/${cycleId}.json`;
  const priorRecords = await loadMeetingRecords(stateRoot);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: [...priorRecords, record],
    skips: await loadMeetingSkips(stateRoot),
    articleSlots: await loadArticleSlotOutcomes(stateRoot),
    now
  });
  const calendarPath = await writeCalendarFeed(stateRoot, calendar);
  await Promise.all([
    atomicWriteJson(stateRoot, meetingPath, record),
    atomicWriteJson(stateRoot, decisionPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId,
      phase: "cu-edition",
      outcome: record.decision.outcome,
      summary: record.decision.summary,
      evidenceRefs: record.decision.evidenceRefs,
      editionRef: produced.package.idempotencyKey,
      generatedAt: record.generatedAt
    }),
    atomicWriteJson(stateRoot, scorecardPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId,
      phase: "cu-edition",
      estimatedWorstCaseUsd,
      actualUsd: produced.report.measuredCostUsd ?? 0,
      participants: room.selectedParticipants.map((participant) => participant.agent),
      sourceResults: produced.sourceRun.sources,
      editionStatus: produced.package.status,
      packageHash: produced.package.idempotencyKey,
      generatedAt: record.generatedAt
    })
  ]);
  const socialArtifacts: string[] = [];
  if (produced.package.status === "edition" && socialContentEnabled) {
    const caughtUpBaseUrl = process.env.CAUGHT_UP_SITE_URL;
    if (!caughtUpBaseUrl) {
      await recordMissingSocialPackConfiguration(stateRoot);
      console.warn("Caught Up social pack skipped: CAUGHT_UP_SITE_URL is not configured");
    } else {
      try {
        const slug = produced.package.article.cs.frontmatter.slug;
        // Czech is served at the site root now, and /cs 308s there. A queue item carries its
        // destination to the platform and cannot be edited afterwards, so it points at the
        // final URL rather than at a redirect.
        const destinations = {
          cs: new URL(`/articles/${slug}`, caughtUpBaseUrl).toString()
        };
        const social = await composeEditionSocialPack({
          editionPackage: produced.package,
          meeting: record,
          destinations,
          repoRoot,
          stateRoot,
          now
        });
        if (social) socialArtifacts.push(...social.artifactPaths);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown composer failure";
        console.warn(`Caught Up social pack failed: ${detail}`);
        await recordSocialPackFailure(stateRoot, detail);
      }
    }
  }
  if (options.explainBudget) {
    console.log(JSON.stringify({
      cycleId,
      callGraph: produced.report.usage.map((usage) => ({
        stage: usage.stage,
        model: usage.model,
        measuredUsd: usage.costUsd
      })),
      estimatedWorstCaseUsd,
      measuredUsd: produced.report.measuredCostUsd ?? null
    }, null, 2));
  }
  if (options.explainRouting) {
    console.log(JSON.stringify({
      selected: room.selectedParticipants,
      skipped: room.skippedParticipants,
      caps: { rounds: room.maxRounds, turns: room.maxTurns, tokens: room.maxTotalTokens }
    }, null, 2));
  }
  const artifacts = [
    meetingPath,
    decisionPath,
    scorecardPath,
    calendarPath,
    ...(produced.outboxPath ? [produced.outboxPath] : []),
    produced.reportPath,
    "budget/ledger.json",
    ...socialArtifacts
  ];
  return {
    cycleId,
    phase: "cu-edition",
    dry: false,
    status: "live_complete",
    decision: produced.package.status === "edition" ? "EDITION" : "NO_EDITION",
    estimatedWorstCaseUsd,
    selectedAgents: room.selectedParticipants.map((participant) => participant.agent),
    skippedAgents: room.skippedParticipants.map((participant) => participant.agent),
    artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(stateRoot, artifact)))
  };
}

export async function runCaughtUpLiveProductCycle(
  options: CycleOptions,
  cycleId: string,
  now: Date
): Promise<CycleResult> {
  if (options.phase !== "cu-product" || options.dry) {
    throw new Error("Live Caught Up product runner requires a non-dry cu-product phase");
  }
  const [routing, stages, ventureRegistry, agentControls, fixedMonthlyUsd] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry(),
    loadVentureAgentControls(),
    loadFixedMonthlyUsd(configRoot, now)
  ]);
  const definition = composeMeetingRouteDefinition(
    ventureRegistry,
    "cu-product",
    "live"
  );
  const limits = budgetLimitsFromEnvironment();
  const meetingCap = Math.min(definition.envelopeUsd, limits.caughtUpMeetingUsd);
  if (PRODUCT_ROOM_RESERVE_USD > meetingCap) {
    throw new Error(
      `Product-room reserve ${PRODUCT_ROOM_RESERVE_USD} exceeds Caught Up meeting cap ${meetingCap}`
    );
  }
  const date = pragueClockParts(now).date;
  const reference = meetingRef(date, "cu-product");
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: definition.objective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: PRODUCT_ROOM_RESERVE_USD,
    ventureId: definition.ventureId,
    preset: definition.preset,
    requiredParticipants: definition.requiredParticipants,
    disabledParticipants: [...disabledAgentsForVenture(agentControls, definition.ventureId)],
    now
  });
  const [index, globalIndex] = await Promise.all([
    regenerateIdeaIndex(stateRoot, CAUGHT_UP_IDEA_NAMESPACE),
    readIdeaIndexSlice(stateRoot, GLOBAL_IDEA_NAMESPACE)
  ]);
  const morningRaw = await readText(stateRoot, `standups/${date}-morning.json`);
  const morning = morningRaw ? StandupSchema.parse(JSON.parse(morningRaw)) : null;
  if (morning?.caughtUpIdeaRef) {
    await ensureIdeaInNamespace(
      stateRoot,
      CAUGHT_UP_IDEA_NAMESPACE,
      morning.caughtUpIdeaRef
    );
  }
  const ideas = currentIdeaEntries(
    await readIdeaLedger(stateRoot, CAUGHT_UP_IDEA_NAMESPACE)
  );
  const idea = morning?.caughtUpIdeaRef
    ? ideas.find((candidate) => candidate.id === morning.caughtUpIdeaRef) ?? null
    : null;
  if (morning?.caughtUpIdeaRef && !idea) {
    throw new Error(`Morning handoff references unknown idea ${morning.caughtUpIdeaRef}`);
  }
  const previousOutcome = await yesterdayEditionOutcome(stateRoot, date);
  const response = idea
    ? await decideLiveProductRoom({
        context: {
          root: stateRoot,
          ideaNamespace: CAUGHT_UP_IDEA_NAMESPACE,
          cycleId,
          stage: stages.current,
          now,
          limits,
          remainingScheduledCycles: remainingScheduledCycles(now),
          fixedMonthlyUsd
        },
        idea,
        index,
        globalIndex,
        yesterdayOutcome: previousOutcome
      })
    : null;
  const recordedIdea = idea && response
    ? await applyIdeaRoomVerdict({
        root: stateRoot,
        namespace: CAUGHT_UP_IDEA_NAMESPACE,
        ideaId: idea.id,
        verdict: toIdeaRoomVerdict(response),
        meetingRef: reference,
        at: now.toISOString()
      })
    : null;
  const budgetLedger = await currentBudgetLedger(stateRoot);
  const actualCycleUsd = ledgerSpend(
    budgetLedger,
    (entry) => entry.cycleId === cycleId
  );
  const month = now.toISOString().slice(0, 7);
  const monthAllInUsd = ledgerSpend(
    budgetLedger,
    (entry) => entry.ts.slice(0, 7) === month
  );
  const record = await createLiveProductMeeting({
    cycleId,
    stage: stages.current,
    room,
    now,
    estimatedCycleUsd: PRODUCT_ROOM_RESERVE_USD,
    actualCycleUsd,
    monthAllInUsd,
    idea: recordedIdea,
    response,
    yesterdayOutcome: previousOutcome
  });
  const meetingPath = `meetings/${date}-cu-product.json`;
  const decisionPath = `decisions/${cycleId}.json`;
  const scorecardPath = `scorecards/${cycleId}.json`;
  const priorRecords = await loadMeetingRecords(stateRoot);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: [...priorRecords, record],
    skips: await loadMeetingSkips(stateRoot),
    articleSlots: await loadArticleSlotOutcomes(stateRoot),
    now
  });
  const calendarPath = await writeCalendarFeed(stateRoot, calendar);
  await Promise.all([
    atomicWriteJson(stateRoot, meetingPath, record),
    atomicWriteJson(stateRoot, decisionPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId,
      phase: "cu-product",
      outcome: record.decision.outcome,
      summary: record.decision.summary,
      evidenceRefs: record.decision.evidenceRefs,
      ...(record.caughtUpIdeaRef ? { caughtUpIdeaRef: record.caughtUpIdeaRef } : {}),
      generatedAt: record.generatedAt
    }),
    atomicWriteJson(stateRoot, scorecardPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId,
      phase: "cu-product",
      estimatedWorstCaseUsd: PRODUCT_ROOM_RESERVE_USD,
      actualUsd: actualCycleUsd,
      participants: room.selectedParticipants.map((participant) => participant.agent),
      ideaId: recordedIdea?.id ?? null,
      vaultScreening: recordedIdea?.statusHistory[0]?.reason ?? "missing_morning_handoff",
      growthIdeaNovelty: recordedIdea?.statusHistory[0]?.reason.includes("hard stop") ? 0 : recordedIdea ? 1 : null,
      yesterdayOutcome: previousOutcome,
      generatedAt: record.generatedAt
    })
  ]);
  if (options.explainBudget) {
    console.log(JSON.stringify({
      cycleId,
      callGraph: budgetLedger
        .filter((entry) => entry.cycleId === cycleId)
        .map((entry) => ({ agent: entry.agent, model: entry.model, measuredUsd: entry.usd })),
      estimatedWorstCaseUsd: PRODUCT_ROOM_RESERVE_USD,
      measuredUsd: actualCycleUsd
    }, null, 2));
  }
  if (options.explainRouting) {
    console.log(JSON.stringify({
      selected: room.selectedParticipants,
      skipped: room.skippedParticipants,
      caps: { rounds: room.maxRounds, turns: room.maxTurns, tokens: room.maxTotalTokens }
    }, null, 2));
  }
  const decision = response?.verdict === "accept"
    ? "ACCEPT"
    : response?.verdict === "veto"
      ? "VETO"
      : response?.verdict === "supersede"
        ? "SUPERSEDE"
        : "DEFER";
  const artifacts = [
    meetingPath,
    decisionPath,
    scorecardPath,
    calendarPath,
    ideaLedgerPath(CAUGHT_UP_IDEA_NAMESPACE),
    ideaIndexPath(CAUGHT_UP_IDEA_NAMESPACE),
    "budget/ledger.json"
  ];
  return {
    cycleId,
    phase: "cu-product",
    dry: false,
    status: "live_complete",
    decision,
    estimatedWorstCaseUsd: PRODUCT_ROOM_RESERVE_USD,
    selectedAgents: room.selectedParticipants.map((participant) => participant.agent),
    skippedAgents: room.skippedParticipants.map((participant) => participant.agent),
    artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(stateRoot, artifact)))
  };
}
