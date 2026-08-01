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
  | "LEDGER"
  | "HERALD"
  | "STET"
  | "HACEK"
  | "SPARK"
  | "VAULT"
  | "FRAME"
  | "RELAY"
  | "ANGLE"
  | "COHORT"
  | "FUNNEL"
  | "PALATE"
  | "SCENE"
  | "STUNT"
  | "CORNER"
  | "SPOTTER"
  | "TAPE"
  | "SIGMA"
  | "VIG"
  | "SONAR";

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
  ventures: "global" | string[];
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
    avatar: string | null;
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
  },
  HERALD: {
    operatingPrinciple: "One consequential story, or no edition.",
    output: "Commissioned edition or NO_EDITION record",
    currentFocus: "Caught Up daily edition",
    publicTrackRecord: null
  },
  STET: {
    operatingPrinciple: "Nothing is poised. Say what happened.",
    output: "Blocking copy verdict and one rewrite request",
    currentFocus: "Caught Up copy quality",
    publicTrackRecord: null
  },
  HACEK: {
    operatingPrinciple: "Překlad není převod slov, ale přesný český článek.",
    output: "Czech article, carousel copy and Threads draft",
    currentFocus: "Caught Up Czech edition",
    publicTrackRecord: null
  },
  SPARK: {
    operatingPrinciple: "Bring one idea worth shipping, not someday.",
    output: "Ledger-checked growth idea and outcome report",
    currentFocus: "Caught Up product growth",
    publicTrackRecord: null
  },
  VAULT: {
    operatingPrinciple: "A prior failure is evidence until something changes.",
    output: "Binding idea-ledger verdict and fresh index",
    currentFocus: "Caught Up institutional memory",
    publicTrackRecord: null
  },
  FRAME: {
    operatingPrinciple: "Measure every pixel and preserve its provenance.",
    output: "Deterministic visual asset with QA and alt text",
    currentFocus: "Caught Up visual production",
    publicTrackRecord: null
  },
  RELAY: {
    operatingPrinciple: "A handoff is complete only when the destination confirms it.",
    output: "Validated delivery and reconciliation status",
    currentFocus: "Caught Up delivery and notifications",
    publicTrackRecord: null
  },
  ANGLE: {
    operatingPrinciple: "Name the reader and the cut-through.",
    output: "Positioning document and CampaignBrief",
    currentFocus: "Portfolio positioning",
    publicTrackRecord: null
  },
  COHORT: {
    operatingPrinciple: "Everyone is not an audience.",
    output: "Validated AudienceSpec",
    currentFocus: "Adult public-interest audiences",
    publicTrackRecord: null
  },
  FUNNEL: {
    operatingPrinciple: "Label the estimate before discussing return.",
    output: "MarketingPlan and measurement design",
    currentFocus: "Pre-commerce launch planning",
    publicTrackRecord: null
  },
  PALATE: {
    operatingPrinciple: "A preference needs a rating reference.",
    output: "Evidence-linked TASTE update",
    currentFocus: "Venture taste memory",
    publicTrackRecord: null
  },
  SCENE: {
    operatingPrinciple: "Bring the source, then the field note.",
    output: "Evidence-linked SceneReport",
    currentFocus: "Titty Tuesdays scene research",
    publicTrackRecord: null
  },
  STUNT: {
    operatingPrinciple: "The idea needs permission and a way to fail.",
    output: "Costed and permission-aware stunt concept",
    currentFocus: "Titty Tuesdays guerrilla concepts",
    publicTrackRecord: null
  },
  CORNER: {
    operatingPrinciple: "A useful fighter file earns every field twice.",
    output: "Sourced UFC and Oktagon fighter and event records",
    currentFocus: "UFC and Oktagon cards",
    publicTrackRecord: null
  },
  SPOTTER: {
    operatingPrinciple: "Read the Polish report before filling the field.",
    output: "Sourced KSW fighter, weigh-in and event records",
    currentFocus: "KSW cards and weigh-ins",
    publicTrackRecord: null
  },
  TAPE: {
    operatingPrinciple: "Context can move a number only when evidence moves with it.",
    output: "Cited and expiring matchup adjustment",
    currentFocus: "Fight context and matchup evidence",
    publicTrackRecord: null
  },
  SIGMA: {
    operatingPrinciple: "Publish the model version with every probability.",
    output: "Versioned model run and calibration report",
    currentFocus: "Fight probability engine",
    publicTrackRecord: null
  },
  VIG: {
    operatingPrinciple: "Show the market, the model and the gap between them.",
    output: "De-vigged odds comparison and closing-line record",
    currentFocus: "Odds and track record",
    publicTrackRecord: null
  },
  SONAR: {
    operatingPrinciple: "A promising source still needs terms, cost and overlap checked.",
    output: "Vetted fight-data source proposal",
    currentFocus: "New MMA data sources",
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
