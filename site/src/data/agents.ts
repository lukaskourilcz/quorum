import registrySource from "../../../config/agents.json";

export type AgentId =
  | "VIZE"
  | "FORGE"
  | "PULSE"
  | "AUDIT"
  | "SCOUT"
  | "SCRIBE"
  | "LENS"
  | "QUILL"
  | "RADAR"
  | "KEEPER"
  | "THREADS"
  | "INSTAGRAM"
  | "PEOPLE"
  | "LEDGER";

type PublicStatus =
  | "active"
  | "coaching"
  | "restricted"
  | "paused"
  | "proposed"
  | "retired";

interface RegistryAgent {
  id: AgentId;
  slug: string;
  kind: "council" | "specialist";
  provider: "OpenAI" | "Anthropic" | "deterministic";
  department: string;
  title: string;
  mission: string;
  responsibilities: string[];
  notResponsibleFor: string[];
  decisionRights: string[];
  ownedKpiIds: string[];
  successChecks: string[];
  capabilityTags: string[];
  status: PublicStatus;
  activatedAt: string;
  profileVersion: number;
  lastOrgReviewAt: string | null;
  descriptionRef: string;
  skillRefs: string[];
  visual: {
    motif: string;
    accentToken: string;
    avatar: string;
    avatarAlt: string;
    provenanceRef: string;
  };
}

export interface Agent extends RegistryAgent {
  name: AgentId;
  group: "Council" | "Specialist" | "Control";
  mandate: string;
  operatingPrinciple: string;
  output: string;
  primaryAccountability: string;
  currentFocus: string | null;
  publicTrackRecord: string | null;
}

const profileCopy: Record<
  AgentId,
  Pick<
    Agent,
    | "operatingPrinciple"
    | "output"
    | "currentFocus"
    | "publicTrackRecord"
  >
> = {
  VIZE: {
    operatingPrinciple: "Choose the problem before choosing the product.",
    output: "Strategy memo and stage recommendation",
    currentFocus: null,
    publicTrackRecord: null
  },
  FORGE: {
    operatingPrinciple: "Ship the smallest verified change.",
    output: "Patch, release record and incident note",
    currentFocus: null,
    publicTrackRecord: null
  },
  PULSE: {
    operatingPrinciple: "A metric without a decision is decoration.",
    output: "Experiment contract and growth plan",
    currentFocus: null,
    publicTrackRecord: null
  },
  AUDIT: {
    operatingPrinciple: "Evidence first. Fail closed.",
    output: "Risk verdict and release gate",
    currentFocus: null,
    publicTrackRecord: null
  },
  SCOUT: {
    operatingPrinciple: "A source is not yet a signal.",
    output: "Evidence digest",
    currentFocus: null,
    publicTrackRecord: null
  },
  SCRIBE: {
    operatingPrinciple: "Record what happened, including uncertainty.",
    output: "Standup and meeting summary",
    currentFocus: null,
    publicTrackRecord: null
  },
  LENS: {
    operatingPrinciple: "Unknown is a valid state. Zero is a measurement.",
    output: "Metric snapshot and forecast review",
    currentFocus: null,
    publicTrackRecord: null
  },
  QUILL: {
    operatingPrinciple: "Clarity is a control surface.",
    output: "Copy draft and claim map",
    currentFocus: null,
    publicTrackRecord: null
  },
  RADAR: {
    operatingPrinciple: "Index only what adds information.",
    output: "Discovery brief and content audit",
    currentFocus: null,
    publicTrackRecord: null
  },
  KEEPER: {
    operatingPrinciple: "Lack of approval is not approval.",
    output: "Compliance memo or HUMAN_APPROVAL",
    currentFocus: null,
    publicTrackRecord: null
  },
  THREADS: {
    operatingPrinciple: "No fact, no post.",
    output: "Threads-native draft",
    currentFocus: null,
    publicTrackRecord: null
  },
  INSTAGRAM: {
    operatingPrinciple: "The visual must carry evidence, not theatre.",
    output: "Instagram-native visual draft",
    currentFocus: null,
    publicTrackRecord: null
  },
  PEOPLE: {
    operatingPrinciple: "Change a role only when outcome data demands it.",
    output: "Organization change proposal",
    currentFocus: null,
    publicTrackRecord: null
  },
  LEDGER: {
    operatingPrinciple: "If it is not reconciled, it is not booked.",
    output: "Cost strip, profit view and spend verdict",
    currentFocus: null,
    publicTrackRecord: null
  }
};

const controlIds = new Set<AgentId>(["KEEPER", "PEOPLE", "LEDGER"]);
const registryAgents = registrySource.agents as RegistryAgent[];

export const agents: readonly Agent[] = registryAgents.map((agent) => ({
  ...agent,
  ...profileCopy[agent.id],
  name: agent.id,
  group:
    agent.kind === "council"
      ? "Council"
      : controlIds.has(agent.id)
        ? "Control"
        : "Specialist",
  mandate: agent.mission,
  primaryAccountability:
    agent.ownedKpiIds[0] ?? agent.successChecks[0] ?? "n/a"
}));

export const agentBySlug = new Map(agents.map((agent) => [agent.slug, agent]));
export const agentById = new Map(agents.map((agent) => [agent.id, agent]));
