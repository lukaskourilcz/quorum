import { describe, expect, it } from "vitest";
import valid from "../../../contracts/fixtures/meeting-record.valid.json";
import { parsePublicMeetingRecord, type PublicMeetingKind, type PublicMeetingRecord } from "./meeting-record-model";
import { readsAsMachineText } from "./public-prose";
import { buildPublicLogEntries } from "./public-log";

function baseMeeting(): PublicMeetingRecord {
  const parsed = parsePublicMeetingRecord(valid);
  if (!parsed) throw new Error("The synthetic meeting fixture must parse");
  return { ...parsed, fixture: false };
}

function meeting(kind: PublicMeetingKind, options: { paused?: boolean; outcome?: string } = {}): PublicMeetingRecord {
  const base = baseMeeting();
  return {
    ...base,
    id: `2026-08-12-${kind}`,
    kind,
    status: options.paused ? "PAUSED" : options.outcome === "NO_ACTION" ? "NO_ACTION" : "PLAN",
    ledger: options.paused ? { ...base.ledger, estimate: 0, actual: 0 } : base.ledger,
    decision: {
      ...base.decision,
      outcome: options.paused || options.outcome === "NO_ACTION" ? "NO_ACTION" : "PLAN",
      summary: options.paused
        ? "$0 — this room meets on Thursdays. Nothing was spent and no action was taken."
        : options.outcome === "NO_ACTION"
          ? "The checked sources did not support a recommendation today."
          : "One bounded draft was prepared for owner review."
    }
  };
}

describe("the public update log", () => {
  it("includes every new desk, including a quiet day, an off-day and a skipped slot", () => {
    const entries = buildPublicLogEntries({
      standups: [],
      meetings: [
        meeting("kv-desk", { outcome: "NO_ACTION" }),
        meeting("dm-desk"),
        meeting("dm-growth", { paused: true }),
        meeting("bh-desk"),
        meeting("ts-desk")
      ],
      skips: [{ date: "2026-08-12", phase: "ts-desk", reason: "The signed spending check closed this slot before the room opened." }]
    });
    expect(entries.map(({ title }) => title)).toEqual(expect.arrayContaining([
      "Kvórum political recommendation desk · Do nothing",
      "Door Money recommendation meeting · Plan the next step",
      "Door Money growth meeting · Not needed",
      "BOOKSOFHISTORY editorial desk · Plan the next step",
      "Tehdejší svět editorial desk · Plan the next step",
      "Tehdejší svět editorial desk · Skipped"
    ]));
    const offDay = entries.find(({ id }) => id === "meeting:2026-08-12-dm-growth");
    expect(offDay).toMatchObject({ href: null, cost: 0, detail: expect.stringContaining("Thursdays") });
    expect(entries.find(({ id }) => id === "meeting:2026-08-12-kv-desk")?.href).toBe("/meetings/2026-08-12-kv-desk");
    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
  });

  it("keeps every visible field in plain language and every machine address out of prose", () => {
    const entries = buildPublicLogEntries({
      standups: [],
      meetings: [meeting("kv-desk"), meeting("dm-desk"), meeting("dm-growth", { paused: true }), meeting("bh-desk"), meeting("ts-desk")],
      skips: []
    });
    for (const entry of entries) {
      expect(readsAsMachineText(entry.title), entry.title).toBe(false);
      expect(readsAsMachineText(entry.detail), entry.detail).toBe(false);
      expect(`${entry.title} ${entry.detail}`).not.toMatch(/state\/|schemaVersion|meeting-record\/2|\.json\b/u);
    }
  });
});
