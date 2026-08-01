import { agentById, type AgentId } from "../data/agents";
import type { RoomTranscript, RoomTurnMode } from "../data/fixtures";

export type PublicMeetingKind = "cu-edition" | "cu-product" | "tt-marketing" | "incubator-scan" | "incubator-synthesis" | "mma-intake" | "mma-analysis" | "mag-editorial" | "mag-desk";
export type PublicMeetingStatus =
  | "PLAN"
  | "PAUSED"
  | "FAILED"
  | "HELD"
  | "NO_EDITION"
  | "NEEDS_RECONCILIATION";

export interface PublicMeetingRecord {
  id: string;
  cycleId: string;
  date: string;
  kind: PublicMeetingKind;
  fixture: boolean;
  status: PublicMeetingStatus;
  stage: string;
  operatingBrief: string;
  participants: Array<{ agent: AgentId; reason: string; participated: boolean }>;
  ledger: {
    estimate: number;
    actual: number | null;
    monthAllIn: number;
    cap: number;
  };
  decision: { outcome: string; summary: string; evidenceRefs: string[] };
  proposals: Array<{ agent: AgentId; summary: string; evidenceRefs: string[] }>;
  voteMatrix: Array<{ voter: AgentId; firstChoice: string; veto: boolean }>;
  tasks: Array<{
    id: string;
    owner: AgentId;
    summary: string;
    status: "planned" | "done" | "blocked" | "skipped";
  }>;
  growthPlan: string;
  eveningOutcome: string | null;
  caughtUpIdeaRef?: string;
  ideaVerdicts: Array<{
    ideaId: string;
    verdict: "accept" | "veto" | "defer" | "supersede";
    reason: string;
  }>;
  editionRef?: string;
  sharperData?: { outcome: "proposal" | "nothing-new"; summary: string; ideaRef?: string; evidenceRefs: string[] };
  roomTranscript: RoomTranscript;
  generatedAt: string;
}

const statuses = new Set<PublicMeetingStatus>([
  "PLAN",
  "PAUSED",
  "FAILED",
  "HELD",
  "NO_EDITION",
  "NEEDS_RECONCILIATION"
]);
const stages = new Set(["DISCOVERY", "VALIDATION", "AUDIENCE", "MONETIZATION", "OPTIMIZATION"]);
const modes = new Set<RoomTurnMode>([
  "gavel",
  "statement",
  "response",
  "reads-ledger",
  "raises-concern",
  "veto",
  "vote",
  "close"
]);
const forbiddenPublicText =
  /(?:system prompt|developer message|process\.env|api[_ -]?key|private[_ -]?key|state\/inbox|social\/queue|begin (?:rsa |ec |openssh )?private key)/i;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = 800): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max && !forbiddenPublicText.test(candidate)
    ? candidate
    : null;
}

