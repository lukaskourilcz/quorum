import type { Agent, AgentId } from "@/data/agents";

const titles: Record<AgentId, string> = {
  VIZE: "Strategy lead",
  FORGE: "Product builder",
  PULSE: "Audience and growth lead",
  AUDIT: "Safety reviewer",
  SCOUT: "Researcher",
  SCRIBE: "Meeting writer",
  LENS: "Numbers reviewer",
  QUILL: "Editor",
  RADAR: "Search editor",
  KEEPER: "Rules reviewer",
  THREADS: "Threads writer",
  INSTAGRAM: "Instagram designer",
  PEOPLE: "AI team reviewer",
  LEDGER: "Budget keeper",
  HERALD: "DNESKAi editor",
  STET: "Plain-language editor",
  HACEK: "Czech editor",
  SPARK: "Product ideas lead",
  VAULT: "Idea history keeper",
  FRAME: "Visual designer",
  RELAY: "Delivery coordinator",
  ANGLE: "Positioning editor",
  COHORT: "Audience researcher",
  FUNNEL: "Marketing planner",
  PALATE: "Style reviewer",
  SCENE: "Culture researcher",
  STUNT: "Campaign ideas lead",
  CORNER: "UFC scout",
  SPOTTER: "Oktagon scout",
  TAPE: "Fight analyst",
  SIGMA: "Probability analyst",
  VIG: "Odds reviewer",
  SONAR: "MMA source scout",
  CANVAS: "MMA Files editor",
  JAB: "MMA writer",
  REACH: "MMA social editor",
  SPLIT: "Social test analyst",
  EASEL: "Carousel template designer",
  MOTIF: "Visual pattern researcher",
  PIVOT: "MMA desk liaison"
};

const mandates: Record<AgentId, string> = {
  VIZE: "Finds real business opportunities and decides when to focus, continue, change direction or stop.",
  FORGE: "Turns approved decisions into small, reliable releases.",
  PULSE: "Plans how projects reach people, earn revenue and explain themselves.",
  AUDIT: "Checks ideas before work begins and can block a clear rule breach.",
  SCOUT: "Finds and checks market sources without confusing attention with demand.",
  SCRIBE: "Turns saved AI-team decisions into clear public and admin summaries.",
  LENS: "Reviews reader, money and test results, separating useful patterns from noise.",
  QUILL: "Edits public writing for clarity, originality and reliable source support.",
  RADAR: "Helps useful work appear in search without creating empty pages.",
  KEEPER: "Checks the company rules before any action leaves the system.",
  THREADS: "Writes concise Threads posts from approved company facts.",
  INSTAGRAM: "Turns approved company facts into clear Instagram stories and images.",
  PEOPLE: "Checks whether every AI role is useful, efficient and assigned to the right work.",
  LEDGER: "Tracks every cost and plans the monthly budget without making up revenue or spending just to spend.",
  HERALD: "Chooses and takes responsibility for the daily DNESKAi story.",
  STET: "Removes generic AI wording and checks every article and public meeting text before release.",
  HACEK: "Keeps the Czech style rules that every article's copy check applies, and never changes the facts to fit them.",
  SPARK: "Brings one realistic DNESKAi product idea to each morning meeting and follows it through the final decision.",
  VAULT: "Keeps the idea history, catches duplicates and stops old failures returning without new information.",
  FRAME: "Creates carousels, quote cards and header images with repeatable code, source notes and useful alt text.",
  RELAY: "Makes sure finished work reaches DNESKAi and keeps the daily summary and calendar accurate.",
  ANGLE: "Defines who each project serves and gives it a clear reason to deserve attention.",
  COHORT: "Describes adult audiences by region, public interests and platform without using personal data or made-up reach numbers.",
  FUNNEL: "Turns campaign strategy into honest, cost-labeled plans without starting ads or sales.",
  PALATE: "Turns the owner's ratings into written style rules linked to the ratings that inspired them.",
  SCENE: "Tracks sourced streetwear, skate and lifestyle trends for Titty Tuesdays without inventing examples.",
  STUNT: "Designs low-cost campaign ideas with clear estimates, permissions and a clear way to tell whether they worked.",
  CORNER: "Builds sourced UFC fighter files and checks important fields twice before model use.",
  SPOTTER: "Tracks Oktagon cards, fighters and weigh-ins from official Czech, Slovak and regional reporting.",
  TAPE: "Reviews sourced matchup context and may propose only small, expiring changes to the model input.",
  SIGMA: "Maintains the repeatable fight model and publishes its version and accuracy record with every number.",
  VIG: "Compares captured odds with model estimates and records whether published prices beat the closing line.",
  SONAR: "Finds possible MMA data sources and checks access rules, cost and usefulness before any connection is built.",
  CANVAS: "Runs the two daily MMA Files slots and blocks any article that fails its sources, language or style checks.",
  JAB: "Writes each sourced MMA story straight in Czech and links every named fighter to their file.",
  REACH: "Builds two clearly different Czech social drafts for every approved article.",
  SPLIT: "Stays idle until Phase 3 and blocks any early reader or post measurement.",
  EASEL: "Turns cited layout observations into original, checked and reusable carousel templates.",
  MOTIF: "Studies approved individual links as text-only visual observations without copying or storing external images.",
  PIVOT: "Carries sourced findings between FightAIQ and MMA Files without turning reader interest into a hidden model input."
};

