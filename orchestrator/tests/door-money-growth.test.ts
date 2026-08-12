import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import {
  DOOR_MONEY_GROWTH_AGENDA_ANCHOR,
  DOOR_MONEY_GROWTH_TOPICS,
  doorMoneyGrowthAgenda,
  isDoorMoneyGrowthDay,
  runDoorMoneyGrowthCycle
} from "../src/ventures/door-money/run.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "door-money-growth-"));
  roots.push(root);
  return root;
}

describe("Door Money growth schedule", () => {
  it("keeps the commissioned eight-topic order inspectable", () => {
    expect(DOOR_MONEY_GROWTH_AGENDA_ANCHOR).toBe("2026-W33");
    expect(DOOR_MONEY_GROWTH_TOPICS.map(({ title }) => title)).toEqual([
      "Launch mechanics",
      "BookTok and Bookstagram",
      "Podcasts and press outreach",
      "Reddit and communities",
      "Short-form video",
      "Newsletter and owned audience",
      "Amazon, Goodreads and reviews",
      "Partnerships and collaborations"
    ]);
  });

  it("selects one stable topic for every date in an ISO week", () => {
    const monday = doorMoneyGrowthAgenda("2026-08-10");
    const thursday = doorMoneyGrowthAgenda("2026-08-13");
    const sunday = doorMoneyGrowthAgenda("2026-08-16");

    expect(monday).toEqual(thursday);
    expect(thursday).toEqual(sunday);
    expect(thursday).toMatchObject({
      isoWeek: "2026-W33",
      weekOf: "2026-08-10",
      topicIndex: 0,
      topic: { id: "launch-mechanics" }
    });
  });

  it("advances weekly, repeats after eight topics and stays continuous across New Year", () => {
    const topics = Array.from({ length: 9 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 7, 13 + index * 7, 12));
      return doorMoneyGrowthAgenda(date.toISOString().slice(0, 10)).topic.id;
    });
    expect(topics).toEqual([
      ...DOOR_MONEY_GROWTH_TOPICS.map(({ id }) => id),
      DOOR_MONEY_GROWTH_TOPICS[0].id
    ]);
    expect(doorMoneyGrowthAgenda("2026-12-31").topicIndex + 1)
      .toBe(doorMoneyGrowthAgenda("2027-01-07").topicIndex);
  });

  it("opens only on Thursdays and refuses malformed calendar dates", () => {
    expect(isDoorMoneyGrowthDay("2026-08-13")).toBe(true);
    expect(isDoorMoneyGrowthDay("2026-08-12")).toBe(false);
    expect(isDoorMoneyGrowthDay("2026-02-30")).toBe(false);
    expect(() => doorMoneyGrowthAgenda("2026-02-30")).toThrow(/valid YYYY-MM-DD/u);
  });

  it("records a live off-day as a zero-dollar closed room without participants", async () => {
    const root = await temporaryRoot();
    const result = await runDoorMoneyGrowthCycle({
      cycleId: "fixture-growth-off-day",
      now: new Date("2026-08-12T14:00:00.000Z"),
      dry: false,
      root,
      stage: "VALIDATION"
    });

    expect(result).toMatchObject({
      status: "paused",
      decision: "PAUSED",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: ["BOOKER", "PULSE", "AUDIT"],
      agenda: { isoWeek: "2026-W33", topic: { id: "launch-mechanics" } }
    });
    const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(root, "meetings/2026-08-12-dm-growth.json"),
      "utf8"
    )));
    expect(meeting).toMatchObject({
      fixture: false,
      status: "PAUSED",
      ledger: { estimatedCycleUsd: 0, actualCycleUsd: 0 },
      decision: { outcome: "NO_ACTION" }
    });
    expect(meeting.decision.summary).toContain("$0 — this room meets on Thursdays");
    expect(meeting.participantReasons.every(({ participated }) => !participated)).toBe(true);
  });

  it("shows the selected agenda in the dry Thursday record without a provider call", async () => {
    const root = await temporaryRoot();
    const result = await runDoorMoneyGrowthCycle({
      cycleId: "fixture-growth-thursday",
      now: new Date("2026-08-13T14:00:00.000Z"),
      dry: true,
      root,
      stage: "VALIDATION"
    });

    expect(result).toMatchObject({
      status: "dry_complete",
      decision: "NO_ACTION",
      selectedAgents: ["BOOKER", "PULSE", "AUDIT"],
      agenda: { isoWeek: "2026-W33", topic: { title: "Launch mechanics" } }
    });
    const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(root, "meetings/2026-08-13-dm-growth.json"),
      "utf8"
    )));
    expect(meeting.operatingBrief).toContain("2026-W33 · Launch mechanics");
    expect(meeting.decision.summary).toContain("no provider or external system was called");
    expect(meeting.ledger.actualCycleUsd).toBe(0);
  });
});
