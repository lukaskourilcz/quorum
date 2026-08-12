import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBooksofHistoryCycle } from "../src/ventures/booksofhistory/run.js";
import {
  MEETING_AGENDA_PATH,
  loadMeetingPolicy,
  readMeetingAgendaQueue,
  requestMeetingAgenda
} from "../src/meetings/agenda.js";
import {
  applyBooksofHistoryCycleDay,
  booksofHistoryCycleComplete,
  createBooksofHistoryCycle,
  readBooksofHistoryCycle
} from "../src/ventures/booksofhistory/state.js";

const temporaryRoots: string[] = [];

async function temporaryState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "booksofhistory-cycle-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.MEETING_TRIGGER;
});

describe("BOOKSOFHISTORY cycle state", () => {
  it("advances only on completion and stretches under budget pressure", () => {
    const initial = createBooksofHistoryCycle({
      date: "2026-08-12",
      now: new Date("2026-08-12T10:00:00.000Z")
    });
    const pressured = applyBooksofHistoryCycleDay({
      cycle: initial,
      date: "2026-08-12",
      now: new Date("2026-08-12T10:05:00.000Z"),
      outcome: { completed: false, pressure: "budget-pressure" }
    });
    expect(pressured.phase).toBe("selection");
    expect(pressured.dayStatuses.selection).toBe("active");
    expect(pressured.stretch).toEqual({
      count: 1,
      reason: "budget-pressure",
      nextAttemptOn: "2026-08-13"
    });

    const advanced = applyBooksofHistoryCycleDay({
      cycle: pressured,
      date: "2026-08-13",
      now: new Date("2026-08-13T10:00:00.000Z"),
      outcome: { completed: true }
    });
    expect(advanced.phase).toBe("research");
    expect(advanced.dayStatuses).toEqual({ selection: "completed", research: "active", production: "pending" });
  });

  it("resumes the current phase after a missed working day instead of skipping it", () => {
    const selection = applyBooksofHistoryCycleDay({
      cycle: createBooksofHistoryCycle({
        date: "2026-08-12",
        now: new Date("2026-08-12T10:00:00.000Z")
      }),
      date: "2026-08-12",
      now: new Date("2026-08-12T10:01:00.000Z"),
      outcome: { completed: true }
    });
    const resumed = applyBooksofHistoryCycleDay({
      cycle: selection,
      date: "2026-08-14",
      now: new Date("2026-08-14T10:00:00.000Z"),
      outcome: { completed: true }
    });

    expect(resumed.phase).toBe("production");
    expect(resumed.dayStatuses.research).toBe("completed");
    expect(resumed.stretch).toEqual({ count: 1, reason: "missed-day", nextAttemptOn: "2026-08-14" });
  });

  it("records shelf-backed research as not needed rather than skipped", () => {
    const cycle = createBooksofHistoryCycle({
      date: "2026-08-12",
      now: new Date("2026-08-12T10:00:00.000Z")
    });
    const production = applyBooksofHistoryCycleDay({
      cycle,
      date: "2026-08-12",
      now: new Date("2026-08-12T10:01:00.000Z"),
      outcome: { completed: true, shelfShortcut: true }
    });
    expect(production.phase).toBe("production");
    expect(production.dayStatuses.research).toBe("not-needed");
  });
});

