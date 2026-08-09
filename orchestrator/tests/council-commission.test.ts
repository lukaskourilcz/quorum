import { describe, expect, it } from "vitest";
import { PriorityItemSchema } from "../src/contracts/autonomy.js";
import type { PriorityItem } from "../src/contracts/autonomy.js";
import {
  councilVoteGate,
  resolveMorningCommission,
  resolveMorningCommissions,
  resolvePriorityProposal,
  schedulerBlockedReason
} from "../src/cycle.js";
import { loadMeetingPolicy, mayRequestMeeting, phaseNeedsAgenda } from "../src/meetings/agenda.js";
import {
  commissionableRooms,
  parseCouncilPosition,
  proposableVentureIds,
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
  pulse?: "approve" | "hold";
  request?: RecordedPosition["meetingRequest"];
  requests?: Partial<Record<RecordedPosition["agent"], RecordedPosition["meetingRequest"]>>;
  proposals?: Partial<Record<RecordedPosition["agent"], RecordedPosition["priorityProposal"]>>;
} = {}): RecordedPosition[] {
  return (["VIZE", "FORGE", "PULSE", "AUDIT"] as const).map((agent, index) => ({
    agent,
    publicSummary: `${agent} recorded a bounded public position.`,
    recommendation: agent === "AUDIT"
      ? overrides.audit ?? "approve"
      : agent === "PULSE"
        ? overrides.pulse ?? "approve"
        : "approve",
    risk: "Keep the work inside the internal operating queue.",
    meetingRequest: overrides.requests
      ? overrides.requests[agent] ?? null
      : agent === "VIZE" ? overrides.request ?? null : null,
    priorityProposal: overrides.proposals?.[agent] ?? null,
    sentAt: new Date(Date.parse("2026-08-03T04:00:00.000Z") + index * 1_000).toISOString()
  }));
}

const proposableVentures = proposableVentureIds(rooms);

