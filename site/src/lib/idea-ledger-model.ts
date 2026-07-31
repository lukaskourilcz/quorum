import { agentById, type AgentId } from "../data/agents";
import type { PublicStandup } from "../data/fixtures";

export const ideaStatuses = [
  "proposed",
  "accepted",
  "in_progress",
  "shipped",
  "deferred",
  "vetoed",
  "killed",
  "superseded",
  "revived"
] as const;
export type PublicIdeaStatus = (typeof ideaStatuses)[number];

export interface PublicIdeaEntry {
  id: string;
  title: string;
  summary: string;
  origin: { agent: AgentId; meetingRef: string };
  status: PublicIdeaStatus;
  statusHistory: Array<{
    status: PublicIdeaStatus;
    at: string;
    meetingRef: string;
    reason: string;
  }>;
  similarTo: Array<{
    id: string;
    score: number;
    verdict: "duplicate_of" | "variant_of";
  }>;
  revival?: { from: string; evidenceRef: string };
  supersededBy?: string;
}

const statusSet = new Set<PublicIdeaStatus>(ideaStatuses);
const ideaIdPattern = /^idea-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/;
const forbiddenPublicText = /(?:system prompt|developer message|process\.env|api[_ -]?key|private[_ -]?key|state\/inbox|social\/queue)/i;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max && !forbiddenPublicText.test(candidate)
    ? candidate
    : null;
}

function ideaId(value: unknown): string | null {
  const candidate = text(value, 160);
  return candidate && ideaIdPattern.test(candidate) ? candidate : null;
}

function iso(value: unknown): string | null {
  const candidate = text(value, 80);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

function status(value: unknown): PublicIdeaStatus | null {
  return typeof value === "string" && statusSet.has(value as PublicIdeaStatus)
    ? (value as PublicIdeaStatus)
    : null;
}

function strictArray<T>(value: unknown, max: number, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed = value.map(parse);
  return parsed.every((entry): entry is T => entry !== null) ? parsed : null;
}

export function parsePublicIdeaEntry(value: unknown): PublicIdeaEntry | null {
  const entry = object(value);
  if (!entry || entry.schemaVersion !== "idea-ledger/1") return null;
  const id = ideaId(entry.id);
  const fingerprint = text(entry.fingerprint, 80);
  const title = text(entry.title, 80);
  const summary = text(entry.summary, 280);
  const currentStatus = status(entry.status);
  const origin = object(entry.origin);
  const originAgent = origin && typeof origin.agent === "string" && agentById.has(origin.agent as AgentId)
    ? origin.agent as AgentId
    : null;
  const originMeetingRef = origin ? text(origin.meetingRef, 160) : null;
  const history = strictArray(entry.statusHistory, 64, (value) => {
    const item = object(value);
    const itemStatus = item ? status(item.status) : null;
    const at = item ? iso(item.at) : null;
    const meetingRef = item ? text(item.meetingRef, 160) : null;
    const reason = item ? text(item.reason, 280) : null;
    return itemStatus && at && meetingRef && reason
      ? { status: itemStatus, at, meetingRef, reason }
      : null;
  });
  const similarTo = strictArray(entry.similarTo, 24, (value) => {
    const item = object(value);
    const linkedId = item ? ideaId(item.id) : null;
    const score = item && typeof item.score === "number" && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1
      ? item.score
      : null;
    const verdict: PublicIdeaEntry["similarTo"][number]["verdict"] | null =
      item?.verdict === "duplicate_of" || item?.verdict === "variant_of" ? item.verdict : null;
    return linkedId && score !== null && verdict ? { id: linkedId, score, verdict } : null;
  });
  if (!id || !fingerprint || !/^sha256:[a-f0-9]{64}$/.test(fingerprint) || !title || !summary || !currentStatus || !originAgent || !originMeetingRef || !history || history.length === 0 || history.at(-1)?.status !== currentStatus || !similarTo) return null;

  const revival = entry.revival === undefined ? undefined : object(entry.revival);
  const revivalFrom = revival ? ideaId(revival.from) : null;
  const revivalEvidence = revival ? text(revival.evidenceRef, 160) : null;
  const supersededBy = entry.supersededBy === undefined ? undefined : ideaId(entry.supersededBy);
  if ((entry.revival !== undefined && (!revivalFrom || !revivalEvidence)) || (entry.supersededBy !== undefined && !supersededBy)) return null;

  return {
    id,
    title,
    summary,
    origin: { agent: originAgent, meetingRef: originMeetingRef },
    status: currentStatus,
    statusHistory: history,
    similarTo,
    ...(revivalFrom && revivalEvidence ? { revival: { from: revivalFrom, evidenceRef: revivalEvidence } } : {}),
    ...(supersededBy ? { supersededBy } : {})
  };
}

export function parsePublicIdeaLedger(raw: string): PublicIdeaEntry[] | null {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const snapshots: PublicIdeaEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = parsePublicIdeaEntry(JSON.parse(line));
      if (!parsed) return null;
      snapshots.push(parsed);
    } catch {
      return null;
    }
  }
  const current = new Map<string, PublicIdeaEntry>();
  for (const snapshot of snapshots) current.set(snapshot.id, snapshot);
  return [...current.values()].sort((left, right) =>
    Date.parse(right.statusHistory.at(-1)!.at) - Date.parse(left.statusHistory.at(-1)!.at)
  );
}

export function publicMeetingHref(
  reference: string,
  standups: readonly Pick<PublicStandup, "id" | "date" | "phase">[] = []
): string | null {
  if (reference.startsWith("meetings/")) return `/${reference}`;
  if (reference.startsWith("standups/")) {
    const logical = reference.slice("standups/".length);
    const date = logical.slice(0, 10);
    const phase = logical.slice(11);
    const record = standups.find((standup) => standup.date === date && standup.phase === phase);
    return record ? `/standups/${record.id}/room` : null;
  }
  return null;
}
