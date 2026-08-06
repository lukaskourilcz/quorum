import {
  MeetingRecordSchema,
  type MeetingRecord
} from "../contracts/meeting-record.js";
import {
  NicheProposalSchema,
  type NicheProposal
} from "../contracts/niche-proposal.js";
import {
  RatingRecordSchema,
  type RatingRecord
} from "../contracts/rating.js";

export const INCUBATOR_SCAN_ID = "2026-08-01-incubator-scan";
export const INCUBATOR_SYNTHESIS_ID = "2026-08-01-incubator-synthesis";
export const INCUBATOR_SCAN_SEATS = ["PULSE", "ANGLE", "SCOUT", "COHORT", "VAULT"] as const;
export const INCUBATOR_SYNTHESIS_SEATS = [...INCUBATOR_SCAN_SEATS, "AUDIT"] as const;

export function applyNicheProposalRating(
  proposalInput: NicheProposal,
  ratingInput: RatingRecord
): NicheProposal {
  const proposal = NicheProposalSchema.parse(proposalInput);
  const rating = RatingRecordSchema.parse(ratingInput);
  if (
    rating.ventureId !== "incubator" ||
    rating.objectKind !== "niche-proposal" ||
    rating.objectRef.id !== proposal.id
  ) {
    throw new Error("Rating does not address this incubator proposal");
  }
  const status = rating.rating === "perfect"
    ? "shortlist"
    : rating.rating === "bad"
      ? "archived"
      : "rated";
  return NicheProposalSchema.parse({ ...proposal, status });
}

export interface FoundingBriefDraft {
  destination: "state/INBOX.md";
  type: "HUMAN_APPROVAL";
  proposalId: string;
  title: string;
  body: string;
  registryMutationAuthorized: false;
}

export function createFoundingBriefDraft(
  proposalInput: NicheProposal,
  ownerRequested: boolean
): FoundingBriefDraft | null {
  const proposal = NicheProposalSchema.parse(proposalInput);
  if (!ownerRequested) return null;
  if (proposal.status !== "shortlist") {
    throw new Error("Only a shortlisted proposal can become a founding-brief draft");
  }
  return {
    destination: "state/INBOX.md",
    type: "HUMAN_APPROVAL",
    proposalId: proposal.id,
    title: `Founding decision requested: ${proposal.domain}`,
    body: `Review ${proposal.id}. A signed founding decision is required before any venture-registry entry.`,
    registryMutationAuthorized: false
  };
}

function participantReasons(seats: readonly string[]) {
  return seats.map((agent) => ({
    agent,
    reason: agent === "PULSE"
      ? "chairs the research-only room"
      : agent === "ANGLE"
        ? "leads daily-readable niche analysis"
        : agent === "SCOUT"
          ? "supplies cited observations or records the evidence gap"
          : agent === "COHORT"
            ? "bounds an adult audience hypothesis without invented size"
            : agent === "VAULT"
              ? "rejects repeats against incubator and global memory"
              : "vetoes fabricated claims, unsafe scope and disguised founding",
    participated: true
  }));
}

export function createIncubatorScanDryMeeting(): MeetingRecord {
  const openedAt = "2026-08-01T06:00:00.000Z";
  const closedAt = "2026-08-01T06:06:00.000Z";
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: "20260801080000-incubator-scan-dry",
    date: "2026-08-01",
    phase: "incubator-scan",
    kind: "incubator-scan",
    fixture: true,
    status: "PLAN",
    stage: "DISCOVERY",
    operatingBrief: "Exercise the divergent incubator room without external evidence, provider calls, founding authority or proposal fabrication.",
    participantReasons: participantReasons(INCUBATOR_SCAN_SEATS),
    ledger: {
      estimatedCycleUsd: 0.06,
      actualCycleUsd: 0,
      monthAllInUsd: 0,
      monthCapUsd: 20
    },
    decision: {
      outcome: "EVIDENCE_PACKET_REQUIRED",
      summary: "Record zero candidate domains because the dry packet contains no external evidence. The next scan must bring cited observations.",
      evidenceRefs: []
    },
    proposals: [],
    voteMatrix: INCUBATOR_SCAN_SEATS.map((voter) => ({
      voter,
      firstChoice: "return-zero-candidates",
      veto: false
    })),
    tasks: [{
      id: "TASK-INCUBATOR-SCAN-EVIDENCE",
      owner: "SCOUT",
      summary: "Prepare a bounded evidence packet before a live scan can name candidate domains.",
      status: "planned"
    }],
    growthPlan: "No outside action. This dry scan records the evidence requirement and nothing else.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt,
      closedAt,
      gavel: "PULSE",
      setting: "Deterministic incubator scan fixture. No source packet, provider call or market fact is represented.",
      turns: [
        { agent: "PULSE", mode: "gavel", sentAt: openedAt, text: "This is a dry scan. Bring a candidate only if the packet can show why someone would return tomorrow." },
        { agent: "SCOUT", mode: "statement", sentAt: "2026-08-01T06:01:00.000Z", text: "The fixture contains no source observations. I will not turn an uncited hunch into a domain." },
        { agent: "ANGLE", mode: "response", sentAt: "2026-08-01T06:02:00.000Z", text: "Without a reader and daily curiosity loop, there is no positioning case to sharpen." },
        { agent: "COHORT", mode: "response", sentAt: "2026-08-01T06:03:00.000Z", text: "No audience size is inferable here. Any future hypothesis must stay adult and use public interests only." },
        { agent: "VAULT", mode: "vote", sentAt: "2026-08-01T06:04:00.000Z", text: "There is nothing to compare with memory. Zero candidates is the novel and honest record." },
        { agent: "PULSE", mode: "close", sentAt: closedAt, text: "Close with zero candidates. A cited evidence packet is the next input, not a manufactured proposal." }
      ]
    },
    generatedAt: closedAt
  });
}