const replacements: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bOPS-OBSERVE\b/g, "record check"],
  [/\bNO_POST\b/g, "do not publish"],
  [/\bNO_PROPOSAL\b/g, "no proposal"],
  [/\bNO_ACTION\b/g, "do nothing"],
  [/\bDISCOVERY(?:-stage)?\b/gi, "early-stage"],
  [/operating cap/gi, "monthly spending limit"],
  [/operating record/gi, "work history"],
  [/operating state/gi, "current work"],
  [/internal operating/gi, "internal work"],
  [/public archive/gi, "public history"],
  [/archive availability/gi, "availability in the public history"],
  [/\bCaught Up\b/g, "DNESKAi"],
  [/hobby-mode/gi, "low-cost test"],
  [/hobby operations/gi, "low-cost work"],
  [/provider calls/gi, "AI service calls"],
  [/editorial slate/gi, "daily article plan"],
  [/slip slate/gi, "fight report"],
  [/ModelRun artifacts?/gi, "saved calculations"],
  [/model[ -]?runs?/gi, "saved calculations"],
  [/source adapters?/gi, "source connections"],
  [/data pipeline/gi, "data process"],
  [/pipeline/gi, "process"],
  [/artifacts?/gi, "saved files"],
  [/public projections?/gi, "public views"],
  [/projections?/gi, "views"],
  [/doctrine/gi, "rules"],
  [/envelope/gi, "spending limit"],
  [/north[- ]star/gi, "top"],
  [/calibration/gi, "forecast accuracy"],
  [/corroboration/gi, "two-source agreement"],
  [/discrepancies/gi, "source disagreements"],
  [/discrepancy/gi, "source disagreement"],
  [/\bCLV\b/g, "final-price advantage"],
  [/\bBrier\b/g, "forecast error"],
  [/\bKPI(?:s)?\b/g, "measures"],
  [/API cost/gi, "AI service cost"],
  [/external actions/gi, "outside actions"],
  [/external action/gi, "outside action"],
  [/divergent incubator room/gi, "new-idea research meeting"],
  [/convergent incubator room/gi, "new-idea review meeting"],
  [/incubator namespace/gi, "new-idea list"],
  [/terminal result/gi, "final result"],
  [/evidence packet/gi, "collection of sources"],
  [/founding authority/gi, "permission to start a company"],
  [/proposal fabrication/gi, "made-up proposals"],
  [/manufactured proposal/gi, "made-up proposal"],
  [/company formation/gi, "starting a company"],
  [/Evidence quality \/ independence/gi, "Source quality and independence"],
  [/First monetization experiment/gi, "First revenue test"],
  [/pieces of ['’]evidence['’]/gi, "sources"],
  [/piece of ['’]evidence['’]/gi, "source"],
  [/ledger verdict/gi, "saved decision"],
  [/eligible for a ledger entry/gi, "ready to be added to the history"],
  [/authorize product action/gi, "approve product work"],
  [/audience hypothesis/gi, "idea about the audience"],
  [/Founding fixture declined/gi, "First test rejected every idea"],
  [/offline fixture/gi, "test example"],
  [/synthetic opportunity cards/gi, "sample business ideas"],
  [/opportunity cards/gi, "business ideas"],
  [/eligible independent market signals?/gi, "reliable information from independent sources"],
  [/market signals?/gi, "signs of interest"],
  [/fixtures/gi, "test examples"],
  [/fixture/gi, "test example"],
  [/signals/gi, "signs"],
  [/signal/gi, "sign"],
  [/council positions/gi, "decision-maker views"],
  [/council seats/gi, "decision makers"],
  [/council/gi, "decision team"],
  [/Business thesis/g, "Business direction"],
  [/Opportunity selection/g, "Choosing business ideas"],
  [/Stage and pivot direction/g, "Deciding when to continue, change or stop"],
  [/Operational reliability/g, "Keeping the product reliable"],
  [/Release preparation/g, "Preparing releases"],
  [/Implementation/g, "Building approved changes"],
  [/evidence-backed/gi, "supported by sources"],
  [/eligible evidence/gi, "reliable sources"],
  [/evidence references/gi, "source links"],
  [/evidence/gi, "sources"],
  [/venture/gi, "project"],
  [/shift/gi, "meeting"],
  [/stage/gi, "step"],
  [/seat/gi, "role"],
  [/ledger/gi, "history"],
  [/guardrails/gi, "safety rules"],
  [/control boundary/gi, "limit"],
  [/controls/gi, "checks"],
  [/control/gi, "check"],
  [/operational/gi, "day-to-day"],
  [/operating/gi, "running"],
  [/production-ready/gi, "ready to release"],
  [/release gating/gi, "release checks"],
  [/release gate/gi, "release check"],
  [/gate/gi, "check"],
  [/gating/gi, "checking"],
  [/monetization/gi, "earning revenue"],
  [/distribution/gi, "ways to reach people"],
  [/market signals/gi, "signs of interest"],
  [/market-signal collection/gi, "collecting signs of interest"],
  [/market sources/gi, "public business sources"],
  [/market statistics/gi, "market numbers"],
  [/attribution review/gi, "checking what caused a result"],
  [/forecast-error analysis/gi, "checking estimate accuracy"],
  [/funnel/gi, "reader journey"],
  [/claim support/gi, "source checking"],
  [/information-gain review/gi, "usefulness review"],
  [/search intent/gi, "what people search for"],
  [/metadata/gi, "page titles and descriptions"],
  [/indexability/gi, "search visibility"],
  [/commercial disclosure/gi, "sales notices"],
  [/organization/gi, "AI team"],
  [/routing/gi, "team assignment"],
  [/reconciliation/gi, "final checking"],
  [/incubator/gi, "new-idea research"],
  [/synthesis/gi, "review"],
  [/provenance/gi, "source history"],
  [/native/gi, "made for the platform"],
  [/deterministically/gi, "with repeatable code"],
  [/deterministic/gi, "repeatable"],
  [/immutable/gi, "saved before the work starts"],
  [/baseline/gi, "starting number"],
  [/cadence/gi, "schedule"],
  [/thesis/gi, "business idea"],
  [/metric/gi, "measure"],
  [/positioning/gi, "clear place in the market"],
  [/AudienceSpecs?/g, "audience descriptions"],
  [/CampaignBriefs?/g, "campaign plans"],
  [/SceneReports?/g, "culture reports"],
  [/TASTE/g, "style notes"],
  [/NO_EDITION/g, "no edition"],
  [/HUMAN_APPROVAL/g, "human approval"]
];

