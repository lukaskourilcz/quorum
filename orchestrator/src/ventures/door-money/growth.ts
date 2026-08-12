import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BudgetError,
  BudgetLedgerEntrySchema,
  type ReserveContext
} from "../../budget.js";
import type { ActionPacket } from "../../contracts/action-packet.js";
import type { PerformanceWeightProposal } from "../../contracts/performance-weights.js";
import { MeetingRecordSchema } from "../../contracts/meeting-record.js";
import type { CycleResult } from "../../cycle/types.js";
import { ModelOutputParseError } from "../../llm/call.js";
import {
  buildCalendarFeed,
  loadArticleSlotOutcomes,
  loadMeetingRecords,
  loadMeetingSkips,
  mondayOfWeek,
  writeCalendarFeed
} from "../../meetings/calendar.js";
import { pragueClockParts } from "../../meetings/clock.js";
import { loadFixedMonthlyUsd } from "../../money/fixed-costs.js";
import { configRoot, repoRoot } from "../../paths.js";
import { loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import { isoWeek } from "../../reports/writers.js";
import { atomicWriteJson } from "../../state.js";
import type { Stage } from "../../types.js";
import { getVentureMeetingDefinition, loadVentureRegistry } from "../registry.js";
import {
  callDoorMoneyBooker,
  type BookerCall
} from "./growth-booker.js";
import {
  commitDoorMoneyGrowthPlaybookPlan,
  prepareDoorMoneyGrowthPlaybooks,
  preserveDoorMoneyActionCompletions
} from "./growth-playbooks.js";
import {
  commitDoorMoneyPerformanceWeights,
  prepareDoorMoneyPerformanceWeights
} from "./performance-weights.js";

export type { BookerCall, BookerResponse } from "./growth-booker.js";

export const DOOR_MONEY_GROWTH_TOPICS = [
  { id: "launch-mechanics", title: "Launch mechanics" },
  { id: "booktok-bookstagram", title: "BookTok and Bookstagram" },
  { id: "podcasts-press", title: "Podcasts and press outreach" },
  { id: "reddit-communities", title: "Reddit and communities" },
  { id: "short-form-video", title: "Short-form video" },
  { id: "newsletter-owned-audience", title: "Newsletter and owned audience" },
  { id: "amazon-goodreads-reviews", title: "Amazon, Goodreads and reviews" },
  { id: "partnerships-collaborations", title: "Partnerships and collaborations" }
] as const;

export const DOOR_MONEY_GROWTH_AGENDA_ANCHOR = "2026-W33";

export type DoorMoneyGrowthTopic = (typeof DOOR_MONEY_GROWTH_TOPICS)[number];

export interface DoorMoneyGrowthAgenda {
  isoWeek: string;
  weekOf: string;
  topicIndex: number;
  topic: DoorMoneyGrowthTopic;
}

export interface DoorMoneyGrowthCycleResult extends CycleResult {
  agenda: DoorMoneyGrowthAgenda;
  actionPacket: ActionPacket | null;
}

const WEEK_MS = 7 * 86_400_000;
// Door Money was founded in ISO week 33. Its first Thursday starts at topic one.
const AGENDA_ANCHOR_MONDAY_MS = Date.UTC(2026, 7, 10, 12);

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function doorMoneyGrowthAgenda(date: string): DoorMoneyGrowthAgenda {
  if (!validDate(date)) throw new Error("Door Money growth agenda date must be a valid YYYY-MM-DD date");
  const week = isoWeek(date);
  const weekOffset = Math.round((Date.parse(`${week.monday}T12:00:00.000Z`) - AGENDA_ANCHOR_MONDAY_MS) / WEEK_MS);
  const topicIndex = ((weekOffset % DOOR_MONEY_GROWTH_TOPICS.length) + DOOR_MONEY_GROWTH_TOPICS.length) % DOOR_MONEY_GROWTH_TOPICS.length;
  return { isoWeek: week.key, weekOf: week.monday, topicIndex, topic: DOOR_MONEY_GROWTH_TOPICS[topicIndex]! };
}

export function isDoorMoneyGrowthDay(date: string): boolean {
  if (!validDate(date)) return false;
  return new Date(`${date}T12:00:00.000Z`).getUTCDay() === 4;
}

async function ledgerSnapshot(root: string, date: string, now: Date, cycleId: string): Promise<{
  monthAllInUsd: number;
  monthCapUsd: number;
  cycleUsd: number;
}> {
  let raw: { entries?: unknown[] } = {};
  try {
    raw = JSON.parse(await readFile(path.join(root, "budget", "ledger.json"), "utf8")) as { entries?: unknown[] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const [limits, fixed] = await Promise.all([
    loadRuntimeBudgetLimits(),
    loadFixedMonthlyUsd(configRoot, now)
  ]);
  const month = date.slice(0, 7);
  const entries = (raw.entries ?? []).map((entry) => BudgetLedgerEntrySchema.parse(entry));
  const modelUsd = entries
    .filter(({ ts }) => ts.slice(0, 7) === month)
    .reduce((sum, entry) => sum + entry.usd, 0);
  const cycleUsd = entries
    .filter((entry) => entry.cycleId === cycleId && entry.phase === "dm-growth")
    .reduce((sum, entry) => sum + entry.usd, 0);
  return { monthAllInUsd: fixed + modelUsd, monthCapUsd: limits.monthlyOperatingUsd, cycleUsd };
}

export async function runDoorMoneyGrowthCycle(input: {
  cycleId: string;
  now: Date;
  dry: boolean;
  root?: string;
  stage?: Stage;
  call?: BookerCall;
  budgetContext?: ReserveContext;
}): Promise<DoorMoneyGrowthCycleResult> {
  const date = pragueClockParts(input.now).date;
  const agenda = doorMoneyGrowthAgenda(date);
  const due = isDoorMoneyGrowthDay(date);

  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : path.join(repoRoot, "state"));
  const [registry, stage] = await Promise.all([
    loadVentureRegistry(),
    input.stage ?? readFile(path.join(configRoot, "stages.json"), "utf8")
      .then((raw) => (JSON.parse(raw) as { current: Stage }).current)
  ]);
  const { meeting } = getVentureMeetingDefinition(registry, "dm-growth");
  let actionPacket: ActionPacket | null = null;
  let actionPacketPath: string | null = null;
  let playbookPaths: string[] = [];
  let performanceWeightPath: string | null = null;
  let performanceWeightProposal: PerformanceWeightProposal | null = null;
  let spendUsd = 0;
  let bookerParticipated = false;
  let roomStatus: "PLAN" | "NO_ACTION" | "PAUSED" | "FAILED" = due ? "NO_ACTION" : input.dry ? "NO_ACTION" : "PAUSED";
  let summary = due
    ? `No action packet was drafted. The dry room selected ${agenda.topic.title} for ${agenda.isoWeek}; no provider or external system was called.`
    : "$0 — this room meets on Thursdays. Nothing was spent and no action was taken.";
  if (due && !input.dry) {
    try {
      const called = await callDoorMoneyBooker({
        root,
        cycleId: input.cycleId,
        now: input.now,
        date,
        stage,
        agenda,
        envelopeUsd: meeting.envelopeUsd,
        call: input.call,
        budgetContext: input.budgetContext
      });
      bookerParticipated = true;
      spendUsd = called.usd;
      const nextPacketPath = `ventures/door-money/actions/${date}.json`;
      const nextPacket = await preserveDoorMoneyActionCompletions(root, nextPacketPath, called.packet);
      const playbookPlan = await prepareDoorMoneyGrowthPlaybooks({
        root,
        cycleId: input.cycleId,
        now: input.now,
        proposals: called.playbookRevisions,
        availableLearningRefs: new Set(called.context.availableLearningRefs)
      });
      const performanceWeightPlan = called.performanceWeightProposal
        ? await prepareDoorMoneyPerformanceWeights({
            root,
            cycleId: input.cycleId,
            now: input.now,
            proposal: called.performanceWeightProposal,
            availableResults: called.context.ownerResults.items
          })
        : null;
      await commitDoorMoneyGrowthPlaybookPlan(root, playbookPlan);
      if (performanceWeightPlan) {
        await commitDoorMoneyPerformanceWeights(root, performanceWeightPlan);
        performanceWeightPath = performanceWeightPlan.relative;
      }
      await atomicWriteJson(root, nextPacketPath, nextPacket);
      performanceWeightProposal = called.performanceWeightProposal;
      playbookPaths = playbookPlan.paths;
      actionPacket = nextPacket;
      actionPacketPath = nextPacketPath;
      roomStatus = actionPacket.outcome === "ACTIONS" ? "PLAN" : "NO_ACTION";
      summary = actionPacket.outcome === "ACTIONS"
        ? `${actionPacket.tasks.length} owner-executable action${actionPacket.tasks.length === 1 ? "" : "s"} prepared for review. Nothing was sent, posted or spent beyond the recorded BOOKER call.`
        : `Honest NO_ACTION: ${actionPacket.noActionReason} Nothing was sent, posted or invented to fill the packet.`;
    } catch (error) {
      bookerParticipated = error instanceof ModelOutputParseError;
      spendUsd = error instanceof ModelOutputParseError ? error.usd : 0;
      roomStatus = error instanceof BudgetError ? "PAUSED" : "FAILED";
      const detail = (error instanceof Error ? error.message : String(error))
        .replace(/(?:\/[^\s:]+)+/gu, "[private path]")
        .slice(0, 500);
      summary = `${error instanceof BudgetError ? "Budget gate paused BOOKER" : "BOOKER failed"}: ${detail} No task was invented, stored, sent or posted.`;
    }
  }
  const { cycleUsd, ...ledger } = await ledgerSnapshot(root, date, input.now, input.cycleId);
  spendUsd = Math.max(spendUsd, cycleUsd);
  const openedAt = input.now.toISOString();
  const closedAt = new Date(input.now.getTime() + 1_000).toISOString();
  const chair = bookerParticipated || input.dry ? meeting.cast[0]! : "AUDIT";
  const estimatedCycleUsd = due ? meeting.envelopeUsd : 0;
  const participantReasons = meeting.cast.map((agent) => {
    const participated = due && (agent === "BOOKER" ? input.dry || bookerParticipated : true);
    return {
      agent,
      reason: !due
        ? "registered for the room but not asked anything because the room meets on Thursdays"
        : agent === "BOOKER"
          ? participated
            ? `prepared the bounded ${agenda.topic.title} response without external action`
            : "the budget or provider boundary closed before BOOKER returned a usable response"
          : "reviewed the bounded growth-room posture without taking external action",
      participated
    };
  });
  const decisionOutcome = actionPacket?.outcome === "ACTIONS" ? "PLAN" : "NO_ACTION";
  const record = MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date,
    phase: "dm-growth",
    kind: "dm-growth",
    fixture: input.dry,
    status: roomStatus,
    stage,
    operatingBrief: due
      ? `${agenda.isoWeek} · ${agenda.topic.title}. Prepare owner-executable research without outreach, publishing, account action or spend.`
      : "This room meets on Thursdays. Nothing was spent.",
    participantReasons,
    ledger: { estimatedCycleUsd, actualCycleUsd: spendUsd, ...ledger },
    decision: { outcome: decisionOutcome, summary, evidenceRefs: actionPacket?.contextRefs ?? [] },
    proposals: (actionPacket?.tasks ?? []).map((task) => ({
      agent: "BOOKER",
      summary: `${task.title}: ${task.why}`.slice(0, 600),
      evidenceRefs: task.evidenceRefs
    })).concat(performanceWeightProposal ? [{
      agent: "BOOKER" as const,
      summary: `Performance weights: ${performanceWeightProposal.rationale}`.slice(0, 600),
      evidenceRefs: performanceWeightProposal.evidenceResultIds.map((id) => `result:${id}`)
    }] : []),
    voteMatrix: due
      ? meeting.cast.filter((voter) => voter !== "BOOKER").map((voter) => ({
          voter,
          firstChoice: decisionOutcome === "PLAN" ? "owner-action-packet" : "NO_ACTION",
          veto: false
        }))
      : [],
    tasks: [],
    growthPlan: "Nothing was published, posted, scheduled, bought or sent; no account or channel was touched and no spend was authorized.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt,
      closedAt,
      gavel: chair,
      setting: due
        ? input.dry
          ? `Deterministic dry growth room for ${agenda.isoWeek}: ${agenda.topic.title}. No provider or external system was called.`
          : `Bounded growth room for ${agenda.isoWeek}: ${agenda.topic.title}. No external action path exists in this runner.`
        : "The Thursday gate closed before any seat was called.",
      turns: [{ agent: chair, mode: "close", sentAt: closedAt, text: summary }]
    },
    generatedAt: closedAt
  });
  const meetingPath = `meetings/${date}-dm-growth.json`;
  const decisionPath = `decisions/${input.cycleId}.json`;
  const scorecardPath = `scorecards/${input.cycleId}.json`;
  const priorRecords = await loadMeetingRecords(root);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: [...priorRecords.filter((item) => !(item.date === date && item.kind === "dm-growth")), record],
    skips: await loadMeetingSkips(root),
    articleSlots: await loadArticleSlotOutcomes(root),
    now: input.now
  });
  const [, , , calendarPath] = await Promise.all([
    atomicWriteJson(root, meetingPath, record),
    atomicWriteJson(root, decisionPath, {
      schemaVersion: 1, fixture: input.dry, cycleId: input.cycleId, phase: "dm-growth",
      outcome: decisionOutcome, summary, evidenceRefs: actionPacket?.contextRefs ?? [], generatedAt: closedAt
    }),
    atomicWriteJson(root, scorecardPath, {
      schemaVersion: 1, fixture: input.dry, cycleId: input.cycleId, phase: "dm-growth",
      estimatedWorstCaseUsd: estimatedCycleUsd, actualUsd: spendUsd,
      participants: participantReasons.filter(({ participated }) => participated).map(({ agent }) => agent),
      agenda: { isoWeek: agenda.isoWeek, topicId: agenda.topic.id }, generatedAt: closedAt
    }),
    writeCalendarFeed(root, calendar)
  ]);
  return {
    cycleId: input.cycleId,
    phase: "dm-growth",
    dry: input.dry,
    status: input.dry
      ? "dry_complete"
      : roomStatus === "PLAN" || roomStatus === "NO_ACTION" ? "live_complete" : "paused",
    decision: roomStatus === "PLAN"
      ? "PLAN"
      : roomStatus === "NO_ACTION" ? "NO_ACTION" : "PAUSED",
    estimatedWorstCaseUsd: estimatedCycleUsd,
    selectedAgents: participantReasons.filter(({ participated }) => participated).map(({ agent }) => agent),
    skippedAgents: participantReasons.filter(({ participated }) => !participated).map(({ agent }) => agent),
    artifacts: [meetingPath, decisionPath, scorecardPath, calendarPath, actionPacketPath, performanceWeightPath, ...playbookPaths]
      .filter((relative): relative is string => relative !== null)
      .map((relative) => path.relative(repoRoot, path.join(root, relative))),
    agenda,
    actionPacket
  };
}
