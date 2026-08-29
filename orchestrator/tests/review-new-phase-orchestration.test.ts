import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMeetingPolicy, phaseHasStandingAgenda } from "../src/meetings/agenda.js";
import { resolveBackstopSweep } from "../src/meetings/sweep.js";
import { slotRecordPath } from "../src/meetings/slot-record.js";
import { ROOM_DEGRADATION_ORDER } from "../src/portfolio/schedule.js";
import { repoRoot } from "../src/paths.js";
import { PhaseSchema, RunnablePhaseSchema, ScheduledPhaseSchema } from "../src/types.js";
import { composeMeetingRouteDefinition, loadVentureRegistry, resolveScheduledClock } from "../src/ventures/registry.js";

const PHASES = ["bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk"] as const;
const VENTURE_BY_PHASE = {
  "bh-desk": "booksofhistory",
  "dm-desk": "door-money",
  "dm-growth": "door-money",
  "ts-desk": "tehdejsi-svet",
  "kv-desk": "kvorum"
} as const;

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function record(root: string, phase: Parameters<typeof slotRecordPath>[0], date: string): Promise<void> {
  const target = path.join(root, slotRecordPath(phase, date));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, "{}\n", "utf8");
}

describe("the five reviewed phase chains", () => {
  it("uses the same phase identities in schemas, registry, workflow, Vercel and policy", async () => {
    const registry = await loadVentureRegistry();
    const policy = await loadMeetingPolicy();
    const workflow = await readFile(path.join(repoRoot, ".github/workflows/cycle.yml"), "utf8");
    const vercel = JSON.parse(await readFile(path.join(repoRoot, "site/vercel.json"), "utf8")) as {
      crons: Array<{ path: string }>;
    };
    const dispatch = workflow.slice(workflow.indexOf("        options:\n"), workflow.indexOf("      trigger:\n"));
    const budgetGate = workflow.split("\n").find((line) =>
      line.includes('test "$dry" != "true"') && line.includes('test "$phase" = "bh-desk"')
    );

    for (const phase of PHASES) {
      expect(PhaseSchema.parse(phase)).toBe(phase);
      expect(RunnablePhaseSchema.parse(phase)).toBe(phase);
      expect(ScheduledPhaseSchema.parse(phase)).toBe(phase);
      expect(composeMeetingRouteDefinition(registry, phase, "dry").ventureId).toBe(VENTURE_BY_PHASE[phase]);
      expect(dispatch.match(new RegExp(`^ {10}- ${phase}$`, "gmu"))).toHaveLength(1);
      expect(budgetGate, `${phase} is outside the workflow budget gate`).toContain(`test "$phase" = "${phase}"`);
      // A room a venture day dispatches has no cron of its own: its day carries the two firings
      // and runs it inside the slot. Door Money's two rooms are the standing example.
      const dispatchedBy = registry.ventures.find((venture) => venture.day?.steps.includes(phase))?.day;
      const cronPhase = dispatchedBy?.kind ?? phase;
      expect(vercel.crons.filter(({ path: route }) => route === `/api/cron/${cronPhase}`)).toHaveLength(2);
      expect(phaseHasStandingAgenda(policy, phase)).toBe(true);
      expect(slotRecordPath(phase, "2026-08-10")).toBe(`meetings/2026-08-10-${phase}.json`);
    }
  });

  it("lets a backstop sweep identify every new phase when its earlier slots are recorded", async () => {
    const registry = await loadVentureRegistry();
    const clock = resolveScheduledClock(registry);
    for (const phase of PHASES) {
      const root = await mkdtemp(path.join(os.tmpdir(), `review-sweep-${phase}-`));
      roots.push(root);
      // The sweep reaches for slots on the clock, so a room a day dispatches is reached as its
      // day. Everything else about the chain — schema, registry, workflow, agenda — is per room.
      const dispatchedBy = registry.ventures.find((venture) => venture.day?.steps.includes(phase))?.day;
      const sweepPhase = dispatchedBy?.kind ?? phase;
      const target = clock.find((slot) => slot.phase === sweepPhase)!;
      for (const earlier of clock.filter((slot) => slot.hour < target.hour)) {
        await record(root, earlier.phase, "2026-08-10");
      }
      const utcHour = (target.hour - 2 + 24) % 24;
      const outcome = await resolveBackstopSweep({
        registry,
        stateRoot: root,
        now: new Date(`2026-08-10T${String(utcHour).padStart(2, "0")}:00:00.000Z`)
      });
      expect(outcome.phase, phase).toBe(sweepPhase);
    }
  });

  it("keeps every reviewed room on the documented degradation ladder", () => {
    expect(ROOM_DEGRADATION_ORDER.filter((phase) => (PHASES as readonly string[]).includes(phase)))
      .toEqual(["dm-growth", "kv-desk", "dm-desk", "ts-desk", "bh-desk"]);
  });
});
