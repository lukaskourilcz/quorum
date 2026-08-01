import registrySource from "../../../config/agents.json";
import editionQualitySource from "../../../config/edition-quality.json";
import modelSource from "../../../config/models.json";

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
  | "SONAR"
  | "CANVAS"
  | "JAB"
  | "REACH"
  | "SPLIT"
  | "PIVOT";

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
  apiModels: readonly AgentApiModel[];
  apiModelSummary: string;
}

export interface AgentApiModel {
  provider: "OpenAI" | "Anthropic";
  model: string;
  label: string;
  context: string;
}

type TextModelRole =
  | "VIZE"
  | "FORGE"
  | "PULSE"
  | "AUDIT"
  | "OPENAI_SPECIALIST"
  | "ANTHROPIC_SPECIALIST"
  | "DIGEST";

const textModelRoles = modelSource.roles as Record<
  TextModelRole,
  { provider: "openai" | "anthropic"; model: string }
>;
const editionModels = editionQualitySource.models as {
  curation: string;
  writing: string;
  localization: string;
};

const modelLabels: Record<string, string> = {
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-opus-4-7": "Claude Opus 4.7"
};

function apiProvider(provider: "openai" | "anthropic"): AgentApiModel["provider"] {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

function apiModel(
  provider: "openai" | "anthropic",
  model: string,
  context: string
): AgentApiModel {
  return {
    provider: apiProvider(provider),
    model,
    label: modelLabels[model] ?? model,
    context
  };
}

function configuredTextModel(role: TextModelRole, context: string): AgentApiModel {
  const route = textModelRoles[role];
  return apiModel(route.provider, route.model, context);
}

function configuredEditionModel(
  model: string,
  context: string
): AgentApiModel {
  return apiModel("anthropic", model, context);
}

function specialistModel(
  provider: RegistryAgent["provider"],
  context: string
): readonly AgentApiModel[] {
  if (provider === "deterministic") return [];
  return [configuredTextModel(
    provider === "OpenAI" ? "OPENAI_SPECIALIST" : "ANTHROPIC_SPECIALIST",
    context
  )];
}

const dedicatedApiModels: Partial<Record<AgentId, readonly AgentApiModel[]>> = {
  VIZE: [configuredTextModel("VIZE", "Company council meetings")],
  FORGE: [
    configuredTextModel("FORGE", "Company council meetings"),
    configuredTextModel("ANTHROPIC_SPECIALIST", "Portfolio rooms when selected")
  ],
  PULSE: [configuredTextModel("PULSE", "Company and portfolio meetings")],
  AUDIT: [configuredTextModel("AUDIT", "Company and portfolio meetings")],
  HERALD: [
    configuredTextModel("DIGEST", "Caught Up product room"),
    configuredTextModel("ANTHROPIC_SPECIALIST", "Portfolio rooms when selected")
  ],
  STET: [
    configuredEditionModel(editionModels.writing, "Caught Up English edition"),
    configuredTextModel("ANTHROPIC_SPECIALIST", "Portfolio rooms when selected")
  ],
  HACEK: [
    configuredEditionModel(
      editionModels.localization,
      "Caught Up and MMA Files Czech editions"
    ),
    configuredTextModel("ANTHROPIC_SPECIALIST", "Portfolio rooms when selected")
  ],
  SPARK: [configuredTextModel("OPENAI_SPECIALIST", "Caught Up idea and portfolio rooms")],
  VAULT: [
    configuredTextModel("DIGEST", "Caught Up idea checks"),
    configuredTextModel("OPENAI_SPECIALIST", "Portfolio rooms when selected")
  ],
  PALATE: [configuredTextModel("ANTHROPIC_SPECIALIST", "Taste and portfolio rooms")],
  JAB: [
    configuredEditionModel(editionModels.localization, "MMA Files English articles"),
    configuredTextModel("OPENAI_SPECIALIST", "MMA Files editorial rooms")
  ]
};

function apiModelsForAgent(agent: RegistryAgent): readonly AgentApiModel[] {
  return dedicatedApiModels[agent.id] ?? specialistModel(
    agent.provider,
    "Text calls when this role is selected"
  );
}

function apiModelSummary(apiModels: readonly AgentApiModel[]): string {
  if (apiModels.length === 0) return "No LLM API call";
  return apiModels
    .map(({ provider, label }) => `${provider} · ${label}`)
    .join(" + ");
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
  },
  CANVAS: {
    operatingPrinciple: "A slot ships only when both languages tell the sourced story well.",
    output: "Two-slot editorial slate and publish-or-kill verdict",
    currentFocus: "MMA Files newsroom",
    publicTrackRecord: null
  },
  JAB: {
    operatingPrinciple: "Write the new fact first and never fill a gap from memory.",
    output: "Sourced English draft and Czech localization brief",
    currentFocus: "Bilingual MMA Files articles",
    publicTrackRecord: null
  },
  REACH: {
    operatingPrinciple: "Change one declared design choice at a time.",
    output: "Two bilingual social variants with reproducible images",
    currentFocus: "MMA Files social drafts",
    publicTrackRecord: null
  },
  SPLIT: {
    operatingPrinciple: "No conclusion without the posts and sample size beside it.",
    output: "Social test scoreboard and bounded design finding",
    currentFocus: "MMA Files social comparisons",
    publicTrackRecord: null
  },
  PIVOT: {
    operatingPrinciple: "Carry only the insight whose source can travel with it.",
    output: "Evidence-linked bridge between both MMA desks",
    currentFocus: "FightAIQ and MMA Files handoffs",
    publicTrackRecord: null
  }
};

const controlIds = new Set<AgentId>(["KEEPER", "PEOPLE", "LEDGER"]);
const registryAgents = registrySource.agents as RegistryAgent[];

export const agents: readonly Agent[] = registryAgents.map((agent) => {
  const apiModels = apiModelsForAgent(agent);
  return {
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
      agent.ownedKpiIds[0] ?? agent.successChecks[0] ?? "n/a",
    apiModels,
    apiModelSummary: apiModelSummary(apiModels)
  };
});

export const agentBySlug = new Map(agents.map((agent) => [agent.slug, agent]));
export const agentById = new Map(agents.map((agent) => [agent.id, agent]));
