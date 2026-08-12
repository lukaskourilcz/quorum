import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWriteProvider } from "./admin-write-mode";
import {
  doorMoneyActionCompletionEnvelope,
  DoorMoneyActionsPanel,
  type DoorMoneyActionsView
} from "./door-money-actions-panel";

const snapshot: DoorMoneyActionsView = {
  state: "present",
  unreadable: 0,
  packets: [{
    id: "fixture-packet-2026-08-12",
    date: "2026-08-12",
    agenda: "dm-growth",
    title: "Test the fictional radio pitch",
    summary: "Run one bounded synthetic outreach exercise and record the result.",
    tasks: [{
      id: "fixture-pitch-email",
      title: "Prepare the community-radio note",
      why: "A prepared note makes the manual test small enough to finish today.",
      steps: ["Review the invented station profile.", "Copy the draft and personalize it outside this panel."],
      templates: [{
        id: "fixture-email-template",
        label: "Community-radio pitch",
        kind: "pitch-email",
        body: "Hello, I’m testing a fictional neighborhood radio program. Would a short sample fit your imaginary schedule?"
      }],
      effort: "20 minutes",
      expectedImpact: "One clear signal from a synthetic prospect set.",
      status: "open",
      outcome: null,
      completedAt: null
    }, {
      id: "fixture-video-script",
      title: "Review the sample video script",
      why: "The fictional clip tests whether the premise is understood.",
      steps: ["Read the synthetic script aloud."],
      templates: [],
      effort: "10 minutes",
      expectedImpact: "A clearer first sentence.",
      status: "completed",
      outcome: "Reviewed with two synthetic listeners; both understood the premise.",
      completedAt: "2026-08-12T12:00:00.000Z"
    }]
  }],
  playbooks: [{
    id: "fixture-community-radio-playbook",
    channel: "Community radio",
    title: "Manual introduction playbook",
    revision: "fixture-r1",
    summary: "A read-only guide for an invented channel exercise.",
    steps: ["Confirm the fictional audience fit.", "Use the prepared draft as a starting point."],
    updatedAt: "2026-08-12",
    evidenceRefs: ["fixture-signal-01"]
  }]
};

describe("Door Money actions panel", () => {
  it("renders fixture packets, prepared templates, outcomes and read-only playbooks", () => {
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled>
        <DoorMoneyActionsPanel snapshot={snapshot} />
      </AdminWriteProvider>
    );

    expect(html).toContain("Today’s actions");
    expect(html).toContain("Community-radio pitch");
    expect(html).toContain("fictional neighborhood radio program");
    expect(html).toContain("20 minutes");
    expect(html).toContain("One clear signal from a synthetic prospect set.");
    expect(html).toContain("Outcome: Reviewed with two synthetic listeners");
    expect(html).toContain("Channel playbooks");
    expect(html).toContain("Read-only");
    expect(html).toContain("Outcome (required)");
    expect(html).toContain('required=""');
    expect(html).toContain("Mark complete");
  });

  it("disables the completion field and button when admin writes are off", () => {
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled={false}>
        <DoorMoneyActionsPanel snapshot={snapshot} />
      </AdminWriteProvider>
    );

    expect(html).toMatch(/<textarea[^>]*disabled=""/u);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark complete<\/button>/u);
  });

  it("isolates the future completion route envelope without inventing a contract", () => {
    expect(doorMoneyActionCompletionEnvelope("packet-1", "task-1", "  Sent 5; received 2 replies.  ")).toEqual({
      packetId: "packet-1",
      taskId: "task-1",
      outcome: "Sent 5; received 2 replies."
    });
    expect(doorMoneyActionCompletionEnvelope("packet-1", "task-1", "   ")).toBeNull();
    expect(doorMoneyActionCompletionEnvelope("packet-1", "task-1", "x".repeat(1_001))).toBeNull();
    expect(doorMoneyActionCompletionEnvelope("bad\npacket", "task-1", "done")).toBeNull();
  });

  it("names an absent store instead of inventing actions", () => {
    const html = renderToStaticMarkup(
      <DoorMoneyActionsPanel snapshot={{ state: "missing", packets: [], playbooks: [], unreadable: 0 }} />
    );
    expect(html).toContain("No Door Money action packets or playbooks exist yet.");
  });
});
