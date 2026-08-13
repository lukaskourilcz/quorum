import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import type { guardedJsonCall } from "../src/llm/call.js";
import {
  MEETING_AGENDA_PATH,
  loadMeetingPolicy,
  readMeetingAgendaQueue,
  requestMeetingAgenda
} from "../src/meetings/agenda.js";
import { runTehdejsiSvetCycle } from "../src/ventures/tehdejsi-svet/run.js";
import { readTehdejsiCycle, tehdejsiCycleComplete } from "../src/ventures/tehdejsi-svet/state.js";

const temporaryRoots: string[] = [];

async function temporaryState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-svet-cycle-"));
  temporaryRoots.push(root);
  return root;
}

function completeCycleFixtureCall(): typeof guardedJsonCall {
  const replies = [
    {
      briefs: [{
        factId: "cs-1970s-vecernicek",
        angle: "A small recorded evening ritual that invites one family question.",
        slideBeats: [
          { beat: "Open on the tune as an evening marker.", claimIds: ["evening-slot"] },
          { beat: "Place the programme in the recorded household routine.", claimIds: ["evening-slot"] },
          { beat: "Ask who switched it on at home.", claimIds: [] }
        ],
        claims: [{
          claimId: "evening-slot",
          statement: "The short programme occupied a regular evening slot before bedtime.",
          factIds: ["cs-1970s-vecernicek"]
        }],
        ctaKind: "ask-your-parents"
      }]
    },
    {
      slides: [
        { ordinal: 1, text: "Večer měl krátkou znělku. Domácnost věděla, že den končí." },
        { ordinal: 2, text: "Krátký pořad patřil do pravidelného času před spaním." },
        { ordinal: 3, text: "Kdo ho u vás doma zapínal?" }
      ],
      caption: "Krátký večerní zvuk označoval rodinný rytmus. Koho se zeptáte?",
      contextLine: null
    },
    {
      slides: [
        { ordinal: 1, text: "Вечір мав коротку мелодію, і родина знала, що день завершується." },
        { ordinal: 2, text: "Коротка програма мала постійне місце перед сном." },
        { ordinal: 3, text: "Хто вмикав її у вашій родині?" }
      ],
      caption: "Короткий вечірній звук позначав ритм родини. Кого ви запитаєте?"
    }
  ];
  let index = 0;
  return (async (request: { parse: (text: string) => unknown }) => ({
    value: request.parse(JSON.stringify(replies[index++])),
    cached: false,
    usd: 0
  })) as unknown as typeof guardedJsonCall;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.MEETING_TRIGGER;
  delete process.env.PORTFOLIO_LIVE_ENABLED;
});

