import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readsAsMachineText } from "./public-prose";
import { publicAgentText, publicDecisionLabel } from "@/components/agent-language";

vi.mock("server-only", () => ({}));
const { getPublicStandups } = await import("./standup-records");
const { getPublicMeetingRecords } = await import("./meeting-records");
const { getDailyResults } = await import("./daily-results");
const { getPublicMeetingSkips } = await import("./meeting-skips");
const { buildPublicCalendarFeed } = await import("./calendar-feed-model");

const stateRoot = path.resolve(process.cwd(), "..", "state");

/**
 * The guard tests before this one only exercised hand-written strings and four fixtures, so
 * every one of them passed while the committed records still leaked. This reads what the site
 * would actually publish, from the records on disk, and is the test the acceptance list means
 * by "verified by the parser guard tests".
 */
describe("what the site would publish today", () => {
  it("has no meeting page text that reads as machine output", async () => {
    const offenders: string[] = [];
    for (const record of await getPublicMeetingRecords()) {
      const fields: Array<[string, string]> = [
        ["operatingBrief", record.operatingBrief],
        ["decision.summary", record.decision.summary],
        ["growthPlan", record.growthPlan],
        ...record.roomTranscript.turns.map(
          (turn, index) => [`turn[${index}]`, turn.text] as [string, string]
        ),
        ...record.participants.map(
          (participant) => [`participant ${participant.agent}`, participant.reason] as [string, string]
        ),
        ...record.voteMatrix.map(
          (vote) => [`vote ${vote.voter}`, publicDecisionLabel(vote.firstChoice)] as [string, string]
        )
      ];
      for (const [field, value] of fields) {
        if (readsAsMachineText(value)) offenders.push(`${record.id} ${field}: ${value.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no standup page text that reads as machine output", async () => {
    const offenders: string[] = [];
    for (const record of await getPublicStandups()) {
      const fields: Array<[string, string]> = [
        ["operatingBrief", record.operatingBrief],
        ["decision.summary", record.decision.summary],
        ["growthPlan", record.growthPlan],
        ...record.roomTranscript.turns.map(
          (turn, index) => [`turn[${index}]`, turn.text] as [string, string]
        ),
        ...record.proposals.map(
          (proposal, index) => [`proposal[${index}]`, proposal.summary] as [string, string]
        )
      ];
      for (const [field, value] of fields) {
        if (readsAsMachineText(value)) offenders.push(`${record.id} ${field}: ${value.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no calendar cell that reads as machine output", async () => {
    const [standups, meetings, skips] = await Promise.all([
      getPublicStandups(),
      getPublicMeetingRecords(),
      getPublicMeetingSkips()
    ]);
    const weeks = new Set(standups.map((standup) => standup.date).concat(meetings.map((m) => m.date)));
    const offenders: string[] = [];
    for (const weekOf of weeks) {
      const feed = buildPublicCalendarFeed({
        weekOf,
        now: new Date("2026-08-06T23:00:00.000Z"),
        standups,
        meetings,
        skips
      });
      for (const slot of feed.slots) {
        if (slot.decisionOneLiner && readsAsMachineText(slot.decisionOneLiner)) {
          offenders.push(`${slot.at} ${slot.kind}: ${slot.decisionOneLiner.slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no results row that reads as machine output", async () => {
    const offenders: string[] = [];
    for (const day of await getDailyResults()) {
      for (const row of day.rows) {
        if (readsAsMachineText(row.output)) offenders.push(`${day.date} ${row.kind} output: ${row.output.slice(0, 120)}`);
        if (row.failureReason && readsAsMachineText(row.failureReason)) {
          offenders.push(`${day.date} ${row.kind} failure: ${row.failureReason.slice(0, 120)}`);
        }
      }
      if (readsAsMachineText(publicAgentText(day.portfolioLine))) {
        offenders.push(`${day.date} portfolioLine: ${day.portfolioLine.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no skip reason that reads as machine output", async () => {
    const committed = await readdir(path.join(stateRoot, "meetings", "skips")).catch(() => []);
    const parsed = await getPublicMeetingSkips();
    // Every committed skip still parses: the guard is meant to be unreachable on real data, and
    // a skip the parser drops is a cell with no reason at all.
    expect(parsed.length).toBe(committed.filter((name) => name.endsWith(".json")).length);
    for (const skip of parsed) expect(readsAsMachineText(skip.reason)).toBe(false);
  });

  it("keeps every committed meeting and standup record readable", async () => {
    const meetingFiles = (await readdir(path.join(stateRoot, "meetings")).catch(() => []))
      .filter((name) => name.endsWith(".json") && /^\d{4}-\d{2}-\d{2}-/.test(name));
    const parsed = await getPublicMeetingRecords();
    const missing = meetingFiles
      .map((name) => name.replace(/\.json$/, ""))
      .filter((id) => !parsed.some((record) => record.id === id));
    // A record the parser drops disappears from the site and takes its calendar cell with it.
    expect(missing).toEqual([]);
    expect((await readFile(path.join(stateRoot, "meetings", meetingFiles[0]!), "utf8")).length).toBeGreaterThan(0);
  });
});
