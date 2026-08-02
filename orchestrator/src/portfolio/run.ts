import { readdir, readFile } from "node:fs/promises";
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
import { guardedJsonCall, ModelOutputParseError } from "../llm/call.js";
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
import { buildCalendarFeed, loadArticleSlotOutcomes, loadMeetingRecords, loadMeetingSkips, mondayOfWeek, writeCalendarFeed } from "../meetings/calendar.js";
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
import { loadFixedMonthlyUsd } from "../money/fixed-costs.js";
import { GuardedPalateDistiller, runPalatePass } from "../taste/pipeline.js";
import { bridgeEvidenceRefs, refreshMmaBridge } from "../mma-files/bridge.js";
import { fightWeekFocus, loadEventCards, loadFighterRecords } from "../fightaiq/store.js";
import { refreshReadinessDossiers } from "../fightaiq/readiness.js";
import { refreshFightAiQAnalysis, refreshFightAiQEvidence, refreshIncubatorEvidence } from "./evidence.js";
import {
  budgetDecisionStatus,
  phaseEnabled,
  resolveEffectivePortfolioSchedule,
  signedOwnerDecision
} from "./schedule.js";
import { environmentBudgetLimits } from "./limits.js";
import { renderMarketingPlanMarkdown } from "./marketing-plan.js";
import { foundTemplateVenture, templateCandidateFromProposal } from "../ventures/founding.js";
import { VentureTemplateSchema } from "../contracts/autonomy.js";
import { composeTittyTuesdaysSocialQueue } from "../social/venture-packs.js";
import { socialContentGenerationEnabled } from "../social/activation.js";
import { processStudioContribution } from "../studio/lifecycle.js";
import {
  deterministicVaultAdjudicator,
  ideaIndexPath,
  ideaLedgerPath,
  regenerateIdeaIndex,
  screenAndRecordIdea
} from "../ideas/ledger.js";

export type PortfolioPhase = "tt-marketing" | "incubator-scan" | "incubator-synthesis" | "mma-intake" | "mma-analysis" | "mag-editorial" | "mag-desk" | "studio";

const ContributionSchema = z.object({
  stance: z.enum(["plan", "pass", "veto"]),
  // Clip the free-text fields rather than reject them. Three seats were dropped in one live
  // mma-intake for a summary a few characters over 280, each after being billed — the room
  // lost most of its contributions to a display limit. The cap exists so a public record
  // stays readable, and a clipped summary satisfies that; a discarded seat does not. Fields
  // that carry meaning rather than prose (evidenceRefs, stance, ids) still reject, because
  // silently trimming those would change what was claimed.
  summary: z.string().trim().min(1).transform((value) => value.slice(0, 280)),
  evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(12),
  task: z.object({ summary: z.string().trim().min(1).transform((value) => value.slice(0, 240)) }).nullable(),
  nicheProposals: z.array(z.unknown()).max(2).default([]),
  editorialSlate: z.unknown().nullable().default(null),
  marketingPlan: z.unknown().nullable().default(null),
  templateProposal: z.unknown().nullable().default(null),
  inspirationObservations: z.array(z.unknown()).max(4).default([]),
  // One compact idea per seat. The caps match IdeaLedgerEntrySchema exactly, so a room can
  // never mint an idea the ledger would then reject, and an idea can never grow into a
  // document: 80 characters of title and 280 of summary is the whole artifact.
  idea: z.object({
    title: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(280)
  }).nullable().default(null),
  // A malformed follow-up request must never discard a room that has already been paid
  // for. A live mag-editorial run returned a followUpRequest naming a phase outside the
  // allowlist and omitting evidenceRefs, and the whole room aborted on it — no editorial
  // slate, so the article slot downstream was killed for missing_editorial_slate too.
  // The request is optional by design: dropping it costs one deferred room, while failing
  // the parse costs the entire contribution. Falling back to null keeps the allowlist
  // exactly as strict, since an out-of-allowlist phase still never reaches the queue.
  followUpRequest: z.object({
    phase: AgendaPhaseSchema,
    summary: z.string().trim().min(1).max(280),
    evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(12)
  }).nullable().default(null).catch(null)
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
  // Caps sized against the contract, not guessed. A minimally-filled contribution
  // serialises to ~228 tokens before any real prose, so the previous 260 left 12% headroom
  // and a seat that actually said something was cut off mid-JSON. Nothing detected the
  // truncation, so it surfaced as "Expected double-quoted property name in JSON at position
  // 824" and killed a live mma-intake room. CANVAS additionally carries a whole editorial
  // slate, and a truncated slate parses as an absent one, which reads as a quiet no-news day.
  // Only generated tokens are billed; the cap sets the reserve, which still fits the
  // $0.05-$0.08 room envelopes at these sizes.
  const cap = agent === "EASEL" ? 1_500 : agent === "ANGLE" || agent === "CANVAS" ? 1_200 : 900;
  return { ...model, maxOutputTokens: Math.min(cap, model.maxOutputTokens) };
}

function shiftedTimes(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => new Date(now.getTime() + index * 60_000).toISOString());
}

