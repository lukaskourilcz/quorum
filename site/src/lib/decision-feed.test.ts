import { describe, expect, it } from "vitest";
import valid from "../../../contracts/fixtures/meeting-record.valid.json";
import { buildPublicDecisions } from "./decision-feed";
import { parsePublicMeetingRecord, type PublicMeetingKind } from "./meeting-record-model";
import { readsAsMachineText } from "./public-prose";

describe("the decisions feed", () => {
  it("names and links all five new room kinds while omitting an off-day that never convened", () => {
    const parsed = parsePublicMeetingRecord(valid);
    if (!parsed) throw new Error("The synthetic meeting fixture must parse");
    const meetings = (["kv-desk", "dm-desk", "dm-growth", "bh-desk", "ts-desk"] as PublicMeetingKind[]).map((kind) => ({
      ...parsed,
      id: `2026-08-12-${kind}`,
      kind,
      fixture: false
    }));
    meetings.push({
      ...meetings[2]!,
      id: "2026-08-14-dm-growth",
      date: "2026-08-14",
      status: "PAUSED",
      decision: { ...meetings[2]!.decision, summary: "$0 — this room meets on Thursdays. Nothing was spent." }
    });
    const decisions = buildPublicDecisions([], meetings);
    expect(decisions).toHaveLength(5);
    expect(decisions.map(({ kind }) => kind)).toEqual(expect.arrayContaining([
      "Kvórum political recommendation desk",
      "Door Money recommendation meeting",
      "Door Money growth meeting",
      "BOOKSOFHISTORY editorial desk",
      "Tehdejší svět editorial desk"
    ]));
    expect(decisions.every(({ href }) => href.startsWith("/meetings/"))).toBe(true);
    expect(decisions.every(({ kind, outcome, summary }) => !readsAsMachineText(`${kind}. ${outcome}. ${summary}`))).toBe(true);
  });
});
