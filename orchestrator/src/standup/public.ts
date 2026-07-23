import type { Standup } from "./schema.js";

const SECRET_PATTERN =
  /(api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*\S+/gi;

function sanitize(value: string): string {
  return value.replaceAll(SECRET_PATTERN, "$1=[redacted]");
}

export function publicStandup(standup: Standup): Standup {
  return {
    ...standup,
    operatingBrief: sanitize(standup.operatingBrief),
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
    growthPlan: sanitize(standup.growthPlan),
    eveningOutcome: standup.eveningOutcome
      ? sanitize(standup.eveningOutcome)
      : null
  };
}
