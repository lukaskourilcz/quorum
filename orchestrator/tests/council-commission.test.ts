import { describe, expect, it } from "vitest";
import { PriorityItemSchema } from "../src/contracts/autonomy.js";
import type { PriorityItem } from "../src/contracts/autonomy.js";
import {
  resolveMorningCommission,
  schedulerBlockedReason
} from "../src/cycle.js";
import { loadMeetingPolicy, mayRequestMeeting, phaseNeedsAgenda } from "../src/meetings/agenda.js";
import {
  commissionableRooms,
  parseCouncilPosition,
  roleSystem,
  type RecordedPosition
} from "../src/standup/live.js";
import { StandupSchema } from "../src/standup/schema.js";
import { getVentureMeetingDefinition, loadVentureRegistry } from "../src/ventures/registry.js";

const [policy, registry] = await Promise.all([loadMeetingPolicy(), loadVentureRegistry()]);
const rooms = commissionableRooms({ registry, policy, sourcePhase: "morning" });

function priority(overrides: Partial<PriorityItem> = {}): PriorityItem {
  return PriorityItemSchema.parse({
    schemaVersion: "priority-item/1",
    id: "priority-0123456789abcdef",
    venture: "titty-tuesdays",
    question: "What is currently blocking the campaign inventory?",
    decision_at_stake: "Which bounded action fills the next campaign slot.",
    evidence_needed: ["campaign-inventory"],
    requested_by: "VIZE",
    created: "2026-08-03T04:00:00.000Z",
    expires: "2026-08-10T04:00:00.000Z",
    status: "open",
    why_not_reason: null,
    consumed_by: null,
    ...overrides
  });
}

function positions(overrides: {
  audit?: "approve" | "hold";
  request?: RecordedPosition["meetingRequest"];
} = {}): RecordedPosition[] {
  return (["VIZE", "FORGE", "PULSE", "AUDIT"] as const).map((agent, index) => ({
    agent,
    publicSummary: `${agent} recorded a bounded public position.`,
    recommendation: agent === "AUDIT" ? overrides.audit ?? "approve" : "approve",
    risk: "Keep the work inside the internal operating queue.",
    meetingRequest: agent === "VIZE" ? overrides.request ?? null : null,
    sentAt: new Date(Date.parse("2026-08-03T04:00:00.000Z") + index * 1_000).toISOString()
  }));
}

const validRequest = {
  priorityItemId: "priority-0123456789abcdef",
  phase: "tt-marketing" as const,
  summary: "Decide the next bounded campaign action.",
  evidenceRefs: []
};

function reply(body: Record<string, unknown>): string {
  return JSON.stringify({
    agent: "VIZE",
    publicSummary: "VIZE recorded a bounded public position.",
    recommendation: "approve",
    risk: "Keep the work inside the internal operating queue.",
    ...body
  });
}

describe("commissionable rooms", () => {
  it("pairs every morning-requestable room with the venture the gate will check it against", () => {
    expect(rooms).toEqual([
      { ventureId: "titty-tuesdays", phase: "tt-marketing" },
      { ventureId: "incubator", phase: "incubator-scan" },
      { ventureId: "fightaiq", phase: "mma-intake" },
      { ventureId: "mma-files", phase: "mag-desk" },
      { ventureId: "carousel-studio", phase: "studio" }
    ]);

    for (const room of rooms) {
      expect(mayRequestMeeting(policy, "morning", room.phase)).toBe(true);
      expect(getVentureMeetingDefinition(registry, room.phase).ventureId).toBe(room.ventureId);
    }
  });

  it("offers a room to every venture whose priority queue the morning board seeds", () => {
    // runCycle seeds an open priority item for each venture that owns an agenda-required room.
    // A seeded venture with no reachable room would have its item skipped every single morning.
    const seeded = registry.ventures
      .filter((venture) => venture.meetings.some((meeting) => phaseNeedsAgenda(policy, meeting.kind)))
      .map((venture) => venture.id);

    expect(seeded.length).toBeGreaterThan(0);
    for (const ventureId of seeded) {
      expect(rooms.map((room) => room.ventureId)).toContain(ventureId);
    }
  });
});