export function publicAgentTitle(agent: Agent): string {
  return titles[agent.id];
}

export function publicAgentMandate(agent: Agent): string {
  return mandates[agent.id];
}

export function publicAgentGroup(agent: Agent): string {
  if (agent.group === "Council") return "Decision maker";
  if (agent.group === "Control") return "Checking role";
  return "Specialist";
}

export function publicAgentStatus(status: Agent["status"]): string {
  if (status === "active") return "Working";
  if (status === "coaching") return "Being improved";
  if (status === "restricted") return "Limited";
  if (status === "paused") return "Paused";
  if (status === "proposed") return "Planned";
  return "Retired";
}

/**
 * Every SCREAMING_SNAKE token a record can carry, translated before the list below runs.
 *
 * The list matches on words, so a status token was torn in half by whichever rule reached it
 * first: NEEDS_RECONCILIATION rendered as "NEEDS_final checking". Statuses and outcomes have
 * their own label map, and it already lowercases anything it does not name, so it goes first
 * and the list never sees the token. It is a safety net for text that arrives shouting, not a
 * place to add rules — plain sentences belong in the writer that makes the record.
 */
function withoutShoutedCodes(value: string): string {
  return value.replace(/\b[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)+\b/g, (token) => publicDecisionLabel(token));
}

