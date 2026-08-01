import type { AgentId } from "@/data/agents";
import type { RoomTranscript } from "@/data/fixtures";

export type CouncilScenarioId =
  | "evidence-review"
  | "build-release"
  | "growth-experiment"
  | "finance-reconciliation"
  | "public-claim"
  | "organization-review"
  | "incident-response";

export interface RoutingPreviewConfig {
  defaults: {
    maxRounds: number;
    maxTurns: number;
    maxTotalTokens: number;
    maxSpecialists: number;
    ttlMinutes: number;
  };
  mandatoryWhen: readonly {
    any: readonly string[];
    include: readonly string[];
  }[];
  presets: Record<
    string,
    {
      required: readonly string[];
      optionalByTopic?: boolean;
      includeAffectedAgent?: boolean;
    }
  >;
}

export interface CouncilScenarioDefinition {
  id: CouncilScenarioId;
  label: string;
  objective: string;
  topicLabel: string;
  owner: AgentId;
  reviewer: AgentId;
  preset: string;
  riskTags: readonly string[];
}

export interface CouncilRoomParticipant {
  agent: AgentId;
  reasons: readonly string[];
  roles: readonly ("owner" | "reviewer" | "preset" | "control")[];
}

export interface CouncilRoomPreview extends CouncilScenarioDefinition {
  participants: readonly CouncilRoomParticipant[];
  standby: readonly AgentId[];
  caps: RoutingPreviewConfig["defaults"];
}

export interface RecordedRelationship {
  counterpart: AgentId;
  directExchanges: number;
  incoming: number;
  outgoing: number;
}

export interface CouncilSetup {
  scenarioId: CouncilScenarioId;
  seatId: AgentId;
}

export const councilScenarioDefinitions: readonly CouncilScenarioDefinition[] =
  [
    {
      id: "evidence-review",
      label: "Source check",
      objective:
        "Check whether the available sources are reliable and come from different places.",
      topicLabel: "sources",
      owner: "VIZE",
      reviewer: "SCOUT",
      preset: "evidence-room",
      riskTags: []
    },
    {
      id: "build-release",
      label: "Release check",
      objective:
        "Decide whether a small code change has been checked well enough to release.",
      topicLabel: "build",
      owner: "FORGE",
      reviewer: "AUDIT",
      preset: "build-room",
      riskTags: []
    },
    {
      id: "growth-experiment",
      label: "Audience test",
      objective:
        "Review a small audience test with a clear success check before it starts.",
      topicLabel: "growth",
      owner: "PULSE",
      reviewer: "LENS",
      preset: "growth-room",
      riskTags: []
    },
    {
      id: "finance-reconciliation",
      label: "Budget review",
      objective:
        "Check the cost, the money left this month and what the numbers support.",
      topicLabel: "finance",
      owner: "LEDGER",
      reviewer: "PULSE",
      preset: "finance-room",
      riskTags: ["cost"]
    },
    {
      id: "public-claim",
      label: "Public wording check",
      objective:
        "Check a public statement against its sources and publishing permissions.",
      topicLabel: "social",
      owner: "PULSE",
      reviewer: "QUILL",
      preset: "growth-room",
      riskTags: ["public_claim"]
    },
    {
      id: "organization-review",
      label: "AI team review",
      objective:
        "Check whether real results support changing a role or its meeting assignments.",
      topicLabel: "organization",
      owner: "PEOPLE",
      reviewer: "AUDIT",
      preset: "org-review",
      riskTags: ["org_change"]
    },
    {
      id: "incident-response",
      label: "Problem response",
      objective:
        "Keep the response small, protect the release checks and name the responsible role.",
      topicLabel: "incident",
      owner: "AUDIT",
      reviewer: "KEEPER",
      preset: "incident-room",
      riskTags: ["incident"]
    }
  ];

function readableTag(tag: string) {
  return tag.replaceAll("_", " ").replaceAll(":", " ");
}