const validProposal = {
  venture: "titty-tuesdays",
  question: "Which campaign format has never been tested against the season brief?",
  decisionAtStake: "Whether the next campaign slot repeats a tested format or trials a new one.",
  evidenceNeeded: ["campaign-inventory"]
};

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
    // Carousel Studio holds no meeting and the incubator is gone, so neither has a room the
    // morning board could commission. GoVIRAL does: an agenda is how a mid-week opening happens
    // at all, since the room otherwise only meets on Mondays.
    expect(rooms).toEqual([
      { ventureId: "titty-tuesdays", phase: "tt-marketing" },
      { ventureId: "goviral", phase: "gv-brief" },
      { ventureId: "fightaiq", phase: "mma-intake" },
      { ventureId: "mma-files", phase: "mag-desk" }
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
      openPriorities: [priority()],
      proposableVentures
    });

    expect(parsed.position.recommendation).toBe("approve");
    expect(parsed.position.meetingRequest).toBeNull();
    expect(parsed.droppedMeetingRequest).toContain("does not match the contract");
  });

  it("keeps the vote when the meeting request cites a priority item that is not open", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({ meetingRequest: { ...validRequest, priorityItemId: "priority-fedcba9876543210" } }),
      openPriorities: [priority()],
      proposableVentures
    });

    expect(parsed.position.recommendation).toBe("approve");
    expect(parsed.position.meetingRequest).toBeNull();
    expect(parsed.droppedMeetingRequest).toContain("priority-fedcba9876543210");
  });

  it("keeps a request that cites an open priority item", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({ meetingRequest: validRequest }),
      openPriorities: [priority()],
      proposableVentures
    });

    expect(parsed.position.meetingRequest).toEqual(validRequest);
    expect(parsed.droppedMeetingRequest).toBeNull();
  });

  it("treats a missing meetingRequest as null without complaint", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({}),
      openPriorities: [priority()],
      proposableVentures
    });

    expect(parsed.position.meetingRequest).toBeNull();
    expect(parsed.droppedMeetingRequest).toBeNull();
  });

  it("keeps the vote when an operations field is unusable, and says what it lost", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({
        ventureVerdicts: [
          { ventureId: "caught-up", verdict: "on-track", evidence: "Delivered on 2026-08-06." },
          { ventureId: "not-a-venture", verdict: "stalled", evidence: "Nothing shipped." }
        ],
        fixTask: { title: "Fix it" },
        growthIdea: { ventureId: "caught-up", title: "Wider mix", summary: "Add two feeds." }
      }),
      openPriorities: [priority()],
      proposableVentures,
      knownVentures: ["caught-up", "titty-tuesdays"]
    });

    expect(parsed.position.recommendation).toBe("approve");
    expect(parsed.position.ventureVerdicts).toEqual([
      { ventureId: "caught-up", verdict: "on-track", evidence: "Delivered on 2026-08-06." }
    ]);
    // The malformed fix task costs the task, never the seat.
    expect(parsed.position.fixTask).toBeNull();
    expect(parsed.position.growthIdea).toEqual({ ventureId: "caught-up", title: "Wider mix", summary: "Add two feeds." });
    expect(parsed.droppedOperations).toHaveLength(2);
    expect(parsed.droppedOperations.join(" ")).toContain("not-a-venture");
  });

  it("discards AUDIT's operations fields by role, because AUDIT proposes no work", () => {
    const parsed = parseCouncilPosition({
      agent: "AUDIT",
      text: JSON.stringify({
        agent: "AUDIT",
        publicSummary: "AUDIT recorded a bounded public position.",
        recommendation: "approve",
        risk: "Records match the day.",
        ventureVerdicts: [{ ventureId: "caught-up", verdict: "stalled", evidence: "Nothing shipped." }],
        fixTask: { title: "Fix it", scope: "orchestrator/src", expectedProof: "A passing gate." },
        growthIdea: { ventureId: "caught-up", title: "Wider mix", summary: "Add two feeds." }
      }),
      openPriorities: [],
      proposableVentures,
      knownVentures: ["caught-up"]
    });

    expect(parsed.position.recommendation).toBe("approve");
    expect(parsed.position.ventureVerdicts).toEqual([]);
    expect(parsed.position.fixTask).toBeNull();
    expect(parsed.position.growthIdea).toBeNull();
    expect(parsed.droppedOperations.join(" ")).toContain("AUDIT holds the veto");
  });

  it("still rejects a reply signed by another agent or missing its vote", () => {
    expect(() => parseCouncilPosition({
      agent: "FORGE",
      text: reply({ meetingRequest: null }),
      openPriorities: [],
      proposableVentures
    })).toThrow(/identity mismatch/);

    expect(() => parseCouncilPosition({
      agent: "VIZE",
      text: JSON.stringify({ agent: "VIZE", publicSummary: "x", risk: "y" }),
      openPriorities: [],
      proposableVentures
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
      positions: positions({ request: { ...validRequest, phase: "mag-desk" } }),
      openPriorities: [priority()]
    });

    expect(outcome.commission).toBe(false);
    if (outcome.commission) throw new Error("expected no commission");
    expect(outcome.reason).toContain("mma-files");
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
        positions: positions({ request: { ...validRequest, phase: "mag-desk" } }),
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
    expect(schedulerBlockedReason("mag-desk", "boom")).toContain("unknown scheduler error");
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
        positions: positions({ request: { ...validRequest, phase: "mag-desk" } }),
        openPriorities: [priority()]
      })
    ];

    for (const outcome of declines) {
      if (outcome.commission) throw new Error("expected no commission");
      expect(outcome.reason.length).toBeLessThanOrEqual(limit);
    }
  });
});

