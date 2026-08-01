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
import { AgendaPhaseSchema, type MeetingAgenda } from "../contracts/meeting-agenda.js";
import { MeetingRecordSchema, type MeetingRecord } from "../contracts/meeting-record.js";
import { EditorialSlateSchema, type EditorialSlate } from "../contracts/mma-files.js";
import { MarketingPlanSchema, type MarketingPlan } from "../contracts/marketing-plan.js";
import { NicheProposalSchema, type NicheProposal } from "../contracts/niche-proposal.js";
import { guardedJsonCall } from "../llm/call.js";
import { loadAgentRegistry } from "../org/registry.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";
import { wrapUntrustedData } from "../security/content.js";
import type { FoundingAgent, Stage } from "../types.js";
import {
  composeMeetingRouteDefinition,
  getVentureMeetingDefinition,
  loadVentureRegistry,
  parseCadenceHour
} from "../ventures/registry.js";
import { disabledAgentsForVenture, loadVentureAgentControls } from "../ventures/agent-controls.js";
import { buildCalendarFeed, loadMeetingRecords, mondayOfWeek, writeCalendarFeed } from "../meetings/calendar.js";
import { pragueClockParts } from "../meetings/clock.js";
import {
  MEETING_AGENDA_PATH,
  consumeMeetingAgenda,
  dueMeetingAgenda,
  loadMeetingPolicy,
  mayRequestMeeting,
  nextAgendaDate,
  phaseNeedsAgenda,
  phaseWakesOnChange,
  readMeetingAgendaQueue,
  requestMeetingAgenda
} from "../meetings/agenda.js";
import { resolveTittyTuesdaysSlot } from "../titty-tuesdays/schedule.js";
import { composeMeetingTastePacket } from "../taste/packet.js";
import { GuardedPalateDistiller, runPalatePass } from "../taste/pipeline.js";
import { bridgeEvidenceRefs, refreshMmaBridge } from "../mma-files/bridge.js";
import { fightWeekFocus, loadEventCards } from "../fightaiq/store.js";
import { refreshReadinessDossiers } from "../fightaiq/readiness.js";
import { refreshFightAiQEvidence, refreshIncubatorEvidence } from "./evidence.js";
import {
  budgetDecisionStatus,
  phaseEnabled,
  resolveEffectivePortfolioSchedule,
  signedOwnerDecision
} from "./schedule.js";
import { renderMarketingPlanMarkdown } from "./marketing-plan.js";
import { foundTemplateVenture, templateCandidateFromProposal } from "../ventures/founding.js";
import { VentureTemplateSchema } from "../contracts/autonomy.js";

export type PortfolioPhase = "tt-marketing" | "incubator-scan" | "incubator-synthesis" | "mma-intake" | "mma-analysis" | "mag-editorial" | "mag-desk";

