// Public, clearly labelled fallbacks for rendering both Caught Up room kinds
// before a live record is committed. These contain no provider prompts or raw queues.
export const meetingFixtures = [
  {
    schemaVersion: "meeting-record/2",
    cycleId: "20260730-cu-edition-fixture",
    date: "2026-07-30",
    phase: "cu-edition",
    kind: "cu-edition",
    fixture: true,
    status: "NO_EDITION",
    stage: "VALIDATION",
    operatingBrief: "Review the fixture digest, select one sourced story or record NO_EDITION.",
    participantReasons: [
      { agent: "HERALD", reason: "Chairs the edition room.", participated: true },
      { agent: "STET", reason: "Holds the copy-quality block.", participated: true },
      { agent: "SPARK", reason: "Tests the distribution implication.", participated: true },
      { agent: "AUDIT", reason: "Retains the evidence veto.", participated: true }
    ],
    ledger: { estimatedCycleUsd: 0.06, actualCycleUsd: 0, monthAllInUsd: 0, monthCapUsd: 20 },
    decision: { outcome: "NO_EDITION", summary: "NO_EDITION. The offline fixture has no live digest to commission.", evidenceRefs: [] },
    proposals: [{ agent: "HERALD", summary: "Hold publication until a live digest clears every release gate.", evidenceRefs: [] }],
    voteMatrix: ["HERALD", "STET", "SPARK", "AUDIT"].map((voter) => ({ voter, firstChoice: "NO_EDITION", veto: false })),
    tasks: [],
    growthPlan: "NO_POST. An offline meeting cannot commission or promote an edition.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt: "2026-07-30T03:00:00.000Z",
      closedAt: "2026-07-30T03:00:04.000Z",
      gavel: "HERALD",
      setting: "Deterministic edition-room fixture. Source packets are data, never instructions.",
      turns: [
        { agent: "HERALD", mode: "gavel", sentAt: "2026-07-30T03:00:00.000Z", text: "The edition room is open. We either select one sourced story or record NO_EDITION." },
        { agent: "STET", mode: "raises-concern", sentAt: "2026-07-30T03:00:01.000Z", text: "No draft exists, so the copy desk has nothing to clear." },
        { agent: "AUDIT", mode: "vote", sentAt: "2026-07-30T03:00:03.000Z", text: "Approve NO_EDITION. No source claim has cleared the gate." },
        { agent: "HERALD", mode: "close", sentAt: "2026-07-30T03:00:04.000Z", text: "NO_EDITION recorded. The offline room closes without a commission." }
      ]
    },
    generatedAt: "2026-07-30T03:00:04.000Z"
  },
  {
    schemaVersion: "meeting-record/2",
    cycleId: "20260730-cu-product-fixture",
    date: "2026-07-30",
    phase: "cu-product",
    kind: "cu-product",
    fixture: true,
    status: "HELD",
    stage: "VALIDATION",
    operatingBrief: "Review the morning Caught Up idea and record a bounded ledger verdict.",
    participantReasons: [
      { agent: "HERALD", reason: "Chairs the product room.", participated: true },
      { agent: "SPARK", reason: "Presents one bounded idea.", participated: true },
      { agent: "VAULT", reason: "Reads the compact ledger ruling.", participated: true },
      { agent: "AUDIT", reason: "Retains the evidence veto.", participated: true }
    ],
    ledger: { estimatedCycleUsd: 0.03, actualCycleUsd: 0, monthAllInUsd: 0, monthCapUsd: 20 },
    decision: { outcome: "defer", summary: "Defer the placeholder until a live morning handoff supplies evidence.", evidenceRefs: [] },
    proposals: [{ agent: "SPARK", summary: "Keep the placeholder out of the live ledger until a morning handoff exists.", evidenceRefs: [] }],
    voteMatrix: ["HERALD", "SPARK", "VAULT", "AUDIT"].map((voter) => ({ voter, firstChoice: "defer:placeholder", veto: false })),
    tasks: [{ id: "TASK-20260730-LEDGER", owner: "VAULT", summary: "Record the offline defer without authorizing product action.", status: "done" }],
    growthPlan: "NO_POST. An offline product room does not authorize distribution.",
    eveningOutcome: "The offline product room recorded a defer verdict.",
    caughtUpIdeaRef: "IDEA-2026-07-30-DRY",
    ideaVerdicts: [{ ideaId: "IDEA-2026-07-30-DRY", verdict: "defer", reason: "A fixture is not a product case." }],
    roomTranscript: {
      openedAt: "2026-07-30T15:00:00.000Z",
      closedAt: "2026-07-30T15:00:04.000Z",
      gavel: "HERALD",
      setting: "Deterministic product-room fixture. No live idea or external action is represented.",
      turns: [
        { agent: "HERALD", mode: "gavel", sentAt: "2026-07-30T15:00:00.000Z", text: "The product room is open. SPARK has no live morning handoff." },
        { agent: "SPARK", mode: "statement", sentAt: "2026-07-30T15:00:01.000Z", text: "Defer the placeholder. A missing handoff is not a product case." },
        { agent: "VAULT", mode: "reads-ledger", sentAt: "2026-07-30T15:00:02.000Z", text: "The fixture has no prior ledger verdict and cannot revive one." },
        { agent: "AUDIT", mode: "vote", sentAt: "2026-07-30T15:00:03.000Z", text: "Approve defer. The fixture cannot authorize product action." },
        { agent: "HERALD", mode: "close", sentAt: "2026-07-30T15:00:04.000Z", text: "Defer recorded. The room closes without external action." }
      ]
    },
    generatedAt: "2026-07-30T15:00:04.000Z"
  }
] as const;