describe("proposing a new priority question", () => {
  it("tells the seats the fields, the one-per-meeting limit and that a topic is refused", () => {
    const prompt = roleSystem("VIZE", rooms);

    for (const field of ["venture", "question", "decisionAtStake", "evidenceNeeded"]) {
      expect(prompt).toContain(field);
    }
    expect(prompt).toContain("at most one question");
    expect(prompt).toContain("a topic, not work");
    expect(prompt).toContain("AUDIT never proposes");
    // Only ventures with a room this shift can open may be named, so a proposed question is
    // always one the board could later commission.
    for (const ventureId of proposableVentures) {
      expect(prompt).toContain(ventureId);
    }
  });

  it("tells a shift with no reachable room that it cannot propose either", () => {
    expect(roleSystem("PULSE", [])).toContain("No new question can be proposed");
  });

  it("keeps the vote when the proposal is malformed", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({ priorityProposal: { ...validProposal, decisionAtStake: "" } }),
      openPriorities: [priority()],
      proposableVentures
    });

    expect(parsed.position.recommendation).toBe("approve");
    expect(parsed.position.priorityProposal).toBeNull();
    expect(parsed.droppedPriorityProposal).toContain("does not match the contract");
  });

  it("refuses a question with no decision behind it", () => {
    const { decisionAtStake: _omitted, ...topicOnly } = validProposal;
    const parsed = parseCouncilPosition({
      agent: "FORGE",
      text: JSON.stringify({
        agent: "FORGE",
        publicSummary: "FORGE recorded a bounded public position.",
        recommendation: "approve",
        risk: "Keep the work inside the internal operating queue.",
        priorityProposal: topicOnly
      }),
      openPriorities: [priority()],
      proposableVentures
    });

    expect(parsed.position.priorityProposal).toBeNull();
    expect(parsed.droppedPriorityProposal).toContain("decisionAtStake");
  });

  it("refuses a venture this shift can commission no room for", () => {
    // caught-up owns only service rooms, so a question for it could never be answered.
    expect(proposableVentures).not.toContain("caught-up");
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({ priorityProposal: { ...validProposal, venture: "caught-up" } }),
      openPriorities: [priority()],
      proposableVentures
    });

    expect(parsed.position.priorityProposal).toBeNull();
    expect(parsed.droppedPriorityProposal).toContain("caught-up");
  });

  it("keeps a well-formed proposal", () => {
    const parsed = parseCouncilPosition({
      agent: "VIZE",
      text: reply({ priorityProposal: validProposal }),
      openPriorities: [priority()],
      proposableVentures
    });

    expect(parsed.position.priorityProposal).toEqual(validProposal);
    expect(parsed.droppedPriorityProposal).toBeNull();
  });

  it("takes one proposal from a meeting that carried, and counts the rest", () => {
    const decision = resolvePriorityProposal({
      positions: positions({ proposals: { VIZE: validProposal, PULSE: validProposal } })
    });

    expect(decision.kind).toBe("take");
    if (decision.kind !== "take") throw new Error("expected a proposal to be taken");
    expect(decision.proposedBy).toBe("VIZE");
    expect(decision.alsoProposed).toBe(1);
  });

  it("records nothing when no seat proposed", () => {
    expect(resolvePriorityProposal({ positions: positions() }).kind).toBe("none");
  });

  it("refuses a proposal on the same gate the commission uses, and says the vote", () => {
    const decision = resolvePriorityProposal({
      positions: positions({ audit: "hold", proposals: { VIZE: validProposal } })
    });

    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("expected a refusal");
    expect(decision.reason).toContain("AUDIT did not approve");
    expect(decision.reason).toContain("AUDIT plus three approvals");
    // Refused, but still attributed: a board that proposed and lost the vote is on the record.
    expect(decision.proposedBy).toBe("VIZE");
  });

  it("refuses a proposal that has AUDIT but only two approvals", () => {
    const decision = resolvePriorityProposal({
      positions: positions({ pulse: "hold", proposals: { FORGE: validProposal } })
    });

    // VIZE, FORGE and AUDIT approve, PULSE holds — three approvals, so the gate carries.
    expect(decision.kind).toBe("take");

    const short = positions({ pulse: "hold", proposals: { FORGE: validProposal } })
      .filter((position) => position.agent !== "VIZE");
    expect(resolvePriorityProposal({ positions: short }).kind).toBe("refuse");
  });

  it("never lets AUDIT author work for itself to audit", () => {
    const decision = resolvePriorityProposal({
      positions: positions({ proposals: { AUDIT: validProposal } })
    });

    expect(decision.kind).toBe("none");
  });

  it("uses one vote gate for both the commission and the proposal", () => {
    // The two paths must not be able to disagree about what "the meeting carried" means.
    for (const audit of ["approve", "hold"] as const) {
      const seats = positions({ audit, request: validRequest, proposals: { VIZE: validProposal } });
      const gate = councilVoteGate(seats);
      const commission = resolveMorningCommission({
        policy,
        registry,
        sourcePhase: "morning",
        positions: seats,
        openPriorities: [priority()]
      });
      const proposal = resolvePriorityProposal({ positions: seats });

      expect(commission.commission).toBe(gate.passed);
      expect(proposal.kind).toBe(gate.passed ? "take" : "refuse");
    }
  });
});

