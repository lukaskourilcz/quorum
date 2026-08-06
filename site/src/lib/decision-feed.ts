import "server-only";
import { publicAgentText, publicDecisionLabel } from "@/components/agent-language";
import { publicKindLabel } from "@/lib/slot-labels";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicStandups } from "@/lib/standup-records";

export async function getPublicDecisions() {
  const [standups, meetings] = await Promise.all([getPublicStandups(), getPublicMeetingRecords()]);
  return [
    ...standups.filter((record) => !record.fixture).map((record) => ({
      id: `standup:${record.id}`,
      href: `/standups/${record.id}`,
      at: record.generatedAt ?? `${record.date}T05:30:00.000Z`,
      kind: publicKindLabel(record.phase),
      outcome: publicDecisionLabel(record.decision.outcome),
      summary: publicAgentText(record.decision.summary),
      costUsd: record.ledger.actual
    })),
    // A PAUSED room never convened and has no page, so publishing it as a decision advertises
    // a URL that 404s and calls an absence a decision.
    ...meetings.filter((record) => !record.fixture && record.status !== "PAUSED").map((record) => ({
      id: `meeting:${record.id}`,
      href: `/meetings/${record.id}`,
      at: record.generatedAt,
      // Five of the nine meeting kinds fell off the end of this chain and were published to
      // the feed as "Incubator synthesis" — including every MMA Files and FightAIQ meeting.
      kind: publicKindLabel(record.kind),
      outcome: publicDecisionLabel(record.decision.outcome),
      summary: publicAgentText(record.decision.summary),
      costUsd: record.ledger.actual
    }))
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}
