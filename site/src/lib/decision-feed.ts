import "server-only";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicStandups } from "@/lib/standup-records";

export async function getPublicDecisions() {
  const [standups, meetings] = await Promise.all([getPublicStandups(), getPublicMeetingRecords()]);
  return [
    ...standups.filter((record) => !record.fixture).map((record) => ({
      id: `standup:${record.id}`,
      href: `/standups/${record.id}`,
      at: record.generatedAt ?? `${record.date}T05:30:00.000Z`,
      kind: `Venture ${record.phase}`,
      outcome: record.decision.outcome,
      summary: record.decision.summary,
      costUsd: record.ledger.actual
    })),
    ...meetings.filter((record) => !record.fixture).map((record) => ({
      id: `meeting:${record.id}`,
      href: `/meetings/${record.id}`,
      at: record.generatedAt,
      kind: record.kind === "cu-edition" ? "Caught Up edition" : "Caught Up product",
      outcome: record.decision.outcome,
      summary: record.decision.summary,
      costUsd: record.ledger.actual
    }))
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}
