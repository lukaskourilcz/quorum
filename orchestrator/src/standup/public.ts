import type { Standup } from "./schema.js";

const SECRET_PATTERN =
  /(api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*\S+/gi;

function sanitize(value: string): string {
  return value
    .replaceAll(SECRET_PATTERN, "$1=[redacted]")
    .replaceAll(
      /(chain[- ]of[- ]thought|system prompt|developer message|process\.env|state\/inbox)/gi,
      "[private detail removed]"
    );
}

export function publicStandup(standup: Standup): Standup {
  return {
    ...standup,
    operatingBrief: sanitize(standup.operatingBrief),
    episode: standup.episode
      ? {
          ...standup.episode,
          title: sanitize(standup.episode.title),
          handoff: sanitize(standup.episode.handoff)
        }
      : standup.episode,
    decision: {
      ...standup.decision,
      summary: sanitize(standup.decision.summary)
    },
    proposals: standup.proposals.map((proposal) => ({
      ...proposal,
      summary: sanitize(proposal.summary)
    })),
    tasks: standup.tasks.map((task) => ({
      ...task,
      summary: sanitize(task.summary)
    })),
    roomTranscript: {
      ...standup.roomTranscript,
      setting: sanitize(standup.roomTranscript.setting),
      turns: standup.roomTranscript.turns.map((turn) => ({
        ...turn,
        text: sanitize(turn.text)
      }))
    },
    growthPlan: sanitize(standup.growthPlan),
    eveningOutcome: standup.eveningOutcome
      ? sanitize(standup.eveningOutcome)
      : null
  };
}
