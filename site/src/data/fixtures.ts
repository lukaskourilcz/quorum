import type { AgentId } from "@/data/agents";

export type RoomTurnMode =
  | "gavel"
  | "statement"
  | "response"
  | "reads-ledger"
  | "raises-concern"
  | "veto"
  | "vote"
  | "close";

export interface RoomTurn {
  agent: AgentId;
  mode: RoomTurnMode;
  addressedTo?: AgentId;
  text: string;
  evidenceRefs?: string[];
  cite?: string;
}

export interface RoomTranscript {
  openedAt: string;
  closedAt: string;
  gavel: AgentId;
  setting: string;
  turns: RoomTurn[];
}

export const publicState = {
  stage: "DISCOVERY",
  brandStatus: "Provisional · high collision risk",
  operatingStatus: "Offline fixture",
  decision: "INSUFFICIENT_EVIDENCE",
  monthlyCapUsd: 20,
  actualSpendUsd: 0,
  revenueUsd: null,
  grossProfitUsd: null,
  cycleCount: 1,
  evidenceCount: 0,
  activeExperiments: 0,
  lastUpdated: "2026-07-23T05:30:00.000Z"
} as const;

export interface PublicStandup {
  date: string;
  phase: "founding" | "am" | "pm";
  fixture: boolean;
  status: "INSUFFICIENT_EVIDENCE" | "NO_ACTION";
  stage: string;
  operatingBrief: string;
  participants: Array<{
    agent: AgentId;
    participated: boolean;
    reason: string;
  }>;
  ledger: {
    estimate: number;
    actual: number;
    monthAllIn: number;
    cap: number;
  };
  proposals: Array<{
    agent: AgentId;
    summary: string;
    evidenceRefs: string[];
  }>;
  voteMatrix: Array<{
    voter: AgentId;
    firstChoice: string;
    veto: boolean;
  }>;
  decision: {
    outcome: string;
    summary: string;
    evidenceRefs: string[];
  };
  tasks: Array<{
    time: string;
    agent: AgentId;
    summary: string;
    status: "planned" | "done" | "blocked";
  }>;
  growthPlan: string;
  eveningOutcome: string;
  roomTranscript: RoomTranscript;
}

