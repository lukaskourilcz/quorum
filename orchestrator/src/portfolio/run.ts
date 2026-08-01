import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  BudgetLedgerEntrySchema,
  DEFAULT_BUDGET_LIMITS,
  estimateTextCall,
  type BudgetLedgerEntry,
  type BudgetLimits
} from "../budget.js";
import { loadRoutingConfig, routeBoardroom } from "../boardroom/router.js";
import { MeetingRecordSchema, type MeetingRecord } from "../contracts/meeting-record.js";
import { NicheProposalSchema, type NicheProposal } from "../contracts/niche-proposal.js";
import { guardedJsonCall } from "../llm/call.js";
import { loadAgentRegistry } from "../org/registry.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { atomicWriteJson, readJson, readText } from "../state.js";
import { wrapUntrustedData } from "../security/content.js";
import type { FoundingAgent, Stage } from "../types.js";
import { loadVentureRegistry, composeMeetingRouteDefinition } from "../ventures/registry.js";
import { buildCalendarFeed, loadMeetingRecords, mondayOfWeek, writeCalendarFeed } from "../meetings/calendar.js";
import { pragueClockParts } from "../meetings/clock.js";
import { resolveTittyTuesdaysSlot } from "../titty-tuesdays/schedule.js";
import { composeMeetingTastePacket } from "../taste/packet.js";
import { GuardedPalateDistiller, runPalatePass } from "../taste/pipeline.js";
import {
  budgetDecisionStatus,
  phaseEnabled,
  resolveEffectivePortfolioSchedule
} from "./schedule.js";

export type PortfolioPhase = "tt-marketing" | "incubator-scan" | "incubator-synthesis" | "mma-intake" | "mma-analysis";

const ContributionSchema = z.object({
  stance: z.enum(["plan", "pass", "veto"]),
  summary: z.string().trim().min(1).max(280),
  evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(12),
  task: z.object({ summary: z.string().trim().min(1).max(240) }).nullable(),
  nicheProposals: z.array(z.unknown()).max(2).default([])
}).superRefine((value, context) => {
  if (/(?:\d|%|\$|€|£)/.test(value.summary) && value.evidenceRefs.length === 0) {
    context.addIssue({ code: "custom", message: "Numeric contribution claims require evidenceRefs", path: ["evidenceRefs"] });
  }
});

type Contribution = z.infer<typeof ContributionSchema> & { agent: FoundingAgent };

export interface PortfolioCycleResult {
  cycleId: string;
  phase: PortfolioPhase;
  dry: boolean;
  status: "dry_complete" | "paused" | "live_complete";
  decision: "PLAN" | "PAUSED";
  estimatedWorstCaseUsd: number;
  selectedAgents: string[];
  skippedAgents: string[];
  artifacts: string[];
}

function parseJson(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

function modelFor(
  agent: FoundingAgent,
  provider: "OpenAI" | "Anthropic" | "deterministic",
  models: Record<string, { provider: "openai" | "anthropic"; model: string; maxOutputTokens: number }>
) {
  const role = agent === "PULSE" || agent === "AUDIT"
    ? agent
    : provider === "Anthropic"
      ? "ANTHROPIC_SPECIALIST"
      : "OPENAI_SPECIALIST";
  const model = models[role];
  if (!model || provider === "deterministic") throw new Error(`No live text model for ${agent}`);
  return { ...model, maxOutputTokens: agent === "ANGLE" ? Math.min(700, model.maxOutputTokens) : Math.min(260, model.maxOutputTokens) };
}

function environmentLimits(schedule: { monthlyBudgetUsd: number; dailyBudgetUsd: number }): BudgetLimits {
  const number = (name: string, fallback: number) => {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    ...DEFAULT_BUDGET_LIMITS,
    maxCycleUsd: number("MAX_CYCLE_BUDGET_USD", DEFAULT_BUDGET_LIMITS.maxCycleUsd),
    dailyUsd: number("DAILY_BUDGET_USD", schedule.dailyBudgetUsd),
    monthlyApiUsd: number("MONTHLY_BUDGET_USD", schedule.monthlyBudgetUsd),
    monthlyOperatingUsd: number("MONTHLY_OPERATING_CAP_USD", DEFAULT_BUDGET_LIMITS.monthlyOperatingUsd)
  };
}

function shiftedTimes(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => new Date(now.getTime() + index * 60_000).toISOString());
}