describe("how many rooms one morning opens", () => {
  const base = { policy, registry, sourcePhase: "morning" as const };
  const ttItem = priority();
  const mmaItem = priority({ id: "priority-fedcba9876543210", venture: "mma-files" });
  const editorialItem = priority({ id: "priority-aaaabbbbccccdddd", venture: "fightaiq" });
  const ttRequest = validRequest;
  const mmaRequest = {
    priorityItemId: mmaItem.id,
    phase: "mag-desk" as const,
    summary: "Decide whether tomorrow's article covers the main card or the prelims.",
    evidenceRefs: []
  };
  const editorialRequest = {
    priorityItemId: editorialItem.id,
    phase: "mma-intake" as const,
    summary: "Decide whether the roster backfill or the card gaps come first tomorrow.",
    evidenceRefs: []
  };

  // Four rooms need a bounded agenda every day; the morning could supply one. Thirteen of the
  // forty-four August meeting records are $0 pauses reading "no bounded agenda was due" — rooms
  // that were never given anything to meet about rather than rooms that declined to meet.
  it("commissions one room per project when several seats ask", () => {
    const resolved = resolveMorningCommissions({
      ...base,
      openPriorities: [ttItem, mmaItem],
      positions: positions({ requests: { VIZE: ttRequest, FORGE: mmaRequest } })
    });

    expect(resolved.commissions.map((entry) => entry.target.ventureId)).toEqual([
      "titty-tuesdays",
      "mma-files"
    ]);
    expect(resolved.commissions.map((entry) => entry.requestedBy)).toEqual(["VIZE", "FORGE"]);
  });

  it("drops a second request for a project another seat already took", () => {
    const resolved = resolveMorningCommissions({
      ...base,
      openPriorities: [ttItem, priority({ id: "priority-1111222233334444" })],
      positions: positions({
        requests: {
          VIZE: ttRequest,
          FORGE: { ...ttRequest, priorityItemId: "priority-1111222233334444" }
        }
      })
    });

    expect(resolved.commissions).toHaveLength(1);
    expect(resolved.commissions[0]?.requestedBy).toBe("VIZE");
  });

  it("never opens more rooms than the policy allows", () => {
    const resolved = resolveMorningCommissions({
      ...base,
      openPriorities: [ttItem, mmaItem, editorialItem],
      positions: positions({
        requests: { VIZE: ttRequest, FORGE: mmaRequest, PULSE: editorialRequest }
      })
    });

    expect(policy.maxRequestsPerMeeting).toBe(2);
    expect(resolved.commissions).toHaveLength(policy.maxRequestsPerMeeting);
  });

  it("commissions nothing and says why when the vote gate is not reached", () => {
    const resolved = resolveMorningCommissions({
      ...base,
      openPriorities: [ttItem, mmaItem],
      positions: positions({ audit: "hold", requests: { VIZE: ttRequest, FORGE: mmaRequest } })
    });

    expect(resolved.commissions).toEqual([]);
    expect(resolved.blockedReason).toContain("AUDIT did not approve");
  });

  it("names a reason a venture can be told even when no seat asked for anything", () => {
    const resolved = resolveMorningCommissions({
      ...base,
      openPriorities: [ttItem],
      positions: positions()
    });

    expect(resolved.commissions).toEqual([]);
    expect(resolved.blockedReason).toContain("no seat requested a room");
  });

  it("tells the seats one room per project is available", () => {
    const prompt = roleSystem("VIZE", rooms, policy.maxRequestsPerMeeting);

    expect(prompt).toContain("at most 2 rooms");
    expect(prompt).toContain("at most one per project");
  });
});
