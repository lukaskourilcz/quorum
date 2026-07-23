import type {
  RoomDecision,
  RoomMessage,
  RoomPacket
} from "./room.js";

const PRIVATE_PATTERN =
  /(chain[- ]of[- ]thought|system prompt|developer message|sk-(?:proj-|ant-)?[a-z0-9_-]+|human_approval|state\/inbox|process\.env)/i;

export interface PublicRoomProjection {
  schemaVersion: 1;
  roomId: string;
  topicType: RoomPacket["topicType"];
  objective: string;
  participants: Array<{ agent: string; reason: string }>;
  evidenceRefs: string[];
  positions: Array<{
    from: string;
    kind: RoomMessage["kind"];
    summary: string;
    evidenceRefs: string[];
  }>;
  decision: {
    outcome: RoomDecision["outcome"];
    summary: string;
    owner: string | null;
  };
  costUsd: number;
  latencyMs: number;
  closedAt: string;
}

function assertPublicText(value: string): void {
  if (PRIVATE_PATTERN.test(value)) {
    throw new Error("Public room projection contains a private or secret marker");
  }
}

export function sanitizeRoom(input: {
  packet: RoomPacket;
  messages: readonly RoomMessage[];
  decision: RoomDecision;
}): PublicRoomProjection {
  [
    input.packet.objective,
    input.decision.summary,
    ...input.packet.selectedParticipants.flatMap((participant) => [
      participant.reason
    ]),
    ...input.messages.map((message) => message.summary)
  ].forEach(assertPublicText);
  return {
    schemaVersion: 1,
    roomId: input.packet.roomId,
    topicType: input.packet.topicType,
    objective: input.packet.objective,
    participants: input.packet.selectedParticipants.map((participant) => ({
      agent: participant.agent,
      reason: participant.reason
    })),
    evidenceRefs: [...input.packet.evidenceRefs],
    positions: input.messages.map((message) => ({
      from: message.from,
      kind: message.kind,
      summary: message.summary,
      evidenceRefs: [...message.evidenceRefs]
    })),
    decision: {
      outcome: input.decision.outcome,
      summary: input.decision.summary,
      owner: input.decision.owner
    },
    costUsd: input.decision.costUsd,
    latencyMs: input.decision.latencyMs,
    closedAt: input.decision.closedAt
  };
}

