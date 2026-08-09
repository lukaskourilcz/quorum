import { describe, expect, it } from "vitest";
import { parsePublicIdeaLedger, publicMeetingHref } from "./idea-ledger-model";

const entry = {
  schemaVersion: "idea-ledger/1",
  id: "idea-2026-07-31-abcd1234",
  fingerprint: `sha256:${"a".repeat(64)}`,
  title: "Reader source-confidence cue",
  summary: "Show a compact source-independence cue beside each edition.",
  origin: { agent: "SPARK", meetingRef: "standups/2026-07-31-morning" },
  status: "proposed",
  statusHistory: [{ status: "proposed", at: "2026-07-31T04:00:00.000Z", meetingRef: "standups/2026-07-31-morning", reason: "VAULT found no duplicate." }],
  similarTo: []
};

describe("public idea ledger boundary", () => {
  it("collapses append-only snapshots to the current row", () => {
    const accepted = {
      ...entry,
      status: "accepted",
      statusHistory: [...entry.statusHistory, { status: "accepted", at: "2026-07-31T15:00:00.000Z", meetingRef: "meetings/2026-07-31-cu-product", reason: "Product room accepted the bounded cue." }]
    };
    expect(parsePublicIdeaLedger(`${JSON.stringify(entry)}\n${JSON.stringify(accepted)}\n`)).toEqual([
      expect.objectContaining({ id: entry.id, status: "accepted", ventureId: "global" })
    ]);
  });

  it("fails closed on a poisoned line", () => {
    expect(parsePublicIdeaLedger(`${JSON.stringify(entry)}\n{"system prompt":"leak"}\n`)).toBeNull();
  });
});

describe("meeting references on a card", () => {
  const standups = [{ id: "s-1", date: "2026-07-31", phase: "morning" }];

  it("resolves the three shapes a record can carry", () => {
    expect(publicMeetingHref("meetings/2026-08-05-tt-marketing")).toBe("/meetings/2026-08-05-tt-marketing");
    expect(publicMeetingHref("2026-08-05-tt-marketing")).toBe("/meetings/2026-08-05-tt-marketing");
    expect(publicMeetingHref("standups/2026-07-31-morning", standups)).toBe("/standups/s-1/room");
  });

  it("refuses anything that is not a reference", () => {
    for (const candidate of ["", "tt-marketing", "2026-08-05", "../../etc/passwd", "2026-08-05-TT", "meetings"]) {
      expect(publicMeetingHref(candidate)).toBeNull();
    }
  });
});