function portfolioChair(phase: PortfolioPhase): FoundingAgent {
  if (phase === "studio") return "EASEL";
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
  const isStudio = input.phase === "studio";
  const chair = portfolioChair(input.phase);
  const times = shiftedTimes(input.now, input.contributions.length + 2);
  const veto = input.contributions.find((contribution) => contribution.agent === "AUDIT" && contribution.stance === "veto");
  const summary = veto
    ? `AUDIT vetoed the room output: ${veto.summary}`
    : isFightDesk
      ? input.phase === "mma-intake"
        ? "Checked UFC and Oktagon and recorded the fighter-file, card and source state without publishing a probability."
        : "Ran the D8 analysis gate. Only confirmed bouts with two eligible fighter cards can produce a Stats prediction."
    : isStudio
      ? input.contributions.find((contribution) => contribution.agent === "EASEL")?.summary ?? "The studio checked the current template library and recorded no new proposal."
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
    growthPlan: input.phase === "tt-marketing" ? "DRAFT_ONLY. Social publishing, ads, commerce and external action remain disabled." : isFightDesk ? "DATA_ONLY. No probability, bookmaker link, account action or bet placement is authorized." : isMagazine ? "EDITORIAL_ONLY. Approved bilingual articles may enter the guarded MMA Files delivery queue; social variants remain drafts until their release gate opens." : isStudio ? "TEMPLATE_ONLY. Checked original templates may enter the internal live library; this does not authorize social publishing or external media collection." : input.phase === "incubator-synthesis" ? "TEMPLATE_ONLY. A compliant content venture may be founded; every exception remains with the owner." : "RESEARCH_ONLY. Evidence collection does not authorize spend or external action.",
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
    skips: await loadMeetingSkips(input.root),
    articleSlots: await loadArticleSlotOutcomes(input.root),
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

export /**
 * The newest `season-NNN.md` on file, falling back to the first season before any exists.
 *
 * Three places asserted `season-001` as a literal — the room's whole context and the id
 * stamped onto every marketing plan — while the file itself declares it ends on 2026-10-30
 * and nothing writes a successor. Creating the next season stays owner or room work; this
 * only stops the code from asserting a season that has ended.
 */
async function newestSeasonFilename(root: string): Promise<string> {
  const names = await readdir(path.join(root, "ventures", "titty-tuesdays")).catch(() => [] as string[]);
  const seasons = names.filter((name) => /^season-\d{3}\.md$/u.test(name)).sort();
  return seasons.at(-1) ?? "season-001.md";
}

function seasonIdFrom(filename: string): string {
  return filename.replace(/\.md$/u, "");
}

export async function composePortfolioContext(phase: PortfolioPhase, root: string, date: string, registry: Awaited<ReturnType<typeof loadVentureRegistry>>): Promise<{ text: string; evidenceRefs: string[] }> {
  const taste = await composeMeetingTastePacket({ repoRoot, registry, meetingKind: phase });
  if (phase === "studio") {
    const inspiration = await readJson<{ links?: Array<{ url?: string; label?: string }> }>(root, "ventures/carousel-studio/inspiration/owner-links.json", {});
    const links = (inspiration.links ?? []).filter((entry): entry is { url: string; label?: string } => typeof entry.url === "string" && entry.url.startsWith("https://"));
    return {
      text: `${taste ?? ""}\n\nApproved individual inspiration links:\n${links.map((link) => `- ${link.url}${link.label ? ` — ${link.label}` : ""}`).join("\n") || "- None. Record no observations and propose no template."}\n\nThe seed library already contains ten live templates. Prefer improving coverage to duplicating an existing layout.`.slice(0, 18_000),
      evidenceRefs: links.map((link) => link.url)
    };
  }
  if (phase === "tt-marketing") {
    // The newest season file, not season-001 forever. season-001 ends on 2026-10-30 and the
    // room would have gone on reading an expired season and stamping its id onto every plan.
    const season = await readText(root, `ventures/titty-tuesdays/${await newestSeasonFilename(root)}`);
    return { text: `${season}\n\n${taste ?? ""}`.slice(0, 18_000), evidenceRefs: [] };
  }
  if (phase === "mma-intake" || phase === "mma-analysis") {
    const [overview, bridge, events, sourceSnapshot, sourceSnapshotData] = await Promise.all([
      canonicalStateText(root, "ventures/fightaiq/README.md"),
      readText(root, "mma/BRIDGE.md"),
      loadEventCards(path.join(root, "mma", "events")),
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
      loadEventCards(path.join(root, "mma", "events"))
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
  const fixedMonthlyUsd = await loadFixedMonthlyUsd(configRoot, input.now);
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
  // Feed the degradation ladder the cap that is actually enforced. Its rungs are $3, $1.50
  // and $0.50 of remaining model-API budget, and it was fed a provisional $42 from the
  // superseded budget-2026-08d while enforcement held at $25, so computed headroom could
  // never fall below $17 and not one rung was reachable. A schedule's amounts depend only on
  // its shape flags, so the first pass can read the cap at any headroom.
  const shapeInput = { registry, budgetDecisionRaw, budgetMmaRaw, budgetFiftyRaw, fightAiQFoundingRaw };
  const enforcedMonthlyApiUsd = environmentBudgetLimits(
    resolveEffectivePortfolioSchedule({ ...shapeInput, monthlyApiHeadroomUsd: 0 })
  ).monthlyApiUsd;
  const schedule = resolveEffectivePortfolioSchedule({ ...shapeInput, monthlyApiHeadroomUsd: Math.max(0, enforcedMonthlyApiUsd - spent) });
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
  if (!input.dry && input.phase === "mma-analysis") {
    preparationArtifacts.push(...await refreshFightAiQAnalysis({ root, now: input.now }));
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
    if (weekday === 5) cast.push("REACH");
  }
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
          allInNonApiSpentUsd: fixedMonthlyUsd,
          allInCommittedUsd: 0,
          knownMonthlyForecastUsd: 0,
          remainingScheduledCycles: 60,
          limits: environmentBudgetLimits(schedule)
        }
      })
    });
  }
  const context = await composePortfolioContext(input.phase, root, date, registry);
  let contributions: Contribution[];
  let estimatedWorstCaseUsd = 0;
  if (input.dry) {
    const dryChair = input.phase === "studio" ? "EASEL" : input.phase.startsWith("mma-") ? "FORGE" : input.phase.startsWith("mag-") ? "CANVAS" : "PULSE";
    contributions = selected.map((agent) => ({ agent, stance: agent === dryChair ? "plan" : "pass", summary: agent === dryChair ? "Dry room complete. No provider call, external action or unsupported artifact is represented." : `${agent} records no live contribution in a deterministic dry run.`, evidenceRefs: [], task: null, nicheProposals: [], editorialSlate: null, marketingPlan: null, templateProposal: null, inspirationObservations: [], idea: null, followUpRequest: null }));
  } else {
    const promptName = input.phase === "studio" ? "studio.md" : input.phase.startsWith("incubator-") ? "incubator.md" : input.phase.startsWith("mma-") ? "mma.md" : input.phase.startsWith("mag-") ? "magazine.md" : "pulse.md";
    const roomPrompt = await readFile(path.join(repoRoot, "orchestrator", "prompts", promptName), "utf8");
    const personas = new Map<string, string>();
    for (const agent of selected) {
      const profile = agents.agents.find((candidate) => candidate.id === agent)!;
      personas.set(agent, (await readFile(path.join(repoRoot, "orchestrator", "prompts", `${profile.slug}.md`), "utf8")).trim());
    }
    const calls = selected.map((agent) => {
      const profile = agents.agents.find((candidate) => candidate.id === agent)!;
      const model = modelFor(agent, profile.provider, modelConfig.roles);
      const system = `${roomPrompt}\n\nReturn one JSON object with every key: {"stance":"plan|pass|veto","summary":"<=280 chars","evidenceRefs":[],"task":null|{"summary":"<=240 chars"},"nicheProposals":[],"editorialSlate":null,"marketingPlan":null,"templateProposal":null,"inspirationObservations":[],"idea":null,"followUpRequest":null}. Keep every field inside its stated character limit; an over-long summary is rejected and your whole contribution is dropped. Set idea to {"title":"<=80 chars","summary":"<=280 chars"} when this room surfaced a concrete idea worth keeping for later, otherwise null; it is recorded verbatim and must stand alone without the transcript. The room chair may request at most one follow-up only when another specialist decision is genuinely needed; everyone else returns followUpRequest:null. When set it must be {"phase":"tt-marketing|incubator-scan|incubator-synthesis|mma-intake|mma-analysis|mag-editorial|mag-desk|studio","summary":"<=280 chars","evidenceRefs":[]} with all three keys present; any other phase or a missing evidenceRefs array is dropped. Only ANGLE may return one detailed marketingPlan during tt-marketing. Every visual must use the supplied live Carousel Studio template id, version and content payload; never return a freeform image specification. No paid media, commerce, outreach or spend is authorized. Only ANGLE may return up to two complete niche-proposal/1 objects during incubator synthesis. Only CANVAS may return editorialSlate, and only during mag-editorial. Only MOTIF may return inspirationObservations and only EASEL may return templateProposal during studio. Use exactly one AM and one PM editorial slot; kill a slot when its source-backed subject is missing or repeated.`;
      const packet = wrapUntrustedData("canonical-portfolio-packet", JSON.stringify({
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
      // The role block is trusted text and deliberately follows the closed <data> fence:
      // it keeps `system` byte-identical for every seat in the room (so the room prompt and
      // the shared packet form one cacheable prefix) and leaves the agent's own instruction
      // as the last thing it reads, after the untrusted packet rather than before it.
      const prompt = `${packet}\n\nROLE BOUNDARY:\n${profile.mission}\n\n${personas.get(agent) ?? ""}`;
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
        budgetContext: { now: input.now, cycleId: input.cycleId, stage: stages.current, ledger: currentLedger, allInNonApiSpentUsd: fixedMonthlyUsd, allInCommittedUsd: 0, knownMonthlyForecastUsd: 0, remainingScheduledCycles: 60, limits: environmentBudgetLimits(schedule) },
        parse: (text) => ContributionSchema.parse(parseJson(text))
      }).catch((error: unknown) => {
        // One seat returning unparsable JSON must cost that seat, not the room. A live
        // mma-intake run died on "Expected double-quoted property name in JSON at position
        // 824" and took every other agent's work with it. The spend is already recorded by
        // guardedJsonCall, so skipping here loses a contribution, not an accounting entry.
        // Anything that is not a parse failure still propagates: a budget stop, a barrier
        // violation or a provider outage should stop the room.
        if (error instanceof ModelOutputParseError) {
          console.warn(JSON.stringify({
            event: "contribution_unparsable",
            agent: call.agent,
            phase: input.phase,
            usd: error.usd,
            reason: error.message
          }));
          return null;
        }
        throw error;
      });
      if (response === null) continue;
      // Drop refs outside the packet rather than destroying a room that is already paid for.
      // The narrowed list is still strictly inside the allowlist, so nothing unciteable ever
      // reaches an artifact — the previous throw discarded every other seat's work too, and
      // for two phases the allowlist is empty, which made a single stray ref fatal.
      const citedRefs = response.value.evidenceRefs.filter((reference) => context.evidenceRefs.includes(reference));
      if (citedRefs.length !== response.value.evidenceRefs.length) {
        console.warn(JSON.stringify({
          event: "evidence_refs_dropped",
          agent: call.agent,
          phase: input.phase,
          dropped: response.value.evidenceRefs.filter((reference) => !context.evidenceRefs.includes(reference))
        }));
      }
      contributions.push({ agent: call.agent, ...response.value, evidenceRefs: citedRefs });
    }
    if (contributions.length === 0) {
      throw new Error(`Every seat in ${input.phase} returned unparsable output; the room produced nothing`);
    }
  }
  // Record every idea a seat raised, into that venture's own ledger namespace.
  //
  // Before this, `screenAndRecordIdea` had exactly one caller, in the Caught Up morning
  // path, so state/ideas/{global,incubator,titty-tuesdays}/ledger.jsonl were all empty
  // files: rooms had no field to return an idea in and nothing to write it to. Capture
  // runs on the deterministic adjudicator, so it adds no model call to a room that has
  // already been paid for, and a failure here never discards the room's real output.
  const savedIdeaIds: string[] = [];
  const ideaArtifacts: string[] = [];
  if (!input.dry) {
    const roomMeetingRef = `${date}-${input.phase}`;
    for (const contribution of contributions) {
      if (!contribution.idea) continue;
      try {
        const screened = await screenAndRecordIdea({
          root: stateRoot,
          namespace: definition.ventureId,
          proposal: {
            title: contribution.idea.title,
            summary: contribution.idea.summary,
            origin: { agent: contribution.agent, meetingRef: roomMeetingRef },
            proposedAt: input.now.toISOString()
          },
          evidence: [],
          adjudicator: deterministicVaultAdjudicator()
        });
        savedIdeaIds.push(screened.entry.id);
      } catch (error) {
        // An idea that cannot be screened is worth losing; the room's output is not.
        console.warn(JSON.stringify({
          event: "idea_capture_failed",
          agent: contribution.agent,
          phase: input.phase,
          reason: error instanceof Error ? error.message : String(error)
        }));
      }
    }
    if (savedIdeaIds.length > 0) {
      await regenerateIdeaIndex(stateRoot, definition.ventureId);
      ideaArtifacts.push(ideaLedgerPath(definition.ventureId), ideaIndexPath(definition.ventureId));
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
          seasonId: seasonIdFrom(await newestSeasonFilename(root)),
          status: contributions.some((contribution) => contribution.agent === "AUDIT" && contribution.stance === "veto") ? "draft" : "approved",
          originMeetingRef: meetingRef
        })
      : null;
    marketingPlan = parsedPlan?.success ? parsedPlan.data : MarketingPlanSchema.parse({
      schemaVersion: "marketing-plan/1",
      id: `plan-${date}-campaign-notes`,
      ventureId: "titty-tuesdays",
      seasonId: seasonIdFrom(await newestSeasonFilename(root)),
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
      postable_assets: [{
        id: `asset-${date.replaceAll("-", "")}-campaign-notes`,
        captions: {
          instagram: { A: "Tuesday idea: the line does the work. The campaign stays typographic, clear and deliberate.", B: "A Tuesday campaign should earn attention with a sharp sentence, not a borrowed face." },
          threads: { A: "A Tuesday idea built from type, timing and one clear point.", B: "The line is the visual. The idea is the reason to stop." }
        },
        visual: {
          template_id: "cover-cta",
          version: "1.0.0",
          content: {
            locale: "en",
            strings: {
              "cover-title": "THE LINE IS THE VISUAL",
              "cover-dek": "A Tuesday campaign idea made from type, not people.",
              cta: "Read the full campaign idea",
              destination: "titty-tuesdays.vercel.app"
            }
          }
        }
      }],
      // A placeholder is a draft, whatever AUDIT thought of it. This fallback hard-codes an
      // empty audienceRefs, and both consumers require a non-empty one — the growth signal
      // and the social unlock counter — so stamping it "approved" put a plan in the admin
      // tab that looked launch-ready while moving neither counter, and the venture's only
      // growth component deadlocked closed. Never synthesize an audience to satisfy the
      // check: the non-empty requirement is the guard.
      status: "draft" as const,
      originMeetingRef: meetingRef
    });
    console.warn(JSON.stringify({
      event: "marketing_plan_fallback",
      phase: input.phase,
      cycleId: input.cycleId,
      reason: "ANGLE returned no usable plan; the placeholder carries no audienceRefs and stays a draft."
    }));
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
      // MMA Files must be able to publish without FightAIQ.
      //
      // The only rescue was a fight-week preview keyed to an `event:` ref, so a day with no
      // upcoming event killed both slots and the magazine printed nothing — one venture's
      // empty data pipeline silenced another venture entirely. FightAIQ currently holds 58
      // sourced fighter cards and a full bout history while holding zero events, so there is
      // real, cited material to write about and no way to reach it.
      //
      // A fighter profile is an allowed format and needs only a card that is already sourced
      // and reviewed. Selection is deterministic — most complete first, then by id — so the
      // same day always picks the same subject, and a card with no source is never eligible.
      if (!editorialSlate.slots.some((slot) => slot.status === "assigned")) {
        const profileSubject = (await loadFighterRecords())
          .filter((fighter) => (fighter.sources?.length ?? 0) > 0 && (fighter.history?.length ?? 0) > 0)
          .sort((left, right) =>
            (right.completeness ?? 0) - (left.completeness ?? 0) || left.id.localeCompare(right.id))[0];
        if (profileSubject) {
          editorialSlate = EditorialSlateSchema.parse({
            ...editorialSlate,
            slots: [
              { slot: "am", format: "fighter-profile", subjectRefs: [profileSubject.id], rationale: "No card is inside the window, so the desk profiles the best-sourced fighter on file.", assignedWriter: "JAB", status: "assigned" },
              editorialSlate.slots[1]
            ],
            vaultVerdicts: [
              ...editorialSlate.vaultVerdicts.filter((verdict) => verdict.subjectRef !== editorialSlate!.slots[0]!.subjectRefs[0]),
              { subjectRef: profileSubject.id, verdict: "fresh", evidenceRef: `meeting:${date}-mag-editorial` }
            ]
          });
        }
      }

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
  const auditVeto = contributions.some((contribution) => contribution.agent === "AUDIT" && contribution.stance === "veto");
  // A rejected studio contribution costs the contribution, not the room. Every seat has
  // already been billed by the time this runs, and it sits before the writes that produce the
  // meeting record, decision, scorecard and calendar — so an observation citing a URL outside
  // the packet, or a template citing no observation, threw and destroyed a paid room that had
  // nothing to do with the studio. The same file already treats an unparsable seat and an
  // out-of-packet evidence ref this way. The guarantee is unchanged: neither ever reaches an
  // artifact; the rejection simply no longer takes the room with it.
  const studioLifecycle = input.phase === "studio"
    ? await processStudioContribution({
        root,
        observations: contributions.find((contribution) => contribution.agent === "MOTIF")?.inspirationObservations ?? [],
        templateProposal: contributions.find((contribution) => contribution.agent === "EASEL")?.templateProposal ?? null,
        allowedEvidenceRefs: context.evidenceRefs,
        allowLive: !input.dry && !auditVeto
      }).catch((error: unknown) => {
        console.warn(JSON.stringify({
          event: "studio_contribution_rejected",
          phase: input.phase,
          cycleId: input.cycleId,
          reason: error instanceof Error ? error.message : String(error)
        }));
        return null;
      })
    : null;
  const actualEntries = input.dry ? [] : (await readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] })).entries;
  const actualCycleUsd = actualEntries.filter((entry) => entry.cycleId === input.cycleId).reduce((sum, entry) => sum + entry.usd, 0);
  const monthAllInUsd = fixedMonthlyUsd + actualEntries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0);
  const record = buildRecord({ phase: input.phase, cycleId: input.cycleId, date, now: input.now, stage: stages.current, cast: selected, objective: effectiveObjective, envelopeUsd: schedule.envelopeByPhase[input.phase] ?? definition.envelopeUsd, actualCycleUsd, monthAllInUsd, monthCapUsd: schedule.monthlyOperatingUsd, contributions, fixture: input.dry, proposals, editorialSlate, agenda });
  const meetingPath = `meetings/${date}-${input.phase}.json`;
  const decisionPath = `decisions/${input.cycleId}.json`;
  const scorecardPath = `scorecards/${input.cycleId}.json`;
  const priorRecords = await loadMeetingRecords(root);
  const calendarPath = await writeCalendarFeed(root, buildCalendarFeed({ weekOf: mondayOfWeek(date), records: [...priorRecords, record], skips: await loadMeetingSkips(root), articleSlots: await loadArticleSlotOutcomes(root), now: input.now }));
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
  const ttSocialUnlocked = !input.dry && await socialContentGenerationEnabled(root, "titty-tuesdays");
  const ttSocialArtifacts = ttSocialUnlocked && marketingPlan?.status === "approved"
    ? await composeTittyTuesdaysSocialQueue({
        stateRoot: root,
        repoRoot,
        plan: marketingPlan,
        destinationBaseUrl: process.env.TITTY_TUESDAYS_SITE_URL ?? "https://titty-tuesdays.vercel.app",
        now: input.now
      })
    : [];
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
  const artifacts = [...preparationArtifacts, meetingPath, decisionPath, scorecardPath, calendarPath, ...proposalPaths, ...proposalMarkdownPaths, ...(editorialSlatePath ? [editorialSlatePath] : []), ...(marketingPlanPath ? [marketingPlanPath] : []), ...(marketingPlanMarkdownPath ? [marketingPlanMarkdownPath] : []), ...(studioLifecycle?.artifacts ?? []), ...ttSocialArtifacts, ...(agendaStateChanged ? [MEETING_AGENDA_PATH] : []), ...foundingArtifacts, ...ideaArtifacts, ...(input.dry ? [] : ["budget/ledger.json"])];
  return { cycleId: input.cycleId, phase: input.phase, dry: input.dry, status: input.dry ? "dry_complete" : "live_complete", decision: "PLAN", estimatedWorstCaseUsd, selectedAgents: selected, skippedAgents: room.skippedParticipants.map(({ agent }) => agent), artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(root, artifact))) };
}
