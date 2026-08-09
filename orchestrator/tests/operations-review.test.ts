import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOperationsPacket, mondayOf } from "../src/operations/packet.js";
import { MAX_FIX_TASKS, MAX_GROWTH_IDEAS, resolveOperationsReview, writeOperationsDecision } from "../src/operations/review.js";
import { resolveRotationTarget } from "../src/operations/rotation.js";
import { roleSystem } from "../src/standup/live.js";
import { repoRoot } from "../src/paths.js";

async function json(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe("the operations packet", () => {
  it("names every meeting that did not happen, and the ones with no record either way", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-ops-packet-"));
    await json(path.join(stateRoot, "calendar", `${mondayOf("2026-08-06")}.json`), {
      schemaVersion: "calendar/1",
      weekOf: mondayOf("2026-08-06"),
      slots: [
        { at: "2026-08-06T03:00:00.000Z", kind: "cu-edition", status: "held" },
        { at: "2026-08-06T09:00:00.000Z", kind: "tt-marketing", status: "skipped" },
        { at: "2026-08-06T13:00:00.000Z", kind: "studio", status: "pending" },
        // A different day: the review is about one day, not the week.
        { at: "2026-08-05T03:00:00.000Z", kind: "cu-edition", status: "held" }
      ]
    });
    await json(path.join(stateRoot, "meetings", "skips", "2026-08-06-tt-marketing.json"), {
      schemaVersion: "meeting-skip/1",
      date: "2026-08-06",
      phase: "tt-marketing",
      reason: "The checks on the code behind this meeting did not pass."
    });

    const packet = await buildOperationsPacket({
      repoRoot,
      stateRoot,
      reviewDate: "2026-08-06",
      since: "2026-08-06",
      autonomy: null,
      ledger: [],
      dayCapUsd: 1,
      monthCapUsd: 30
    });

    expect(packet.meetings.scheduled).toBe(3);
    expect(packet.meetings.held).toBe(1);
    expect(packet.meetings.skipped).toEqual([
      expect.objectContaining({ phase: "tt-marketing", reason: expect.stringContaining("did not pass") })
    ]);
    // `studio` neither met nor wrote a skip. That silence is the finding.
    expect(packet.meetings.unaccounted).toEqual([{ date: "2026-08-06", kind: "studio" }]);
  });

  it("counts only the ratings recorded inside the window, and survives a poisoned line", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-ops-ratings-"));
    const lines = [
      JSON.stringify({ ventureId: "titty-tuesdays", rating: "perfect", ratedAt: "2026-08-06T12:00:00.000Z" }),
      JSON.stringify({ ventureId: "titty-tuesdays", rating: "bad", ratedAt: "2026-08-06T13:00:00.000Z" }),
      // Outside the window.
      JSON.stringify({ ventureId: "titty-tuesdays", rating: "perfect", ratedAt: "2026-08-01T13:00:00.000Z" }),
      "{ not json at all"
    ];
    await mkdir(path.join(stateRoot, "ratings", "titty-tuesdays"), { recursive: true });
    await writeFile(path.join(stateRoot, "ratings", "titty-tuesdays", "ledger.jsonl"), `${lines.join("\n")}\n`);

    const packet = await buildOperationsPacket({
      repoRoot,
      stateRoot,
      reviewDate: "2026-08-06",
      since: "2026-08-06",
      autonomy: null,
      ledger: [],
      dayCapUsd: 1,
      monthCapUsd: 30
    });
    expect(packet.ratingDeltas).toEqual([{ ventureId: "titty-tuesdays", perfect: 1, good: 0, bad: 1 }]);
  });

  it("reads a day with nothing on disk as an empty day, not a failure", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-ops-empty-"));
    const packet = await buildOperationsPacket({
      repoRoot,
      stateRoot,
      reviewDate: "2026-08-06",
      since: "2026-08-06",
      autonomy: null,
      ledger: [],
      dayCapUsd: 1,
      monthCapUsd: 30
    });
    expect(packet.meetings).toEqual({ scheduled: 0, held: 0, skipped: [], unaccounted: [] });
    expect(packet.contentScores).toEqual([]);
    expect(packet.quality).toBeNull();
    expect(packet.ventures.length).toBeGreaterThan(0);
  });

  it("records an unscored content day as unscored rather than as a zero", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-ops-scores-"));
    await json(path.join(stateRoot, "ventures", "caught-up", "content-scores", "2026-08-06.json"), {
      schemaVersion: "content-score/1",
      ventureId: "caught-up",
      date: "2026-08-06",
      items: [{ fit: 7 }, { fit: null, unscored: true }]
    });
    const packet = await buildOperationsPacket({
      repoRoot,
      stateRoot,
      reviewDate: "2026-08-06",
      since: "2026-08-06",
      autonomy: null,
      ledger: [],
      dayCapUsd: 1,
      monthCapUsd: 30
    });
    expect(packet.contentScores).toEqual([
      { ventureId: "caught-up", date: "2026-08-06", scored: 1, unscored: 1, averageFit: 7 }
    ]);
  });
});

