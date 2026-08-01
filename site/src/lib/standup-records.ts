import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { agentById, type AgentId } from "@/data/agents";
import { standups as fixtureStandups, type PublicStandup, type RoomTurnMode } from "@/data/fixtures";

const phases = new Set([
  "founding",
  "am",
  "pm",
  "morning",
  "afternoon",
  "night"
]);
const statuses = new Set([
  "INSUFFICIENT_EVIDENCE",
  "NO_ACTION",
  "PLAN",
  "PAUSED",
  "FAILED"
]);
const turnModes = new Set<RoomTurnMode>([
  "gavel",
  "statement",
  "response",
  "reads-ledger",
  "raises-concern",
  "veto",
  "vote",
  "close"
]);

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = 800): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function agent(value: unknown): AgentId | null {
  return typeof value === "string" && agentById.has(value as AgentId)
    ? (value as AgentId)
    : null;
}

function iso(value: unknown): string | null {
  const candidate = text(value, 80);
  return candidate && !Number.isNaN(new Date(candidate).getTime()) ? candidate : null;
}

function parseTurn(value: unknown): PublicStandup["roomTranscript"]["turns"][number] | null {
  const entry = object(value);
  if (!entry) return null;
  const speaker = agent(entry.agent);
  const mode = text(entry.mode, 32) as RoomTurnMode | null;
  const body = text(entry.text);
  if (!speaker || !mode || !turnModes.has(mode) || !body) return null;
  const addressedTo = entry.addressedTo === undefined ? undefined : agent(entry.addressedTo);
  if (entry.addressedTo !== undefined && !addressedTo) return null;
  const sentAt = entry.sentAt === undefined ? undefined : iso(entry.sentAt);
  if (entry.sentAt !== undefined && !sentAt) return null;
  const evidenceRefs = Array.isArray(entry.evidenceRefs)
    ? entry.evidenceRefs.map((reference) => text(reference, 120)).filter(
        (reference): reference is string => Boolean(reference)
      )
    : undefined;
  return {
    agent: speaker,
    mode,
    addressedTo: addressedTo ?? undefined,
    sentAt: sentAt ?? undefined,
    text: body,
    evidenceRefs
  };
}