function iso(value: unknown): string | null {
  const candidate = text(value, 80);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

function date(value: unknown): string | null {
  const candidate = text(value, 10);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T12:00:00Z`))
    ? candidate
    : null;
}

function finiteNonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function agent(value: unknown): AgentId | null {
  return typeof value === "string" && agentById.has(value as AgentId)
    ? (value as AgentId)
    : null;
}

function stringArray(value: unknown, maxItems = 16): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const parsed = value.map((entry) => text(entry, 160));
  return parsed.every((entry): entry is string => Boolean(entry)) ? parsed : null;
}

function strictArray<T>(
  value: unknown,
  parse: (entry: unknown) => T | null,
  maxItems: number
): T[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const parsed = value.map(parse);
  return parsed.every((entry): entry is T => entry !== null) ? parsed : null;
}

function parseTurn(value: unknown): RoomTranscript["turns"][number] | null {
  const entry = object(value);
  if (!entry) return null;
  const speaker = agent(entry.agent);
  const mode = text(entry.mode, 32) as RoomTurnMode | null;
  const body = text(entry.text, 800);
  const addressedTo = entry.addressedTo === undefined ? undefined : agent(entry.addressedTo);
  const sentAt = entry.sentAt === undefined ? undefined : iso(entry.sentAt);
  const evidenceRefs = entry.evidenceRefs === undefined ? undefined : stringArray(entry.evidenceRefs);
  if (
    !speaker ||
    !mode ||
    !modes.has(mode) ||
    !body ||
    (entry.addressedTo !== undefined && !addressedTo) ||
    (entry.sentAt !== undefined && !sentAt) ||
    (entry.evidenceRefs !== undefined && !evidenceRefs)
  ) return null;
  return {
    agent: speaker,
    mode,
    text: body,
    ...(addressedTo ? { addressedTo } : {}),
    ...(sentAt ? { sentAt } : {}),
    ...(evidenceRefs ? { evidenceRefs } : {})
  };
}

export function parsePublicMeetingRecord(value: unknown): PublicMeetingRecord | null {
  const record = object(value);
  if (!record || record.schemaVersion !== "meeting-record/2") return null;
  const cycleId = text(record.cycleId, 160);
  const meetingDate = date(record.date);
  const kind = record.kind === "cu-edition" || record.kind === "cu-product" || record.kind === "tt-marketing" || record.kind === "incubator-scan" || record.kind === "incubator-synthesis" || record.kind === "mma-intake" || record.kind === "mma-analysis" || record.kind === "mag-editorial" || record.kind === "mag-desk" ? record.kind : null;
  const phase = record.phase === kind ? kind : null;
  const status = text(record.status, 40) as PublicMeetingStatus | null;
  const stage = text(record.stage, 40);
  const operatingBrief = text(record.operatingBrief);
  const generatedAt = iso(record.generatedAt);
  if (!cycleId || !meetingDate || !kind || !phase || !status || !statuses.has(status) || !stage || !stages.has(stage) || !operatingBrief || !generatedAt || typeof record.fixture !== "boolean") return null;

  const ledger = object(record.ledger);
  const decision = object(record.decision);
  const transcript = object(record.roomTranscript);
  if (!ledger || !decision || !transcript) return null;
  const estimate = finiteNonnegative(ledger.estimatedCycleUsd);
  const actual = ledger.actualCycleUsd === null ? null : finiteNonnegative(ledger.actualCycleUsd);
  const monthAllIn = finiteNonnegative(ledger.monthAllInUsd);
  const cap = finiteNonnegative(ledger.monthCapUsd);
  const outcome = text(decision.outcome, 160);
  const decisionSummary = text(decision.summary);
  const decisionEvidence = stringArray(decision.evidenceRefs);
  const openedAt = iso(transcript.openedAt);
  const closedAt = iso(transcript.closedAt);
  const gavel = agent(transcript.gavel);
  const setting = text(transcript.setting);
  const turns = strictArray(transcript.turns, parseTurn, 36);
  if (estimate === null || (ledger.actualCycleUsd !== null && actual === null) || monthAllIn === null || cap === null || cap <= 0 || !outcome || !decisionSummary || !decisionEvidence || !openedAt || !closedAt || !gavel || !setting || !turns || turns.length === 0) return null;

  const participants = strictArray(record.participantReasons, (value) => {
    const entry = object(value);
    const id = entry ? agent(entry.agent) : null;
    const reason = entry ? text(entry.reason, 240) : null;
    return id && reason && typeof entry?.participated === "boolean"
      ? { agent: id, reason, participated: entry.participated }
      : null;
  }, 20);
  const proposals = strictArray(record.proposals, (value) => {
    const entry = object(value);
    const id = entry ? agent(entry.agent) : null;
    const summary = entry ? text(entry.summary) : null;
    const evidenceRefs = entry ? stringArray(entry.evidenceRefs) : null;
    return id && summary && evidenceRefs ? { agent: id, summary, evidenceRefs } : null;
  }, 8);
  const voteMatrix = strictArray(record.voteMatrix, (value) => {
    const entry = object(value);
    const voter = entry ? agent(entry.voter) : null;
    const firstChoice = entry ? text(entry.firstChoice, 200) : null;
    return voter && firstChoice && typeof entry?.veto === "boolean"
      ? { voter, firstChoice, veto: entry.veto }
      : null;
  }, 8);
  const tasks = strictArray(record.tasks, (value) => {
    const entry = object(value);
    const id = entry ? text(entry.id, 160) : null;
    const owner = entry ? agent(entry.owner) : null;
    const summary = entry ? text(entry.summary) : null;
    const taskStatus = entry ? text(entry.status, 20) : null;
    return id && owner && summary && taskStatus && ["planned", "done", "blocked", "skipped"].includes(taskStatus)
      ? { id, owner, summary, status: taskStatus as PublicMeetingRecord["tasks"][number]["status"] }
      : null;
  }, 20);
  const ideaVerdicts = record.ideaVerdicts === undefined ? [] : strictArray(record.ideaVerdicts, (value) => {
    const entry = object(value);
    const ideaId = entry ? text(entry.ideaId, 160) : null;
    const verdict = entry ? text(entry.verdict, 20) : null;
    const reason = entry ? text(entry.reason, 280) : null;
    return ideaId && verdict && reason && ["accept", "veto", "defer", "supersede"].includes(verdict)
      ? { ideaId, verdict: verdict as PublicMeetingRecord["ideaVerdicts"][number]["verdict"], reason }
      : null;
  }, 8);
  const growthPlan = text(record.growthPlan);
  const eveningOutcome = record.eveningOutcome === null ? null : text(record.eveningOutcome);
  if (!participants || participants.length === 0 || !proposals || !voteMatrix || voteMatrix.length === 0 || !tasks || !ideaVerdicts || !growthPlan || (record.eveningOutcome !== null && !eveningOutcome)) return null;

  const caughtUpIdeaRef = record.caughtUpIdeaRef === undefined ? undefined : text(record.caughtUpIdeaRef, 160);
  const editionRef = record.editionRef === undefined ? undefined : text(record.editionRef, 160);
  const sharper = record.sharperData === undefined ? null : object(record.sharperData);
  const sharperOutcome = sharper?.outcome === "proposal" || sharper?.outcome === "nothing-new" ? sharper.outcome : null;
  const sharperSummary = sharper ? text(sharper.summary, 280) : null;
  const sharperEvidence = sharper ? stringArray(sharper.evidenceRefs) : null;
  const sharperIdeaRef = sharper?.ideaRef === undefined ? undefined : text(sharper.ideaRef, 160);
  const mmaKind = kind === "mma-intake" || kind === "mma-analysis";
  if ((record.caughtUpIdeaRef !== undefined && !caughtUpIdeaRef) || (record.editionRef !== undefined && !editionRef) || (mmaKind && (!sharper || !sharperOutcome || !sharperSummary || !sharperEvidence)) || (sharper?.ideaRef !== undefined && !sharperIdeaRef)) return null;

  return {
    id: `${meetingDate}-${kind}`,
    cycleId,
    date: meetingDate,
    kind,
    fixture: record.fixture,
    status,
    stage,
    operatingBrief,
    participants,
    ledger: { estimate, actual, monthAllIn, cap },
    decision: { outcome, summary: decisionSummary, evidenceRefs: decisionEvidence },
    proposals,
    voteMatrix,
    tasks,
    growthPlan,
    eveningOutcome,
    ...(caughtUpIdeaRef ? { caughtUpIdeaRef } : {}),
    ideaVerdicts,
    ...(editionRef ? { editionRef } : {}),
    ...(sharperOutcome && sharperSummary && sharperEvidence ? { sharperData: { outcome: sharperOutcome, summary: sharperSummary, ...(sharperIdeaRef ? { ideaRef: sharperIdeaRef } : {}), evidenceRefs: sharperEvidence } } : {}),
    roomTranscript: { openedAt, closedAt, gavel, setting, turns },
    generatedAt
  };
}