export function buildCouncilRoomPreviews(
  config: RoutingPreviewConfig,
  agentIds: readonly AgentId[]
): readonly CouncilRoomPreview[] {
  const validAgentIds = new Set<AgentId>(agentIds);

  return councilScenarioDefinitions.map((scenario) => {
    const routed = new Map<
      AgentId,
      {
        reasons: Set<string>;
        roles: Set<CouncilRoomParticipant["roles"][number]>;
      }
    >();

    const addParticipant = (
      value: string,
      reason: string,
      role: CouncilRoomParticipant["roles"][number]
    ) => {
      if (!validAgentIds.has(value as AgentId)) return;
      const agent = value as AgentId;
      const entry = routed.get(agent) ?? {
        reasons: new Set<string>(),
        roles: new Set<CouncilRoomParticipant["roles"][number]>()
      };
      entry.reasons.add(reason);
      entry.roles.add(role);
      routed.set(agent, entry);
    };

    addParticipant(
      scenario.owner,
      `Leads the ${scenario.topicLabel} decision.`,
      "owner"
    );
    addParticipant(
      scenario.reviewer,
      `Reviews the ${scenario.topicLabel} decision.`,
      "reviewer"
    );

    for (const agent of config.presets[scenario.preset]?.required ?? []) {
      addParticipant(
        agent,
        `Always joins this kind of meeting.`,
        "preset"
      );
    }

    for (const rule of config.mandatoryWhen) {
      const matchedTags = rule.any.filter((tag) =>
        scenario.riskTags.includes(tag)
      );
      if (!matchedTags.length) continue;
      const tagLabel = matchedTags.map(readableTag).join(" or ");
      for (const agent of rule.include) {
        addParticipant(
          agent,
          `Required when the meeting involves ${tagLabel}.`,
          "control"
        );
      }
    }

    const participants = [...routed.entries()].map(
      ([agent, { reasons, roles }]) => ({
        agent,
        reasons: [...reasons],
        roles: [...roles]
      })
    );
    const selectedIds = new Set(participants.map((item) => item.agent));

    return {
      ...scenario,
      participants,
      standby: agentIds.filter((agent) => !selectedIds.has(agent)),
      caps: config.defaults
    };
  });
}

export function getRecordedRelationships(
  transcript: RoomTranscript,
  selectedAgent: AgentId
): {
  speakingTurns: number;
  relationships: readonly RecordedRelationship[];
} {
  const relationships = new Map<AgentId, RecordedRelationship>();

  const update = (
    counterpart: AgentId,
    direction: "incoming" | "outgoing"
  ) => {
    const current = relationships.get(counterpart) ?? {
      counterpart,
      directExchanges: 0,
      incoming: 0,
      outgoing: 0
    };
    current.directExchanges += 1;
    current[direction] += 1;
    relationships.set(counterpart, current);
  };

  for (const turn of transcript.turns) {
    if (!turn.addressedTo || turn.addressedTo === turn.agent) continue;
    if (turn.agent === selectedAgent) {
      update(turn.addressedTo, "outgoing");
    } else if (turn.addressedTo === selectedAgent) {
      update(turn.agent, "incoming");
    }
  }

  return {
    speakingTurns: transcript.turns.filter(
      (turn) => turn.agent === selectedAgent
    ).length,
    relationships: [...relationships.values()].sort(
      (left, right) =>
        right.directExchanges - left.directExchanges ||
        left.counterpart.localeCompare(right.counterpart)
    )
  };
}

export function parseCouncilSetup(
  search: string,
  previews: readonly CouncilRoomPreview[]
): CouncilSetup | null {
  const params = new URLSearchParams(search);
  const scenarioId = params.get("room");
  const seatId = params.get("seat");
  const scenario = previews.find((item) => item.id === scenarioId);
  if (!scenario) return null;

  const selectedSeat = scenario.participants.find(
    (participant) => participant.agent === seatId
  )?.agent;

  return {
    scenarioId: scenario.id,
    seatId: selectedSeat ?? scenario.owner
  };
}

export function buildCouncilSetupUrl(
  currentHref: string,
  setup: CouncilSetup
) {
  const url = new URL(currentHref);
  url.searchParams.set("room", setup.scenarioId);
  url.searchParams.set("seat", setup.seatId);
  url.hash = "council-simulator";
  return url.toString();
}