const ContributionSchema = z.object({
  stance: z.enum(["plan", "pass", "veto"]),
  summary: z.string().trim().min(1).max(280),
  evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(12),
  task: z.object({ summary: z.string().trim().min(1).max(240) }).nullable(),
  nicheProposals: z.array(z.unknown()).max(2).default([]),
  editorialSlate: z.unknown().nullable().default(null),
  marketingPlan: z.unknown().nullable().default(null),
  followUpRequest: z.object({
    phase: AgendaPhaseSchema,
    summary: z.string().trim().min(1).max(280),
    evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(12)
  }).nullable().default(null)
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

function renderNicheProposalMarkdown(proposal: NicheProposal): string {
  return [
    `# ${proposal.domain}`,
    "",
    `> ${proposal.oneLiner}`,
    "",
    "## Why readers would care",
    "",
    proposal.whyPeopleCareDaily,
    "",
    "## Audience",
    "",
    `- Regions: ${proposal.audienceHypothesis.regions.join(", ")}`,
    `- Ages: ${proposal.audienceHypothesis.ageRange.min}–${proposal.audienceHypothesis.ageRange.max}`,
    `- Interests: ${proposal.audienceHypothesis.interests.join(", ")}`,
    `- Platforms: ${proposal.audienceHypothesis.platforms.join(", ")}`,
    "",
    "## Publication shape",
    "",
    `- Cadence: ${proposal.contentShape.cadence}`,
    `- Formats: ${proposal.contentShape.formats.join(", ")}`,
    `- Caught Up reuse: ${proposal.contentShape.caughtUpReuseNotes}`,
    "",
    "## Risks",
    "",
    ...(proposal.risks.length ? proposal.risks.map((risk) => `- ${risk}`) : ["- None recorded"]),
    "",
    "## Evidence",
    "",
    ...(proposal.evidenceRefs.length ? proposal.evidenceRefs.map((reference) => `- ${reference}`) : ["- None recorded"]),
    ""
  ].join("\n");
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
  return { ...model, maxOutputTokens: agent === "ANGLE" || agent === "CANVAS" ? Math.min(700, model.maxOutputTokens) : Math.min(260, model.maxOutputTokens) };
}

function environmentLimits(schedule: { monthlyBudgetUsd: number; dailyBudgetUsd: number; monthlyOperatingUsd: number }): BudgetLimits {
  const number = (name: string, fallback: number) => {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    ...DEFAULT_BUDGET_LIMITS,
    maxCycleUsd: number("MAX_CYCLE_BUDGET_USD", DEFAULT_BUDGET_LIMITS.maxCycleUsd),
    dailyUsd: number("DAILY_BUDGET_USD", schedule.dailyBudgetUsd),
    monthlyApiUsd: number("MONTHLY_BUDGET_USD", schedule.monthlyBudgetUsd),
    monthlyOperatingUsd: number("MONTHLY_OPERATING_CAP_USD", schedule.monthlyOperatingUsd)
  };
}

function shiftedTimes(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => new Date(now.getTime() + index * 60_000).toISOString());
}

function portfolioChair(phase: PortfolioPhase): FoundingAgent {
  if (phase === "mma-intake" || phase === "mma-analysis") return "FORGE";
  if (phase === "mag-editorial" || phase === "mag-desk") return "CANVAS";
  return "PULSE";
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
  monthCapUsd: number;
  contributions: readonly Contribution[];
  fixture: boolean;
  proposals: readonly NicheProposal[];
  editorialSlate: EditorialSlate | null;
  agenda: MeetingAgenda | null;
}): MeetingRecord {
  const isFightDesk = input.phase === "mma-intake" || input.phase === "mma-analysis";
  const isMagazine = input.phase === "mag-editorial" || input.phase === "mag-desk";
  const chair = portfolioChair(input.phase);
  const times = shiftedTimes(input.now, input.contributions.length + 2);
  const veto = input.contributions.find((contribution) => contribution.agent === "AUDIT" && contribution.stance === "veto");
  const summary = veto
    ? `AUDIT vetoed the room output: ${veto.summary}`
    : isFightDesk
      ? input.phase === "mma-intake"
        ? "Checked UFC and Oktagon and recorded the fighter-file, card and source state without publishing a probability."
        : "Reviewed the versioned analysis state within the data-only gate. No probability was published."
    : input.phase === "mag-editorial" && input.editorialSlate
      ? input.editorialSlate.slots.map((slot) => `${slot.slot.toUpperCase()}: ${slot.status}`).join("; ")
    : input.phase === "incubator-synthesis"
      ? input.proposals.length
        ? `Recorded ${input.proposals.length} evidenced niche proposal${input.proposals.length === 1 ? "" : "s"}. The first may be founded only if AUDIT and every deterministic template check pass.`
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
    participantReasons: input.cast.map((agent) => ({ agent, reason: agent === chair ? "chairs the bounded room" : "serves the registered specialist or veto seat", participated: true })),
    ledger: { estimatedCycleUsd: input.envelopeUsd, actualCycleUsd: input.actualCycleUsd, monthAllInUsd: input.monthAllInUsd, monthCapUsd: input.monthCapUsd },
    decision: { outcome: veto ? "VETO" : input.phase === "incubator-synthesis" && input.proposals.length === 0 ? "NO_PROPOSAL" : "PLAN", summary, evidenceRefs: [...new Set(input.contributions.flatMap((contribution) => contribution.evidenceRefs))] },
    proposals: input.contributions.map((contribution) => ({ agent: contribution.agent, summary: contribution.summary, evidenceRefs: contribution.evidenceRefs })),
    voteMatrix: input.contributions.map((contribution) => ({ voter: contribution.agent, firstChoice: contribution.stance, veto: contribution.stance === "veto" })),
    tasks: input.contributions.flatMap((contribution, index) => contribution.task ? [{ id: `TASK-${input.cycleId.toUpperCase()}-${String(index + 1).padStart(2, "0")}`, owner: contribution.agent, summary: contribution.task.summary, status: "planned" as const }] : []),
    growthPlan: input.phase === "tt-marketing" ? "DRAFT_ONLY. Social publishing, ads, commerce and external action remain disabled." : isFightDesk ? "DATA_ONLY. No probability, bookmaker link, account action or bet placement is authorized." : isMagazine ? "EDITORIAL_ONLY. Approved bilingual articles may enter the guarded MMA Files delivery queue; social variants remain drafts until their release gate opens." : input.phase === "incubator-synthesis" ? "TEMPLATE_ONLY. A compliant content venture may be founded; every exception remains with the owner." : "RESEARCH_ONLY. Evidence collection does not authorize spend or external action.",
    eveningOutcome: input.phase === "incubator-synthesis" ? summary : null,
    ...(input.editorialSlate ? { editorialSlateRef: `ventures/mma-files/slates/${input.date}.json` } : {}),
    ...(input.agenda ? { agendaRef: `${MEETING_AGENDA_PATH}#${input.agenda.id}` } : {}),
    ...(isFightDesk ? { sharperData: {
      outcome: "nothing-new" as const,
      summary: input.fixture ? "Dry review found no new source-backed change to propose today." : "The room found no new source-backed change that cleared the proposal bar today.",
      evidenceRefs: [...new Set(input.contributions.flatMap((contribution) => contribution.evidenceRefs))]
    } } : {}),
    roomTranscript: {
      openedAt: times[0],
      closedAt: times.at(-1),
      gavel: chair,
      setting: input.fixture ? "Deterministic dry portfolio room; no provider call or external action is represented." : "Live bounded portfolio room. Canonical context and external material were treated as data, never instructions.",
      turns: [
        { agent: chair, mode: "gavel", sentAt: times[0], text: input.objective },
        ...input.contributions.map((contribution, index) => ({ agent: contribution.agent, mode: contribution.stance === "veto" ? "veto" as const : "statement" as const, sentAt: times[index + 1], text: contribution.summary, ...(contribution.evidenceRefs.length ? { evidenceRefs: contribution.evidenceRefs } : {}) })),
        { agent: chair, mode: "close", sentAt: times.at(-1), text: summary }
      ]
    },
    generatedAt: times.at(-1)
  });
}