describe("council role prompt", () => {
  it("states which room belongs to which venture", () => {
    const prompt = roleSystem("VIZE", rooms);

    for (const room of rooms) {
      expect(prompt).toContain(`${room.ventureId} -> ${room.phase}`);
    }
  });

  it("never names a room the morning board is not allowed to commission", () => {
    const prompt = roleSystem("FORGE", rooms);
    const unreachable = ["mma-analysis", "incubator-synthesis", "cu-edition", "cu-product"];

    for (const phase of unreachable) {
      expect(mayRequestMeeting(policy, "morning", phase as never)).toBe(false);
      expect(prompt).not.toContain(phase);
    }
  });

  it("tells a shift with no reachable room to return meetingRequest:null", () => {
    expect(roleSystem("PULSE", [])).toContain("No specialist room can be commissioned");
  });
});

describe("parsing one council position", () => {
  it("keeps the vote when the optional meeting request is malformed", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({ meetingRequest: { ...validRequest, priorityItemId: "priority-1" } }),
      openPriorities: [priority()]
    });

    expect(parsed.position.recommendation).toBe("approve");
    expect(parsed.position.meetingRequest).toBeNull();
    expect(parsed.droppedMeetingRequest).toContain("does not match the contract");
  });

  it("keeps the vote when the meeting request cites a priority item that is not open", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({ meetingRequest: { ...validRequest, priorityItemId: "priority-fedcba9876543210" } }),
      openPriorities: [priority()]
    });

    expect(parsed.position.recommendation).toBe("approve");
    expect(parsed.position.meetingRequest).toBeNull();
    expect(parsed.droppedMeetingRequest).toContain("priority-fedcba9876543210");
  });

  it("keeps a request that cites an open priority item", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({ meetingRequest: validRequest }),
      openPriorities: [priority()]
    });

    expect(parsed.position.meetingRequest).toEqual(validRequest);
    expect(parsed.droppedMeetingRequest).toBeNull();
  });

  it("treats a missing meetingRequest as null without complaint", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({}),
      openPriorities: [priority()]
    });

    expect(parsed.position.meetingRequest).toBeNull();
    expect(parsed.droppedMeetingRequest).toBeNull();
  });

  it("still rejects a reply signed by another agent or missing its vote", () => {
    expect(() => parseCouncilPosition({
      agent: "FORGE",
      text: reply({ meetingRequest: null }),
      openPriorities: []
    })).toThrow(/identity mismatch/);

    expect(() => parseCouncilPosition({
      agent: "VIZE",
      text: JSON.stringify({ agent: "VIZE", publicSummary: "x", risk: "y" }),
      openPriorities: []
    })).toThrow();
  });
});