describe("Tehdejsi svet desk", () => {
  it("walks the complete two-day pipeline through labelled dry fixture calls", async () => {
    const root = await temporaryState();
    const call = completeCycleFixtureCall();

    const planning = await runTehdejsiSvetCycle({
      executionCycleId: "20260813160000-ts-desk",
      dry: true,
      now: new Date("2026-08-13T16:00:00.000Z"),
      root,
      call
    });
    expect(planning).toMatchObject({ status: "dry_complete", decision: "PLAN", selectedAgents: ["LETOPIS"] });

    const production = await runTehdejsiSvetCycle({
      executionCycleId: "20260814160000-ts-desk",
      dry: true,
      now: new Date("2026-08-14T16:00:00.000Z"),
      root,
      call
    });
    expect(production).toMatchObject({
      status: "dry_complete",
      decision: "PLAN",
      selectedAgents: ["LETOPIS", "VERBA"]
    });
    expect(production.artifacts.some((entry) => entry.includes("/drafts/"))).toBe(true);
    expect(tehdejsiCycleComplete(await readTehdejsiCycle(root))).toBe(true);

    const record = MeetingRecordSchema.parse(JSON.parse(
      await readFile(path.join(root, "meetings", "2026-08-14-ts-desk.json"), "utf8")
    ));
    expect(record).toMatchObject({ fixture: true, ledger: { actualCycleUsd: 0 } });
  });

  it("keeps a scheduled live phase paused behind the pending founding decision at $0", async () => {
    const root = await temporaryState();
    process.env.MEETING_TRIGGER = "schedule";

    const result = await runTehdejsiSvetCycle({
      executionCycleId: "20260812160000-ts-desk",
      dry: false,
      now: new Date("2026-08-12T16:00:00.000Z"),
      root
    });

    expect(result).toMatchObject({ status: "paused", decision: "PAUSED", estimatedWorstCaseUsd: 0 });
    expect(result.selectedAgents).toEqual([]);
    const record = JSON.parse(await readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8"));
    expect(MeetingRecordSchema.safeParse(record).success).toBe(true);
    expect(record.ledger).toMatchObject({ estimatedCycleUsd: 0, actualCycleUsd: 0 });
    // The room records the closed paid path rather than reporting a meeting that never happened.
    expect(record.participantReasons.every((entry: { participated: boolean }) => !entry.participated)).toBe(true);
    expect(record.decision.evidenceRefs).toContain("decisions/2026-08-12-tehdejsi-svet-founding.md");
    const cycle = await readTehdejsiCycle(root);
    expect(cycle).toMatchObject({
      phase: "planning",
      dayStatuses: { planning: "active", production: "pending" },
      chosenFactIds: [],
      stretch: { count: 1, reason: "review-required", nextAttemptOn: "2026-08-13" }
    });
    expect(result.artifacts.some((entry) => entry.includes("shortlists/2026-08-12.json"))).toBe(true);
  });

  it("leads with and consumes the one due GoVIRAL agenda after the desk checkpoint is durable", async () => {
    const root = await temporaryState();
    const now = new Date("2026-08-12T16:00:00.000Z");
    const summary = "Decide whether the recorded family-memory signal changes today's timing priority.";
    const requested = await requestMeetingAgenda({
      root,
      policy: await loadMeetingPolicy(),
      ventureId: "tehdejsi-svet",
      phase: "ts-desk",
      requestedBy: "PULSE",
      sourcePhase: "gv-brief",
      sourceMeetingRef: "meetings/2026-08-12-gv-brief",
      summary,
      evidenceRefs: ["ventures/goviral/plans/2026-08-12.json"],
      notBefore: "2026-08-12",
      now
    });
    process.env.MEETING_TRIGGER = "schedule";

    const result = await runTehdejsiSvetCycle({
      executionCycleId: "20260812160000-ts-desk-agenda",
      dry: false,
      now,
      root
    });

    expect(result.artifacts).toContain(path.relative(
      path.resolve(import.meta.dirname, "../.."),
      path.join(root, MEETING_AGENDA_PATH)
    ));
    const record = MeetingRecordSchema.parse(JSON.parse(
      await readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8")
    ));
    expect(record.operatingBrief).toContain(summary);
    expect(record.agendaRef).toBe(`${MEETING_AGENDA_PATH}#${requested.agenda.id}`);
    expect(record.decision.evidenceRefs).toContain("ventures/goviral/plans/2026-08-12.json");
    const queue = await readMeetingAgendaQueue(root, now);
    expect(queue.agendas[0]).toMatchObject({
      id: requested.agenda.id,
      status: "consumed",
      consumedBy: "20260812160000-ts-desk-agenda"
    });
  });

  it("writes nothing when a closed live room is invoked by hand", async () => {
    const root = await temporaryState();

    const result = await runTehdejsiSvetCycle({
      executionCycleId: "20260812170000-ts-desk",
      dry: false,
      now: new Date("2026-08-12T17:00:00.000Z"),
      root
    });

    expect(result).toMatchObject({ status: "paused", decision: "PAUSED", artifacts: [] });
    await expect(readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("treats a second firing for a recorded date as a no-op", async () => {
    const root = await temporaryState();
    process.env.MEETING_TRIGGER = "schedule";
    const now = new Date("2026-08-12T16:00:00.000Z");
    await runTehdejsiSvetCycle({ executionCycleId: "20260812160000-ts-desk", dry: false, now, root });
    const first = await readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8");

    const duplicate = await runTehdejsiSvetCycle({
      executionCycleId: "20260812161500-ts-desk",
      dry: false,
      now: new Date("2026-08-12T16:15:00.000Z"),
      root
    });

    expect(duplicate).toMatchObject({ status: "already_recorded", decision: "NO_ACTION", artifacts: [] });
    expect(await readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8")).toBe(first);
  });
});
