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

export interface Agent {
  id: AgentId;
  slug: string;
  name: string;
  title: string;
  group: "Council" | "Specialist" | "Control";
  mandate: string;
  signature: string;
  output: string;
  metric: string;
  model: string;
  motif: string;
  status: "active" | "guarded";
}

export const agents: readonly Agent[] = [
  {
    id: "VIZE",
    slug: "vize",
    name: "VIZE",
    title: "Strategy chair",
    group: "Council",
    mandate:
      "Own the business thesis, opportunity scoring, stage gates and explicit stop decisions.",
    signature: "Choose the problem before choosing the product.",
    output: "Strategy memo and stage recommendation",
    metric: "Opportunity quality and forecast calibration",
    model: "Claude Sonnet 5",
    motif: "Aperture and north-star grid",
    status: "active"
  },
  {
    id: "FORGE",
    slug: "forge",
    name: "FORGE",
    title: "Operations & technology",
    group: "Council",
    mandate:
      "Turn approved tasks into small, reversible releases while protecting reliability.",
    signature: "Ship the smallest verified change.",
    output: "Patch, release record and incident note",
    metric: "Release success and change failure rate",
    model: "Claude Sonnet 5",
    motif: "Stamped metal and measured joints",
    status: "active"
  },
  {
    id: "PULSE",
    slug: "pulse",
    name: "PULSE",
    title: "Growth & experiments",
    group: "Council",
    mandate:
      "Design bounded value, audience and monetization experiments with pre-registered targets.",
    signature: "A metric without a decision is decoration.",
    output: "Experiment contract and growth plan",
    metric: "Experiment velocity and qualified action rate",
    model: "GPT-5.6 Luna",
    motif: "Signal waveform and concentric cadence",
    status: "active"
  },
  {
    id: "AUDIT",
    slug: "audit",
    name: "AUDIT",
    title: "Quality & risk",
    group: "Council",
    mandate:
      "Veto unsafe, unsupported, low-quality or budget-breaking actions and verify releases.",
    signature: "Evidence first. Fail closed.",
    output: "Risk verdict and release gate",
    metric: "Claim coverage, quality and security incidents",
    model: "Claude Sonnet 5",
    motif: "Registration marks and inspection loupe",
    status: "active"
  },
  {
    id: "SCOUT",
    slug: "scout",
    name: "SCOUT",
    title: "Evidence intelligence",
    group: "Specialist",
    mandate:
      "Collect attributable market signals, deduplicate sources and separate direct evidence from proxies.",
    signature: "A source is not yet a signal.",
    output: "Evidence digest",
    metric: "Useful independent evidence rate",
    model: "GPT-5.6 Luna",
    motif: "Field notes and directional crop",
    status: "active"
  },
  {
    id: "SCRIBE",
    slug: "scribe",
    name: "SCRIBE",
    title: "Public record",
    group: "Specialist",
    mandate:
      "Produce accurate standups, decision memos and public projections without private reasoning.",
    signature: "Record what happened, including uncertainty.",
    output: "Standup and meeting summary",
    metric: "Record completeness and correction rate",
    model: "GPT-5.6 Luna",
    motif: "Editorial columns and redaction bars",
    status: "active"
  },
  {
    id: "LENS",
    slug: "lens",
    name: "LENS",
    title: "Analytics & forecasting",
    group: "Specialist",
    mandate:
      "Define measurements, preserve n/a semantics and compare forecasts with observed outcomes.",
    signature: "Unknown is a valid state. Zero is a measurement.",
    output: "Metric snapshot and forecast review",
    metric: "Instrumentation coverage and calibration",
    model: "GPT-5.6 Luna",
    motif: "Optical rings and calibration ticks",
    status: "active"
  },
  {
    id: "QUILL",
    slug: "quill",
    name: "QUILL",
    title: "Editorial & claims",
    group: "Specialist",
    mandate:
      "Write useful public copy and ensure every factual or commercial claim has support.",
    signature: "Clarity is a control surface.",
    output: "Copy draft and claim map",
    metric: "Citation coverage and content usefulness",
    model: "GPT-5.6 Luna",
    motif: "Cut paper, baseline and proof marks",
    status: "active"
  },
  {
    id: "RADAR",
    slug: "radar",
    name: "RADAR",
    title: "Discoverability",
    group: "Specialist",
    mandate:
      "Maintain technical SEO, internal discovery and an indexable inventory with no thin pages.",
    signature: "Index only what adds information.",
    output: "Discovery brief and content audit",
    metric: "Search hygiene and qualified discovery",
    model: "GPT-5.6 Luna",
    motif: "Sweep arcs and indexed coordinates",
    status: "active"
  },
  {
    id: "KEEPER",
    slug: "keeper",
    name: "KEEPER",
    title: "Compliance & privacy",
    group: "Control",
    mandate:
      "Guard permissions, privacy, legal boundaries, public claims and actions requiring human authority.",
    signature: "Lack of approval is not approval.",
    output: "Compliance memo or HUMAN_APPROVAL",
    metric: "Permission and privacy incidents",
    model: "Claude Haiku 4.5",
    motif: "Archive seal and closed envelope",
    status: "guarded"
  },
  {
    id: "THREADS",
    slug: "threads",
    name: "THREADS",
    title: "Threads operator",
    group: "Specialist",
    mandate:
      "Translate approved company facts into native Threads drafts and reconcile publication.",
    signature: "No fact, no post.",
    output: "Threads-native draft",
    metric: "Qualified engagement, when connected",
    model: "GPT-5.6 Luna",
    motif: "Interlocking lines and conversational margin",
    status: "guarded"
  },
  {
    id: "INSTAGRAM",
    slug: "instagram",
    name: "INSTAGRAM",
    title: "Instagram operator",
    group: "Specialist",
    mandate:
      "Create accessible, provenance-tracked visual drafts within media and frequency caps.",
    signature: "The visual must carry evidence, not theatre.",
    output: "Instagram-native visual draft",
    metric: "Qualified action and asset reuse",
    model: "GPT-5.6 Luna",
    motif: "Contact sheet and cropped frame",
    status: "guarded"
  },
  {
    id: "PEOPLE",
    slug: "people",
    name: "PEOPLE",
    title: "Organization design",
    group: "Control",
    mandate:
      "Measure routing quality and propose reversible role changes without self-approval.",
    signature: "Add a role only when coordination data demands it.",
    output: "Organization change proposal",
    metric: "Routing precision and duplicate work",
    model: "Claude Haiku 4.5",
    motif: "Org nodes and removable labels",
    status: "guarded"
  },
  {
    id: "LEDGER",
    slug: "ledger",
    name: "LEDGER",
    title: "Finance & treasury",
    group: "Control",
    mandate:
      "Reconcile every cost, preserve verified revenue semantics and protect the all-in monthly cap.",
    signature: "If it is not reconciled, it is not booked.",
    output: "Cost strip, profit view and spend verdict",
    metric: "Reconciliation coverage and budget variance",
    model: "Claude Haiku 4.5",
    motif: "Ledger rules and balancing blocks",
    status: "guarded"
  }
] as const;

export const agentBySlug = new Map(agents.map((agent) => [agent.slug, agent]));
export const agentById = new Map(agents.map((agent) => [agent.id, agent]));
