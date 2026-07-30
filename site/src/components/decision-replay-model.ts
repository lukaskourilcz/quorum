import type { AgentId } from "@/data/agents";
import type { RoomTranscript } from "@/data/fixtures";

export interface ReplayCut {
  id: string;
  label: string;
  detail: string;
  turnIndexes?: readonly number[];
}

export interface ReplayMoment {
  turnIndex: number;
  cutId: string;
  followedAgent: AgentId | null;
}

export function normalizeTurnIndexes(
  turnCount: number,
  turnIndexes?: readonly number[]
) {
  const source =
    turnIndexes ?? Array.from({ length: turnCount }, (_, index) => index);
  return [...new Set(source)]
    .filter(
      (turn) =>
        Number.isInteger(turn) && turn >= 0 && turn < Math.max(0, turnCount)
    )
    .sort((a, b) => a - b);
}

export function buildReplayPlaylist({
  followedAgent,
  transcript,
  turnIndexes
}: {
  followedAgent: AgentId | null;
  transcript: RoomTranscript;
  turnIndexes?: readonly number[];
}) {
  const normalized = normalizeTurnIndexes(
    transcript.turns.length,
    turnIndexes
  );
  if (!followedAgent) return normalized;
  return normalized.filter((turnIndex) => {
    const turn = transcript.turns[turnIndex];
    return (
      turn?.agent === followedAgent || turn?.addressedTo === followedAgent
    );
  });
}

export function findPlaylistTurnAtOrAfter(
  playlist: readonly number[],
  requestedTurn: number
) {
  return playlist.find((turn) => turn >= requestedTurn) ?? playlist.at(-1);
}

export function parseReplayMoment({
  agentIds,
  cutIds,
  search,
  turnCount
}: {
  agentIds: ReadonlySet<string>;
  cutIds: ReadonlySet<string>;
  search: string;
  turnCount: number;
}): ReplayMoment | null {
  const params = new URLSearchParams(search);
  const requestedTurn = Number(params.get("turn"));
  if (
    !Number.isInteger(requestedTurn) ||
    requestedTurn < 1 ||
    requestedTurn > turnCount
  ) {
    return null;
  }

  const requestedCut = params.get("cut");
  const requestedAgent = params.get("seat");

  return {
    turnIndex: requestedTurn - 1,
    cutId: requestedCut && cutIds.has(requestedCut) ? requestedCut : "full",
    followedAgent:
      requestedAgent && agentIds.has(requestedAgent)
        ? (requestedAgent as AgentId)
        : null
  };
}

export function buildReplayMomentUrl(href: string, moment: ReplayMoment) {
  const url = new URL(href);
  url.searchParams.set("turn", String(moment.turnIndex + 1));
  if (moment.cutId === "full") {
    url.searchParams.delete("cut");
  } else {
    url.searchParams.set("cut", moment.cutId);
  }
  if (moment.followedAgent) {
    url.searchParams.set("seat", moment.followedAgent);
  } else {
    url.searchParams.delete("seat");
  }
  url.hash = "decision-replay";
  return url.toString();
}

export function clearReplayMomentUrl(href: string) {
  const url = new URL(href);
  url.searchParams.delete("turn");
  url.searchParams.delete("cut");
  url.searchParams.delete("seat");
  if (url.hash === "#decision-replay") {
    url.hash = "";
  }
  return url.toString();
}
