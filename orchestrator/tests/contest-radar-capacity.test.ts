import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { readEntryPolicy, resolveContestCapacity } from "../src/ventures/contest-radar/capacity.js";
import { dueEntrySlots, resolveEntrySlots } from "../src/ventures/contest-radar/schedule.js";
import type { ContestOwnerEvent, ContestRecord } from "../src/contracts/contest-radar.js";

const NOW = "2026-08-30T06:00:00.000Z";
const TODAY = "2026-08-30";

function record(over: Partial<ContestRecord> = {}): Pick<ContestRecord, "id" | "lifecycle" | "dates"> {
  const absent = { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] };
  return {
    id: "cr-1",
    lifecycle: "open",
    dates: {
      registrationOpens: absent,
      submissionCloses: absent,
      eventStarts: absent,
      deadline: absent,
      resultsAnnounced: absent
    },
    ...over
  } as Pick<ContestRecord, "id" | "lifecycle" | "dates">;
}

function entered(id: string, at: string): ContestOwnerEvent {
  return {
    schemaVersion: "contest-owner-event/1",
    id,
    contestId: "cr-1",
    recordedAt: at,
    action: "entered",
    result: null,
    note: null,
    actualMinutes: null,
    realizedValue: null,
    supersedesEventId: null
  } as ContestOwnerEvent;
}

/**
 * The entrant unit is where a discovery tool would become a cheating tool. Every case below is a
 * refusal to read a limit as permission.
 */
describe("lawful entry capacity", () => {
  it("assumes one entry when no rule text has been read", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: null });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW });

    expect(policy.entrantUnit).toBe("unknown");
    expect(capacity.totalCapacity).toBe(1);
    // The failure mode of the parser is "enter once", never "enter eleven times against a rule
    // nobody read".
    expect(capacity.ownerChecks.join(" ")).toContain("rules have not been read");
  });

  it("never multiplies an account limit into more accounts", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "Jeden vstup na účet." });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW });

    expect(policy.entrantUnit).toBe("account");
    // One entry per account, with one account, is one entry. Anything else is sock puppets.
    expect(capacity.baseCapacity).toBe(1);
    expect(capacity.ownerChecks.join(" ")).toContain("owner's one existing account");
  });

  it("counts no household member who has not agreed", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "Jedna výhra na domácnost." });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW });

    expect(policy.entrantUnit).toBe("household");
    // The field exists to say zero out loud rather than leave an allowance implied.
    expect(capacity.householdCapacity).toBe(0);
    expect(capacity.baseCapacity).toBe(1);
  });

  it("counts a team entry as one, because no teammate is recorded", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "One entry per team." });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW });

    expect(capacity.baseCapacity).toBe(1);
    expect(capacity.ownerChecks.join(" ")).toContain("real teammates who agreed");
  });

  it("grants referral capacity only where the rules state a cap", () => {
    const uncapped = readEntryPolicy({ contestId: "cr-1", ruleText: "Za doporučení získáte další vstup." });
    const capped = readEntryPolicy({ contestId: "cr-1", ruleText: "Za každé z 5 doporučení získáte vstup." });

    // A stated mechanic with no stated ceiling is not an unlimited allowance.
    expect(uncapped.referralAllowed).toBe(false);
    expect(capped.referralAllowed).toBe(true);
    expect(resolveContestCapacity({ record: record(), policy: capped, now: NOW }).referralCapacity).toBe(5);
  });

  it("gives a closed contest no capacity at all", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "Jeden vstup na osobu denně." });
    const capacity = resolveContestCapacity({ record: record({ lifecycle: "closed" } as Partial<ContestRecord>), policy, now: NOW });

    expect(capacity.totalCapacity).toBe(0);
  });

  it("subtracts what the owner already entered", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "3 vstupy na osobu." });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW, alreadyEntered: 2 });

    expect(capacity.baseCapacity).toBe(1);
  });
});

describe("the repeat-entry scheduler", () => {
  it("opens one daily window and closes it on the owner's own event", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "Jeden vstup na osobu každý den." });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW });

    const open = resolveEntrySlots({ record: record(), policy, capacity, ownerEvents: [], today: TODAY });
    const used = resolveEntrySlots({
      record: record(), policy, capacity,
      ownerEvents: [entered("ev-1", "2026-08-30T09:00:00.000Z")],
      today: TODAY
    });

    expect(open[0]?.state).toBe("due");
    // The owner's append-only record closes the slot, not a counter this module keeps: two sources
    // of truth about "did I enter today" would eventually disagree.
    expect(used[0]?.state).toBe("used");
    expect(used[0]?.usedByEventId).toBe("ev-1");
  });

  it("ends a weekly window early when the deadline lands inside it", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "Jeden vstup na osobu každý týden." });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW });
    // 2026-08-26 is a Wednesday, so its week runs 24th–30th. A deadline on Friday the 28th is
    // still ahead and lands inside that week.
    const withDeadline = record({
      dates: { ...record().dates, deadline: { value: "2026-08-28", confidence: "stated", unavailableReason: null, evidenceRefs: [] } }
    } as Partial<ContestRecord>);

    const slots = resolveEntrySlots({ record: withDeadline, policy, capacity, ownerEvents: [], today: "2026-08-26" });

    // The calendar week runs to Sunday; the contest does not.
    expect(slots[0]?.opensOn).toBe("2026-08-24");
    expect(slots[0]?.closesOn).toBe("2026-08-28");
  });

  it("reports a passed deadline as closed rather than as a window", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "Jeden vstup na osobu denně." });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW });
    const expired = record({
      dates: { ...record().dates, deadline: { value: "2026-08-01", confidence: "stated", unavailableReason: null, evidenceRefs: [] } }
    } as Partial<ContestRecord>);

    const slots = resolveEntrySlots({ record: expired, policy, capacity, ownerEvents: [], today: TODAY });

    // A reminder to enter something that ended costs a click to discover it is useless.
    expect(slots).toHaveLength(1);
    expect(slots[0]?.state).toBe("closed");
    expect(dueEntrySlots(slots)).toEqual([]);
  });

  it("gives a one-off contest one slot for its whole life", () => {
    const policy = readEntryPolicy({ contestId: "cr-1", ruleText: "Jeden vstup na osobu." });
    const capacity = resolveContestCapacity({ record: record(), policy, now: NOW });

    const before = resolveEntrySlots({ record: record(), policy, capacity, ownerEvents: [], today: TODAY });
    const after = resolveEntrySlots({
      record: record(), policy, capacity,
      ownerEvents: [entered("ev-9", "2026-07-01T09:00:00.000Z")],
      today: TODAY
    });

    expect(before[0]?.state).toBe("due");
    expect(after[0]?.state).toBe("used");
  });

  it("orders due windows by what closes soonest", () => {
    const slots = [
      { contestId: "cr-late", closesOn: "2026-09-30", state: "due" },
      { contestId: "cr-soon", closesOn: "2026-08-31", state: "due" },
      { contestId: "cr-used", closesOn: "2026-08-30", state: "used" }
    ] as never;

    expect(dueEntrySlots(slots).map((slot) => slot.contestId)).toEqual(["cr-soon", "cr-late"]);
  });

  it("has no path that could enter anything", async () => {
    const source = await readFile(
      path.join(repoRoot, "orchestrator/src/ventures/contest-radar/schedule.ts"),
      "utf8"
    );

    // The founding decision's line is enforced by there being nothing here that could act.
    expect(source).not.toMatch(/\bfetch\(|axios|\.post\(|FormData|submit\(/u);
  });
});