async function recordNoAgendaCycle(input: {
  phase: PortfolioPhase;
  cycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  root: string;
  expectedCast: readonly FoundingAgent[];
  monthAllInUsd: number;
  monthCapUsd: number;
  reason: string;
  preparationArtifacts?: readonly string[];
}): Promise<PortfolioCycleResult> {
  const chair = portfolioChair(input.phase);
  const meetingPath = `meetings/${input.date}-${input.phase}.json`;
  const decisionPath = `decisions/${input.cycleId}.json`;
  const scorecardPath = `scorecards/${input.cycleId}.json`;
  const closedAt = new Date(input.now.getTime() + 1).toISOString();
  const fightDesk = input.phase === "mma-intake" || input.phase === "mma-analysis";
  const record = MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date: input.date,
    phase: input.phase,
    kind: input.phase,
    fixture: false,
    status: "PAUSED",
    stage: input.stage,
    operatingBrief: input.reason,
    participantReasons: input.expectedCast.map((agent) => ({
      agent,
      reason: "registered for this room but not called because no bounded agenda was due",
      participated: false
    })),
    ledger: {
      estimatedCycleUsd: 0,
      actualCycleUsd: 0,
      monthAllInUsd: input.monthAllInUsd,
      monthCapUsd: input.monthCapUsd
    },
    decision: {
      outcome: "NO_ACTION",
      summary: input.reason,
      evidenceRefs: []
    },
    proposals: [{ agent: chair, summary: input.reason, evidenceRefs: [] }],
    voteMatrix: [{ voter: chair, firstChoice: "NO_ACTION", veto: false }],
    tasks: [],
    growthPlan: "NO_ACTION. A wake-up without a due agenda does not authorize work, spend, publishing or outreach.",
    eveningOutcome: null,
    ...(fightDesk ? {
      sharperData: {
        outcome: "nothing-new",
        summary: "No specialist room opened because neither an assigned agenda nor a material source change was due.",
        evidenceRefs: []
      }
    } : {}),
    roomTranscript: {
      openedAt: input.now.toISOString(),
      closedAt,
      gavel: chair,
      setting: "The scheduler checked the bounded agenda queue. No specialist meeting opened and no model was called.",
      turns: [{
        agent: chair,
        mode: "close",
        sentAt: closedAt,
        text: input.reason
      }]
    },
    generatedAt: closedAt
  });
  const priorRecords = await loadMeetingRecords(input.root);
  const calendarPath = await writeCalendarFeed(input.root, buildCalendarFeed({
    weekOf: mondayOfWeek(input.date),
    records: [...priorRecords, record],
    now: input.now
  }));
  await Promise.all([
    atomicWriteJson(input.root, meetingPath, record),
    atomicWriteJson(input.root, decisionPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId: input.cycleId,
      phase: input.phase,
      outcome: "NO_ACTION",
      summary: input.reason,
      evidenceRefs: [],
      generatedAt: closedAt
    }),
    atomicWriteJson(input.root, scorecardPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId: input.cycleId,
      phase: input.phase,
      estimatedWorstCaseUsd: 0,
      actualUsd: 0,
      participants: [],
      schedulerOutcome: "not-needed",
      generatedAt: closedAt
    })
  ]);
  return {
    cycleId: input.cycleId,
    phase: input.phase,
    dry: false,
    status: "paused",
    decision: "PAUSED",
    estimatedWorstCaseUsd: 0,
    selectedAgents: [],
    skippedAgents: [...input.expectedCast],
    artifacts: [...(input.preparationArtifacts ?? []), meetingPath, decisionPath, scorecardPath, calendarPath]
      .map((artifact) => path.relative(repoRoot, path.join(input.root, artifact)))
  };
}

