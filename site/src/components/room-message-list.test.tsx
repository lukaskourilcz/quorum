import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoomMessageList } from "./room-message-list";
import type { RoomTranscript } from "@/data/fixtures";

const transcript: RoomTranscript = {
  openedAt: "2026-08-04T09:00:00.000Z",
  closedAt: "2026-08-04T09:12:00.000Z",
  gavel: "VIZE",
  setting: "The morning meeting.",
  turns: [
    {
      agent: "VIZE",
      mode: "gavel",
      text: "VIZE opens the shift and asks for the evidence.",
      sentAt: "2026-08-04T09:00:00.000Z"
    },
    {
      agent: "AUDIT",
      mode: "raises-concern",
      addressedTo: "VIZE",
      text: "No eligible market signal supports the venture.",
      evidenceRefs: ["budget-2026-08e"],
      sentAt: "2026-08-04T09:04:00.000Z"
    },
    {
      agent: "LEDGER",
      mode: "vote",
      text: "The operating cap holds.",
      sentAt: "2026-08-04T09:09:00.000Z"
    }
  ]
};

/**
 * Live meeting pages showed "Read every message." above nothing at all: the message list
 * was written inside the test-example replay, so a real morning, afternoon or night record
 * rendered its heading and none of its discussion. Both meeting pages now render from here.
 */
describe("the saved meeting messages", () => {
  const html = renderToStaticMarkup(<RoomMessageList transcript={transcript} />);

  it("renders one entry per saved turn, in order", () => {
    expect(html).toContain("#01");
    expect(html).toContain("#02");
    expect(html).toContain("#03");
    expect(html.indexOf("#01")).toBeLessThan(html.indexOf("#03"));
  });

  it("names the speaker by role and marks the safety reviewer", () => {
    expect(html).toContain("Strategy lead");
    expect(html).toContain("Safety reviewer");
    expect(html).toContain("To Strategy lead");
  });

  it("replaces internal codes in the message body", () => {
    expect(html).toContain("Strategy lead opens the meeting");
    expect(html).toContain("No eligible signs of interest supports the project.");
    expect(html).toContain("monthly spending limit");
    expect(html).not.toContain("VIZE opens");
  });

  it("keeps each source link on its message, in words", () => {
    // The pill used to print the stored reference, `budget-2026-08e`.
    expect(html).toContain("Budget decision, Aug 2026");
    expect(html).not.toContain("budget-2026-08e");
  });
});