describe("BOOKSOFHISTORY dry runner", () => {
  it("walks selection, research and production across three $0 invocations", async () => {
    const root = await temporaryState();
    const dates = ["2026-08-12", "2026-08-13", "2026-08-14"];
    const results = [];
    for (const [index, date] of dates.entries()) {
      results.push(await runBooksofHistoryCycle({
        executionCycleId: `202608${String(12 + index).padStart(2, "0")}100000-bh-desk`,
        dry: true,
        now: new Date(`${date}T10:00:00.000Z`),
        root
      }));
    }

    expect(results.map((result) => result.status)).toEqual(["dry_complete", "dry_complete", "dry_complete"]);
    expect(results.map((result) => result.estimatedWorstCaseUsd)).toEqual([0, 0, 0]);
    const records = await Promise.all(dates.map((date) =>
      readFile(path.join(root, "meetings", `${date}-bh-desk.json`), "utf8").then(JSON.parse)
    ));
    expect(records.map((record) => record.ledger.actualCycleUsd)).toEqual([0, 0, 0]);
    expect(records.map((record) => record.decision.summary)).toEqual([
      expect.stringContaining("selection"),
      expect.stringContaining("research"),
      expect.stringContaining("production")
    ]);
    const shortlist = JSON.parse(await readFile(
      path.join(root, "ventures", "booksofhistory", "shortlists", "2026-08-12.json"),
      "utf8"
    ));
    expect(shortlist).toMatchObject({ schemaVersion: "bh-shortlist/1", date: "2026-08-12" });
    expect(shortlist.entries).toHaveLength(10);
    expect(records[0].decision.evidenceRefs).toContain("ventures/booksofhistory/shortlists/2026-08-12.json");
    await expect(readFile(
      path.join(root, "ventures", "booksofhistory", "shortlists", "2026-08-13.json"),
      "utf8"
    )).rejects.toMatchObject({ code: "ENOENT" });
    const cycle = await readBooksofHistoryCycle(root);
    expect(cycle).not.toBeNull();
    expect(booksofHistoryCycleComplete(cycle!)).toBe(true);

    const duplicate = await runBooksofHistoryCycle({
      executionCycleId: "duplicate-bh-desk",
      dry: true,
      now: new Date("2026-08-14T10:30:00.000Z"),
      root
    });
    expect(duplicate.status).toBe("already_recorded");
    expect(await readBooksofHistoryCycle(root)).toEqual(cycle);
  });

  it("keeps a scheduled live phase paused behind the pending founding decision", async () => {
    const root = await temporaryState();
    process.env.MEETING_TRIGGER = "schedule";
    const result = await runBooksofHistoryCycle({
      executionCycleId: "20260812100000-bh-desk",
      dry: false,
      now: new Date("2026-08-12T10:00:00.000Z"),
      root
    });
    expect(result).toMatchObject({ status: "paused", decision: "PAUSED", estimatedWorstCaseUsd: 0 });
    const record = JSON.parse(await readFile(path.join(root, "meetings", "2026-08-12-bh-desk.json"), "utf8"));
    expect(record.ledger.actualCycleUsd).toBe(0);
    expect((await readBooksofHistoryCycle(root))?.phase).toBe("selection");
  });

  it("reads and consumes the one due gv-brief agenda after recording the desk checkpoint", async () => {
    const root = await temporaryState();
    const now = new Date("2026-08-12T10:00:00.000Z");
    const summary = "Decide whether the recorded anniversary signal changes this cycle's shortlist.";
    const requested = await requestMeetingAgenda({
      root,
      policy: await loadMeetingPolicy(),
      ventureId: "booksofhistory",
      phase: "bh-desk",
      requestedBy: "PULSE",
      sourcePhase: "gv-brief",
      sourceMeetingRef: "meetings/2026-08-12-gv-brief",
      summary,
      evidenceRefs: ["ventures/goviral/plans/2026-08-12.json"],
      notBefore: "2026-08-12",
      now
    });
    process.env.MEETING_TRIGGER = "schedule";

    const result = await runBooksofHistoryCycle({
      executionCycleId: "20260812120000-bh-desk",
      dry: false,
      now,
      root
    });

    expect(result.artifacts).toContain(path.relative(
      path.resolve(import.meta.dirname, "../.."),
      path.join(root, MEETING_AGENDA_PATH)
    ));
    const record = JSON.parse(await readFile(path.join(root, "meetings", "2026-08-12-bh-desk.json"), "utf8"));
    expect(record.operatingBrief).toContain(summary);
    expect(record.decision.evidenceRefs).toContain(`${MEETING_AGENDA_PATH}#${requested.agenda.id}`);
    const queue = await readMeetingAgendaQueue(root, now);
    expect(queue.agendas[0]).toMatchObject({
      id: requested.agenda.id,
      status: "consumed",
      consumedBy: "20260812120000-bh-desk"
    });
  });
});
