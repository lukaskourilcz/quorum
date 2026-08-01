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
  apiCostSummary: string;
}

export interface AgentApiModel {
  provider: "OpenAI" | "Anthropic";
  model: string;
  label: string;
  context: string;
  estimatedCostUsd: number;
  estimatedCostLabel: string;
  estimateBasis: string;
  priceVerifiedAt: string;
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

interface PublicTextPrice {
  provider: "openai" | "anthropic";
  model: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  verifiedAt: string;
}

interface CallEstimateProfile {
  promptChars: number;
  maxOutputTokens: number;
  basis: string;
}

// This display-only table mirrors the runtime's dated text-price table. Billing
// remains token-based in the orchestrator; the site deliberately labels these
// figures as estimates rather than presenting them as a fixed meeting fee.
const publicTextPrices: readonly PublicTextPrice[] = [
  {
    provider: "openai",
    model: "gpt-5.6-luna",
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 6,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-7",
    effectiveFrom: "2026-07-21",
    effectiveTo: null,
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 25,
    verifiedAt: "2026-07-21"
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    effectiveFrom: "2026-07-21",
    effectiveTo: null,
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    verifiedAt: "2026-07-21"
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    effectiveFrom: "2026-06-09",
    effectiveTo: "2026-09-01",
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    verifiedAt: "2026-07-23"
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    effectiveFrom: "2025-10-01",
    effectiveTo: null,
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
    verifiedAt: "2026-07-23"
  }
];

const meetingCall: CallEstimateProfile = {
  promptChars: 8_000,
  maxOutputTokens: 260,
  basis: "Typical meeting call: an 8,000-character brief and up to 260 response tokens"
};

const councilMeetingCall: CallEstimateProfile = {
  promptChars: 8_000,
  maxOutputTokens: 400,
  basis: "Company council call: an 8,000-character brief and up to 400 response tokens"
};

const sparkMeetingCall: CallEstimateProfile = {
  promptChars: 12_000,
  maxOutputTokens: 280,
  basis: "Morning idea call: a 12,000-character brief and up to 280 response tokens"
};

const vaultMeetingCall: CallEstimateProfile = {
  promptChars: 12_000,
  maxOutputTokens: 240,
  basis: "Morning check: a 12,000-character brief and up to 240 response tokens"
};

const curationCall: CallEstimateProfile = {
  promptChars: 20_000,
  maxOutputTokens: 1_500,
  basis: "Typical edition curation run: a 20,000-character source packet and up to 1,500 response tokens"
};

const englishEditionCall: CallEstimateProfile = {
  promptChars: 16_000,
  maxOutputTokens: 2_000,
  basis: "Typical 1,100-word English edition: a 16,000-character source packet and up to 2,000 response tokens"
};

const czechEditionCall: CallEstimateProfile = {
  promptChars: 14_000,
  maxOutputTokens: 2_000,
  basis: "Typical 1,100-word Czech edition: a 14,000-character source packet and up to 2,000 response tokens"
};

const mmaArticleCall: CallEstimateProfile = {
  promptChars: 25_000,
  maxOutputTokens: 1_700,
  basis: "Typical MMA Files article: a 25,000-character evidence packet and up to 1,700 response tokens"
};

function apiProvider(provider: "openai" | "anthropic"): AgentApiModel["provider"] {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

function priceFor(
  provider: "openai" | "anthropic",
  model: string
): PublicTextPrice {
  const now = new Date().toISOString();
  const price = publicTextPrices.find(
    (candidate) =>
      candidate.provider === provider &&
      candidate.model === model &&
      candidate.effectiveFrom <= now &&
      (candidate.effectiveTo === null || now < candidate.effectiveTo)
  );
  if (!price) throw new Error(`No public price estimate for ${provider}/${model}`);
  return price;
}

function formatEstimatedCost(estimatedCostUsd: number): string {
  return estimatedCostUsd < 0.01
    ? `$${estimatedCostUsd.toFixed(3)}`
    : `$${estimatedCostUsd.toFixed(2)}`;
}

function apiModel(
  provider: "openai" | "anthropic",
  model: string,
  context: string,
  estimateProfile: CallEstimateProfile
): AgentApiModel {
  const price = priceFor(provider, model);
  const inputTokens = Math.ceil(estimateProfile.promptChars / 3.5);
  const estimatedCostUsd = Number((
    (inputTokens / 1_000_000) * price.inputUsdPerMillion +
    (estimateProfile.maxOutputTokens / 1_000_000) * price.outputUsdPerMillion
  ).toFixed(8));
  return {
    provider: apiProvider(provider),
    model,
    label: modelLabels[model] ?? model,
    context,
    estimatedCostUsd,
    estimatedCostLabel: formatEstimatedCost(estimatedCostUsd),
    estimateBasis: estimateProfile.basis,
    priceVerifiedAt: price.verifiedAt
  };
}

function configuredTextModel(
  role: TextModelRole,
  context: string,
  estimateProfile = meetingCall
): AgentApiModel {
  const route = textModelRoles[role];
  return apiModel(route.provider, route.model, context, estimateProfile);
}

function configuredEditionModel(
  model: string,
  context: string,
  estimateProfile: CallEstimateProfile
): AgentApiModel {
  return apiModel("anthropic", model, context, estimateProfile);
}

function specialistModel(
  provider: RegistryAgent["provider"],
  context: string
): readonly AgentApiModel[] {
  if (provider === "deterministic") return [];
  return [configuredTextModel(
    provider === "OpenAI" ? "OPENAI_SPECIALIST" : "ANTHROPIC_SPECIALIST",
    context,
    meetingCall
  )];
}

const dedicatedApiModels: Partial<Record<AgentId, readonly AgentApiModel[]>> = {
  VIZE: [configuredTextModel("VIZE", "Company council meetings", councilMeetingCall)],
  FORGE: [
    configuredTextModel("FORGE", "Company council meetings", councilMeetingCall),
    configuredTextModel("ANTHROPIC_SPECIALIST", "Portfolio rooms when selected")
  ],
  PULSE: [configuredTextModel("PULSE", "Company and portfolio meetings", councilMeetingCall)],
  AUDIT: [configuredTextModel("AUDIT", "Company and portfolio meetings", councilMeetingCall)],
  HERALD: [
    configuredEditionModel(editionModels.curation, "Caught Up daily edition curation", curationCall),
    configuredTextModel("DIGEST", "Caught Up product room"),
    configuredTextModel("ANTHROPIC_SPECIALIST", "Portfolio rooms when selected")
  ],
  STET: [
    configuredEditionModel(editionModels.writing, "Caught Up English edition", englishEditionCall),
    configuredTextModel("ANTHROPIC_SPECIALIST", "Portfolio rooms when selected")
  ],
  HACEK: [
    configuredEditionModel(
      editionModels.localization,
      "Caught Up Czech edition",
      czechEditionCall
    ),
    configuredEditionModel(editionModels.localization, "MMA Files Czech edition", mmaArticleCall),
    configuredTextModel("ANTHROPIC_SPECIALIST", "Portfolio rooms when selected")
  ],
  SPARK: [configuredTextModel("OPENAI_SPECIALIST", "Caught Up idea and portfolio rooms", sparkMeetingCall)],
  VAULT: [
    configuredTextModel("DIGEST", "Caught Up idea checks", vaultMeetingCall),
    configuredTextModel("OPENAI_SPECIALIST", "Portfolio rooms when selected")
  ],
  PALATE: [configuredTextModel("ANTHROPIC_SPECIALIST", "Taste and portfolio rooms")],
  JAB: [
    configuredEditionModel(editionModels.localization, "MMA Files English articles", mmaArticleCall),
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

function apiCostSummary(apiModels: readonly AgentApiModel[]): string {
  if (apiModels.length === 0) return "No LLM API cost";
  const costs = apiModels.map(({ estimatedCostUsd }) => estimatedCostUsd);
  const lowest = Math.min(...costs);
  const highest = Math.max(...costs);
  return lowest === highest
    ? `About ${formatEstimatedCost(lowest)} per live run`
    : `About ${formatEstimatedCost(lowest)}–${formatEstimatedCost(highest)} per live run`;
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
    currentFocus: "Caught Up and MMA Files copy quality",
    publicTrackRecord: null
  },
  HACEK: {
    operatingPrinciple: "Překlad není převod slov, ale přesný český článek.",
    output: "Venture-specific Czech article and parity verdict",
    currentFocus: "Caught Up and MMA Files Czech editions",
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
    output: "Sourced UFC fighter and event records",
    currentFocus: "UFC cards",
    publicTrackRecord: null
  },
  SPOTTER: {
    operatingPrinciple: "Read the regional report before filling the field.",
    output: "Sourced Oktagon fighter, weigh-in and event records",
    currentFocus: "Oktagon cards and weigh-ins",
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
    currentFocus: "MMA Files English articles",
    publicTrackRecord: null
  },
  REACH: {
    operatingPrinciple: "Change one declared design choice at a time.",
    output: "Two bilingual social variants with reproducible images",
    currentFocus: "MMA Files social drafts",
    publicTrackRecord: null
  },
  SPLIT: {
    operatingPrinciple: "No measurement work before the owner opens Phase 3.",
    output: "Closed measurement gate",
    currentFocus: "Idle until Phase 3",
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
    apiModelSummary: apiModelSummary(apiModels),
    apiCostSummary: apiCostSummary(apiModels)
  };
});

export const agentBySlug = new Map(agents.map((agent) => [agent.slug, agent]));
export const agentById = new Map(agents.map((agent) => [agent.id, agent]));