export function createIncubatorSynthesisDryMeeting(): MeetingRecord {
  const openedAt = "2026-08-01T17:00:00.000Z";
  const closedAt = "2026-08-01T17:07:00.000Z";
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: "20260801190000-incubator-synthesis-dry",
    date: "2026-08-01",
    phase: "incubator-synthesis",
    kind: "incubator-synthesis",
    fixture: true,
    status: "PLAN",
    stage: "DISCOVERY",
    operatingBrief: "Exercise the convergent incubator room against an empty dry scan and prove that zero proposals is a valid terminal result.",
    participantReasons: participantReasons(INCUBATOR_SYNTHESIS_SEATS),
    ledger: {
      estimatedCycleUsd: 0.06,
      actualCycleUsd: 0,
      monthAllInUsd: 0,
      monthCapUsd: 20
    },
    decision: {
      outcome: "NO_PROPOSAL",
      summary: "Synthesize zero NicheProposal records because the dry scan returned no evidenced candidate. No founding brief or registry change is authorized.",
      evidenceRefs: [`meetings/${INCUBATOR_SCAN_ID}`]
    },
    proposals: [],
    voteMatrix: INCUBATOR_SYNTHESIS_SEATS.map((voter) => ({
      voter,
      firstChoice: "publish-zero-proposals",
      veto: false
    })),
    tasks: [{
      id: "TASK-INCUBATOR-SYNTHESIS-HOLD",
      owner: "ANGLE",
      summary: "Wait for an evidenced scan before writing any niche proposal.",
      status: "blocked"
    }],
    growthPlan: "No company is founded. The incubator ends with an empty shortlist until evidence supports a proposal and the owner rates it.",
    eveningOutcome: "Zero proposals; zero shortlist items; owner action is not requested.",
    roomTranscript: {
      openedAt,
      closedAt,
      gavel: "PULSE",
      setting: "Deterministic incubator synthesis fixture using only the committed empty scan result.",
      turns: [
        { agent: "PULSE", mode: "gavel", sentAt: openedAt, text: "The scan returned zero candidates. Synthesis can still do useful work by refusing false momentum." },
        { agent: "SCOUT", mode: "statement", sentAt: "2026-08-01T17:01:00.000Z", text: "No cited observation entered the room, so I have no domain to carry forward." },
        { agent: "ANGLE", mode: "response", sentAt: "2026-08-01T17:02:00.000Z", text: "A blank proposal list is stronger than a broad category wearing a one-line promise." },
        { agent: "COHORT", mode: "response", sentAt: "2026-08-01T17:03:00.000Z", text: "There is no bounded audience hypothesis to validate and no number to report." },
        { agent: "VAULT", mode: "reads-ledger", sentAt: "2026-08-01T17:04:00.000Z", text: "The incubator namespace is empty. Nothing is duplicated, revived or eligible for a ledger entry." },
        { agent: "AUDIT", mode: "vote", sentAt: "2026-08-01T17:05:00.000Z", text: "Approve zero proposals. Any invented competitor, demand claim or founding implication would breach the room contract." },
        { agent: "PULSE", mode: "close", sentAt: closedAt, text: "Record NO_PROPOSAL. The next useful move is evidence collection, not company formation." }
      ]
    },
    generatedAt: closedAt
  });
}

export function createIncubatorDryMeetings(): readonly [MeetingRecord, MeetingRecord] {
  return [createIncubatorScanDryMeeting(), createIncubatorSynthesisDryMeeting()];
}
