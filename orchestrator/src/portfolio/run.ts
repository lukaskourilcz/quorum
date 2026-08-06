import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  BudgetError,
  BudgetLedgerEntrySchema,
  type BudgetErrorCode,
  DEFAULT_BUDGET_LIMITS,
  budgetStopReason,
  dailyBudgetStatus,
  estimateTextCall,
  exceedsDailyCap,
  type BudgetLedgerEntry,
  type BudgetLimits
} from "../budget.js";
import { loadRoutingConfig, routeBoardroom } from "../boardroom/router.js";
import { AgendaPhaseSchema, type MeetingAgenda } from "../contracts/meeting-agenda.js";
import { MeetingRecordSchema, type MeetingRecord } from "../contracts/meeting-record.js";
import { MeetingSkipSchema } from "../contracts/meeting-skip.js";
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
import { resolveSlateEvidence } from "../mma-files/slate-evidence.js";
import { fetchReadable } from "../sources/adapters/reader.js";
import { loadArticlePackages } from "../mma-files/store.js";
import { fightAiQBrief } from "../fightaiq/brief.js";
import { fightWeekFocus, loadEventCards, loadFighterRecords } from "../fightaiq/store.js";
import { withinIntakeHorizon } from "./evidence.js";
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
import {
  INCUBATOR_CONTEXT_CHARS,
  INCUBATOR_TASTE_CHARS,
  assertSweptToPacketPath,
  boundIncubatorPacket,
  incubatorScanBrief,
  incubatorScanTriggerPreview,
  readIncubatorPacketItems,
  readIncubatorReadItems,
  recordIncubatorPacketRead,
  unreadPacketItems,
  type IncubatorPacketItem
} from "../incubator/packet.js";

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
  // One compact idea per seat. The caps match IdeaLedgerEntrySchema exactly. Clip presentation
  // overflow rather than lose a paid idea, just as the contribution summary above does.
  idea: z.object({
    title: z.string().trim().min(1).transform((value) => value.slice(0, 80)),
    summary: z.string().trim().min(1).transform((value) => value.slice(0, 280))
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
});

const EvidenceBoundContributionSchema = ContributionSchema.superRefine((value, context) => {
  if (/(?:\d|%|\$|€|£)/.test(value.summary) && value.evidenceRefs.length === 0) {
    context.addIssue({ code: "custom", message: "Numeric contribution claims require evidenceRefs", path: ["evidenceRefs"] });
  }
});

type Contribution = z.infer<typeof ContributionSchema> & { agent: FoundingAgent };

const TITTY_TUESDAYS_CORE_IDEATORS = new Set<FoundingAgent>(["PULSE", "ANGLE"]);

export interface PortfolioCycleResult {
  cycleId: string;
  phase: PortfolioPhase;
  dry: boolean;
  status: "dry_complete" | "paused" | "live_complete";
  decision: "PLAN" | "PAUSED" | "NO_ACTION";
  estimatedWorstCaseUsd: number;
  selectedAgents: string[];
  skippedAgents: string[];
  artifacts: string[];
}

function parseJson(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

export function portfolioIdeaInstruction(phase: PortfolioPhase): string {
  if (phase === "tt-marketing") {
    return "This scheduled room has a standing agenda: generate marketing ideas for the future Titty Tuesdays eshop. PULSE and ANGLE must each set idea exactly to {\"title\":\"one title, at most 80 characters\",\"summary\":\"one standalone description, at most 280 characters\"}; use no other idea keys, and repeat the concept from summary inside idea rather than leaving idea null. Each idea must fit the current crop-top season and target adults. Keep it pre-commerce: do not claim stock, price, availability or a purchase path; do not propose paid ads, publishing, human imagery, anatomy-led art or sexual supporting copy. AUDIT sets idea:null and reviews the concepts. The weekday specialist may add one idea in the same shape when its role supports the concept.";
  }
  return "Set idea to {\"title\":\"<=80 chars\",\"summary\":\"<=280 chars\"} when this room surfaced a concrete idea worth keeping for later, otherwise null. It is recorded verbatim and must stand alone without the transcript.";
}

function repairTittyTuesdaysIdea(value: unknown, agent: FoundingAgent): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  // These fields belong to other rooms and have no TT consumer. Models sometimes fill every
  // key despite the phase rule; validating irrelevant payloads then discarded the paid idea
  // and plan (ANGLE once returned three incubator proposals here). Erase them at the boundary
  // rather than weakening their owning phase's schema.
  const contribution: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
    nicheProposals: [],
    editorialSlate: null,
    templateProposal: null,
    inspirationObservations: []
  };
  const rawIdea = contribution.idea;
  const idea = rawIdea && typeof rawIdea === "object" && !Array.isArray(rawIdea)
    ? rawIdea as Record<string, unknown>
    : null;
  if (!idea) {
    if (!TITTY_TUESDAYS_CORE_IDEATORS.has(agent)) return contribution;
    const plan = contribution.marketingPlan && typeof contribution.marketingPlan === "object" && !Array.isArray(contribution.marketingPlan)
      ? contribution.marketingPlan as Record<string, unknown>
      : null;
    const summary = [contribution.summary, plan?.summary, plan?.objective]
      .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
      ?.trim();
    const title = [plan?.title, contribution.headline, contribution.title, summary]
      .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
      ?.trim();
    if (!title || !summary) return contribution;
    // Preserve the provider's own words. This is a structural recovery only: it neither asks
    // another model nor invents campaign content after the paid response has arrived.
    return { ...contribution, idea: { title, summary } };
  }
  const strings = Object.values(idea)
    .filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
    .map((candidate) => candidate.trim());
  const title = [idea.title, idea.name, idea.headline, idea.conceptTitle]
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
    ?.trim() ?? strings[0];
  const summary = [idea.summary, idea.description, idea.concept, idea.rationale]
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
    ?.trim() ?? [...strings].sort((left, right) => right.length - left.length)[0];
  if (!title || !summary) return contribution;
  return { ...contribution, idea: { title, summary } };
}

