import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MeetingAgendaQueueSchema } from "../src/contracts/meeting-agenda.js";
import {
  MEETING_AGENDA_PATH,
  consumeMeetingAgenda,
  dueMeetingAgenda,
  loadMeetingPolicy,
  mayRequestMeeting,
  nextAgendaDate,
  phaseHasStandingAgenda,
  phaseNeedsAgenda,
  readMeetingAgendaQueue,
  requestMeetingAgenda,
  starvationList
} from "../src/meetings/agenda.js";

describe("meeting agenda queue", () => {
  it("allows only bounded transitions and picks the next available room date", async () => {
    const policy = await loadMeetingPolicy();
    expect(mayRequestMeeting(policy, "morning", "tt-marketing")).toBe(true);
    // Transitions are bounded, not a free-for-all: the morning board opens the rooms that read
    // its own record, and `mma-analysis` is not one of them — it is commissioned by mma-intake,
    // which is the room that produces the material it analyses. The studio and both incubator
    // rooms used to be checked here; those phases are out of the agenda contract entirely now,
    // so the type system refuses them before this assertion could.
    expect(mayRequestMeeting(policy, "morning", "mma-analysis")).toBe(false);
    expect(mayRequestMeeting(policy, "morning", "mag-desk")).toBe(true);
    expect(policy.agendaRequiredPhases).toContain("mag-desk");
    expect(phaseNeedsAgenda(policy, "tt-marketing")).toBe(false);
    expect(phaseHasStandingAgenda(policy, "tt-marketing")).toBe(true);
    expect(phaseHasStandingAgenda(policy, "bh-desk")).toBe(true);
    expect((policy.transitions["gv-brief"] ?? []).filter((phase) => phase === "bh-desk")).toHaveLength(1);
    expect((policy.transitions["bh-desk"] ?? []).filter((phase) => phase === "gv-brief")).toHaveLength(1);
    expect(mayRequestMeeting(policy, "gv-brief", "bh-desk")).toBe(true);
    expect(mayRequestMeeting(policy, "bh-desk", "gv-brief")).toBe(true);
    expect(policy).toMatchObject({
      maxPending: 24,
      perVenturePendingCap: 8,
      maxRequestsPerMeeting: 2,
      ttlDays: 3
    });
    expect(policy.servicePhases).not.toContain("tt-marketing");
    expect(mayRequestMeeting(policy, "tt-marketing", "mma-analysis")).toBe(false);
    expect(nextAgendaDate({ currentDate: "2026-08-01", currentHour: 6, targetHour: 11 }))
      .toBe("2026-08-01");
    expect(nextAgendaDate({ currentDate: "2026-08-01", currentHour: 20, targetHour: 7 }))
      .toBe("2026-08-02");
  });

  it("deduplicates, consumes and expires agenda requests", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-agenda-"));
    const policy = await loadMeetingPolicy();
    const request = {
      root,
      policy,
      ventureId: "mma-files",
      phase: "mag-desk" as const,
      requestedBy: "PULSE",
      sourcePhase: "morning",
      sourceMeetingRef: "standups/2026-08-01-morning",
      summary: "Decide tomorrow's angle between the main card and the prelims.",
      notBefore: "2026-08-01",
      now: new Date("2026-08-01T04:00:00.000Z")
    };
    const first = await requestMeetingAgenda(request);
    const duplicate = await requestMeetingAgenda(request);
    expect(first.created).toBe(true);
    expect(duplicate).toEqual({ agenda: first.agenda, created: false });
    const queue = await readMeetingAgendaQueue(root, request.now);
    expect(dueMeetingAgenda(queue, "mag-desk", "2026-08-01")?.id).toBe(first.agenda.id);

    await consumeMeetingAgenda({
      root,
      agendaId: first.agenda.id,
      cycleId: "20260801200000-mag-desk",
      now: new Date("2026-08-01T05:10:00.000Z")
    });
    const consumed = MeetingAgendaQueueSchema.parse(JSON.parse(await readFile(
      path.join(root, MEETING_AGENDA_PATH),
      "utf8"
    )));
    expect(consumed.agendas[0]).toMatchObject({
      status: "consumed",
      consumedBy: "20260801200000-mag-desk"
    });

    const expiring = await requestMeetingAgenda({
      ...request,
      phase: "mag-desk",
      ventureId: "mma-files",
      summary: "Review the article result only if the desk still has an open question.",
      notBefore: "2026-08-02",
      now: new Date("2026-08-01T04:01:00.000Z")
    });
    const expired = await readMeetingAgendaQueue(root, new Date("2026-08-06T00:00:00.000Z"));
    expect(expired.agendas.find((agenda) => agenda.id === expiring.agenda.id)?.status).toBe("expired");
  });

  it("enforces the per-venture cap and lists starved ventures", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-agenda-cap-"));
    const base = await loadMeetingPolicy();
    const policy = { ...base, perVenturePendingCap: 1 };
    const now = new Date("2026-08-08T04:00:00.000Z");
    await requestMeetingAgenda({
      root, policy, ventureId: "fightaiq", phase: "mma-intake", requestedBy: "PULSE",
      sourcePhase: "morning", sourceMeetingRef: "standups/2026-08-08-morning",
      summary: "Check a cited reader problem.", notBefore: "2026-08-08", now
    });
    await expect(requestMeetingAgenda({
      root, policy, ventureId: "fightaiq", phase: "mma-intake", requestedBy: "PULSE",
      sourcePhase: "morning", sourceMeetingRef: "standups/2026-08-08-morning",
      summary: "Check the next cited reader problem.", notBefore: "2026-08-09", now
    })).rejects.toThrow("1-item pending limit");
    const queue = await readMeetingAgendaQueue(root, now);
    expect(starvationList({ queue, ventureIds: ["fightaiq", "mma-files"], now }))
      .toEqual([
        { ventureId: "fightaiq", lastConsumedAt: null, daysWithoutConsumedAgenda: null },
        { ventureId: "mma-files", lastConsumedAt: null, daysWithoutConsumedAgenda: null }
      ]);
  });
});