describe("resolving what the board asked for", () => {
  const verdict = (ventureId: string) => ({ ventureId, verdict: "on-track" as const, evidence: "Delivered on 2026-08-06." });
  const task = (title: string) => ({ title, scope: "orchestrator/src/edition", expectedProof: "A skip record on the next failure." });
  const idea = (ventureId: string) => ({ ventureId, title: "Wider source mix", summary: "Add two more allowlisted feeds." });

  it("caps fix tasks and growth ideas whole-board, and says what it dropped", () => {
    const resolved = resolveOperationsReview([
      { agent: "VIZE", ventureVerdicts: [verdict("caught-up")], fixTask: task("one"), growthIdea: idea("caught-up") },
      { agent: "FORGE", ventureVerdicts: [], fixTask: task("two"), growthIdea: idea("fightaiq") },
      { agent: "PULSE", ventureVerdicts: [], fixTask: task("three"), growthIdea: idea("mma-files") },
      { agent: "AUDIT", ventureVerdicts: [], fixTask: task("four"), growthIdea: null }
    ]);
    expect(resolved.fixTasks.map((entry) => entry.title)).toEqual(["one", "two", "three"]);
    expect(resolved.fixTasks).toHaveLength(MAX_FIX_TASKS);
    expect(resolved.growthIdeas.map((entry) => entry.ventureId)).toEqual(["caught-up", "fightaiq"]);
    expect(resolved.growthIdeas).toHaveLength(MAX_GROWTH_IDEAS);
    // AUDIT's fourth task and PULSE's third idea both hit a full list. The parser already strips
    // AUDIT's fields by role; this is the cap holding on its own, called directly.
    expect(resolved.dropped).toEqual(expect.arrayContaining([
      expect.objectContaining({ agent: "AUDIT", field: "fixTask" }),
      expect.objectContaining({ agent: "PULSE", field: "growthIdea" })
    ]));
    expect(resolved.dropped).toHaveLength(2);
  });

  it("keeps one verdict per venture even when two seats return one", () => {
    const resolved = resolveOperationsReview([
      { agent: "VIZE", ventureVerdicts: [verdict("caught-up"), verdict("goviral")] },
      { agent: "FORGE", ventureVerdicts: [verdict("caught-up")] }
    ]);
    expect(resolved.perVentureVerdicts.map((entry) => entry.ventureId)).toEqual(["caught-up", "goviral"]);
    expect(resolved.dropped).toEqual([
      expect.objectContaining({ agent: "FORGE", field: "ventureVerdicts" })
    ]);
  });

  it("treats a green day as a real outcome and writes no decision file", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-ops-green-"));
    const resolved = resolveOperationsReview([
      { agent: "VIZE", ventureVerdicts: [verdict("caught-up")], fixTask: null, growthIdea: null },
      { agent: "AUDIT", ventureVerdicts: [], fixTask: null, growthIdea: null }
    ]);
    expect(resolved.fixTasks).toEqual([]);
    const written = await writeOperationsDecision({
      stateRoot,
      date: "2026-08-07",
      review: resolved,
      packet: await buildOperationsPacket({
        repoRoot, stateRoot, reviewDate: "2026-08-06", since: "2026-08-06",
        autonomy: null, ledger: [], dayCapUsd: 1, monthCapUsd: 30
      })
    });
    expect(written).toBeNull();
  });

  it("writes the fix tasks as checkboxes a builder session can tick", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-ops-decision-"));
    const resolved = resolveOperationsReview([
      { agent: "FORGE", ventureVerdicts: [verdict("caught-up")], fixTask: task("Write a skip record when the edition slot dies") }
    ]);
    const written = await writeOperationsDecision({
      stateRoot,
      date: "2026-08-07",
      review: resolved,
      packet: await buildOperationsPacket({
        repoRoot, stateRoot, reviewDate: "2026-08-06", since: "2026-08-06",
        autonomy: null, ledger: [], dayCapUsd: 1, monthCapUsd: 30
      })
    });
    expect(written).toBe("decisions/2026-08-07-operations.md");
    const body = await readFile(path.join(stateRoot, written!), "utf8");
    expect(body).toContain("- [ ] **Write a skip record when the edition slot dies**");
    expect(body).toContain("orchestrator/src/edition");
    expect(body).toContain("**caught-up** — on-track");
  });
});

