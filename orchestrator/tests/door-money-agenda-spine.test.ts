import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUDGET_LIMITS, type ReserveContext } from "../src/budget.js";
import { MeetingAgendaQueueSchema } from "../src/contracts/meeting-agenda.js";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { OpenAiTextClient } from "../src/llm/openai.js";
import {
  loadMeetingPolicy,
  readMeetingAgendaQueue,
  requestMeetingAgenda
} from "../src/meetings/agenda.js";
import { runDoorMoneyGrowthCycle } from "../src/ventures/door-money/run.js";

const NOW = new Date("2026-08-13T14:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "door-money-agenda-spine-"));
  roots.push(root);
  return root;
}

async function writeJson(root: string, relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function budget(cycleId: string): ReserveContext {
  return {
    now: NOW, cycleId, stage: "VALIDATION", ledger: [], allInNonApiSpentUsd: 0,
    allInCommittedUsd: 0, knownMonthlyForecastUsd: 0, remainingScheduledCycles: 1,
    limits: { ...DEFAULT_BUDGET_LIMITS, dailyUsd: 1, monthlyApiUsd: 25, monthlyOperatingUsd: 30 }
  };
}

function weeklyBrief(): Record<string, unknown> {
  return {
    schemaVersion: "marketing-plan/1", id: "plan-2026-08-10-weekly-brief", ventureId: "goviral",
    title: "Synthetic weekly brief", summary: "An invented public-signal brief for contract testing.",
    objective: "Give a synthetic owner one bounded idea to inspect.",
    tactics: [{
      type: "content", description: "Review one fictional neighborhood reading concept.",
      assetsNeeded: [], platformPolicyNote: "Draft only. Nothing is sent or posted."
    }],
    calendar: [{ week: 1, focus: "Manual owner review only." }], audienceRefs: [],
    kpis: ["One synthetic brief stored."],
    postable_assets: [{
      id: "asset-20260810-weekly-brief",
      captions: {
        instagram: { A: "Synthetic caption A.", B: "Synthetic caption B." },
        threads: { A: "Synthetic thread A.", B: "Synthetic thread B." }
      },
      visual: {
        template_id: "cover-cta", version: "1.0.0",
        content: { locale: "en", strings: {
          "cover-title": "SYNTHETIC BRIEF", "cover-dek": "Invented contract fixture.",
          cta: "Review the fixture", destination: "boardless-ai.vercel.app"
        } }
      }
    }],
    status: "approved", originMeetingRef: "2026-08-10-gv-brief"
  };
}

function actionResponse(reference: string): string {
  return JSON.stringify({
    outcome: "ACTIONS", summary: "One supported synthetic owner action is ready.", noActionReason: null,
    tasks: [{
      id: "review-fictional-reading-note", title: "Review the fictional reading note",
      why: "The recorded synthetic brief supports one bounded manual check.",
      steps: ["Read the invented profile.", "Personalize the prepared note outside this system."],
      templates: [{
        id: "fictional-reading-email", label: "Fictional reading note", kind: "pitch-email",
        body: "Hello, would an invented neighborhood reading sample fit your fictional program?"
      }],
      effort: "15 minutes", expectedImpact: "One owner-recorded judgment about the synthetic premise.",
      evidenceRefs: [reference], completion: null
    }],
    playbookRevisions: [], performanceWeightProposal: null,
    followUpRequest: {
      phase: "gv-brief",
      summary: "Decide whether the next free scout should measure the fictional reading theme again.",
      evidenceRefs: [reference]
    }
  });
}

async function incomingGrowthAgenda(root: string, evidenceRefs: string[] = []) {
  return requestMeetingAgenda({
    root, policy: await loadMeetingPolicy(), ventureId: "door-money", phase: "dm-growth",
    requestedBy: "PULSE", sourcePhase: "gv-brief", sourceMeetingRef: "meetings/2026-08-10-gv-brief",
    summary: "Decide whether the measured fictional reading theme merits one owner task.", evidenceRefs,
    notBefore: "2026-08-13", now: new Date("2026-08-10T11:05:00.000Z")
  });
}

describe("Door Money's GoVIRAL agenda spine", () => {
  it("consumes the incoming agenda, filters its citations and files one return question", async () => {
    const root = await temporaryRoot();
    const reference = "goviral-plan:plan-2026-08-10-weekly-brief";
    await writeJson(root, "ventures/goviral/plans/plan-2026-08-10-weekly-brief.json", weeklyBrief());
    const incoming = await incomingGrowthAgenda(root, [reference, "agenda-only:untrusted"]);
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
    const provider = vi.spyOn(OpenAiTextClient.prototype, "generate").mockResolvedValue({
      text: actionResponse(reference), model: "gpt-5.6-luna", tokensIn: 360, tokensOut: 160,
      cachedTokensIn: 0, cacheWriteTokensIn: 0, toolUses: 0
    });

    const result = await runDoorMoneyGrowthCycle({
      cycleId: "fixture-booker-agenda-spine", now: NOW, dry: false, root, stage: "VALIDATION",
      budgetContext: budget("fixture-booker-agenda-spine")
    });

    expect(result).toMatchObject({ decision: "PLAN", status: "live_complete" });
    expect(provider.mock.calls[0]?.[0].input).toContain(incoming.agenda.summary);
    expect(provider.mock.calls[0]?.[0].input).toContain(`\"evidenceRefs\":[\"${reference}\"]`);
    expect(provider.mock.calls[0]?.[0].input).not.toContain("agenda-only:untrusted");
    const queue = MeetingAgendaQueueSchema.parse(await readMeetingAgendaQueue(root, NOW));
    expect(queue.agendas).toHaveLength(2);
    expect(queue.agendas.find(({ id }) => id === incoming.agenda.id)).toMatchObject({
      status: "consumed", consumedBy: "fixture-booker-agenda-spine"
    });
    expect(queue.agendas.filter(({ sourcePhase }) => sourcePhase === "dm-growth"))
      .toEqual([expect.objectContaining({
        phase: "gv-brief", status: "pending", requestedBy: "BOOKER",
        notBefore: "2026-08-14", evidenceRefs: [reference]
      })]);
    const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(root, "meetings/2026-08-13-dm-growth.json"), "utf8"
    )));
    expect(meeting.agendaRef).toBe(`meeting-agendas/queue.json#${incoming.agenda.id}`);
    expect(meeting.operatingBrief).toContain(incoming.agenda.summary);
    expect(meeting.growthPlan).toContain("Nothing was published, posted, scheduled, bought or sent");
  });

  it("preflights a refused return agenda before committing generated artifacts", async () => {
    const root = await temporaryRoot();
    const reference = "goviral-plan:plan-2026-08-10-weekly-brief";
    await writeJson(root, "ventures/goviral/plans/plan-2026-08-10-weekly-brief.json", weeklyBrief());
    const policy = await loadMeetingPolicy();
    for (let index = 0; index < policy.perVenturePendingCap; index += 1) {
      await requestMeetingAgenda({
        root, policy, ventureId: "goviral", phase: "gv-brief", requestedBy: "PULSE",
        sourcePhase: "morning", sourceMeetingRef: `standups/2026-08-${13 + index}-morning`,
        summary: `Decide the synthetic trend question numbered ${index + 1}.`,
        notBefore: `2026-08-${String(15 + index).padStart(2, "0")}`,
        now: new Date("2026-08-13T12:00:00.000Z")
      });
    }
    const before = await readMeetingAgendaQueue(root, NOW);
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
    vi.spyOn(OpenAiTextClient.prototype, "generate").mockResolvedValue({
      text: actionResponse(reference), model: "gpt-5.6-luna", tokensIn: 360, tokensOut: 160,
      cachedTokensIn: 0, cacheWriteTokensIn: 0, toolUses: 0
    });

    const result = await runDoorMoneyGrowthCycle({
      cycleId: "fixture-booker-agenda-cap", now: NOW, dry: false, root, stage: "VALIDATION",
      budgetContext: budget("fixture-booker-agenda-cap")
    });

    expect(result).toMatchObject({ decision: "PAUSED", status: "paused" });
    await expect(readFile(path.join(root, "ventures/door-money/actions/2026-08-13.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await readMeetingAgendaQueue(root, NOW)).toEqual(before);
    const meeting = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(root, "meetings/2026-08-13-dm-growth.json"), "utf8"
    )));
    expect(meeting).toMatchObject({ status: "FAILED", proposals: [] });
    expect(meeting.ledger.actualCycleUsd).toBeGreaterThan(0);
    expect(meeting.participantReasons.find(({ agent }) => agent === "BOOKER")?.participated).toBe(true);
  });
});