export function parsePortfolioContribution(input: {
  phase: PortfolioPhase;
  agent: FoundingAgent;
  text: string;
}): z.infer<typeof ContributionSchema> {
  const parsed = parseJson(input.text);
  // This room is creative ideation over canonical internal brand state and deliberately has
  // no external citation allowlist. A digit in a concept label (the live room used one in two
  // otherwise valid contributions) is not an empirical claim, so the general evidence guard
  // must not make those paid seats impossible to record. Every evidence-bearing portfolio
  // phase keeps the stricter schema below.
  const schema = input.phase === "tt-marketing" ? ContributionSchema : EvidenceBoundContributionSchema;
  const contribution = schema.parse(
    input.phase === "tt-marketing" ? repairTittyTuesdaysIdea(parsed, input.agent) : parsed
  );
  if (
    input.phase === "tt-marketing" &&
    TITTY_TUESDAYS_CORE_IDEATORS.has(input.agent) &&
    contribution.idea === null
  ) {
    throw new Error(`${input.agent} returned no Titty Tuesdays marketing idea`);
  }
  return contribution;
}

export function assertTittyTuesdaysIdeaOutput(
  phase: PortfolioPhase,
  contributions: readonly Pick<Contribution, "agent" | "idea">[]
): void {
  if (phase !== "tt-marketing") return;
  if (!contributions.some((contribution) =>
    TITTY_TUESDAYS_CORE_IDEATORS.has(contribution.agent) && contribution.idea !== null
  )) {
    throw new Error("Titty Tuesdays marketing room produced no core marketing idea");
  }
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
  return { ...model, maxOutputTokens: portfolioMaxOutputTokens(agent, model.maxOutputTokens) };
}

