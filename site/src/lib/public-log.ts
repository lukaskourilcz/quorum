import "server-only";
import { publicAgentText, publicDecisionLabel } from "@/components/agent-language";
import { logEntries as recordedFixtureEntries } from "@/data/fixtures";
import type { PublicStandup } from "@/data/fixtures";
import type { PublicMeetingSkip } from "@/lib/calendar-feed-model";
import type { PublicMeetingRecord } from "@/lib/meeting-record-model";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicMeetingSkips } from "@/lib/meeting-skips";
import { publicKindLabel } from "@/lib/slot-labels";
import { getPublicStandups } from "@/lib/standup-records";

export interface PublicLogEntry {
  id: string;
  at: string;
  type: string;
  title: string;
  detail: string;
  cost: number | null;
  href: string | null;
}

interface BuildPublicLogInput {
  standups: readonly PublicStandup[];
  meetings: readonly PublicMeetingRecord[];
  skips: readonly PublicMeetingSkip[];
  fixtures?: readonly { at: string; type: string; title: string; detail: string; cost: number }[];
}

/** Build one public history without turning a quiet or closed room into a meeting that happened. */
export function buildPublicLogEntries(input: BuildPublicLogInput): PublicLogEntry[] {
  const entries: PublicLogEntry[] = [
    ...input.standups.filter(({ fixture }) => !fixture).map((record) => ({
      id: `standup:${record.id}`,
      at: record.generatedAt ?? record.roomTranscript.closedAt,
      type: "Company meeting record",
      title: `${publicKindLabel(record.phase)} · ${publicDecisionLabel(record.decision.outcome)}`,
      detail: publicAgentText(record.decision.summary),
      cost: record.ledger.actual,
      href: `/standups/${record.id}`
    })),
    ...input.meetings.filter(({ fixture }) => !fixture).map((record) => {
      const paused = record.status === "PAUSED";
      return {
        id: `meeting:${record.id}`,
        at: record.generatedAt,
        type: paused ? "Room did not meet" : "Project meeting record",
        title: `${publicKindLabel(record.kind)} · ${paused ? "Not needed" : publicDecisionLabel(record.decision.outcome)}`,
        detail: publicAgentText(record.decision.summary),
        cost: record.ledger.actual,
        href: paused ? null : `/meetings/${record.id}`
      };
    }),
    ...input.skips.map((skip) => ({
      id: `skip:${skip.date}:${skip.phase}`,
      at: `${skip.date}T12:00:00.000Z`,
      type: "Skipped project slot",
      title: `${publicKindLabel(skip.phase)} · Skipped`,
      detail: publicAgentText(skip.reason),
      cost: 0,
      href: null
    })),
    ...(input.fixtures ?? []).map((entry, index) => ({
      ...entry,
      id: `fixture:${index}:${entry.at}`,
      href: null
    }))
  ];
  return entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at) || left.id.localeCompare(right.id));
}

export async function getPublicLogEntries(): Promise<PublicLogEntry[]> {
  const [standups, meetings, skips] = await Promise.all([
    getPublicStandups(),
    getPublicMeetingRecords(),
    getPublicMeetingSkips()
  ]);
  return buildPublicLogEntries({ standups, meetings, skips, fixtures: recordedFixtureEntries });
}
