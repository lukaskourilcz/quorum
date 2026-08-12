import { readFile } from "node:fs/promises";
import path from "node:path";
import { BudgetLedgerEntrySchema } from "../../budget.js";
import { MeetingRecordSchema } from "../../contracts/meeting-record.js";
import type { CycleResult } from "../../cycle/types.js";
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

async function ledgerSnapshot(root: string, date: string, now: Date): Promise<{
  monthAllInUsd: number;
  monthCapUsd: number;
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
  const modelUsd = (raw.entries ?? [])
    .map((entry) => BudgetLedgerEntrySchema.parse(entry))
    .filter(({ ts }) => ts.slice(0, 7) === month)
    .reduce((sum, entry) => sum + entry.usd, 0);
  return { monthAllInUsd: fixed + modelUsd, monthCapUsd: limits.monthlyOperatingUsd };
}

export async function runDoorMoneyGrowthCycle(input: {
  cycleId: string;
  now: Date;
  dry: boolean;
  root?: string;
  stage?: Stage;
}): Promise<DoorMoneyGrowthCycleResult> {
  const date = pragueClockParts(input.now).date;
  const agenda = doorMoneyGrowthAgenda(date);
  const due = isDoorMoneyGrowthDay(date);

  // DM-19b owns the action contract and BOOKER call. Keep the live Thursday closed until both exist.
  if (due && !input.dry) {
    return {
      cycleId: input.cycleId,
      phase: "dm-growth",
      dry: false,
      status: "paused",
      decision: "PAUSED",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [],
      artifacts: [],
      agenda
    };
  }

  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : path.join(repoRoot, "state"));
  const [registry, stage, ledger] = await Promise.all([
    loadVentureRegistry(),
    input.stage ?? readFile(path.join(configRoot, "stages.json"), "utf8")
      .then((raw) => (JSON.parse(raw) as { current: Stage }).current),
    ledgerSnapshot(root, date, input.now)
  ]);
  const { meeting } = getVentureMeetingDefinition(registry, "dm-growth");
  const summary = due
    ? `No action packet was drafted. The dry room selected ${agenda.topic.title} for ${agenda.isoWeek}; no provider or external system was called.`
    : "$0 — this room meets on Thursdays. Nothing was spent and no action was taken.";
  const openedAt = input.now.toISOString();
  const closedAt = new Date(input.now.getTime() + 1_000).toISOString();
  const chair = meeting.cast[0]!;
  const estimatedCycleUsd = due ? meeting.envelopeUsd : 0;
  const record = MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date,
    phase: "dm-growth",
    kind: "dm-growth",
    fixture: input.dry,
    status: due ? "NO_ACTION" : input.dry ? "NO_ACTION" : "PAUSED",
    stage,
    operatingBrief: due
      ? `${agenda.isoWeek} · ${agenda.topic.title}. Prepare owner-executable research without outreach, publishing, account action or spend.`
      : "This room meets on Thursdays. Nothing was spent.",
    participantReasons: meeting.cast.map((agent) => ({
      agent,
      reason: due
        ? `registered for the dry growth room on ${agenda.topic.title}`
        : "registered for the room but not asked anything because the room meets on Thursdays",
      participated: due
    })),
    ledger: { estimatedCycleUsd, actualCycleUsd: 0, ...ledger },
    decision: { outcome: "NO_ACTION", summary, evidenceRefs: [] },
    proposals: [],
    voteMatrix: due
      ? meeting.cast.map((voter) => ({ voter, firstChoice: "NO_ACTION", veto: false }))
      : [],
    tasks: [],
    growthPlan: "Nothing was published, posted, scheduled, bought or sent; no account or channel was touched and no spend was authorized.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt,
      closedAt,
      gavel: chair,
      setting: due
        ? `Deterministic dry growth room for ${agenda.isoWeek}: ${agenda.topic.title}. No provider or external system was called.`
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
      outcome: "NO_ACTION", summary, evidenceRefs: [], generatedAt: closedAt
    }),
    atomicWriteJson(root, scorecardPath, {
      schemaVersion: 1, fixture: input.dry, cycleId: input.cycleId, phase: "dm-growth",
      estimatedWorstCaseUsd: estimatedCycleUsd, actualUsd: 0, participants: due ? [...meeting.cast] : [],
      agenda: { isoWeek: agenda.isoWeek, topicId: agenda.topic.id }, generatedAt: closedAt
    }),
    writeCalendarFeed(root, calendar)
  ]);
  return {
    cycleId: input.cycleId,
    phase: "dm-growth",
    dry: input.dry,
    status: input.dry ? "dry_complete" : "paused",
    decision: input.dry ? "NO_ACTION" : "PAUSED",
    estimatedWorstCaseUsd: estimatedCycleUsd,
    selectedAgents: due ? [...meeting.cast] : [],
    skippedAgents: due ? [] : [...meeting.cast],
    artifacts: [meetingPath, decisionPath, scorecardPath, calendarPath]
      .map((relative) => path.relative(repoRoot, path.join(root, relative))),
    agenda
  };
}
