import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCycle } from "../src/cycle.js";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { EditorialSlateSchema } from "../src/contracts/mma-files.js";
import { resolveRotationTarget } from "../src/operations/rotation.js";
import { repoRoot } from "../src/paths.js";
import {
  PhaseSchema,
  RunnablePhaseSchema,
  ScheduledPhaseSchema,
  type ShiftPhase
} from "../src/types.js";

const shifts: Array<{
  phase: ShiftPhase;
  now: Date;
}> = [
  { phase: "morning", now: new Date("2026-07-23T04:00:00.000Z") },
  { phase: "afternoon", now: new Date("2026-07-23T12:00:00.000Z") },
  { phase: "night", now: new Date("2026-07-23T20:00:00.000Z") }
];

async function dateForRotationTarget(ventureId: string): Promise<string> {
  for (let offset = 0; offset < 30; offset += 1) {
    const at = new Date("2026-08-01T04:00:00.000Z");
    at.setUTCDate(at.getUTCDate() + offset);
    const target = await resolveRotationTarget({
      stateRoot: path.join(repoRoot, "tmp", "dry-run", "state"),
      now: at
    });
    if (target?.ventureId === ventureId) return at.toISOString().slice(0, 10);
  }
  throw new Error(`No rotation date found for ${ventureId}`);
}