export function publicAgentText(value: string): string {
  // The named token rules run first. Lowercasing every shouted code ahead of them silently
  // killed OPS-OBSERVE and NO_POST, whose plain wording is a phrase rather than a status label:
  // publicDecisionLabel does not know them, so they came out as "ops-observe" and "no post".
  const namedTokens = replacements
    .filter(([pattern]) => pattern.source.startsWith("\\b") && /[A-Z]/.test(pattern.source[2] ?? ""))
    .reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  const withRoleTitles = (Object.entries(titles) as Array<[AgentId, string]>).reduce(
    (text, [agentId, title]) => text.replace(new RegExp(`\\b${agentId}\\b`, "g"), title),
    withoutShoutedCodes(namedTokens)
  );
  return replacements.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    withRoleTitles
  );
}

export function publicAgentCheck(value: string): string {
  return publicAgentText(value.replaceAll("_", " ").toLowerCase());
}

export function publicDecisionLabel(value: string): string {
  const labels: Record<string, string> = {
    INSUFFICIENT_EVIDENCE: "Not enough real sources",
    NEEDS_EVIDENCE: "Needs real sources",
    EVIDENCE_PACKET_REQUIRED: "Needs reliable sources",
    NO_ACTION: "Do nothing",
    PLAN: "Plan the next step",
    planned: "Planned",
    done: "Finished",
    blocked: "Blocked",
    skipped: "Skipped",
    OPS_HANDOFF: "Prepare the next step",
    "OPS-HANDOFF": "Prepare the next step",
    proposed: "Suggested",
    accepted: "Approved",
    in_progress: "Being built",
    shipped: "Released",
    vetoed: "Blocked",
    deferred: "Waiting",
    killed: "Closed",
    superseded: "Replaced",
    revived: "Reopened",
    rejected: "Rejected",
    HELD: "Finished",
    NEEDS_RECONCILIATION: "Needs checking"
  };
  return labels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

export function publicStageLabel(value: string): string {
  const labels: Record<string, string> = {
    DISCOVERY: "Looking for proof",
    VALIDATION: "Testing the idea",
    AUDIENCE: "Reaching people",
    MONETIZATION: "Earning first revenue",
    OPTIMIZATION: "Improving the numbers"
  };
  return labels[value] ?? publicAgentText(value.replaceAll("_", " ").toLowerCase());
}

export function publicOpportunityTitle(value: string): string {
  const labels: Record<string, string> = {
    "Release-evidence notebook": "Release check notebook",
    "Plain-language policy diff": "Plain-language rule comparison",
    "Small-team incident brief": "Small-team problem summary"
  };
  return labels[value] ?? publicAgentText(value);
}

export function publicReferenceLabel(value: string): string {
  return publicAgentText(publicOpportunityTitle(value));
}