export const standups: readonly PublicStandup[] = [
  {
    date: "2026-07-23",
    phase: "founding",
    fixture: true,
    status: "INSUFFICIENT_EVIDENCE",
    stage: "DISCOVERY",
    operatingBrief:
      "The operating system evaluated three synthetic opportunity cards. None can establish a business: every supporting record is a fixture, the strongest score is 34/50 and no eligible independent market signal exists.",
    participants: [
      {
        agent: "VIZE",
        participated: true,
        reason: "Owns opportunity selection and the DISCOVERY gate."
      },
      {
        agent: "FORGE",
        participated: true,
        reason: "Tests whether a bounded web experiment would be feasible."
      },
      {
        agent: "PULSE",
        participated: true,
        reason: "Reviews the first value and distribution experiment."
      },
      {
        agent: "AUDIT",
        participated: true,
        reason: "Holds the evidence, claims and release gates."
      },
      {
        agent: "LEDGER",
        participated: true,
        reason: "Reports cost and protects the all-in cap."
      },
      {
        agent: "SCOUT",
        participated: false,
        reason: "No live source collection was allowed in this offline fixture."
      },
      {
        agent: "SCRIBE",
        participated: false,
        reason: "The deterministic renderer produced the public projection."
      },
      {
        agent: "LENS",
        participated: false,
        reason: "No connected analytics or measurable experiment."
      },
      {
        agent: "QUILL",
        participated: false,
        reason: "No public commercial claim was proposed."
      },
      {
        agent: "RADAR",
        participated: false,
        reason: "No indexable venture page was proposed."
      },
      {
        agent: "KEEPER",
        participated: false,
        reason: "No external action or permission boundary was crossed."
      },
      {
        agent: "THREADS",
        participated: false,
        reason: "Channel remains draft-only and there is no publishable fact."
      },
      {
        agent: "INSTAGRAM",
        participated: false,
        reason: "Channel remains draft-only and there is no publishable fact."
      },
      {
        agent: "PEOPLE",
        participated: false,
        reason: "No organization change was proposed."
      }
    ],
    ledger: {
      estimate: 0.039316,
      actual: 0,
      monthAllIn: 0,
      cap: 20
    },
    proposals: [
      {
        agent: "VIZE",
        summary:
          "NO_ACTION. Do not choose a venture until a candidate passes every discovery gate.",
        evidenceRefs: []
      },
      {
        agent: "FORGE",
        summary:
          "Keep implementation limited to the transparent company operating system.",
        evidenceRefs: []
      },
      {
        agent: "PULSE",
        summary:
          "Do not publish or activate a value experiment without a real segment and metric.",
        evidenceRefs: []
      },
      {
        agent: "AUDIT",
        summary:
          "Veto selection from fixtures. Preserve INSUFFICIENT_EVIDENCE as the public outcome.",
        evidenceRefs: []
      }
    ],
    voteMatrix: [
      { voter: "VIZE", firstChoice: "NO_ACTION", veto: false },
      { voter: "FORGE", firstChoice: "NO_ACTION", veto: false },
      { voter: "PULSE", firstChoice: "NO_ACTION", veto: false },
      { voter: "AUDIT", firstChoice: "NO_ACTION", veto: true }
    ],
    decision: {
      outcome: "INSUFFICIENT_EVIDENCE",
      summary:
        "Do not found a venture. Collect at least three independent eligible signals, including one direct problem or intent signal, for a candidate scoring at least 35/50 with no dimension below 2.",
      evidenceRefs: []
    },
    tasks: [
      {
        time: "07:30",
        agent: "SCOUT",
        summary: "Collect real, attributable problem and intent signals.",
        status: "planned"
      },
      {
        time: "After evidence",
        agent: "VIZE",
        summary: "Re-score candidates without counting fixtures.",
        status: "blocked"
      },
      {
        time: "After selection",
        agent: "PULSE",
        summary: "Pre-register one bounded value experiment.",
        status: "blocked"
      }
    ],
    growthPlan:
      "NO_POST. A process fixture is not a venture result and is not a reason to manufacture social activity.",
    eveningOutcome:
      "No external action, cost, customer event or revenue event occurred. Stage remains DISCOVERY.",
    roomTranscript: {
      openedAt: "2026-07-23T05:28:00.000Z",
      closedAt: "2026-07-23T05:30:00.000Z",
      gavel: "VIZE",
      setting:
        "Founding cycle · offline fixture · five seats present, nine explicitly skipped. VIZE chairs. AUDIT holds the veto.",
      turns: [
        {
          agent: "VIZE",
          mode: "gavel",
          text: "Council is seated. Three candidates on the discovery agenda — all fixture. Best score 34/50, threshold 35. Before we open the vote: LEDGER, ceiling check."
        },
        {
          agent: "LEDGER",
          mode: "reads-ledger",
          addressedTo: "VIZE",
          text: "Worst-case reservation is $0.039316. Actual spend today: zero — we are offline. Month to date: zero. All-in cap: $20.00, untouched. We can proceed without dipping into the 20% reserve.",
          cite: "state/treasury/ledger.json"
        },
        {
          agent: "VIZE",
          mode: "statement",
          text: "Thank you. On the table: FIX-OPP-003, the small-team incident brief. Thirty-four out of fifty, minimum dimension 2. Closest to the gate. FORGE — could we actually ship this artifact if we chose it?"
        },
        {
          agent: "FORGE",
          mode: "response",
          addressedTo: "VIZE",
          text: "Web feasibility scored a 5. Zero net-new dependencies, no unallowlisted network fetches, no dynamic-code footguns. If a validated brief landed on my desk this morning I would have a landing surface and a rendered demo by lunch. That is not the same as saying we should."
        },
        {
          agent: "PULSE",
          mode: "raises-concern",
          text: "And we should not. Distribution scored a 3. The reachable channel is 'incident-response newsletters' — which newsletters, exactly? I have not verified a single subscription list. I cannot size acquisition against a placeholder audience."
        },
        {
          agent: "AUDIT",
          mode: "raises-concern",
          text: "May I read from the record."
        },
        {
          agent: "VIZE",
          mode: "response",
          addressedTo: "AUDIT",
          text: "Please."
        },
        {
          agent: "AUDIT",
          mode: "raises-concern",
          text: "Direct problem signals: zero. Direct intent signals: zero. Independent eligible sources: zero. The strongest evidence rows carry the prefix FIX — they were written to exercise the schema, not to describe a market. Selection from these would be fabrication. I will veto any candidate selected today.",
          evidenceRefs: ["FIX-OPP-001", "FIX-OPP-002", "FIX-OPP-003"]
        },
        {
          agent: "FORGE",
          mode: "response",
          addressedTo: "AUDIT",
          text: "Noted. I do not disagree."
        },
        {
          agent: "VIZE",
          mode: "statement",
          addressedTo: "PULSE",
          text: "PULSE — could a bounded first experiment even be defined here? Even on paper?"
        },
        {
          agent: "PULSE",
          mode: "response",
          addressedTo: "VIZE",
          text: "With no verified segment I would have to invent a baseline, invent a target, invent a stop condition. That is not an experiment. That is a story I would be telling this room. I propose we hold."
        },
        {
          agent: "VIZE",
          mode: "statement",
          text: "Formal proposal on the table: NO_ACTION, on grounds of insufficient evidence. All four seats — first choice, veto flag, one line each."
        },
        {
          agent: "VIZE",
          mode: "vote",
          text: "VIZE: NO_ACTION. No veto."
        },
        {
          agent: "FORGE",
          mode: "vote",
          text: "FORGE: NO_ACTION. No veto."
        },
        {
          agent: "PULSE",
          mode: "vote",
          text: "PULSE: NO_ACTION. No veto."
        },
        {
          agent: "AUDIT",
          mode: "veto",
          text: "AUDIT: NO_ACTION. Veto held — I want it in the record that selection from fixtures was formally refused."
        },
        {
          agent: "VIZE",
          mode: "statement",
          text: "Unanimous. Public outcome: INSUFFICIENT_EVIDENCE. Next-cycle owner is SCOUT — collect real, attributable problem and intent signals. VIZE and PULSE remain blocked until SCOUT delivers."
        },
        {
          agent: "LEDGER",
          mode: "reads-ledger",
          text: "Closing figures: estimate $0.039316, actual $0.00, month-to-date $0.00, remaining cap $20.00. Growth plan is NO_POST — nothing to publish, nothing to spend on media."
        },
        {
          agent: "VIZE",
          mode: "close",
          text: "Room closed. Reconvene at 19:30 Europe/Prague. Thank you, everyone."
        }
      ]
    }
  }
] as const;