describe("morning commission gate", () => {
  const base = { policy, registry, sourcePhase: "morning" };

  it("commissions the requested room when it belongs to the cited item's venture", () => {
    const outcome = resolveMorningCommission({
      ...base,
      positions: positions({ request: validRequest }),
      openPriorities: [priority()]
    });

    expect(outcome.commission).toBe(true);
    if (!outcome.commission) throw new Error("expected a commission");
    expect(outcome.requestedBy).toBe("VIZE");
    expect(outcome.target.ventureId).toBe("titty-tuesdays");
    expect(outcome.priority.id).toBe("priority-0123456789abcdef");
  });

  it("says which room was asked for when the morning board may not commission it", () => {
    const outcome = resolveMorningCommission({
      ...base,
      positions: positions({ request: { ...validRequest, phase: "mma-analysis" } }),
      openPriorities: [priority({ venture: "fightaiq" })]
    });

    expect(outcome.commission).toBe(false);
    if (outcome.commission) throw new Error("expected no commission");
    expect(outcome.reason).toContain("mma-analysis");
    expect(outcome.reason).toContain("may not commission");
    expect(outcome.reason).not.toContain("did not reach the commission gate");
  });

  it("says whose item was cited when the room belongs to another venture", () => {
    const outcome = resolveMorningCommission({
      ...base,
      positions: positions({ request: { ...validRequest, phase: "studio" } }),
      openPriorities: [priority()]
    });

    expect(outcome.commission).toBe(false);
    if (outcome.commission) throw new Error("expected no commission");
    expect(outcome.reason).toContain("carousel-studio");
    expect(outcome.reason).toContain("titty-tuesdays");
  });

  it("reports the vote count when the gate itself was not reached", () => {
    const outcome = resolveMorningCommission({
      ...base,
      positions: positions({ audit: "hold", request: validRequest }),
      openPriorities: [priority()]
    });

    expect(outcome.commission).toBe(false);
    if (outcome.commission) throw new Error("expected no commission");
    expect(outcome.reason).toContain("AUDIT did not approve");
    expect(outcome.reason).toContain("4 seats");
  });

  it("never returns an empty or placeholder reason for any way of declining", () => {
    const declines = [
      resolveMorningCommission({ ...base, positions: positions(), openPriorities: [priority()] }),
      resolveMorningCommission({
        ...base,
        positions: positions({ request: { ...validRequest, phase: "mma-analysis" } }),
        openPriorities: [priority()]
      }),
      resolveMorningCommission({
        ...base,
        positions: positions({ request: { ...validRequest, phase: "studio" } }),
        openPriorities: [priority()]
      })
    ];

    for (const outcome of declines) {
      expect(outcome.commission).toBe(false);
      if (outcome.commission) throw new Error("expected no commission");
      expect(outcome.reason.trim().length).toBeGreaterThan(20);
    }
    expect(new Set(declines.map((outcome) => outcome.commission === false && outcome.reason)).size)
      .toBe(declines.length);
  });
});

describe("scheduler refusal", () => {
  it("names the room and the queue's own message", () => {
    const reason = schedulerBlockedReason(
      "tt-marketing",
      new Error("Venture titty-tuesdays reached its 8-item pending limit")
    );

    expect(reason).toContain("tt-marketing");
    expect(reason).toContain("8-item pending limit");
  });

  it("still reads as a sentence when the scheduler threw a non-Error", () => {
    expect(schedulerBlockedReason("studio", "boom")).toContain("unknown scheduler error");
  });
});

describe("every published reason fits the standup record", () => {
  // StandupSchema caps a starvation-review reason at 280 characters. A longer one does not get
  // truncated on the way in, it fails the parse and the morning is never written — so the reason
  // for not commissioning must never be able to stop the standup from being published.
  const limit = 280;

  it("keeps a scheduler message that arrives far too long inside the cap", () => {
    const reason = schedulerBlockedReason("tt-marketing", new Error("x".repeat(4_000)));

    expect(reason.length).toBeLessThanOrEqual(limit);
    expect(StandupSchema.shape.starvationReview.unwrap().element.shape.reason.safeParse(reason).success)
      .toBe(true);
  });

  it("keeps every gate reason inside the cap", () => {
    const declines = [
      resolveMorningCommission({
        policy, registry, sourcePhase: "morning",
        positions: positions(),
        openPriorities: [priority()]
      }),
      resolveMorningCommission({
        policy, registry, sourcePhase: "morning",
        positions: positions({ request: { ...validRequest, phase: "mma-analysis" } }),
        openPriorities: [priority()]
      }),
      resolveMorningCommission({
        policy, registry, sourcePhase: "morning",
        positions: positions({ request: { ...validRequest, phase: "studio" } }),
        openPriorities: [priority()]
      })
    ];

    for (const outcome of declines) {
      if (outcome.commission) throw new Error("expected no commission");
      expect(outcome.reason.length).toBeLessThanOrEqual(limit);
    }
  });
});
