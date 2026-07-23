import {
  CandidateIdSchema,
  type CandidateId,
  type Proposal,
  type Vote
} from "./council.js";
import type { CouncilAgent } from "./types.js";

const COUNCIL: readonly CouncilAgent[] = ["VIZE", "PULSE", "FORGE", "AUDIT"];
const BORDA_POINTS = [4, 3, 2, 1, 0] as const;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

export interface AnonymizedProposal {
  publicId: Exclude<CandidateId, "NO_ACTION">;
  proposal: Omit<Proposal, "agent">;
  author: CouncilAgent;
}

export function anonymizeProposals(
  proposals: readonly Proposal[],
  seed: number
): AnonymizedProposal[] {
  if (proposals.length !== 4) {
    throw new Error("Council voting requires exactly four proposals");
  }
  const shuffled = [...proposals];
  const random = seededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  return shuffled.map(({ agent, ...proposal }, index) => ({
    publicId: CandidateIdSchema.parse(`P${index + 1}`) as Exclude<
      CandidateId,
      "NO_ACTION"
    >,
    proposal,
    author: agent
  }));
}

export function scoreBorda(
  votes: readonly Vote[],
  vetoed: ReadonlySet<CandidateId> = new Set()
): Record<CandidateId, number> {
  const scores: Record<CandidateId, number> = {
    P1: 0,
    P2: 0,
    P3: 0,
    P4: 0,
    NO_ACTION: 0
  };
  for (const vote of votes) {
    vote.ranking.forEach((candidate, index) => {
      if (!vetoed.has(candidate)) {
        scores[candidate] += BORDA_POINTS[index] ?? 0;
      }
    });
  }
  for (const candidate of vetoed) {
    scores[candidate] = Number.NEGATIVE_INFINITY;
  }
  return scores;
}

export function chairForMeeting(meetingNo: number): CouncilAgent {
  return COUNCIL[((meetingNo % COUNCIL.length) + COUNCIL.length) % COUNCIL.length]!;
}

export interface ConsensusResult {
  winnerId: CandidateId;
  winnerAgent: CouncilAgent | null;
  scores: Record<CandidateId, number>;
  chair: CouncilAgent;
  vetoed: CandidateId[];
  keeperRejected: CandidateId[];
}

export async function resolveConsensus(input: {
  anonymized: readonly AnonymizedProposal[];
  votes: readonly Vote[];
  meetingNo: number;
  keeperPasses: (candidate: AnonymizedProposal) => Promise<boolean>;
}): Promise<ConsensusResult> {
  const vetoed = new Set<CandidateId>();
  for (const vote of input.votes) {
    if (vote.agent === "AUDIT" && vote.veto) {
      vetoed.add(vote.veto.target);
    }
  }
  const scores = scoreBorda(input.votes, vetoed);
  const chair = chairForMeeting(input.meetingNo);
  const authorById = new Map<CandidateId, CouncilAgent>(
    input.anonymized.map((candidate) => [candidate.publicId, candidate.author])
  );
  const candidates = (
    ["P1", "P2", "P3", "P4", "NO_ACTION"] as CandidateId[]
  ).sort((left, right) => {
    const scoreDifference = scores[right] - scores[left];
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    const leftIsChair = authorById.get(left) === chair;
    const rightIsChair = authorById.get(right) === chair;
    if (leftIsChair !== rightIsChair) {
      return leftIsChair ? -1 : 1;
    }
    return left.localeCompare(right);
  });
  const keeperRejected: CandidateId[] = [];
  for (const candidateId of candidates) {
    if (vetoed.has(candidateId)) {
      continue;
    }
    if (candidateId === "NO_ACTION") {
      return {
        winnerId: candidateId,
        winnerAgent: null,
        scores,
        chair,
        vetoed: [...vetoed],
        keeperRejected
      };
    }
    const candidate = input.anonymized.find(
      (item) => item.publicId === candidateId
    );
    if (candidate && (await input.keeperPasses(candidate))) {
      return {
        winnerId: candidateId,
        winnerAgent: candidate.author,
        scores,
        chair,
        vetoed: [...vetoed],
        keeperRejected
      };
    }
    keeperRejected.push(candidateId);
  }
  return {
    winnerId: "NO_ACTION",
    winnerAgent: null,
    scores,
    chair,
    vetoed: [...vetoed],
    keeperRejected
  };
}