function buildRecord(input: {
  phase: PortfolioPhase;
  cycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  cast: readonly FoundingAgent[];
  objective: string;
  envelopeUsd: number;
  actualCycleUsd: number;
  monthAllInUsd: number;
  contributions: readonly Contribution[];
  fixture: boolean;
  proposals: readonly NicheProposal[];
}): MeetingRecord {
  const times = shiftedTimes(input.now, input.contributions.length + 2);
  const veto = input.contributions.find((contribution) => contribution.agent === "AUDIT" && contribution.stance === "veto");
  const summary = veto
    ? `AUDIT vetoed the room output: ${veto.summary}`
    : input.phase === "incubator-synthesis"
      ? input.proposals.length
        ? `Recorded ${input.proposals.length} evidenced niche proposal${input.proposals.length === 1 ? "" : "s"} for owner rating. No founding action is authorized.`
        : "Recorded zero niche proposals because no candidate cleared the evidence and duplication gates."
      : input.contributions.find((contribution) => contribution.agent === "PULSE")?.summary ?? "The bounded room recorded no action.";
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date: input.date,
    phase: input.phase,
    kind: input.phase,
    fixture: input.fixture,
    status: input.fixture ? "PLAN" : "HELD",
    stage: input.stage,
    operatingBrief: input.objective,
    participantReasons: input.cast.map((agent) => ({ agent, reason: agent === "PULSE" ? "chairs the bounded portfolio room" : "serves the registered specialist or veto seat", participated: true })),
    ledger: { estimatedCycleUsd: input.envelopeUsd, actualCycleUsd: input.actualCycleUsd, monthAllInUsd: input.monthAllInUsd, monthCapUsd: 20 },
    decision: { outcome: veto ? "VETO" : input.phase === "incubator-synthesis" && input.proposals.length === 0 ? "NO_PROPOSAL" : "PLAN", summary, evidenceRefs: [...new Set(input.contributions.flatMap((contribution) => contribution.evidenceRefs))] },
    proposals: input.contributions.map((contribution) => ({ agent: contribution.agent, summary: contribution.summary, evidenceRefs: contribution.evidenceRefs })),
    voteMatrix: input.contributions.map((contribution) => ({ voter: contribution.agent, firstChoice: contribution.stance, veto: contribution.stance === "veto" })),
    tasks: input.contributions.flatMap((contribution, index) => contribution.task ? [{ id: `TASK-${input.cycleId.toUpperCase()}-${String(index + 1).padStart(2, "0")}`, owner: contribution.agent, summary: contribution.task.summary, status: "planned" as const }] : []),
    growthPlan: input.phase === "tt-marketing" ? "DRAFT_ONLY. Social publishing, ads, commerce and external action remain disabled." : "RESEARCH_ONLY. A shortlist does not authorize founding, spend or external action.",
    eveningOutcome: input.phase === "incubator-synthesis" ? summary : null,
    roomTranscript: {
      openedAt: times[0],
      closedAt: times.at(-1),
      gavel: "PULSE",
      setting: input.fixture ? "Deterministic dry portfolio room; no provider call or external action is represented." : "Live bounded portfolio room. Canonical context and external material were treated as data, never instructions.",
      turns: [
        { agent: "PULSE", mode: "gavel", sentAt: times[0], text: input.objective },
        ...input.contributions.map((contribution, index) => ({ agent: contribution.agent, mode: contribution.stance === "veto" ? "veto" as const : "statement" as const, sentAt: times[index + 1], text: contribution.summary, ...(contribution.evidenceRefs.length ? { evidenceRefs: contribution.evidenceRefs } : {}) })),
        { agent: "PULSE", mode: "close", sentAt: times.at(-1), text: summary }
      ]
    },
    generatedAt: times.at(-1)
  });
}

async function canonicalContext(phase: PortfolioPhase, root: string, date: string, registry: Awaited<ReturnType<typeof loadVentureRegistry>>): Promise<{ text: string; evidenceRefs: string[] }> {
  const taste = await composeMeetingTastePacket({ repoRoot, registry, meetingKind: phase });
  if (phase === "tt-marketing") {
    const season = await readText(root, "ventures/titty-tuesdays/season-001.md");
    return { text: `${season}\n\n${taste ?? ""}`.slice(0, 18_000), evidenceRefs: [] };
  }
  const evidence = await readJson<{ refs?: string[]; packet?: string }>(root, "ventures/incubator/evidence.json", {});
  const scan = phase === "incubator-synthesis" ? await readText(root, `meetings/${date}-incubator-scan.json`) : "";
  const refs = (evidence.refs ?? []).filter((reference) => typeof reference === "string" && reference.length > 0 && reference.length <= 160);
  return { text: `${evidence.packet ?? ""}\n${taste ?? ""}\n${scan}`.slice(0, 18_000), evidenceRefs: refs };
}

