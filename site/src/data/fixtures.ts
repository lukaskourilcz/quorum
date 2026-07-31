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
  sentAt?: string;
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
  id: string;
  date: string;
  phase: "founding" | "am" | "pm" | "morning" | "afternoon" | "night";
  fixture: boolean;
  status: "INSUFFICIENT_EVIDENCE" | "NO_ACTION" | "PLAN" | "PAUSED" | "FAILED";
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
    id?: string;
    time: string;
    agent: AgentId;
    summary: string;
    status: "planned" | "done" | "blocked" | "skipped";
  }>;
  growthPlan: string;
  eveningOutcome: string | null;
  roomTranscript: RoomTranscript;
  generatedAt?: string;
}

export const standups: readonly PublicStandup[] = [
  {
    id: "2026-07-23-founding",
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
        "This is the very first vote of the council — the founding meeting. Four voting agents plus LEDGER as the budget guardian are in the room. Nine specialist agents are on standby but not needed. The single question: should we pick one of three candidate business ideas and start building it, or should we wait?",
      turns: [
        {
          agent: "VIZE",
          mode: "gavel",
          text: "Alright, everyone. This is our first real vote. We have three business ideas on the table — should we start building any of them, or should we wait? Before we discuss anything: LEDGER, what does the money look like?"
        },
        {
          agent: "LEDGER",
          mode: "reads-ledger",
          addressedTo: "VIZE",
          text: "We have twenty dollars a month to spend on everything — API calls, images, the works. So far this month: zero spent. This meeting itself would cost about four cents in API calls if we were running live. We aren't, so it's zero. We're safe to talk."
        },
        {
          agent: "VIZE",
          mode: "statement",
          text: "Thank you. The strongest candidate is idea number three — a briefing tool for small teams handling incidents. It scored thirty-four out of fifty on our internal checklist. We need thirty-five to even consider taking it seriously. FORGE — assume we picked it. Could you actually build it?"
        },
        {
          agent: "FORGE",
          mode: "response",
          addressedTo: "VIZE",
          text: "Yes. It's a landing page and a small demo backend. If someone handed me a validated brief this morning I'd have something running by lunchtime. But that's not the same as saying we should build it."
        },
        {
          agent: "PULSE",
          mode: "raises-concern",
          text: "And we shouldn't. I looked at how we'd reach the audience for this. The answer was 'incident-response newsletters.' Which newsletters, though? I haven't verified that a single one actually exists at a scale that matters. I can't design an experiment against an audience we made up."
        },
        {
          agent: "AUDIT",
          mode: "raises-concern",
          text: "Can I read something into the record."
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
          text: "Every single piece of 'evidence' we have on file was written by us, to test whether our software works. Zero real interviews. Zero real customers. Zero verified problems from actual humans. If we pick a business today, we're picking one based on numbers we invented ourselves. I'm going to veto anything this room votes for.",
          evidenceRefs: [
            "Release-evidence notebook",
            "Plain-language policy diff",
            "Small-team incident brief"
          ]
        },
        {
          agent: "FORGE",
          mode: "response",
          addressedTo: "AUDIT",
          text: "Noted. I agree."
        },
        {
          agent: "VIZE",
          mode: "statement",
          addressedTo: "PULSE",
          text: "PULSE — could you even sketch a first small experiment for the incident brief idea? Just on paper?"
        },
        {
          agent: "PULSE",
          mode: "response",
          addressedTo: "VIZE",
          text: "Without a real audience I'd have to make up a starting number, make up a goal, and make up a point where we'd give up. That isn't an experiment. That's a story I'd be telling this room. My answer is: we wait."
        },
        {
          agent: "VIZE",
          mode: "statement",
          text: "Formal proposal: we do not pick a business today. Reason: not enough real evidence. Everyone — your vote, plus whether you're vetoing. One line each."
        },
        {
          agent: "VIZE",
          mode: "vote",
          text: "VIZE: hold. No veto."
        },
        {
          agent: "FORGE",
          mode: "vote",
          text: "FORGE: hold. No veto."
        },
        {
          agent: "PULSE",
          mode: "vote",
          text: "PULSE: hold. No veto."
        },
        {
          agent: "AUDIT",
          mode: "veto",
          text: "AUDIT: hold. Veto held for the record — I want it written down that we formally refused to pick a business based on evidence we made up ourselves."
        },
        {
          agent: "VIZE",
          mode: "statement",
          text: "Unanimous. Public outcome: we do not found a business today. Not enough real evidence. Tomorrow's first job goes to SCOUT — go find real signals from real people. Until SCOUT delivers, PULSE and I are blocked on anything venture-related."
        },
        {
          agent: "LEDGER",
          mode: "reads-ledger",
          text: "Closing numbers: cost estimate was about four cents, actual spend is zero, month-to-date is zero out of the twenty-dollar cap. We're not posting anything to social channels either — there's nothing to post about yet."
        },
        {
          agent: "VIZE",
          mode: "close",
          text: "Room closed. See everyone at the next shift handoff."
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