function parseRecord(value: unknown): PublicStandup | null {
  const record = object(value);
  if (!record || typeof record.fixture !== "boolean") return null;
  const cycleId = text(record.cycleId, 120);
  const date = text(record.date, 20);
  const phase = text(record.phase, 20);
  const status = text(record.status, 40);
  const stage = text(record.stage, 40);
  const operatingBrief = text(record.operatingBrief);
  const generatedAt = iso(record.generatedAt);
  if (
    !cycleId ||
    !date ||
    !phase ||
    !phases.has(phase) ||
    !status ||
    !statuses.has(status) ||
    !stage ||
    !operatingBrief ||
    !generatedAt
  ) {
    return null;
  }
  const ledger = object(record.ledger);
  const decision = object(record.decision);
  const transcript = object(record.roomTranscript);
  if (!ledger || !decision || !transcript) return null;
  const estimate = number(ledger.estimatedCycleUsd);
  const actual = number(ledger.actualCycleUsd);
  const monthAllIn = number(ledger.monthAllInUsd);
  const cap = number(ledger.monthCapUsd);
  const outcome = text(decision.outcome, 120);
  const decisionSummary = text(decision.summary);
  const openedAt = iso(transcript.openedAt);
  const closedAt = iso(transcript.closedAt);
  const gavel = agent(transcript.gavel);
  const setting = text(transcript.setting);
  const turns = Array.isArray(transcript.turns)
    ? transcript.turns.map(parseTurn).filter(
        (turn): turn is NonNullable<ReturnType<typeof parseTurn>> => Boolean(turn)
      )
    : [];
  if (
    estimate === null ||
    actual === null ||
    monthAllIn === null ||
    cap === null ||
    !outcome ||
    !decisionSummary ||
    !openedAt ||
    !closedAt ||
    !gavel ||
    !setting ||
    turns.length === 0
  ) {
    return null;
  }
  const participants = Array.isArray(record.participantReasons)
    ? record.participantReasons.flatMap((participant) => {
        const item = object(participant);
        const id = item ? agent(item.agent) : null;
        const reason = item ? text(item.reason, 200) : null;
        return id && reason && typeof item?.participated === "boolean"
          ? [{ agent: id, reason, participated: item.participated }]
          : [];
      })
    : [];
  const proposals = Array.isArray(record.proposals)
    ? record.proposals.flatMap((proposal) => {
        const item = object(proposal);
        const id = item ? agent(item.agent) : null;
        const summary = item ? text(item.summary) : null;
        const evidenceRefs = item && Array.isArray(item.evidenceRefs)
          ? item.evidenceRefs.map((reference) => text(reference, 160)).filter(
              (reference): reference is string => Boolean(reference)
            )
          : [];
        return id && summary ? [{ agent: id, summary, evidenceRefs }] : [];
      })
    : [];
  const voteMatrix = Array.isArray(record.voteMatrix)
    ? record.voteMatrix.flatMap((vote) => {
        const item = object(vote);
        const voter = item ? agent(item.voter) : null;
        const firstChoice = item ? text(item.firstChoice, 160) : null;
        return voter && firstChoice && typeof item?.veto === "boolean"
          ? [{ voter, firstChoice, veto: item.veto }]
          : [];
      })
    : [];
  const tasks = Array.isArray(record.tasks)
    ? record.tasks.flatMap((task) => {
        const item = object(task);
        const owner = item ? agent(item.owner) : null;
        const summary = item ? text(item.summary) : null;
        const taskStatus = item ? text(item.status, 20) : null;
        const id = item ? text(item.id, 120) : null;
        return owner && summary && taskStatus && ["planned", "done", "blocked", "skipped"].includes(taskStatus)
          ? [{ id: id ?? undefined, time: "Current shift", agent: owner, summary, status: taskStatus as "planned" | "done" | "blocked" | "skipped" }]
          : [];
      })
    : [];
  const proposalCountValid = proposals.length === 4 || (
    phase === "morning" &&
    proposals.length === 5 &&
    proposals.filter((proposal) => proposal.agent === "SPARK").length === 1
  );
  if (participants.length === 0 || !proposalCountValid || voteMatrix.length !== 4) {
    return null;
  }
  return {
    id: cycleId,
    date,
    phase: phase as PublicStandup["phase"],
    fixture: record.fixture,
    status: status as PublicStandup["status"],
    stage,
    operatingBrief,
    participants,
    ledger: { estimate, actual, monthAllIn, cap },
    proposals,
    voteMatrix,
    decision: { outcome, summary: decisionSummary, evidenceRefs: [] },
    tasks,
    growthPlan: text(record.growthPlan) ?? "NO_POST — no public distribution event was recorded.",
    eveningOutcome: typeof record.eveningOutcome === "string" ? record.eveningOutcome : null,
    ...(text(record.caughtUpIdeaRef, 160)
      ? { caughtUpIdeaRef: text(record.caughtUpIdeaRef, 160)! }
      : {}),
    roomTranscript: { openedAt, closedAt, gavel, setting, turns },
    generatedAt
  };
}

function stateRoot() {
  const repoRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(repoRoot, "state", "standups");
}

export async function getPublicStandups(): Promise<readonly PublicStandup[]> {
  let names: string[];
  try {
    names = await readdir(stateRoot());
  } catch {
    return fixtureStandups;
  }
  const records = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          return parseRecord(JSON.parse(await readFile(path.join(stateRoot(), name), "utf8")));
        } catch {
          return null;
        }
      })
  );
  return [...records.filter((record): record is PublicStandup => Boolean(record)), ...fixtureStandups].sort(
    (left, right) =>
      new Date(right.roomTranscript.openedAt).getTime() -
      new Date(left.roomTranscript.openedAt).getTime()
  );
}

export async function getPublicStandup(id: string): Promise<PublicStandup | undefined> {
  return (await getPublicStandups()).find((standup) => standup.id === id);
}