export function portfolioMaxOutputTokens(agent: FoundingAgent, configuredMax: number): number {
  const contractCap = agent === "EASEL" ? 1_500 : agent === "ANGLE" ? 1_600 : agent === "CANVAS" ? 1_200 : 900;
  return Math.min(contractCap, configuredMax);
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
    // growthPlan is published with the meeting record, so each branch has to be true of what the
    // venture may actually do. The magazine branch says "Czech articles" because that is all the
    // desk produces: mma-files/pipeline.ts makes one writeCzech call and stores
    // `localizations: { cs }`. It read "bilingual articles" while nothing English was written.
    growthPlan: input.phase === "tt-marketing" ? "DRAFT_ONLY. Social publishing, ads, commerce and external action remain disabled." : isFightDesk ? "DATA_ONLY. No probability, bookmaker link, account action or bet placement is authorized." : isMagazine ? "EDITORIAL_ONLY. Approved Czech articles may enter the guarded MMA Files delivery queue; social variants remain drafts until their release gate opens." : isStudio ? "TEMPLATE_ONLY. Checked original templates may enter the internal live library; this does not authorize social publishing or external media collection." : input.phase === "incubator-synthesis" ? "TEMPLATE_ONLY. A compliant content venture may be founded; every exception remains with the owner." : "RESEARCH_ONLY. Evidence collection does not authorize spend or external action.",
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

/**
 * Say on the calendar that a cap ended this meeting, and leave the slot amber rather than red.
 *
 * A refused reservation used to leave the room runner as an uncaught BudgetError: the job
 * exited 1, and the workflow step that notices a failed run wrote "The run for this meeting
 * failed before it finished" onto the slot. Fourteen active phases reserve more than the day's
 * cap allows, so from tomorrow the cap doing its job would have painted the rest of the day as
 * a broken system. This writes the same MeetingSkip the other gates write — buildCalendarFeed
 * renders that as "Skipped" with the reason, not "Did not happen" — and re-records the day in
 * budget/exhaustions.json, which the finance alert and the daily digest read and which only
 * index.ts used to write, on its way out with a non-zero exit code.
 *
 * It lives here rather than in cycle.ts because cycle.ts already imports this module; the
 * reverse would be an import cycle.
 */
export async function recordBudgetStop(input: {
  phase: string;
  date: string;
  now: Date;
  root: string;
  reason: string;
  /** True when the daily cap is the one that refused, which is what the alert counts. */
  dailyCapReached: boolean;
}): Promise<string[]> {
  const skipPath = `meetings/skips/${input.date}-${input.phase}.json`;
  await atomicWriteJson(input.root, skipPath, MeetingSkipSchema.parse({
    schemaVersion: "meeting-skip/1",
    date: input.date,
    phase: input.phase,
    reason: input.reason.slice(0, 240),
    decidedAt: input.now.toISOString()
  }));
  const artifacts = [skipPath];
  if (input.dailyCapReached) {
    const existing = await readJson<{ dates?: string[] }>(input.root, "budget/exhaustions.json", {});
    await atomicWriteJson(input.root, "budget/exhaustions.json", {
      schemaVersion: 1,
      dates: [...new Set([...(existing.dates ?? []), input.date])].sort()
    });
    artifacts.push("budget/exhaustions.json");
  }
  artifacts.push(await writeCalendarFeed(input.root, buildCalendarFeed({
    weekOf: mondayOfWeek(input.date),
    records: await loadMeetingRecords(input.root),
    skips: await loadMeetingSkips(input.root),
    articleSlots: await loadArticleSlotOutcomes(input.root),
    now: input.now
  })));
  console.warn(JSON.stringify({ event: "budget_stop", phase: input.phase, date: input.date, reason: input.reason }));
  return artifacts;
}

/**
 * Why a scheduled room did not open, in each of the four places the record says it.
 *
 * A published record used to carry one caller-supplied sentence and three hard-coded ones. The
 * hard-coded three all described the agenda queue — every seat "not called because no bounded
 * agenda was due", a growth plan about wake-ups without agendas, and a transcript setting
 * saying the scheduler had checked the queue — while the sentence above them said the owner's
 * gate was shut, or that the source sweep had found nothing. Three of the four were then false
 * on two of the three paths that write this record, and site/src/lib/meeting-record-model.ts
 * publishes all four. Each caller now supplies its own, so a seat's reason is the reason that
 * actually applied to that seat on that morning.
 */
interface RoomStayedShut {
  /** operatingBrief, the decision summary, the chair's proposal and the single closing turn. */
  brief: string;
  /** Why each registered seat was not called. Published beside the seat's name. */
  seat: string;
  /** roomTranscript.setting: what the scheduler actually did before it closed the slot. */
  setting: string;
  /** growthPlan: what the closed slot authorizes, which is nothing. */
  growthPlan: string;
}

function shutByOwnerGate(): RoomStayedShut {
  return {
    brief: "The owner has these meetings switched off, so this one did not meet and nothing was spent.",
    seat: "registered for this meeting but not asked anything, because the owner has these meetings switched off",
    setting: "The owner's switch for these meetings was read first. It is off, so nothing was queued, the meeting did not open and nobody was asked anything.",
    growthPlan: "Nothing was decided and nothing was authorized: a meeting the owner has switched off produces no work, spend, publishing or outreach."
  };
}

function shutByBudgetShape(): RoomStayedShut {
  return {
    brief: "The budget the owner signed does not pay for this meeting, so it did not meet and nothing was spent.",
    seat: "registered for this meeting but not asked anything, because the signed budget does not pay for it",
    setting: "The budget the owner signed was read first. It does not pay for this meeting at any level of spend, so nothing was queued, the meeting did not open and nobody was asked anything.",
    growthPlan: "Nothing was decided and nothing was authorized: a meeting outside the signed budget produces no work, spend, publishing or outreach."
  };
}

/**
 * The other half of `phaseEnabled`, told apart from the shape rather than blamed on it.
 *
 * `resolveEffectivePortfolioSchedule` drops rooms for two unrelated reasons: the countersigned
 * shape never included them, or the month has spent down to a rung of the degradation ladder.
 * The record used to name the shape for both, which reads as a decision the owner made when it
 * is really this month's spend. The caller separates them by resolving the same schedule at
 * full headroom and seeing whether the room survives there.
 */
function shutByLowHeadroom(input: { remainingUsd: number; capUsd: number }): RoomStayedShut {
  const spend = `$${input.remainingUsd.toFixed(2)} of the $${input.capUsd.toFixed(2)} monthly budget for model calls is left`;
  return {
    brief: `${spend}, which is too little to pay for this meeting, so it did not meet and nothing was spent.`,
    seat: `registered for this meeting but not asked anything, because ${spend} — too little to pay for it`,
    setting: `The month was priced first: ${spend}. This month's spending is what closed the meeting at that level, not any decision the owner signed, so it did not open and nobody was asked anything.`,
    growthPlan: "Nothing was decided and nothing was authorized: a meeting the month's remaining budget cannot pay for produces no work, spend, publishing or outreach."
  };
}

function shutByNoAgenda(): RoomStayedShut {
  return {
    brief: "Nothing was queued for this meeting to decide, so it did not meet and nothing was spent.",
    seat: "registered for this meeting but not asked anything, because it had nothing to decide",
    setting: "Nothing had been queued for this meeting to decide, so it did not meet and nobody was asked anything.",
    growthPlan: "Nothing was decided and nothing was authorized: a meeting with nothing to settle produces no work, spend, publishing or outreach."
  };
}

function shutByNoMaterialChange(): RoomStayedShut {
  return {
    brief: "Nothing new arrived since the last check, so this meeting was not needed.",
    seat: "registered for this meeting but not asked anything, because nothing new had arrived",
    // "the last check", not "what the room has read": refreshFightAiQEvidence compares content
    // hashes it writes itself, before any seat is called.
    setting: "The sources were checked and nothing had changed since the last check, so the meeting was not needed and nobody was asked anything.",
    growthPlan: "Nothing was decided and nothing was authorized: a meeting on unchanged sources produces no work, spend, publishing or outreach."
  };
}

/**
 * The fight-model review has nothing to review until a model run exists.
 *
 * The 19:00 room's own deterministic pre-step (refreshFightAiQAnalysis) runs either way and costs
 * nothing. What the room adds on top is a reading of the newest model run — and no model run has
 * ever been produced, because no bout reaches `confirmed` without a second independent odds
 * source and THE_ODDS_API_KEY is not installed. Every sitting so far could only have restated the
 * pre-step back to itself at full cast price.
 */
function shutByNoModelRun(): RoomStayedShut {
  return {
    brief: "No model run exists to review yet — waiting for the odds data key.",
    seat: "registered for this meeting but not asked anything, because there is no model run to review yet",
    setting: "The fight data was refreshed as usual. No model run has been produced yet, so there was nothing for this meeting to read and nobody was asked anything.",
    growthPlan: "Nothing was decided and nothing was authorized: the meeting reviews model runs, and none exist yet."
  };
}

/** The incubator scan's two ways of finding nothing to read, told apart because they differ. */
function shutByEmptySweep(): RoomStayedShut {
  return {
    brief: "The source check returned nothing at all, so there was nothing to put in front of anyone and nothing was spent.",
    seat: "registered for this meeting but not asked anything, because the source check returned nothing to read",
    setting: "The sources were checked and returned nothing at all, so there was nothing to read, the meeting did not open and nobody was asked anything.",
    growthPlan: "Nothing was decided and nothing was authorized: a check that returns nothing produces no work, spend, publishing or outreach."
  };
}

function shutByNothingUnread(input: { offered: number; shown: number }): RoomStayedShut {
  const counted = `The check kept ${input.offered} ${input.offered === 1 ? "story" : "stories"} and ${input.shown} of them fit what this meeting can read`;
  return {
    brief: `${counted}; every one had been read at an earlier meeting, so this one was not needed.`,
    seat: "registered for this meeting but not asked anything, because nothing new had arrived to read",
    setting: `${counted}. Every one of them had already been read at an earlier meeting, so this one did not open and nobody was asked anything. Stories past that limit were shown to nobody and counted for nothing.`,
    growthPlan: "Nothing was decided and nothing was authorized: re-reading stories this meeting has already read produces no work, spend, publishing or outreach."
  };
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
  shut: RoomStayedShut;
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
    operatingBrief: input.shut.brief,
    participantReasons: input.expectedCast.map((agent) => ({
      agent,
      reason: input.shut.seat,
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
      summary: input.shut.brief,
      evidenceRefs: []
    },
    proposals: [{ agent: chair, summary: input.shut.brief, evidenceRefs: [] }],
    voteMatrix: [{ voter: chair, firstChoice: "NO_ACTION", veto: false }],
    tasks: [],
    growthPlan: input.shut.growthPlan,
    eveningOutcome: null,
    ...(fightDesk ? {
      sharperData: {
        outcome: "nothing-new",
        // The tightest limit this record has (280), not the only one: roomTranscript.setting and
        // every turns[].text cap at 800, and those take caller strings too. A record that fails
        // to parse takes the whole scheduled run out with exit 1, so each of the three is cut to
        // its own schema limit rather than allowed to decide whether the slot gets a record at
        // all. The untruncated sentence is published four lines up.
        summary: input.shut.brief.slice(0, 280),
        evidenceRefs: []
      }
    } : {}),
    roomTranscript: {
      openedAt: input.now.toISOString(),
      closedAt,
      gavel: chair,
      // Both cut to RoomTranscriptSchema's 800. Today every RoomStayedShut is a fixed sentence
      // well inside it, but two of them interpolate caller values — the month's figures and the
      // sweep's counts — and the reason a closed slot gets a record at all must not depend on how
      // long a future reason runs.
      setting: input.shut.setting.slice(0, 800),
      turns: [{
        agent: chair,
        mode: "close",
        sentAt: closedAt,
        text: input.shut.brief.slice(0, 800)
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
      summary: input.shut.brief,
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

/**
 * Whether any versioned fight-model run exists for the 19:00 room to read.
 *
 * A directory scan rather than a state read: `state/mma/model-runs/` does not exist yet — no bout
 * has ever reached `confirmed`, because that needs a second independent odds source and
 * THE_ODDS_API_KEY is not installed — so there is no index file to consult and the absent
 * directory is the honest answer.
 */
async function hasFightAiQModelRun(root: string): Promise<boolean> {
  const names = await readdir(path.join(root, "mma", "model-runs")).catch(() => [] as string[]);
  return names.some((name) => name.endsWith(".json"));
}

function seasonIdFrom(filename: string): string {
  return filename.replace(/\.md$/u, "");
}

/** How many owner links one studio room reads. Each is a network fetch inside a daily room. */
const STUDIO_LINKS_PER_ROOM = 6;
/** Characters kept per page, so six pages cannot crowd out the rest of the packet. */
const STUDIO_PAGE_CHARS = 2_200;

/**
 * The same rejections the admin store applies when a link is saved.
 *
 * A board or a bare homepage is not a design to observe. The room filter only checked the
 * https prefix, so a link that the admin store would refuse could still reach the room if it
 * arrived any other way.
 */
function allowedIndividualUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (/(?:^|\.)pinterest\./iu.test(url.hostname)) return false;
  return url.pathname.replace(/\/+$/u, "").length > 1;
}

export async function composePortfolioContext(phase: PortfolioPhase, root: string, date: string, registry: Awaited<ReturnType<typeof loadVentureRegistry>>, now = new Date()): Promise<{
  text: string;
  evidenceRefs: string[];
  /** The incubator packet items that ended up in `text`, and therefore the only ones a seat read. */
  incubatorItems?: IncubatorPacketItem[];
}> {
  const taste = await composeMeetingTastePacket({ repoRoot, registry, meetingKind: phase });
  if (phase === "studio") {
    const inspiration = await readJson<{ links?: Array<{ url?: string; label?: string }> }>(root, "ventures/carousel-studio/inspiration/owner-links.json", {});
    const links = (inspiration.links ?? [])
      .filter((entry): entry is { url: string; label?: string } => typeof entry.url === "string" && allowedIndividualUrl(entry.url))
      .slice(0, STUDIO_LINKS_PER_ROOM);
    // Read the pages. MOTIF was handed bare URLs and has no tool with which to open one, yet
    // StudioObservationSchema demands a principle, an originality boundary and the time the
    // page was retrieved — so every observation the room could return was invented rather
    // than observed. The reader is Firecrawl when a key exists and keyless r.jina.ai
    // otherwise, both already allowlisted, and a page that will not load is named as unread
    // rather than quietly dropped.
    const pages = await Promise.all(links.map(async (link) => {
      const body = await fetchReadable(link.url, { allowHosts: [new URL(link.url).hostname, "r.jina.ai", "api.firecrawl.dev"], now })
        .catch(() => null);
      return { link, body: body?.slice(0, STUDIO_PAGE_CHARS) ?? null };
    }));
    const readable = pages.filter((page) => page.body !== null);
    const rendered = pages.length === 0
      ? "- None. Record no observations and propose no template."
      : pages.map(({ link, body }) => body === null
          ? `- ${link.url}${link.label ? ` — ${link.label}` : ""} — could not be read; record no observation for it.`
          : `- ${link.url}${link.label ? ` — ${link.label}` : ""}\n${wrapUntrustedData("owner-inspiration-page", body)}`).join("\n\n");
    return {
      text: `${taste ?? ""}\n\nApproved individual inspiration links, retrieved ${now.toISOString()}:\n${rendered}\n\nThe seed library already contains ten live templates. Prefer improving coverage to duplicating an existing layout.`.slice(0, 18_000),
      evidenceRefs: readable.map(({ link }) => link.url)
    };
  }
  if (phase === "tt-marketing") {
    // The newest season file, not season-001 forever. season-001 ends on 2026-10-30 and the
    // room would have gone on reading an expired season and stamping its id onto every plan.
    const season = await readText(root, `ventures/titty-tuesdays/${await newestSeasonFilename(root)}`);
    return { text: `${season}\n\n${taste ?? ""}`.slice(0, 18_000), evidenceRefs: [] };
  }
  if (phase === "mma-intake" || phase === "mma-analysis") {
    const [overview, bridge, events, sourceSnapshotData] = await Promise.all([
      canonicalStateText(root, "ventures/fightaiq/README.md"),
      readText(root, "mma/BRIDGE.md"),
      loadEventCards(path.join(root, "mma", "events")),
      readJson<{ evidenceRefs?: string[]; sources?: Array<{ sourceId: string; status: string; reason?: string | null; items?: unknown[] }> }>(
        root,
        `ventures/fightaiq/source-snapshots/${date}.json`,
        {}
      )
    ]);
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const leadOrg = ["ufc", "oktagon"][day % 2];
    const focus = fightWeekFocus(events, new Date(`${date}T12:00:00Z`));
    const focusPacket = focus.length
      ? `Fight-week cards, nearest first. Work only these bouts:\n${JSON.stringify(focus)}`
      : "No verified card is inside the three-day fight-week window. Continue file work across UFC and Oktagon.";
    // A brief, not the snapshot. Pasting the snapshot and cutting at eighteen thousand
    // characters meant the room read eleven kilobytes of bookmaker odds and never reached the
    // ninety-two roster entries at all — which is why SPOTTER reported no Oktagon data on a day
    // the data was there.
    const brief = fightAiQBrief({
      sources: sourceSnapshotData.sources ?? [],
      horizonEvents: events
        .filter((event) => withinIntakeHorizon(event.startsAtUtc, new Date(`${date}T12:00:00Z`)))
        .map((event) => ({ id: event.id, name: event.name, startsAt: event.startsAtUtc, bouts: event.bouts })),
      now: new Date(`${date}T12:00:00Z`)
    });
    return {
      text: `${overview}\n\nDaily lead organization: ${leadOrg}. Check UFC and Oktagon.\n\n${focusPacket}\n\n${brief}\n\n${taste ?? ""}\n\n${bridge}`.slice(0, 18_000),
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
  // The incubator rooms. Every block is bounded before it is joined, and the join is not cut
  // afterwards — that is the whole difference from what stood here.
  //
  // The packet is cut to whole items and the citation allowlist is narrowed to the sources those
  // items came from, so the room can only cite what it was shown. It used to be the raw
  // serialised digest, allowlisted against every source id in the file. The three blocks were
  // then concatenated and cut to the ceiling by characters, which moved the damage rather than
  // removing it: the last block ended wherever the ceiling fell, mid-token and unparseable.
  // `incubatorScanBrief` bounds the scan by dropping whole transcript turns, and the taste packet
  // is prose, so a clip there costs a sentence rather than a syntax error. INCUBATOR_CONTEXT_CHARS
  // carries the cost arithmetic and the measurement behind these three budgets.
  const packet = boundIncubatorPacket(await readIncubatorPacketItems(root));
  const scan = phase === "incubator-synthesis"
    ? incubatorScanBrief(await readText(root, `meetings/${date}-incubator-scan.json`))
    : "";
  const text = `${packet.text}\n${(taste ?? "").slice(0, INCUBATOR_TASTE_CHARS)}\n${scan}`;
  // The three budgets sum below the ceiling, so this never trims. It is the assertion that they
  // still do — a budget raised past the ceiling would otherwise reintroduce the cut in silence.
  if (text.length > INCUBATOR_CONTEXT_CHARS) {
    throw new Error(`Incubator context ${text.length} exceeds ${INCUBATOR_CONTEXT_CHARS}; the per-block budgets no longer sum below the ceiling`);
  }
  return {
    text,
    evidenceRefs: packet.evidenceRefs.filter((reference) => reference.length <= 160),
    incubatorItems: packet.items
  };
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
  const definition = composeMeetingRouteDefinition(registry, input.phase, input.dry ? "dry" : "live");
  const date = pragueClockParts(input.now).date;
  const root = input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot;
  // One room, one date, one bill.
  //
  // Article slots have had this guard since launch (recordClosedArticleSlot refuses to write over
  // a run that already exists for the date). Portfolio rooms had none, so every extra firing of a
  // slot re-ran the palate pre-step and the whole cast: on 2026-08-05 tt-marketing was billed six
  // times in about sixty-three minutes, $0.0725 against a room that costs about $0.012, and the
  // sixth record simply overwrote the first five.
  //
  // A PAUSED record deliberately does not block. It is what a closed gate leaves behind — no
  // agenda due, owner gate off, headroom gone — and those are all conditions that can open later
  // the same day. Blocking on one would mean a room that was shut at 08:00 could not meet at
  // 20:00 after its agenda arrived, which is the opposite of the supply problem this system has.
  const alreadyHeld = input.dry
    ? null
    : await readJson<{ status?: unknown; decision?: { outcome?: unknown } } | null>(
        root,
        `meetings/${date}-${input.phase}.json`,
        null
      );
  if (alreadyHeld && alreadyHeld.status !== "PAUSED") {
    console.warn(JSON.stringify({
      event: "portfolio_room_already_held",
      phase: input.phase,
      date,
      cycleId: input.cycleId,
      status: alreadyHeld.status
    }));
    return {
      cycleId: input.cycleId,
      phase: input.phase,
      dry: false,
      status: "live_complete",
      decision: alreadyHeld.status === "PLAN" ? "PLAN" : "NO_ACTION",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [],
      artifacts: [path.relative(repoRoot, path.join(root, `meetings/${date}-${input.phase}.json`))]
    };
  }
  // A room the owner gate or the degradation ladder closed leaves the same PAUSED record the
  // no-agenda path already leaves. This used to return with artifacts: [] and write nothing,
  // so the slot was indistinguishable on the calendar from one nobody reached — the shape of
  // an empty day that took a full audit to explain.
  if (!input.dry && (process.env.PORTFOLIO_LIVE_ENABLED !== "true" || !phaseEnabled(schedule, input.phase))) {
    // Only a scheduled wake-up leaves a record, exactly as the no-agenda path below does. A
    // manual or local invocation of a closed phase is not a missed meeting and must not write
    // one into the calendar.
    if (process.env.MEETING_TRIGGER !== "schedule") {
      return { cycleId: input.cycleId, phase: input.phase, dry: false, status: "paused", decision: "PAUSED", estimatedWorstCaseUsd: 0, selectedAgents: [], skippedAgents: [], artifacts: [] };
    }
    const closedBy = process.env.PORTFOLIO_LIVE_ENABLED !== "true"
      ? shutByOwnerGate()
      : phaseEnabled(resolveEffectivePortfolioSchedule({ ...shapeInput, monthlyApiHeadroomUsd: enforcedMonthlyApiUsd }), input.phase)
        ? shutByLowHeadroom({
            remainingUsd: Math.max(0, enforcedMonthlyApiUsd - spent),
            capUsd: enforcedMonthlyApiUsd
          })
        : shutByBudgetShape();
    return recordNoAgendaCycle({
      phase: input.phase,
      cycleId: input.cycleId,
      date,
      now: input.now,
      stage: stages.current,
      root,
      expectedCast: definition.requiredParticipants.filter(
        (agent) => !disabledAgentsForVenture(agentControls, definition.ventureId).has(agent)
      ),
      monthAllInUsd: spent,
      monthCapUsd: schedule.monthlyOperatingUsd,
      shut: closedBy
    });
  }
  const limits = environmentBudgetLimits(schedule);
  const roomEnvelopeUsd = schedule.envelopeByPhase[input.phase] ?? definition.envelopeUsd;
  /** End this room as a stated skip rather than as an uncaught BudgetError and exit 1. */
  const stoppedByBudget = async (stop: {
    /** The room's reservation when it was refused before opening; null once seats were called. */
    reservationUsd: number | null;
    code: BudgetErrorCode;
    cast: readonly FoundingAgent[];
  }): Promise<PortfolioCycleResult> => {
    // Read the ledger again rather than reuse the copy from the top of the run: by the time a
    // seat is refused mid-room, earlier seats of this same room are on it, and a reason that
    // quoted the opening figure would understate the day.
    const ledgerNow = (await readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] })).entries
      .map((entry) => BudgetLedgerEntrySchema.parse(entry));
    const artifacts = await recordBudgetStop({
      phase: input.phase,
      date,
      now: input.now,
      root,
      reason: budgetStopReason({
        phase: input.phase,
        status: dailyBudgetStatus(ledgerNow, input.now, limits),
        reservationUsd: stop.reservationUsd,
        code: stop.code
      }),
      dailyCapReached: stop.code === "DAILY_CAP"
    });
    return {
      cycleId: input.cycleId,
      phase: input.phase,
      dry: false,
      status: "paused",
      decision: "NO_ACTION",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [...stop.cast],
      artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(root, artifact)))
    };
  };
  // Ask the day's ledger before opening the room, so the reservation is refused before spend.
  //
  // Fourteen active phases reserve about $1.74 against the $1.00 daily cap, so the last rooms
  // of a full day cannot be funded. Without this the room opened anyway, paid for the palate
  // pass and some of its seats, and then took an uncaught BudgetError out of the process:
  // exit 1, and the workflow wrote "the run failed before it finished" onto the slot. The test
  // is assertSharedReservation's own — exceedsDailyCap is the function it calls to decide
  // DAILY_CAP — applied to the room's declared envelope rather than to one seat, because a
  // room that cannot be funded to the end is better not started. No cap is read differently,
  // raised or bypassed here; the day simply stops earlier and says so.
  if (!input.dry && exceedsDailyCap(roomEnvelopeUsd, entries, input.now, limits)) {
    return stoppedByBudget({
      reservationUsd: roomEnvelopeUsd,
      code: "DAILY_CAP",
      cast: definition.requiredParticipants.filter(
        (agent) => !disabledAgentsForVenture(agentControls, definition.ventureId).has(agent)
      )
    });
  }
  const preparationArtifacts: string[] = [];
  const scheduledWakeUp = !input.dry && process.env.MEETING_TRIGGER === "schedule";
  const agendaQueue = input.dry ? null : await readMeetingAgendaQueue(root, input.now);
  const agenda = agendaQueue
    ? dueMeetingAgenda(agendaQueue, AgendaPhaseSchema.parse(input.phase), date)
    : null;
  const disabledAgents = disabledAgentsForVenture(agentControls, definition.ventureId);
  const expectedCast = definition.requiredParticipants.filter((agent) => !disabledAgents.has(agent));
  if (!input.dry && input.phase === "mma-analysis") {
    // The refresh runs whatever the room decides; it is deterministic and free, and it is what
    // produces the model runs the room exists to read.
    preparationArtifacts.push(...await refreshFightAiQAnalysis({ root, now: input.now }));
    if (scheduledWakeUp && !(await hasFightAiQModelRun(root))) {
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
        shut: shutByNoModelRun(),
        preparationArtifacts
      });
    }
  }

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
      shut: shutByNoAgenda()
    });
  }
  let sourceMaterialChanged = true;
  let noChange = shutByNoMaterialChange();
  if (!input.dry && input.phase === "incubator-scan") {
    // Order matters and is the point of this block: sweep first, then decide. The trigger reads
    // the file the sweep has just written, so a decision taken before the sweep would read
    // yesterday's packet — or, the first time, no packet at all — and close the room on it.
    const evidence = await refreshIncubatorEvidence({ root, now: input.now });
    preparationArtifacts.push(...evidence.artifactPaths);
    assertSweptToPacketPath(evidence.artifactPaths);
    // Bound before comparing. The room is shown whole items up to its context budget, so an
    // unread item outside that window must not open a room that will never show it — that is a
    // room paid for daily that can never mark the item read. The digest sorts newest first, so
    // the window is the newest end of it; an item published long ago and only now fetched can
    // sit outside the window and stay unread.
    const shown = boundIncubatorPacket(await readIncubatorPacketItems(root));
    const unread = unreadPacketItems(shown.items, (await readIncubatorReadItems(root)).keys);
    sourceMaterialChanged = unread.length > 0;
    noChange = shown.offered === 0
      ? shutByEmptySweep()
      : shutByNothingUnread({ offered: shown.offered, shown: shown.items.length });
  }
  if (input.dry && input.phase === "incubator-scan") {
    // The dry run's only honest statement about this room: what the live state root would
    // decide today. It sweeps nothing, spends nothing and writes nothing here.
    console.log(JSON.stringify(await incubatorScanTriggerPreview(stateRoot), null, 2));
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
      shut: noChange,
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
    // The agenda leads, and the standing objective follows it. Appending the agenda to the
    // objective buried the one thing this sitting was called to settle behind a sentence the room
    // reads every day, and the records show what that produced: process-shaped agendas ("Supply
    // fight-week event priority list…") answered with PLAN records that decided nothing.
    ? `Decide today: ${agenda.summary} Standing objective: ${definition.objective}`
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
    try {
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
            limits
          }
        })
      });
    } catch (error) {
      // The palate pass is the first paid call of a room with a pre-step, so a cap that the
      // envelope pre-check let through — because another phase spent between the two reads —
      // lands here. assertTextReservation refuses before the provider is contacted, so nothing
      // was billed and there is nothing to record but the reason.
      if (!(error instanceof BudgetError)) throw error;
      return stoppedByBudget({ reservationUsd: null, code: error.code, cast: selected });
    }
  }
  const context = await composePortfolioContext(input.phase, root, date, registry, input.now);
  let contributions: Contribution[];
  let estimatedWorstCaseUsd = 0;
  /** Set when a cap refused a seat, so the room closes on the seats it already paid for. */
  let budgetStop: BudgetError | null = null;
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
      const system = `${roomPrompt}\n\nReturn one JSON object with every key: {"stance":"plan|pass|veto","summary":"<=280 chars","evidenceRefs":[],"task":null|{"summary":"<=240 chars"},"nicheProposals":[],"editorialSlate":null,"marketingPlan":null,"templateProposal":null,"inspirationObservations":[],"idea":null,"followUpRequest":null}. Keep every field inside its stated character limit; an over-long summary is rejected and your whole contribution is dropped. ${portfolioIdeaInstruction(input.phase)} The room chair may request at most one follow-up only when another specialist decision is genuinely needed; everyone else returns followUpRequest:null. When set it must be {"phase":"tt-marketing|incubator-scan|incubator-synthesis|mma-intake|mma-analysis|mag-editorial|mag-desk|studio","summary":"<=280 chars","evidenceRefs":[]} with all three keys present; any other phase or a missing evidenceRefs array is dropped. The summary is the first line the target room reads and must name the decision it has to take: write it as "Decide X between A and B" or "Approve or kill Y". A summary that describes work to prepare, supply or review is not a decision and gives that room nothing to settle. Only ANGLE may return one detailed marketingPlan during tt-marketing. Every visual must use the supplied live Carousel Studio template id, version and content payload; never return a freeform image specification. No paid media, commerce, outreach or spend is authorized. Only ANGLE may return up to two complete niche-proposal/1 objects during incubator synthesis. Only CANVAS may return editorialSlate, and only during mag-editorial. Only MOTIF may return inspirationObservations and only EASEL may return templateProposal during studio. Use exactly one AM and one PM editorial slot; kill a slot when its source-backed subject is missing or repeated.`;
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
      // it keeps `system` byte-identical for every seat in the room, so the room prompt and
      // the shared packet form one cacheable prefix, and leaves the agent's own instruction as
      // the last thing it reads, after the untrusted packet rather than before it. The request
      // now actually marks that prefix cacheable; for a long time this comment described an
      // intention the provider was never told about, and sixty ledger entries showed one
      // cache read between them.
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
        budgetContext: { now: input.now, cycleId: input.cycleId, stage: stages.current, ledger: currentLedger, allInNonApiSpentUsd: fixedMonthlyUsd, allInCommittedUsd: 0, knownMonthlyForecastUsd: 0, remainingScheduledCycles: 60, limits },
        parse: (text) => parsePortfolioContribution({ phase: input.phase, agent: call.agent, text })
      }).catch((error: unknown) => {
        // One seat returning unparsable JSON must cost that seat, not the room. A live
        // mma-intake run died on "Expected double-quoted property name in JSON at position
        // 824" and took every other agent's work with it. The spend is already recorded by
        // guardedJsonCall, so skipping here loses a contribution, not an accounting entry.
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
        // A cap refusing the next seat ends the room, not the job. assertTextReservation runs
        // before the provider is contacted, so this seat cost nothing and every seat already
        // called is already on the ledger — the remaining ones are simply not called. It used
        // to travel out of the process as exit 1 and the day's remaining slots then read as a
        // failed system. A barrier violation or a provider outage still propagates.
        if (error instanceof BudgetError) return error;
        throw error;
      });
      if (response instanceof BudgetError) {
        budgetStop = response;
        break;
      }
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
    if (budgetStop && contributions.length === 0) {
      // No seat said anything, so there is no meeting to record — only a reason. A record here
      // would read as a room that was held and decided nothing. Any seat that was billed before
      // the cap refused the next one is on the ledger already, and the reason quotes the day's
      // spend from that ledger, so nothing goes unaccounted for.
      return stoppedByBudget({ reservationUsd: null, code: budgetStop.code, cast: selected });
    }
    if (contributions.length === 0) {
      throw new Error(`Every seat in ${input.phase} returned unparsable output; the room produced nothing`);
    }
    if (budgetStop) {
      // Seats were called and billed before the cap refused the next one. Their work is the
      // room's real output and is written below exactly as any other room's is, so the meeting
      // is recorded rather than thrown away; this line is what says the room was cut short.
      console.warn(JSON.stringify({
        event: "room_cut_short_by_budget",
        phase: input.phase,
        code: budgetStop.code,
        seatsHeard: contributions.length,
        seatsSeated: selected.length
      }));
    }
  }
  if (!input.dry) assertTittyTuesdaysIdeaOutput(input.phase, contributions);
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
    if (marketingPlan.status === "draft" && marketingPlan.audienceRefs.length === 0) {
      console.warn(JSON.stringify({
        event: "marketing_plan_fallback",
        phase: input.phase,
        cycleId: input.cycleId,
        reason: "ANGLE returned no usable plan; the placeholder carries no audienceRefs and stays a draft."
      }));
    }

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
        // A subject already profiled is not fresh. Selection is deterministic, so without
        // this the same best-sourced fighter would be assigned every day the desk kills its
        // slate, publishing a second Shevchenko profile tomorrow at the full article
        // envelope and stamping a "fresh" verdict on a repeat. When every eligible fighter
        // has been used the slot stays killed, which is the honest answer.
        const alreadyProfiled = new Set(
          (await loadArticlePackages(stateRoot)).flatMap((article) => article.fighterRefs)
        );
        const profileSubject = (await loadFighterRecords())
          .filter((fighter) => (fighter.sources?.length ?? 0) > 0 && (fighter.history?.length ?? 0) > 0)
          .filter((fighter) => !alreadyProfiled.has(fighter.id))
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
    // Whichever branch above produced the slate, this is the last point before it is written to
    // `ventures/mma-files/slates/` and read back as the desk's record. The dry branch copies a
    // fixture and the live branch takes a model's object, so neither has checked that a ref
    // shaped like a repository path names a file: that is how the fixture's
    // `state/ideas/mma-files/ledger.jsonl#1` was stored as a real verdict. Resolution runs
    // against `repoRoot` and not `root`, because the refs are repository-relative — a dry run
    // writes into `tmp/dry-run/state` but still cites `state/...`.
    if (editorialSlate) {
      const checked = await resolveSlateEvidence(repoRoot, editorialSlate);
      if (checked.removed.length) {
        console.warn(JSON.stringify({
          event: "slate_evidence_unresolvable",
          phase: input.phase,
          cycleId: input.cycleId,
          removed: checked.removed,
          reason: "The verdict cited a repository path that does not exist; the ref was dropped and the verdict notes it."
        }));
      }
      editorialSlate = checked.slate;
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
  // What the incubator room read, written where the room's other output is written and nowhere
  // earlier. The items come from the packet the seats were handed, so the log can only ever
  // claim what was in front of them; a room the palate pre-step or a cap ended before any seat
  // spoke returns above this line and leaves the log alone, which is what keeps the next scan
  // able to see those items as unread.
  const incubatorReadPaths = !input.dry && input.phase === "incubator-scan" && context.incubatorItems?.length
    ? [await recordIncubatorPacketRead({ root, items: context.incubatorItems, cycleId: input.cycleId, now: input.now })]
    : [];
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
    // Do not queue an agenda for a room the effective schedule has switched off.
    //
    // `mayRequestMeeting` answers a policy question — may this phase hand work to that one — and
    // incubator-scan may hand work to incubator-synthesis. Whether that room can ever sit is a
    // different question, and today the answer is no: decisions/2026-08-01-budget-raise.md is
    // still "pending owner countersignature" with neither shape ticked, so the schedule takes its
    // own stated fallback — shape B, "run one daily incubator meeting" — which drops
    // incubator-synthesis. The workflow reads the same flag and skips the phase before the cycle
    // starts. An agenda queued for it would sit in the queue until its three-day TTL expired with
    // no room able to consume it, and the scan's record would claim it had handed work onward.
    // The scan is therefore terminal under the current shape: it can surface and log candidates,
    // and nothing downstream turns them into a proposal or founds a venture until the owner
    // countersigns shape A. Refusing the request keeps that visible instead of burying it in an
    // expiring queue entry.
    if (followUp && !phaseEnabled(schedule, followUp.phase)) {
      console.warn(`Follow-up meeting request was not queued: ${followUp.phase} is not in the effective budget shape, so no room could consume it`);
    } else if (followUp && mayRequestMeeting(meetingPolicy, input.phase, followUp.phase)) {
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
  const artifacts = [...preparationArtifacts, ...incubatorReadPaths, meetingPath, decisionPath, scorecardPath, calendarPath, ...proposalPaths, ...proposalMarkdownPaths, ...(editorialSlatePath ? [editorialSlatePath] : []), ...(marketingPlanPath ? [marketingPlanPath] : []), ...(marketingPlanMarkdownPath ? [marketingPlanMarkdownPath] : []), ...(studioLifecycle?.artifacts ?? []), ...ttSocialArtifacts, ...(agendaStateChanged ? [MEETING_AGENDA_PATH] : []), ...foundingArtifacts, ...ideaArtifacts, ...(input.dry ? [] : ["budget/ledger.json"])];
  return { cycleId: input.cycleId, phase: input.phase, dry: input.dry, status: input.dry ? "dry_complete" : "live_complete", decision: "PLAN", estimatedWorstCaseUsd, selectedAgents: selected, skippedAgents: room.skippedParticipants.map(({ agent }) => agent), artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(root, artifact))) };
}
