import { describe, expect, it } from "vitest";
import { RoomPacketSchema } from "../src/boardroom/room.js";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { buildCalendarFeed } from "../src/meetings/calendar.js";
import { createLiveStandup, type RecordedPosition } from "../src/standup/live.js";
import { createOfflineStandup } from "../src/standup/run.js";

// 00:30 on 4 August in Prague, which is still 3 August in UTC. This is the 22:00 night shift
// of 4 August running two and a half hours behind its cron — the kind of delay GitHub has
// already produced on this repository, where fourteen crons fired between 13 and 54 minutes
// late on 2 August and the tolerance in resolveCronPhase is six hours.
const AFTER_PRAGUE_MIDNIGHT = new Date("2026-08-03T22:30:00.000Z");
const PRAGUE_DATE = "2026-08-04";

const room = RoomPacketSchema.parse({
  roomId: "ROOM-20260804-NIGHT",
  topicType: "council",
  objective: "Reconcile the shift record",
  owner: "VIZE",
  evidenceRefs: [],
  decisionNeeded: "NO_ACTION",
  riskTags: [],
  budgetImpactUsd: 0.03,
  selectedParticipants: ["VIZE", "FORGE", "PULSE", "AUDIT", "LEDGER"].map((agent) => ({
    agent,
    reason: "required for the shift",
    mandatoryRule: "daily-standup"
  })),
  skippedParticipants: [],
  maxRounds: 2,
  maxTurns: 6,
  maxTotalTokens: 12000,
  expiresAt: "2026-08-03T23:00:00.000Z"
});

function positions(): RecordedPosition[] {
  return ["VIZE", "FORGE", "PULSE", "AUDIT"].map((agent, index) => ({
    agent: agent as RecordedPosition["agent"],
    publicSummary: `${agent} recorded a bounded public position.`,
    recommendation: "approve" as const,
    risk: "Keep the work inside the internal operating queue.",
    meetingRequest: null,
    sentAt: new Date(AFTER_PRAGUE_MIDNIGHT.getTime() + index * 1_000).toISOString()
  }));
}

function offlineStandup() {
  return createOfflineStandup({
    cycleId: "20260803223000-night",
    phase: "night",
    stage: "DISCOVERY",
    fixture: false,
    status: "NO_ACTION",
    room,
    estimatedCycleUsd: 0.03,
    now: AFTER_PRAGUE_MIDNIGHT,
    ledger: { monthAllInUsd: 1.18, monthCapUsd: 30 }
  });
}

function liveStandup() {
  return createLiveStandup({
    cycleId: "20260803223000-night",
    phase: "night",
    stage: "DISCOVERY",
    room,
    estimatedCycleUsd: 0.03,
    now: AFTER_PRAGUE_MIDNIGHT,
    council: {
      item: {
        id: "OPS-OBSERVE",
        phase: "night",
        owner: "FORGE",
        title: "Verify the public shift record",
        summary: "Check that the latest committed shift record is complete."
      },
      positions: positions(),
      droppedSeats: [],
      scope: "Internal only.",
      actualCycleUsd: 0.0123,
      monthCapUsd: 30,
      monthAllInUsd: 0.0123
    }
  });
}

describe("standup records are dated by the Prague wall clock", () => {
  it("dates an offline shift by the Prague day, not the UTC day", () => {
    const standup = offlineStandup();

    expect(standup.date).toBe(PRAGUE_DATE);
    expect(standup.episode?.id).toBe("EP-20260804-NIGHT");
  });

  it("dates a live shift by the Prague day, not the UTC day", () => {
    const standup = liveStandup();

    expect(standup.date).toBe(PRAGUE_DATE);
    expect(standup.episode?.id).toBe("EP-20260804-NIGHT");
  });

  it("keeps the same day the whole calendar uses, so the slot reads held and not missed", () => {
    // cycle.ts names the file `standups/<record.date>-<phase>.json` and the calendar keys its
    // Prague-laid-out grid on the same field, so a UTC date puts the record on the day before
    // the one it belongs to: the slot that actually ran reads "missed", and the file collides
    // with the previous day's record of the same phase.
    const record = MeetingRecordSchema.parse({
      ...offlineStandup(),
      schemaVersion: "meeting-record/2",
      kind: "venture"
    });
    const feed = buildCalendarFeed({
      weekOf: PRAGUE_DATE,
      records: [record],
      now: new Date("2026-08-05T12:00:00.000Z")
    });
    const nightSlots = feed.slots.filter((slot) => slot.kind === "venture-night");
    const pragueNight = nightSlots.find((slot) => slot.at.startsWith("2026-08-04T20:00"));
    const utcNight = nightSlots.find((slot) => slot.at.startsWith("2026-08-03T20:00"));

    expect(pragueNight?.status).toBe("held");
    expect(utcNight?.status).toBe("missed");
  });
});