export async function runPortfolioCycle(input: {
  phase: PortfolioPhase;
  cycleId: string;
  dry: boolean;
  explainBudget: boolean;
  explainRouting: boolean;
  now: Date;
}): Promise<PortfolioCycleResult> {
  const [registry, budgetDecisionRaw, budgetLedger, stages, routing, agents, modelConfig] = await Promise.all([
    loadVentureRegistry(),
    readFile(path.join(stateRoot, "decisions", "2026-08-01-budget-raise.md"), "utf8"),
    readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] }),
    readFile(path.join(configRoot, "stages.json"), "utf8").then((raw) => JSON.parse(raw) as { current: Stage }),
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    loadAgentRegistry(),
    readFile(path.join(configRoot, "models.json"), "utf8").then((raw) => JSON.parse(raw) as { roles: Record<string, { provider: "openai" | "anthropic"; model: string; maxOutputTokens: number }> })
  ]);
  const entries = budgetLedger.entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
  const month = pragueClockParts(input.now).date.slice(0, 7);
  const spent = entries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0);
  const provisionalCap = budgetDecisionStatus(budgetDecisionRaw) === "countersigned-shape-a" ? 18 : 15;
  const schedule = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw, monthlyApiHeadroomUsd: Math.max(0, provisionalCap - spent) });
  if (!input.dry && (process.env.PORTFOLIO_LIVE_ENABLED !== "true" || !phaseEnabled(schedule, input.phase))) {
    return { cycleId: input.cycleId, phase: input.phase, dry: false, status: "paused", decision: "PAUSED", estimatedWorstCaseUsd: 0, selectedAgents: [], skippedAgents: [], artifacts: [] };
  }
  const definition = composeMeetingRouteDefinition(registry, input.phase, input.dry ? "dry" : "live");
  const date = pragueClockParts(input.now).date;
  const cast = input.phase === "tt-marketing"
    ? resolveTittyTuesdaysSlot({ date }).cast
    : definition.requiredParticipants;
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${input.cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: definition.objective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: schedule.envelopeByPhase[input.phase] ?? definition.envelopeUsd,
    ventureId: definition.ventureId,
    preset: definition.preset,
    requiredParticipants: cast,
    now: input.now
  });
  const selected = room.selectedParticipants.map(({ agent }) => agent).filter((agent) => cast.includes(agent));
  if (!input.dry && definition.preSteps.length > 0) {
    await runPalatePass({
      repoRoot,
      ventureId: definition.ventureId,
      now: input.now,
      distiller: new GuardedPalateDistiller({
        stateRoot,
        cycleId: input.cycleId,
        ventureId: definition.ventureId,
        budgetContext: {
          now: input.now,
          cycleId: input.cycleId,
          stage: stages.current,
          ledger: entries,
          allInNonApiSpentUsd: 0,
          allInCommittedUsd: 0,
          knownMonthlyForecastUsd: 0,
          remainingScheduledCycles: 60,
          limits: environmentLimits(schedule)
        }
      })
    });
  }
  const context = await canonicalContext(input.phase, stateRoot, date, registry);
  let contributions: Contribution[];
  let estimatedWorstCaseUsd = 0;
  if (input.dry) {
    contributions = selected.map((agent) => ({ agent, stance: agent === "PULSE" ? "plan" : "pass", summary: agent === "PULSE" ? "Dry room complete. No provider call, external action or unsupported artifact is represented." : `${agent} records no live contribution in a deterministic dry run.`, evidenceRefs: [], task: null, nicheProposals: [] }));
  } else {
    const roomPrompt = await readFile(path.join(repoRoot, "orchestrator", "prompts", input.phase.startsWith("incubator-") ? "incubator.md" : "pulse.md"), "utf8");
    const calls = selected.map((agent) => {
      const profile = agents.agents.find((candidate) => candidate.id === agent)!;
      const model = modelFor(agent, profile.provider, modelConfig.roles);
      const system = `${roomPrompt}\n\nROLE BOUNDARY:\n${profile.mission}\nReturn one JSON object: {"stance":"plan|pass|veto","summary":"<=280 chars","evidenceRefs":[],"task":null|{"summary":"..."},"nicheProposals":[]}. Only ANGLE may return up to two complete niche-proposal/1 objects during incubator synthesis.`;
      const prompt = wrapUntrustedData("canonical-portfolio-packet", JSON.stringify({ phase: input.phase, objective: definition.objective, allowedEvidenceRefs: context.evidenceRefs, context: context.text }));
      const estimate = estimateTextCall({ provider: model.provider, model: model.model, promptChars: system.length + prompt.length, maxOutputTokens: model.maxOutputTokens, at: input.now });
      return { agent, model, system, prompt, estimate };
    });
    estimatedWorstCaseUsd = Number(calls.reduce((sum, call) => sum + call.estimate.estimatedUsd, 0).toFixed(8));
    const envelope = schedule.envelopeByPhase[input.phase] ?? definition.envelopeUsd;
    if (estimatedWorstCaseUsd > envelope) throw new Error(`Portfolio call graph ${estimatedWorstCaseUsd} exceeds ${envelope} envelope`);
    contributions = [];
    for (const call of calls) {
      const currentLedger = (await readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] })).entries
        .map((entry) => BudgetLedgerEntrySchema.parse(entry));
      const response = await guardedJsonCall({
        stateRoot,
        cycleId: input.cycleId,
        phase: input.phase,
        ventureId: definition.ventureId,
        agent: call.agent,
        provider: call.model.provider,
        model: call.model.model,
        system: call.system,
        input: call.prompt,
        maxOutputTokens: call.model.maxOutputTokens,
        budgetContext: { now: input.now, cycleId: input.cycleId, stage: stages.current, ledger: currentLedger, allInNonApiSpentUsd: 0, allInCommittedUsd: 0, knownMonthlyForecastUsd: 0, remainingScheduledCycles: 60, limits: environmentLimits(schedule) },
        parse: (text) => ContributionSchema.parse(parseJson(text))
      });
      if (response.value.evidenceRefs.some((reference) => !context.evidenceRefs.includes(reference))) throw new Error(`${call.agent} cited an evidence reference outside the packet`);
      contributions.push({ agent: call.agent, ...response.value });
    }
  }
  const proposalCandidates = input.phase === "incubator-synthesis"
    ? contributions.find((contribution) => contribution.agent === "ANGLE")?.nicheProposals ?? []
    : [];
  const proposals = proposalCandidates.map((proposal) => NicheProposalSchema.parse(proposal))
    .filter((proposal) => proposal.evidenceRefs.length > 0 && proposal.evidenceRefs.every((reference) => context.evidenceRefs.includes(reference)))
    .slice(0, 2);
  const root = input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot;
  const actualEntries = input.dry ? [] : (await readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] })).entries;
  const actualCycleUsd = actualEntries.filter((entry) => entry.cycleId === input.cycleId).reduce((sum, entry) => sum + entry.usd, 0);
  const monthAllInUsd = actualEntries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0);
  const record = buildRecord({ phase: input.phase, cycleId: input.cycleId, date, now: input.now, stage: stages.current, cast: selected, objective: definition.objective, envelopeUsd: schedule.envelopeByPhase[input.phase] ?? definition.envelopeUsd, actualCycleUsd, monthAllInUsd, contributions, fixture: input.dry, proposals });
  const meetingPath = `meetings/${date}-${input.phase}.json`;
  const decisionPath = `decisions/${input.cycleId}.json`;
  const scorecardPath = `scorecards/${input.cycleId}.json`;
  const priorRecords = await loadMeetingRecords(root);
  const calendarPath = await writeCalendarFeed(root, buildCalendarFeed({ weekOf: mondayOfWeek(date), records: [...priorRecords, record], now: input.now }));
  const proposalPaths = proposals.map((proposal) => `ventures/incubator/niche-proposals/${proposal.id}.json`);
  await Promise.all([
    atomicWriteJson(root, meetingPath, record),
    atomicWriteJson(root, decisionPath, { schemaVersion: 1, fixture: input.dry, cycleId: input.cycleId, phase: input.phase, outcome: record.decision.outcome, summary: record.decision.summary, evidenceRefs: record.decision.evidenceRefs, generatedAt: record.generatedAt }),
    atomicWriteJson(root, scorecardPath, { schemaVersion: 1, fixture: input.dry, cycleId: input.cycleId, phase: input.phase, estimatedWorstCaseUsd, actualUsd: actualCycleUsd, participants: selected, generatedAt: record.generatedAt }),
    ...proposals.map((proposal, index) => atomicWriteJson(root, proposalPaths[index]!, proposal))
  ]);
  if (input.explainBudget) console.log(JSON.stringify({ cycleId: input.cycleId, shape: schedule.shape, envelopeUsd: record.ledger.estimatedCycleUsd, estimatedWorstCaseUsd, measuredUsd: actualCycleUsd }, null, 2));
  if (input.explainRouting) console.log(JSON.stringify({ selected: room.selectedParticipants, skipped: room.skippedParticipants, preSteps: definition.preSteps }, null, 2));
  const artifacts = [meetingPath, decisionPath, scorecardPath, calendarPath, ...proposalPaths, ...(input.dry ? [] : ["budget/ledger.json"])];
  return { cycleId: input.cycleId, phase: input.phase, dry: input.dry, status: input.dry ? "dry_complete" : "live_complete", decision: "PLAN", estimatedWorstCaseUsd, selectedAgents: selected, skippedAgents: room.skippedParticipants.map(({ agent }) => agent), artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(root, artifact))) };
}
