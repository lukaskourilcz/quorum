import { mkdtempSync } from "node:fs";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  const root = mkdtempSync(path.join(os.tmpdir(), "goviral-agenda-consumer-"));
  process.env.GOVIRAL_AGENDA_TEST_STATE_ROOT = root;
  return { ...actual, stateRoot: root };
});

vi.mock("../src/llm/call.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/llm/call.js")>();
  return {
    ...actual,
    guardedJsonCall: vi.fn(async (input: {
      agent: string;
      parse: (text: string) => unknown;
    }) => ({
      value: input.parse(JSON.stringify({
        stance: input.agent === "PULSE" ? "plan" : "pass",
        summary: input.agent === "PULSE"
          ? "Keep the bounded synthetic reading signal in owner review."
          : "No additional action is justified by the synthetic packet.",
        evidenceRefs: [],
        task: null,
        editorialSlate: null,
        marketingPlan: null,
        inspirationObservations: [],
        idea: null,
        followUpRequest: null
      })),
      cached: false,
      usd: 0
    }))
  };
});

const { MeetingRecordSchema } = await import("../src/contracts/meeting-record.js");
const { loadMeetingPolicy, readMeetingAgendaQueue, requestMeetingAgenda } = await import("../src/meetings/agenda.js");
const { runPortfolioCycle } = await import("../src/portfolio/run.js");
const { repoRoot } = await import("../src/paths.js");

const root = process.env.GOVIRAL_AGENDA_TEST_STATE_ROOT!;
const REQUIRED_DECISIONS = [
  "2026-08-01-budget-raise.md",
  "2026-08-02-budget-mma.md",
  "2026-08-04-budget-fifty.md",
  "2026-08-02-fightaiq-founding.md"
];

async function seedDecisions(): Promise<void> {
  await mkdir(path.join(root, "decisions"), { recursive: true });
  await Promise.all(REQUIRED_DECISIONS.map((name) => copyFile(
    path.join(repoRoot, "state", "decisions", name),
    path.join(root, "decisions", name)
  )));
}

describe("GoVIRAL agenda consumption", () => {
  beforeEach(async () => {
    await rm(root, { recursive: true, force: true });
    await seedDecisions();
    vi.stubEnv("PORTFOLIO_LIVE_ENABLED", "true");
    vi.stubEnv("MEETING_TRIGGER", "schedule");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens an off-Monday commissioned room, leads with its agenda and consumes it", async () => {
    const requested = await requestMeetingAgenda({
      root,
      policy: await loadMeetingPolicy(),
      ventureId: "goviral",
      phase: "gv-brief",
      requestedBy: "BOOKER",
      sourcePhase: "dm-growth",
      sourceMeetingRef: "meetings/2026-08-13-dm-growth",
      summary: "Decide whether the fictional reading signal needs one free scout check.",
      evidenceRefs: [],
      notBefore: "2026-08-14",
      now: new Date("2026-08-13T14:05:00.000Z")
    });
    const now = new Date("2026-08-14T11:00:00.000Z");

    const result = await runPortfolioCycle({
      phase: "gv-brief",
      cycleId: "fixture-goviral-agenda-consumer",
      dry: false,
      explainBudget: false,
      explainRouting: false,
      now
    });

    expect(result).toMatchObject({ status: "live_complete", decision: "PLAN" });
    const queue = await readMeetingAgendaQueue(root, now);
    expect(queue.agendas).toEqual([expect.objectContaining({
      id: requested.agenda.id,
      status: "consumed",
      consumedBy: "fixture-goviral-agenda-consumer"
    })]);
    const record = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(root, "meetings/2026-08-14-gv-brief.json"), "utf8"
    )));
    expect(record.agendaRef).toBe(`meeting-agendas/queue.json#${requested.agenda.id}`);
    expect(record.operatingBrief).toContain(requested.agenda.summary);
    expect(record.growthPlan).toContain("Nothing here posts, schedules, buys or creates an account");
  });
});