async function canonicalStateText(root: string, relative: string): Promise<string> {
  const local = await readText(root, relative);
  return local || root === stateRoot ? local : readText(stateRoot, relative);
}

export async function composePortfolioContext(phase: PortfolioPhase, root: string, date: string, registry: Awaited<ReturnType<typeof loadVentureRegistry>>): Promise<{ text: string; evidenceRefs: string[] }> {
  const taste = await composeMeetingTastePacket({ repoRoot, registry, meetingKind: phase });
  if (phase === "tt-marketing") {
    const season = await readText(root, "ventures/titty-tuesdays/season-001.md");
    return { text: `${season}\n\n${taste ?? ""}`.slice(0, 18_000), evidenceRefs: [] };
  }
  if (phase === "mma-intake" || phase === "mma-analysis") {
    const [overview, bridge, events, sourceSnapshot, sourceSnapshotData] = await Promise.all([
      canonicalStateText(root, "ventures/fightaiq/README.md"),
      readText(root, "mma/BRIDGE.md"),
      loadEventCards(path.join(root, "ventures", "fightaiq", "events")),
      readText(root, `ventures/fightaiq/source-snapshots/${date}.json`),
      readJson<{ evidenceRefs?: string[] }>(root, `ventures/fightaiq/source-snapshots/${date}.json`, {})
    ]);
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const leadOrg = ["ufc", "oktagon"][day % 2];
    const focus = fightWeekFocus(events, new Date(`${date}T12:00:00Z`));
    const focusPacket = focus.length
      ? `Fight-week cards, nearest first. Work only these bouts:\n${JSON.stringify(focus)}`
      : "No verified card is inside the three-day fight-week window. Continue file work across UFC and Oktagon.";
    return {
      text: `${overview}\n\nDaily lead organization: ${leadOrg}. Check UFC and Oktagon.\n\n${focusPacket}\n\nLatest guarded API snapshot:\n${sourceSnapshot}\n\n${taste ?? ""}\n\n${bridge}`.slice(0, 18_000),
      evidenceRefs: [
        ...bridgeEvidenceRefs(bridge),
        ...focus.map((event) => `event:${event.id}`),
        ...(sourceSnapshotData.evidenceRefs ?? [])
      ]
    };
  }
  if (phase === "mag-editorial" || phase === "mag-desk") {
    const [stylebook, bridge, slate, articles, events] = await Promise.all([
      canonicalStateText(root, "ventures/mma-files/STYLEBOOK.md"),
      readText(root, "mma/BRIDGE.md"),
      canonicalStateText(root, `ventures/mma-files/slates/${date}.json`),
      canonicalStateText(root, "ventures/mma-files/articles/INDEX.md"),
      loadEventCards(path.join(root, "ventures", "fightaiq", "events"))
    ]);
    const focus = fightWeekFocus(events, new Date(`${date}T12:00:00Z`));
    return {
      text: `${stylebook}\n\n${taste ?? ""}\n\n${bridge}\n\nFight-week event priority:\n${JSON.stringify(focus)}\n\n${slate}\n\n${articles}`.slice(0, 18_000),
      evidenceRefs: [...bridgeEvidenceRefs(bridge), ...focus.map((event) => `event:${event.id}`)]
    };
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
  const [registry, budgetDecisionRaw, budgetMmaRaw, budgetFiftyRaw, fightAiQFoundingRaw, budgetLedger, stages, routing, agents, modelConfig, agentControls, meetingPolicy] = await Promise.all([
    loadVentureRegistry(),
    readFile(path.join(stateRoot, "decisions", "2026-08-01-budget-raise.md"), "utf8"),
    readFile(path.join(stateRoot, "decisions", "2026-08-02-budget-mma.md"), "utf8"),
    readFile(path.join(stateRoot, "decisions", "2026-08-04-budget-fifty.md"), "utf8"),
    readFile(path.join(stateRoot, "decisions", "2026-08-02-fightaiq-founding.md"), "utf8"),
    readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] }),
    readFile(path.join(configRoot, "stages.json"), "utf8").then((raw) => JSON.parse(raw) as { current: Stage }),
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    loadAgentRegistry(),
    readFile(path.join(configRoot, "models.json"), "utf8").then((raw) => JSON.parse(raw) as { roles: Record<string, { provider: "openai" | "anthropic"; model: string; maxOutputTokens: number }> }),
    loadVentureAgentControls(),
    loadMeetingPolicy()
  ]);
  const entries = budgetLedger.entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
  const month = pragueClockParts(input.now).date.slice(0, 7);
  const spent = entries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0);
  const provisionalCap = signedOwnerDecision(budgetFiftyRaw) === "countersigned"
    ? 42
    : budgetDecisionStatus(budgetDecisionRaw) === "countersigned-shape-a" ? 18 : 15;
  const schedule = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw, budgetMmaRaw, budgetFiftyRaw, fightAiQFoundingRaw, monthlyApiHeadroomUsd: Math.max(0, provisionalCap - spent) });
  if (!input.dry && (process.env.PORTFOLIO_LIVE_ENABLED !== "true" || !phaseEnabled(schedule, input.phase))) {
    return { cycleId: input.cycleId, phase: input.phase, dry: false, status: "paused", decision: "PAUSED", estimatedWorstCaseUsd: 0, selectedAgents: [], skippedAgents: [], artifacts: [] };
  }
  const definition = composeMeetingRouteDefinition(registry, input.phase, input.dry ? "dry" : "live");
  const date = pragueClockParts(input.now).date;
  const root = input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot;
  const preparationArtifacts: string[] = [];
  const scheduledWakeUp = !input.dry && process.env.MEETING_TRIGGER === "schedule";
  const agendaQueue = input.dry ? null : await readMeetingAgendaQueue(root, input.now);
  const agenda = agendaQueue
    ? dueMeetingAgenda(agendaQueue, AgendaPhaseSchema.parse(input.phase), date)
    : null;
  const disabledAgents = disabledAgentsForVenture(agentControls, definition.ventureId);
  const expectedCast = definition.requiredParticipants.filter((agent) => !disabledAgents.has(agent));
  if (scheduledWakeUp && phaseNeedsAgenda(meetingPolicy, input.phase) && !agenda) {
    return recordNoAgendaCycle({
      phase: input.phase,
      cycleId: input.cycleId,
      date,
      now: input.now,
      stage: stages.current,
      root,
      expectedCast,
      monthAllInUsd: spent,
      monthCapUsd: schedule.monthlyOperatingUsd,
      reason: "No bounded agenda was due, so the specialist room did not open and no model was called."
    });
  }
  let sourceMaterialChanged = true;
  if (!input.dry && input.phase === "incubator-scan") {
    const evidence = await refreshIncubatorEvidence({ root, now: input.now });
    preparationArtifacts.push(...evidence.artifactPaths);
  }
  if (!input.dry && input.phase === "mma-intake") {
    const evidence = await refreshFightAiQEvidence({ root, date, now: input.now });
    preparationArtifacts.push(...evidence.artifactPaths);
    sourceMaterialChanged = evidence.materialChange;
    preparationArtifacts.push(...await refreshReadinessDossiers(root, input.now));
  }
  if (input.phase === "mma-intake") {
    await refreshMmaBridge(root, date);
    preparationArtifacts.push("mma/BRIDGE.md");
  }
  if (scheduledWakeUp && phaseWakesOnChange(meetingPolicy, input.phase) && !agenda && !sourceMaterialChanged) {
    return recordNoAgendaCycle({
      phase: input.phase,
      cycleId: input.cycleId,
      date,
      now: input.now,
      stage: stages.current,
      root,
      expectedCast,
      monthAllInUsd: spent,
      monthCapUsd: schedule.monthlyOperatingUsd,
      reason: "The guarded source refresh found no material change and no agenda was due, so no specialist model was called.",
      preparationArtifacts
    });
  }
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  let cast = input.phase === "tt-marketing"
    ? [...resolveTittyTuesdaysSlot({ date }).cast]
    : [...definition.requiredParticipants];
  if (input.phase === "mma-intake") {
    cast = cast.filter((agent) => agent !== "SONAR");
    if (weekday === 2 || weekday === 5) cast.push("SONAR");
    if (weekday === 0 || weekday === 3) cast.push("SIGMA");
  }
  if (input.phase === "mag-editorial") {
    if (weekday === 4) cast.push("TAPE");
    if (weekday === 5) cast.push("REACH", "SPLIT");
  }
  if (input.phase === "mag-desk" && weekday === 5) cast.push("SPLIT");
  cast = [...new Set(cast)];
  cast = cast.filter((agent) => !disabledAgents.has(agent));
  const effectiveObjective = agenda
    ? `${definition.objective} Assigned agenda: ${agenda.summary}`
    : definition.objective;
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${input.cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: effectiveObjective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: schedule.envelopeByPhase[input.phase] ?? definition.envelopeUsd,
    ventureId: definition.ventureId,
    preset: definition.preset,
    requiredParticipants: cast,
    disabledParticipants: [...disabledAgents],
    owner: cast[0],
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
  const context = await composePortfolioContext(input.phase, root, date, registry);
  let contributions: Contribution[];
  let estimatedWorstCaseUsd = 0;
  if (input.dry) {
    const dryChair = input.phase.startsWith("mma-") ? "FORGE" : input.phase.startsWith("mag-") ? "CANVAS" : "PULSE";
    contributions = selected.map((agent) => ({ agent, stance: agent === dryChair ? "plan" : "pass", summary: agent === dryChair ? "Dry room complete. No provider call, external action or unsupported artifact is represented." : `${agent} records no live contribution in a deterministic dry run.`, evidenceRefs: [], task: null, nicheProposals: [], editorialSlate: null, marketingPlan: null, followUpRequest: null }));
  } else {
    const promptName = input.phase.startsWith("incubator-") ? "incubator.md" : input.phase.startsWith("mma-") ? "mma.md" : input.phase.startsWith("mag-") ? "magazine.md" : "pulse.md";
    const roomPrompt = await readFile(path.join(repoRoot, "orchestrator", "prompts", promptName), "utf8");
    const calls = selected.map((agent) => {
      const profile = agents.agents.find((candidate) => candidate.id === agent)!;
      const model = modelFor(agent, profile.provider, modelConfig.roles);
      const system = `${roomPrompt}\n\nROLE BOUNDARY:\n${profile.mission}\nReturn one JSON object: {"stance":"plan|pass|veto","summary":"<=280 chars","evidenceRefs":[],"task":null|{"summary":"..."},"nicheProposals":[],"editorialSlate":null|{"schemaVersion":"editorial-slate/1","date":"YYYY-MM-DD","slots":[...],"vaultVerdicts":[...]},"marketingPlan":null|{"schemaVersion":"marketing-plan/1","title":"...","summary":"<=280 chars","objective":"...","tactics":[...],"calendar":[...],"audienceRefs":[...],"kpis":[...]},"followUpRequest":null|{"phase":"allowed phase","summary":"why another room is needed","evidenceRefs":[]}}. The room chair may request at most one allowlisted follow-up only when another specialist decision is genuinely needed; everyone else returns followUpRequest:null. Only ANGLE may return one detailed marketingPlan during tt-marketing. It must describe future campaign ideas only; no publishing, image production, paid media, commerce, outreach or spend is authorized. Only ANGLE may return up to two complete niche-proposal/1 objects during incubator synthesis. Only CANVAS may return editorialSlate, and only during mag-editorial. Use exactly one AM and one PM slot; kill a slot when its source-backed subject is missing or repeated.`;
      const prompt = wrapUntrustedData("canonical-portfolio-packet", JSON.stringify({
        phase: input.phase,
        objective: effectiveObjective,
        agenda: agenda ? {
          id: agenda.id,
          summary: agenda.summary,
          evidenceRefs: agenda.evidenceRefs,
          sourceMeetingRef: agenda.sourceMeetingRef
        } : null,
        allowedEvidenceRefs: context.evidenceRefs,
        context: context.text
      }));
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
  let marketingPlan: MarketingPlan | null = null;
  if (input.phase === "tt-marketing") {
    const meetingRef = `${date}-tt-marketing`;
    const rawPlan = input.dry
      ? JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", "marketing-plan.valid.json"), "utf8")) as Record<string, unknown>
      : contributions.find((contribution) => contribution.agent === "ANGLE")?.marketingPlan;
    const parsedPlan = rawPlan && typeof rawPlan === "object"
      ? MarketingPlanSchema.safeParse({
          ...rawPlan,
          schemaVersion: "marketing-plan/1",
          id: `plan-${date}-campaign-notes`,
          ventureId: "titty-tuesdays",
          seasonId: "season-001",
          status: "draft",
          originMeetingRef: meetingRef
        })
      : null;
    marketingPlan = parsedPlan?.success ? parsedPlan.data : MarketingPlanSchema.parse({
      schemaVersion: "marketing-plan/1",
      id: `plan-${date}-campaign-notes`,
      ventureId: "titty-tuesdays",
      seasonId: "season-001",
      title: `Campaign notes for ${date}`,
      summary: contributions.find((contribution) => contribution.agent === "ANGLE")?.summary ?? "The room kept a short list of future campaign directions for owner review.",
      objective: "Keep a detailed record of future marketing ideas without producing assets or taking any public action.",
      tactics: contributions.map((contribution) => ({
        type: "content" as const,
        description: contribution.summary,
        assetsNeeded: ["owner-approved campaign brief"],
        platformPolicyNote: "Planning only. Do not publish, generate social images or contact anyone."
      })),
      calendar: [{ week: 1, focus: "Owner reads the notes and decides whether any direction deserves a separate brief." }],
      audienceRefs: [],
      kpis: ["The owner can understand and rate each proposed direction without opening the meeting transcript."],
      status: "draft",
      originMeetingRef: meetingRef
    });
  }
  let editorialSlate: EditorialSlate | null = null;
  if (input.phase === "mag-editorial") {
    if (input.dry) {
      const fixture = JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", "editorial-slate.valid.json"), "utf8")) as Record<string, unknown>;
      editorialSlate = EditorialSlateSchema.parse({ ...fixture, date });
    } else {
      const candidate = contributions.find((contribution) => contribution.agent === "CANVAS")?.editorialSlate;
      const parsed = EditorialSlateSchema.safeParse(candidate);
      editorialSlate = parsed.success ? parsed.data : EditorialSlateSchema.parse({
        schemaVersion: "editorial-slate/1",
        date,
        slots: [
          { slot: "am", format: "desk-notes", subjectRefs: [`missing:${date}:am`], rationale: "No new source-backed subject cleared the desk before the morning cutoff.", assignedWriter: "JAB", status: "killed", killedReason: "Missing fresh, source-backed subject." },
          { slot: "pm", format: "desk-notes", subjectRefs: [`missing:${date}:pm`], rationale: "No new source-backed subject cleared the desk before the evening cutoff.", assignedWriter: "QUILL", status: "killed", killedReason: "Missing fresh, source-backed subject." }
        ],
        vaultVerdicts: [
          { subjectRef: `missing:${date}:am`, verdict: "repeat", evidenceRef: `meeting:${date}-mag-editorial` },
          { subjectRef: `missing:${date}:pm`, verdict: "repeat", evidenceRef: `meeting:${date}-mag-editorial` }
        ]
      });
      const fightWeekSubject = context.evidenceRefs.find((reference) => reference.startsWith("event:"))?.slice("event:".length);
      if (fightWeekSubject && !editorialSlate.slots.some((slot) => slot.status === "assigned" && slot.subjectRefs.includes(fightWeekSubject))) {
        editorialSlate = EditorialSlateSchema.parse({
          ...editorialSlate,
          slots: [
            { slot: "am", format: "fight-week-preview", subjectRefs: [fightWeekSubject], rationale: "The nearest verified card is inside the three-day window and takes one daily slot.", assignedWriter: "JAB", status: "assigned" },
            editorialSlate.slots[1]
          ],
          vaultVerdicts: [
            ...editorialSlate.vaultVerdicts.filter((verdict) => verdict.subjectRef !== editorialSlate!.slots[0].subjectRefs[0]),
            { subjectRef: fightWeekSubject, verdict: "fresh", evidenceRef: `event:${fightWeekSubject}` }
          ]
        });
      }
    }
  }
  const actualEntries = input.dry ? [] : (await readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] })).entries;
  const actualCycleUsd = actualEntries.filter((entry) => entry.cycleId === input.cycleId).reduce((sum, entry) => sum + entry.usd, 0);
  const monthAllInUsd = actualEntries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0);
  const record = buildRecord({ phase: input.phase, cycleId: input.cycleId, date, now: input.now, stage: stages.current, cast: selected, objective: effectiveObjective, envelopeUsd: schedule.envelopeByPhase[input.phase] ?? definition.envelopeUsd, actualCycleUsd, monthAllInUsd, monthCapUsd: schedule.monthlyOperatingUsd, contributions, fixture: input.dry, proposals, editorialSlate, agenda });
  const meetingPath = `meetings/${date}-${input.phase}.json`;
  const decisionPath = `decisions/${input.cycleId}.json`;
  const scorecardPath = `scorecards/${input.cycleId}.json`;
  const priorRecords = await loadMeetingRecords(root);
  const calendarPath = await writeCalendarFeed(root, buildCalendarFeed({ weekOf: mondayOfWeek(date), records: [...priorRecords, record], now: input.now }));
  const proposalPaths = proposals.map((proposal) => `ventures/incubator/niche-proposals/${proposal.id}.json`);
  const proposalMarkdownPaths = proposals.map((proposal) => `ventures/incubator/niche-proposals/${proposal.id}.md`);
  const editorialSlatePath = editorialSlate ? `ventures/mma-files/slates/${date}.json` : null;
  const marketingPlanPath = marketingPlan ? `ventures/titty-tuesdays/plans/${marketingPlan.id}.json` : null;
  const marketingPlanMarkdownPath = marketingPlan ? `ventures/titty-tuesdays/plans/${marketingPlan.id}.md` : null;
  await Promise.all([
    atomicWriteJson(root, meetingPath, record),
    atomicWriteJson(root, decisionPath, { schemaVersion: 1, fixture: input.dry, cycleId: input.cycleId, phase: input.phase, outcome: record.decision.outcome, summary: record.decision.summary, evidenceRefs: record.decision.evidenceRefs, ...(agenda ? { agendaRef: `${MEETING_AGENDA_PATH}#${agenda.id}` } : {}), generatedAt: record.generatedAt }),
    atomicWriteJson(root, scorecardPath, { schemaVersion: 1, fixture: input.dry, cycleId: input.cycleId, phase: input.phase, estimatedWorstCaseUsd, actualUsd: actualCycleUsd, participants: selected, agendaId: agenda?.id ?? null, generatedAt: record.generatedAt }),
    ...(editorialSlatePath && editorialSlate ? [atomicWriteJson(root, editorialSlatePath, editorialSlate)] : []),
    ...(marketingPlan && marketingPlanPath && marketingPlanMarkdownPath ? [
      atomicWriteJson(root, marketingPlanPath, marketingPlan),
      atomicWriteText(root, marketingPlanMarkdownPath, renderMarketingPlanMarkdown(marketingPlan))
    ] : []),
    ...proposals.flatMap((proposal, index) => [
      atomicWriteJson(root, proposalPaths[index]!, proposal),
      atomicWriteText(root, proposalMarkdownPaths[index]!, renderNicheProposalMarkdown(proposal))
    ])
  ]);
  let agendaStateChanged = false;
  if (!input.dry && agenda) {
    await consumeMeetingAgenda({
      root,
      agendaId: agenda.id,
      cycleId: input.cycleId,
      now: input.now
    });
    agendaStateChanged = true;
  }
  if (!input.dry && !contributions.some((contribution) => contribution.agent === "AUDIT" && contribution.stance === "veto")) {
    const chair = portfolioChair(input.phase);
    const followUp = contributions.find((contribution) => contribution.agent === chair)?.followUpRequest;
    if (followUp && mayRequestMeeting(meetingPolicy, input.phase, followUp.phase)) {
      const target = getVentureMeetingDefinition(registry, followUp.phase);
      const currentHour = pragueClockParts(input.now).hour;
      try {
        await requestMeetingAgenda({
          root,
          policy: meetingPolicy,
          ventureId: target.ventureId,
          phase: followUp.phase,
          requestedBy: chair,
          sourcePhase: input.phase,
          sourceMeetingRef: `meetings/${date}-${input.phase}`,
          summary: followUp.summary,
          evidenceRefs: followUp.evidenceRefs,
          notBefore: nextAgendaDate({
            currentDate: date,
            currentHour,
            targetHour: parseCadenceHour(target.meeting.cadence)
          }),
          now: input.now
        });
        agendaStateChanged = true;
      } catch (error) {
        console.warn(`Follow-up meeting request was not queued: ${error instanceof Error ? error.message : "unknown scheduler error"}`);
      }
    }
  }
  const foundingArtifacts: string[] = [];
  if (!input.dry && input.phase === "incubator-synthesis" && proposals.length > 0 && !contributions.some((contribution) => contribution.agent === "AUDIT" && contribution.stance === "veto")) {
    const template = VentureTemplateSchema.parse(JSON.parse(await readFile(path.join(configRoot, "venture-template.json"), "utf8")));
    const currentRegistry = await loadVentureRegistry();
    const candidate = templateCandidateFromProposal({ proposal: proposals[0]!, registry: currentRegistry, template });
    if (!currentRegistry.ventures.some((venture) => venture.id === candidate.slug)) {
      const founded = await foundTemplateVenture({ repoRoot, candidateValue: candidate, now: input.now });
      foundingArtifacts.push(...founded.files);
    }
  }
  if (input.explainBudget) console.log(JSON.stringify({ cycleId: input.cycleId, shape: schedule.shape, envelopeUsd: record.ledger.estimatedCycleUsd, estimatedWorstCaseUsd, measuredUsd: actualCycleUsd }, null, 2));
  if (input.explainRouting) console.log(JSON.stringify({ selected: room.selectedParticipants, skipped: room.skippedParticipants, preSteps: definition.preSteps }, null, 2));
  const artifacts = [...preparationArtifacts, meetingPath, decisionPath, scorecardPath, calendarPath, ...proposalPaths, ...proposalMarkdownPaths, ...(editorialSlatePath ? [editorialSlatePath] : []), ...(marketingPlanPath ? [marketingPlanPath] : []), ...(marketingPlanMarkdownPath ? [marketingPlanMarkdownPath] : []), ...(agendaStateChanged ? [MEETING_AGENDA_PATH] : []), ...foundingArtifacts, ...(input.dry ? [] : ["budget/ledger.json"])];
  return { cycleId: input.cycleId, phase: input.phase, dry: input.dry, status: input.dry ? "dry_complete" : "live_complete", decision: "PLAN", estimatedWorstCaseUsd, selectedAgents: selected, skippedAgents: room.skippedParticipants.map(({ agent }) => agent), artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(root, artifact))) };
}