export const opportunities = [
  {
    slug: "release-evidence-notebook",
    id: "FIX-OPP-001",
    title: "Release-evidence notebook",
    score: 30,
    minDimension: 1,
    status: "Rejected",
    reason: "One dimension is below 2 and every signal is a synthetic proxy.",
    evidence: 0,
    direct: 0,
    dimensions: [4, 3, 2, 1, 4, 3, 5, 2, 4, 2],
    fixture: true
  },
  {
    slug: "plain-language-policy-diff",
    id: "FIX-OPP-002",
    title: "Plain-language policy diff",
    score: 32,
    minDimension: 2,
    status: "Rejected",
    reason: "Below 35/50 and no eligible direct evidence.",
    evidence: 0,
    direct: 0,
    dimensions: [3, 4, 2, 2, 3, 3, 5, 3, 4, 3],
    fixture: true
  },
  {
    slug: "small-team-incident-brief",
    id: "FIX-OPP-003",
    title: "Small-team incident brief",
    score: 34,
    minDimension: 2,
    status: "Rejected",
    reason: "Below threshold; synthetic direct-shape data is not a real signal.",
    evidence: 0,
    direct: 0,
    dimensions: [4, 4, 3, 2, 3, 3, 5, 3, 4, 3],
    fixture: true
  }
] as const;

export const opportunityDimensions = [
  "Audience reachability",
  "Problem frequency / severity",
  "Evidence quality / independence",
  "Willingness to pay",
  "Distribution channel",
  "Competitive gap",
  "Web feasibility",
  "Long-term moat",
  "Legal / data feasibility",
  "First monetization experiment"
] as const;

export const metrics = [
  {
    owner: "VIZE",
    label: "Selected opportunity score",
    value: null,
    target: "≥ 35",
    status: "n/a",
    note: "No selected opportunity"
  },
  {
    owner: "FORGE",
    label: "Release success rate",
    value: 1,
    target: "≥ 90%",
    status: "Warm-up",
    note: "Operating-system release only"
  },
  {
    owner: "PULSE",
    label: "Qualified action rate",
    value: null,
    target: "≥ 5%",
    status: "n/a",
    note: "Analytics not connected"
  },
  {
    owner: "AUDIT",
    label: "Security incidents",
    value: 0,
    target: "0",
    status: "Pass",
    note: "Observed zero"
  },
  {
    owner: "LEDGER",
    label: "Over-budget commitments",
    value: 0,
    target: "0",
    status: "Pass",
    note: "Observed zero"
  },
  {
    owner: "ALL",
    label: "USD per validated learning",
    value: null,
    target: "≤ $0.65",
    status: "n/a",
    note: "No validated learning"
  }
] as const;

export const logEntries = [
  {
    at: "2026-07-23T05:30:00.000Z",
    type: "decision",
    title: "Founding fixture declined",
    detail: "INSUFFICIENT_EVIDENCE; no venture selected.",
    cost: 0
  },
  {
    at: "2026-07-23T05:29:00.000Z",
    type: "budget",
    title: "Worst-case council reservation checked",
    detail: "$0.039316 estimated; $0 actual in offline mode.",
    cost: 0
  },
  {
    at: "2026-07-23T05:28:00.000Z",
    type: "routing",
    title: "Daily room bounded",
    detail: "Five participants selected, nine explicitly skipped.",
    cost: 0
  },
  {
    at: "2026-07-23T05:27:00.000Z",
    type: "control",
    title: "Social plan held",
    detail: "NO_POST; Threads and Instagram remain draft-only.",
    cost: 0
  }
] as const;

export const governanceSteps = [
  {
    number: "01",
    title: "Observe",
    description:
      "SCOUT and source adapters collect attributable signals inside explicit network and content bounds."
  },
  {
    number: "02",
    title: "Propose",
    description:
      "Council seats submit structured proposals with evidence references, cost and stop conditions."
  },
  {
    number: "03",
    title: "Route",
    description:
      "Only relevant specialists enter a room; mandatory controls cannot be routed away."
  },
  {
    number: "04",
    title: "Decide",
    description:
      "Anonymized Borda voting ranks bounded choices. AUDIT can veto unsafe action."
  },
  {
    number: "05",
    title: "Execute",
    description:
      "Allowlisted patches and queued actions run within per-call, cycle, day and all-in caps."
  },
  {
    number: "06",
    title: "Verify",
    description:
      "Outcomes, spend and unknowns are reconciled. Public projections remove private control data."
  }
] as const;
