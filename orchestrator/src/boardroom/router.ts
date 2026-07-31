import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  FoundingAgentSchema,
  type FoundingAgent
} from "../types.js";
import { loadAgentRegistry } from "../org/registry.js";
import {
  RoomPacketSchema,
  type RoomPacket
} from "./room.js";

const RoutingConfigSchema = z.object({
  schemaVersion: z.literal(1),
  defaults: z.object({
    maxRounds: z.number().int().min(1).max(2),
    maxTurns: z.number().int().min(1).max(6),
    maxTotalTokens: z.number().int().positive().max(12000),
    maxSpecialists: z.number().int().min(0).max(3),
    ttlMinutes: z.number().int().positive()
  }),
  agents: z.record(
    FoundingAgentSchema,
    z.object({
      capabilities: z.array(z.string().min(1)),
      status: z.enum([
        "active",
        "coaching",
        "restricted",
        "paused",
        "proposed",
        "retired"
      ])
    })
  ),
  mandatoryWhen: z.array(
    z.object({
      any: z.array(z.string().min(1)).min(1),
      include: z.array(FoundingAgentSchema).min(1)
    })
  ),
  presets: z.record(
    z.string(),
    z.object({
      required: z.array(FoundingAgentSchema),
      optionalByTopic: z.boolean().optional(),
      includeAffectedAgent: z.boolean().optional()
    })
  )
});

type RoutingConfig = z.infer<typeof RoutingConfigSchema> & {
  ventureAssignments: Record<FoundingAgent, "global" | string[]>;
};

const COUNCIL = new Set<FoundingAgent>(["VIZE", "FORGE", "PULSE", "AUDIT"]);
const OWNER_BY_TOPIC: Record<RoomPacket["topicType"], FoundingAgent> = {
  evidence: "VIZE",
  build: "FORGE",
  growth: "PULSE",
  social: "PULSE",
  finance: "LEDGER",
  org: "PEOPLE",
  incident: "AUDIT",
  council: "VIZE",
  edition: "HERALD",
  product: "HERALD"
};
const DOMAIN_REVIEWER: Partial<Record<RoomPacket["topicType"], FoundingAgent>> = {
  evidence: "SCOUT",
  build: "AUDIT",
  growth: "LENS",
  social: "QUILL",
  finance: "PULSE",
  org: "AUDIT",
  incident: "KEEPER",
  edition: "STET",
  product: "VAULT"
};

export async function loadRoutingConfig(path: string): Promise<RoutingConfig> {
  const [routing, registry] = await Promise.all([
    readFile(path, "utf8").then((source) =>
      RoutingConfigSchema.parse(JSON.parse(source))
    ),
    loadAgentRegistry()
  ]);
  return {
    ...routing,
    ventureAssignments: Object.fromEntries(
      registry.agents.map((agent) => [agent.id, agent.ventures])
    ) as Record<FoundingAgent, "global" | string[]>
  };
}

export interface RouteInput {
  roomId: string;
  topicType: RoomPacket["topicType"];
  objective: string;
  evidenceRefs: string[];
  decisionNeeded: RoomPacket["decisionNeeded"];
  riskTags: string[];
  budgetImpactUsd: number;
  ventureId?: string;
  preset?: string;
  requiredParticipants?: readonly FoundingAgent[];
  affectedAgent?: FoundingAgent;
  now?: Date;
}

export function routeBoardroom(
  config: RoutingConfig,
  input: RouteInput
): RoomPacket {
  const owner = OWNER_BY_TOPIC[input.topicType];
  const selected = new Map<
    FoundingAgent,
    { reason: string; mandatoryRule: string | null }
  >();
  const add = (
    agent: FoundingAgent,
    reason: string,
    mandatoryRule: string | null = null
  ) => {
    if (config.agents[agent]?.status !== "active") {
      throw new Error(`Routing selected inactive or unknown agent ${agent}`);
    }
    const assignment = config.ventureAssignments[agent];
    if (
      input.ventureId &&
      assignment !== "global" &&
      !assignment?.includes(input.ventureId)
    ) {
      throw new Error(`Routing selected ${agent} outside venture ${input.ventureId}`);
    }
    const existing = selected.get(agent);
    selected.set(agent, {
      reason: existing?.reason ?? reason,
      mandatoryRule: existing?.mandatoryRule ?? mandatoryRule
    });
  };
  add(owner, `owns ${input.topicType} objective`);
  const preset = input.preset ? config.presets[input.preset] : undefined;
  for (const agent of preset?.required ?? []) {
    add(agent, `required by ${input.preset} preset`, `preset:${input.preset}`);
  }
  for (const agent of input.requiredParticipants ?? []) {
    add(agent, "required by venture registry", "venture-registry");
  }
  if (preset?.includeAffectedAgent && input.affectedAgent) {
    add(input.affectedAgent, "affected by the proposed organization change");
  }
  const reviewer = DOMAIN_REVIEWER[input.topicType];
  if (reviewer && !selected.has(reviewer)) {
    const selectedSpecialists = [...selected.keys()].filter(
      (agent) => !COUNCIL.has(agent) && agent !== owner
    ).length;
    if (selectedSpecialists < config.defaults.maxSpecialists) {
      add(reviewer, `reviews ${input.topicType} work`);
    }
  }
  for (const rule of config.mandatoryWhen) {
    const matchingTags = rule.any.filter((tag) => input.riskTags.includes(tag));
    if (matchingTags.length > 0) {
      for (const agent of rule.include) {
        add(
          agent,
          `mandatory control for ${matchingTags.join(", ")}`,
          `mandatory:${matchingTags.join("+")}`
        );
      }
    }
  }
  if (input.topicType === "council") {
    for (const agent of COUNCIL) {
      add(agent, "formal voting seat", "formal-council");
    }
  }
  const allAgents = Object.keys(config.agents) as FoundingAgent[];
  const now = input.now ?? new Date();
  return RoomPacketSchema.parse({
    roomId: input.roomId,
    topicType: input.topicType,
    objective: input.objective,
    owner,
    evidenceRefs: input.evidenceRefs,
    decisionNeeded: input.decisionNeeded,
    riskTags: input.riskTags,
    budgetImpactUsd: input.budgetImpactUsd,
    selectedParticipants: [...selected.entries()].map(
      ([agent, { reason, mandatoryRule }]) => ({
        agent,
        reason,
        mandatoryRule
      })
    ),
    skippedParticipants: allAgents
      .filter((agent) => !selected.has(agent))
      .map((agent) => ({
        agent,
        reason: "not relevant to this bounded room",
        mandatoryRule: null
      })),
    maxRounds: config.defaults.maxRounds,
    maxTurns: config.defaults.maxTurns,
    maxTotalTokens: config.defaults.maxTotalTokens,
    expiresAt: new Date(
      now.getTime() + config.defaults.ttlMinutes * 60_000
    ).toISOString()
  });
}