describe("cycle preflight", () => {
  it("runs one decision room and two zero-model checkpoints inside the daily budget", async () => {
    const results = await Promise.all(
      shifts.map(({ phase, now }) =>
        runCycle({
          phase,
          dry: true,
          explainBudget: false,
          explainRouting: false,
          now
        })
      )
    );

    for (const [index, result] of results.entries()) {
      const shift = shifts[index]!;
      expect(result.status).toBe("dry_complete");
      expect(result.estimatedWorstCaseUsd).toBeLessThanOrEqual(0.12);
      if (shift.phase === "morning") {
        expect(result.selectedAgents).toEqual(
          expect.arrayContaining(["VIZE", "FORGE", "PULSE", "AUDIT", "LEDGER", "SPARK"])
        );
      } else {
        expect(result.estimatedWorstCaseUsd).toBe(0);
        expect(result.selectedAgents).toEqual([]);
        expect(result.skippedAgents).toEqual(expect.arrayContaining(["VIZE", "FORGE", "PULSE", "AUDIT", "LEDGER"]));
        const standup = JSON.parse(await readFile(
          path.join(repoRoot, `tmp/dry-run/state/standups/2026-07-23-${shift.phase}.json`),
          "utf8"
        )) as { participantReasons: Array<{ participated: boolean }> };
        expect(standup.participantReasons.every(({ participated }) => !participated)).toBe(true);
      }
      expect(result.skippedAgents).toContain("PEOPLE");
      expect(result.artifacts).toContain(
        `tmp/dry-run/state/standups/2026-07-23-${shift.phase}.json`
      );
    }

    expect(
      results.reduce(
        (total, result) => total + result.estimatedWorstCaseUsd,
        0
      )
    ).toBeLessThanOrEqual(0.4);
  });

  it("refuses to found a venture from fixture evidence", async () => {
    const result = await runCycle({
      phase: "founding",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date("2026-07-23T05:30:00.000Z")
    });
    expect(result.decision).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.status).toBe("dry_complete");
  });

  it("is deterministic for the same cycle identity", async () => {
    const now = new Date("2026-07-23T20:00:00.000Z");
    const first = await runCycle({
      phase: "night",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now
    });
    const second = await runCycle({
      phase: "night",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now
    });
    expect(second).toEqual(first);
  });

  it("reads legacy records but refuses to schedule legacy phases", () => {
    expect(PhaseSchema.parse("am")).toBe("am");
    expect(PhaseSchema.parse("pm")).toBe("pm");
    expect(() => RunnablePhaseSchema.parse("am")).toThrow();
    expect(() => RunnablePhaseSchema.parse("pm")).toThrow();
  });

  it("registers bh-desk as a recorded, runnable and scheduled phase", () => {
    expect(PhaseSchema.parse("bh-desk")).toBe("bh-desk");
    expect(RunnablePhaseSchema.parse("bh-desk")).toBe("bh-desk");
    expect(ScheduledPhaseSchema.parse("bh-desk")).toBe("bh-desk");
  });

  it("runs both Caught Up phases through fixture-only meeting and calendar steps", async () => {
    const phases = [
      { phase: "cu-edition" as const, now: new Date("2026-08-04T03:00:00.000Z") },
      { phase: "cu-product" as const, now: new Date("2026-08-04T15:00:00.000Z") }
    ];
    for (const fixture of phases) {
      const result = await runCycle({
        ...fixture,
        dry: true,
        explainBudget: false,
        explainRouting: false
      });
      expect(result.status).toBe("dry_complete");
      expect(result.estimatedWorstCaseUsd).toBe(
        fixture.phase === "cu-edition" ? 0.08 : 0.03
      );
      expect(result.artifacts).toEqual(expect.arrayContaining([
        `tmp/dry-run/state/meetings/2026-08-04-${fixture.phase}.json`,
        "tmp/dry-run/state/calendar/2026-08-03.json"
      ]));
      const meetingFile = path.join(
        repoRoot,
        `tmp/dry-run/state/meetings/2026-08-04-${fixture.phase}.json`
      );
      expect(MeetingRecordSchema.parse(JSON.parse(await readFile(meetingFile, "utf8"))).kind)
        .toBe(fixture.phase);
    }
  });

  it("runs every portfolio room as a bounded dry record without per-meeting email", async () => {
    // The incubator rooms were the other two entries here. The venture is paused and holds no
    // meeting, so there is no definition for the dry room to compose.
    const phases = [
      { phase: "tt-marketing" as const, now: new Date("2026-08-03T09:00:00.000Z"), cast: ["PULSE", "ANGLE", "AUDIT", "COHORT"] }
    ];
    for (const fixture of phases) {
      const result = await runCycle({ ...fixture, dry: true, explainBudget: false, explainRouting: false });
      expect(result.status).toBe("dry_complete");
      expect(result.artifacts.some((artifact) => artifact.includes("notify/email"))).toBe(false);
      expect(result.selectedAgents).toEqual(fixture.cast);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(fixture.now);
      const record = MeetingRecordSchema.parse(JSON.parse(await readFile(path.join(repoRoot, `tmp/dry-run/state/meetings/${date}-${fixture.phase}.json`), "utf8")));
      expect(record.fixture).toBe(true);
      expect(record.ledger.actualCycleUsd).toBe(0);
      expect(record.roomTranscript.turns.length).toBeLessThanOrEqual(22);
      if (fixture.phase === "tt-marketing") {
        const planId = `plan-${date}-campaign-notes`;
        const plan = JSON.parse(await readFile(path.join(repoRoot, `tmp/dry-run/state/ventures/titty-tuesdays/plans/${planId}.json`), "utf8"));
        const markdown = await readFile(path.join(repoRoot, `tmp/dry-run/state/ventures/titty-tuesdays/plans/${planId}.md`), "utf8");
        expect(plan.summary).toMatch(/permission-first/i);
        expect(markdown).toContain("## Campaign ideas");
        expect(markdown).toContain("does not authorize publishing");
      }
    }
  });

  it("records both Door Money dry rooms with zero spend and no external action", async () => {
    for (const fixture of [
      { phase: "dm-desk" as const, now: new Date("2026-08-06T13:00:00.000Z"), cast: ["GHOST", "AUDIT"] },
      { phase: "dm-growth" as const, now: new Date("2026-08-06T14:00:00.000Z"), cast: ["BOOKER", "PULSE", "AUDIT"] }
    ]) {
      const result = await runCycle({ ...fixture, dry: true, explainBudget: false, explainRouting: false });
      expect(result).toMatchObject({ status: "dry_complete", decision: "NO_ACTION", selectedAgents: fixture.cast });
      expect(result.artifacts.some((artifact) => artifact.includes("notify/") || artifact.includes("social/queue"))).toBe(false);
      const record = MeetingRecordSchema.parse(JSON.parse(await readFile(
        path.join(repoRoot, `tmp/dry-run/state/meetings/2026-08-06-${fixture.phase}.json`),
        "utf8"
      )));
      expect(record).toMatchObject({ kind: fixture.phase, fixture: true, ledger: { actualCycleUsd: 0 } });
      expect(record.decision.summary).toMatch(/no (?:recommendation|action packet) was drafted/i);
      expect(record.growthPlan).toMatch(/nothing was published, posted, scheduled, bought or sent/i);
    }
  });

  it("records the Door Money growth off-day as a zero-dollar no-op", async () => {
    const result = await runCycle({
      phase: "dm-growth",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date("2026-08-05T14:00:00.000Z")
    });
    expect(result).toMatchObject({ status: "dry_complete", decision: "NO_ACTION", selectedAgents: [] });
    const record = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "tmp/dry-run/state/meetings/2026-08-05-dm-growth.json"),
      "utf8"
    )));
    expect(record.ledger.actualCycleUsd).toBe(0);
    expect(record.decision.summary).toContain("$0 — this room meets on Thursdays");
    expect(record.participantReasons.every(({ participated }) => !participated)).toBe(true);
  });

  it("keeps every new portfolio phase paused in live mode until the owner gate is explicit", async () => {
    const previous = process.env.PORTFOLIO_LIVE_ENABLED;
    delete process.env.PORTFOLIO_LIVE_ENABLED;
    try {
      for (const phase of ["tt-marketing", "mma-intake", "mag-desk"] as const) {
        const result = await runCycle({
          phase,
          dry: false,
          explainBudget: false,
          explainRouting: false,
          // A date with no committed record for any of these rooms, so the same-date guard is
          // not what answers here -- the owner gate is.
          now: new Date("2026-12-01T19:00:00.000Z")
        });
        expect(result).toMatchObject({ status: "paused", decision: "PAUSED", artifacts: [] });
      }
    } finally {
      if (previous === undefined) delete process.env.PORTFOLIO_LIVE_ENABLED;
      else process.env.PORTFOLIO_LIVE_ENABLED = previous;
    }
  });

  it("runs both MMA Files rooms and both article slots in dry mode", async () => {
    // tmp/dry-run is not cleaned between runs, so the packages a previous run left in these
    // two slots collide with this one's the moment the article body changes at all — the slot
    // guard doing its job on a scratch directory that was never meant to hold history. Only
    // this test's own slots are cleared; the rest of the tree is state earlier tests built.
    const dryArticles = path.join(repoRoot, "tmp", "dry-run", "state", "ventures", "mma-files", "articles");
    for (const name of await readdir(dryArticles).catch(() => [])) {
      if (name.startsWith("2026-08-04-")) await rm(path.join(dryArticles, name), { force: true });
    }
    const phases = [
      { phase: "mag-editorial" as const, now: new Date("2026-08-04T07:00:00.000Z") },
      { phase: "article-am" as const, now: new Date("2026-08-04T08:00:00.000Z") },
      { phase: "article-pm" as const, now: new Date("2026-08-04T16:00:00.000Z") },
      { phase: "mag-desk" as const, now: new Date("2026-08-04T18:00:00.000Z") }
    ];
    for (const fixture of phases) {
      const result = await runCycle({ ...fixture, dry: true, explainBudget: false, explainRouting: false });
      expect(result.status).toBe("dry_complete");
      expect(result.estimatedWorstCaseUsd).toBe(0);
      if (fixture.phase.startsWith("mag-")) {
        const record = MeetingRecordSchema.parse(JSON.parse(await readFile(path.join(repoRoot, `tmp/dry-run/state/meetings/2026-08-04-${fixture.phase}.json`), "utf8")));
        expect(record.kind).toBe(fixture.phase);
        expect(record.roomTranscript.gavel).toBe("CANVAS");
        if (fixture.phase === "mag-editorial") {
          expect(record.editorialSlateRef).toBe("ventures/mma-files/slates/2026-08-04.json");
          expect(EditorialSlateSchema.parse(JSON.parse(await readFile(
            path.join(repoRoot, "tmp/dry-run/state/ventures/mma-files/slates/2026-08-04.json"),
            "utf8"
          ))).date).toBe("2026-08-04");
        }
      } else {
        expect(result.artifacts).toEqual(expect.arrayContaining([
          expect.stringMatching(new RegExp(`articles/2026-08-04-${fixture.phase === "article-am" ? "am" : "pm"}-`)),
          expect.stringMatching(/social-A-cs-01\.svg$/),
          expect.stringMatching(/social-B-cs-02\.svg$/)
        ]));
      }
    }
  });

  it("carries one VAULT-screened dry morning idea into the product-room verdict", async () => {
    // Resolve the date from the live ring. Registering a venture changes the modulo denominator;
    // pinning a historical date made this test silently ask the wrong venture for an idea.
    const date = await dateForRotationTarget("caught-up");
    const morning = await runCycle({
      phase: "morning",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date(`${date}T04:00:00.000Z`)
    });
    expect(morning.artifacts).toEqual(expect.arrayContaining([
      "tmp/dry-run/state/ideas/caught-up/ledger.jsonl",
      "tmp/dry-run/state/ideas/caught-up/INDEX.md"
    ]));
    const standup = JSON.parse(await readFile(
      path.join(repoRoot, `tmp/dry-run/state/standups/${date}-morning.json`),
      "utf8"
    )) as { caughtUpIdeaRef?: string; morningIdeaNamespace?: string };
    expect(standup.caughtUpIdeaRef).toMatch(new RegExp(`^idea-${date}-`));
    expect(standup.morningIdeaNamespace).toBe("caught-up");

    const product = await runCycle({
      phase: "cu-product",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date(`${date}T15:00:00.000Z`)
    });
    const record = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, `tmp/dry-run/state/meetings/${date}-cu-product.json`),
      "utf8"
    )));
    expect(record.caughtUpIdeaRef).toBe(standup.caughtUpIdeaRef);

    // The verdict follows the idea's own screening result rather than a fixed expectation. This
    // used to assert VETO, which held only because an earlier test in this file had already run
    // the same morning and left a duplicate in the shared dry ledger — and `tmp/dry-run/state` is
    // written by every test file in parallel, so that was luck rather than a rule. The rule is:
    // an idea VAULT hard-stopped is vetoed, anything else is deferred.
    const ledger = (await readFile(
      path.join(repoRoot, "tmp/dry-run/state/ideas/caught-up/ledger.jsonl"),
      "utf8"
    )).split("\n").filter(Boolean).map((line) => JSON.parse(line) as { id: string; status: string });
    const screened = ledger.filter((entry) => entry.id === standup.caughtUpIdeaRef).at(-1);
    const expected = screened?.status === "vetoed" || screened?.status === "killed" ? "veto" : "defer";

    expect(product.decision).toBe(expected.toUpperCase());
    expect(record.ideaVerdicts).toEqual([
      expect.objectContaining({ ideaId: standup.caughtUpIdeaRef, verdict: expected })
    ]);
  });

  it("rotates the morning idea across the portfolio and leaves the Caught Up room alone", async () => {
    // Caught Up used to receive every morning idea because the namespace was a constant at the
    // call site. On a day the rotation names another venture, the idea lands in that venture's
    // ledger and the Caught Up product room has nothing to adopt — a normal day, not a gap.
    const date = await dateForRotationTarget("mma-files");
    const morning = await runCycle({
      phase: "morning",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date(`${date}T04:00:00.000Z`)
    });
    expect(morning.artifacts).toEqual(expect.arrayContaining([
      "tmp/dry-run/state/ideas/marketingshark/ledger.jsonl"
    ]));
    expect(morning.artifacts).not.toContain("tmp/dry-run/state/ideas/caught-up/ledger.jsonl");

    const standup = JSON.parse(await readFile(
      path.join(repoRoot, `tmp/dry-run/state/standups/${date}-morning.json`),
      "utf8"
    )) as { morningIdeaNamespace?: string; caughtUpIdeaRef?: string };
    expect(standup.morningIdeaNamespace).toBe("marketingshark");

    await runCycle({
      phase: "cu-product",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date(`${date}T15:00:00.000Z`)
    });
    const record = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, `tmp/dry-run/state/meetings/${date}-cu-product.json`),
      "utf8"
    )));
    // The room still records its own dry placeholder; what it must not do is adopt the idea
    // raised that morning for another venture.
    expect(record.caughtUpIdeaRef).not.toBe(standup.caughtUpIdeaRef);
    expect((record.ideaVerdicts ?? []).map((entry) => entry.ideaId))
      .not.toContain(standup.caughtUpIdeaRef);
  });
});