describe("the ideation rotation", () => {
  it("picks the same venture for the same date, and moves on the next one", async () => {
    const stateRoot = path.join(repoRoot, "state");
    const monday = await resolveRotationTarget({ stateRoot, now: new Date("2026-08-03T04:00:00.000Z") });
    const again = await resolveRotationTarget({ stateRoot, now: new Date("2026-08-03T23:00:00.000Z") });
    const tuesday = await resolveRotationTarget({ stateRoot, now: new Date("2026-08-04T04:00:00.000Z") });

    expect(monday?.ventureId).toBe(again?.ventureId);
    expect(monday?.ventureId).not.toBe(tuesday?.ventureId);
    expect(monday?.growthObjective.length).toBeGreaterThan(0);
  });

  it("covers every active venture across one full turn of the ring", async () => {
    const stateRoot = path.join(repoRoot, "state");
    const seen = new Set<string>();
    for (let day = 0; day < 14; day += 1) {
      const at = new Date("2026-08-03T04:00:00.000Z");
      at.setUTCDate(at.getUTCDate() + day);
      const target = await resolveRotationTarget({ stateRoot, now: at });
      if (target) seen.add(target.ventureId);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(seen.has("caught-up")).toBe(true);
  });
});

describe("the operations room prompt", () => {
  const ventureIds = ["caught-up", "fightaiq"];
  const contract = "OPERATIONS CONTRACT BODY";

  it("gives each seat only the fields its lens owns", () => {
    const vize = roleSystem("VIZE", [], 1, { contract, ventureIds });
    const forge = roleSystem("FORGE", [], 1, { contract, ventureIds });
    const audit = roleSystem("AUDIT", [], 1, { contract, ventureIds });

    expect(vize).toContain(contract);
    expect(vize).toContain("one entry per venture");
    expect(forge).toContain('"ventureVerdicts": []');
    expect(audit).toContain('"fixTask": null and "growthIdea": null');
    // AUDIT keeps the veto and proposes nothing; VIZE and PULSE are the only idea seats.
    expect(forge).toContain('"growthIdea": null');
    expect(roleSystem("PULSE", [], 1, { contract, ventureIds })).toContain('one "growthIdea"');
  });

  it("leaves every other shift's prompt exactly as it was", () => {
    const plain = roleSystem("VIZE", [], 1);
    expect(plain).not.toContain("ventureVerdicts");
    expect(plain).not.toContain(contract);
    expect(plain).toContain("You own strategic clarity");
  });
});
