import {
  BudgetLedgerEntrySchema,
  COUNTERSIGNED_MONTHLY_OPERATING_USD,
  type BudgetLedgerEntry
} from "../../budget.js";
import { MeetingRecordSchema, type MeetingRecord } from "../../contracts/meeting-record.js";
import { MeetingSkipSchema, type MeetingSkip } from "../../contracts/meeting-skip.js";
import type {
  KvorumPackageGateEvaluation,
  TribunPackage
} from "../../contracts/kvorum-desk.js";
import {
  buildCalendarFeed,
  loadArticleSlotOutcomes,
  loadMeetingRecords,
  loadMeetingSkips,
  mondayOfWeek,
  writeCalendarFeed
} from "../../meetings/calendar.js";
import { loadFixedMonthlyUsd } from "../../money/fixed-costs.js";
import { configRoot } from "../../paths.js";
import { atomicWriteJson, readJson } from "../../state.js";
import type { Stage } from "../../types.js";

export const KVORUM_DESK_MEETING_PHASE = "kv-desk" as const;
export const KVORUM_DESK_ENVELOPE_USD = 0.1;

export interface KvorumDeskRecordOutcome {
  status: "packages" | "quiet" | "model-failed" | "failed";
  reason: string | null;
  packages: TribunPackage[];
  tribunRan: boolean;
  spendUsd: number;
  hasMonitorReceipt: boolean;
  droppedPackages: number;
  gateEvaluations: KvorumPackageGateEvaluation[];
}

function monitorRef(date: string): string {
  return `state/ventures/kvorum/monitor/${date}.json`;
}

function evidenceRefs(input: KvorumDeskRecordOutcome, date: string): string[] {
  return [
    ...(input.hasMonitorReceipt ? [monitorRef(date)] : []),
    ...input.packages.map((candidate) => `kvorum:cluster:${candidate.clusterId}`),
    ...input.packages.flatMap((candidate) => candidate.claims.flatMap((claim) =>
      claim.refs.map((ref) => `kvorum:item:${ref}`)
    ))
  ].filter((ref, index, refs) => refs.indexOf(ref) === index);
}

function outcomeSummary(outcome: KvorumDeskRecordOutcome): string {
  if (outcome.status === "packages") {
    const dropped = outcome.droppedPackages > 0
      ? ` ${outcome.droppedPackages} other candidate ${outcome.droppedPackages === 1 ? "was" : "were"} dropped by deterministic gates.`
      : "";
    return `${outcome.packages.length} owner-review draft ${outcome.packages.length === 1 ? "package" : "packages"}: ${outcome.packages.map((candidate) => candidate.headline).join(";")}.${dropped}`;
  }
  if (outcome.status === "quiet") return `Quiet day: ${outcome.reason}`;
  return `The desk failed after opening: ${outcome.reason}`;
}

export function buildKvorumDeskMeetingRecord(input: {
  cycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  dry: boolean;
  outcome: KvorumDeskRecordOutcome;
  monthAllInUsd: number;
}): MeetingRecord {
  const summary = outcomeSummary(input.outcome).slice(0, 800);
  const status = input.outcome.status === "packages"
    ? "PLAN"
    : input.outcome.status === "quiet"
      ? "NO_ACTION"
      : "FAILED";
  const refs = evidenceRefs(input.outcome, input.date);
  const at = input.now.toISOString();
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date: input.date,
    phase: KVORUM_DESK_MEETING_PHASE,
    kind: KVORUM_DESK_MEETING_PHASE,
    fixture: input.dry,
    status,
    stage: input.stage,
    operatingBrief: "Review the deterministic Czech political digest and retain at most two sourced draft packages for owner review; never publish, schedule, open an account or touch a channel.",
    participantReasons: [
      {
        agent: "TRIBUN",
        reason: input.outcome.tribunRan
          ? input.dry
            ? "the committed fixture exercised the TRIBUN output contract without a provider call"
            : "the bounded TRIBUN call reviewed the retained digest"
          : "the TRIBUN desk seat recorded the deterministic outcome without a provider call",
        participated: true
      },
      { agent: "HACEK", reason: "the deterministic register gate lands in KV-13b and was not claimed here", participated: false },
      {
        agent: "AUDIT",
        reason: input.outcome.gateEvaluations.length > 0
          ? "the deterministic schema, claim, originality, quote and angle gates evaluated every returned candidate"
          : "no candidate reached the deterministic package gates",
        participated: input.outcome.gateEvaluations.length > 0
      }
    ],
    ledger: {
      estimatedCycleUsd: input.outcome.tribunRan ? KVORUM_DESK_ENVELOPE_USD : 0,
      actualCycleUsd: input.outcome.spendUsd,
      monthAllInUsd: input.monthAllInUsd,
      monthCapUsd: COUNTERSIGNED_MONTHLY_OPERATING_USD
    },
    decision: { outcome: status, summary, evidenceRefs: refs },
    proposals: input.outcome.packages.map((candidate) => ({
      agent: "TRIBUN",
      summary: `${candidate.headline}: ${candidate.whyThisIsWorthIt}`.slice(0, 800),
      evidenceRefs: [
        `kvorum:cluster:${candidate.clusterId}`,
        ...candidate.claims.flatMap((claim) => claim.refs.map((ref) => `kvorum:item:${ref}`))
      ].filter((ref, index, all) => all.indexOf(ref) === index)
    })),
    voteMatrix: input.outcome.gateEvaluations.length > 0
      ? [{
          voter: "AUDIT",
          firstChoice: input.outcome.droppedPackages > 0 ? `veto:${input.outcome.droppedPackages}` : "pass",
          veto: input.outcome.droppedPackages > 0
        }]
      : [],
    tasks: [],
    growthPlan: "Drafts only. This record authorizes no publishing, scheduling, account or channel action, paid promotion, engagement ingestion, provider-plan change, treasury action or payment. Every package remains pending owner review and the later deterministic gates.",
    eveningOutcome: null,
    kvorumDesk: {
      monitorRef: input.outcome.hasMonitorReceipt ? monitorRef(input.date) : null,
      runStatus: input.outcome.status,
      reason: input.outcome.reason,
      providerCallMade: !input.dry && input.outcome.tribunRan,
      packages: input.outcome.packages,
      droppedPackages: input.outcome.droppedPackages,
      gateEvaluations: input.outcome.gateEvaluations
    },
    roomTranscript: {
      openedAt: at,
      closedAt: at,
      gavel: "TRIBUN",
      setting: "A bounded causal record generated by the desk runner, not a simulated conversation. The typed Kvórum payload states whether any provider call occurred.",
      turns: [
        ...(input.outcome.gateEvaluations.length > 0
          ? [{
              agent: "AUDIT" as const,
              mode: (input.outcome.droppedPackages > 0 ? "veto" : "statement") as "veto" | "statement",
              sentAt: at,
              text: input.outcome.droppedPackages > 0
                ? `${input.outcome.droppedPackages} ${input.outcome.droppedPackages === 1 ? "candidate failed" : "candidates failed"} deterministic gates and ${input.outcome.droppedPackages === 1 ? "was" : "were"} dropped without another model call.`
                : "Every returned candidate passed the deterministic part-one package gates."
            }]
          : []),
        { agent: "TRIBUN", mode: "close", sentAt: at, text: summary, evidenceRefs: refs }
      ]
    },
    generatedAt: at
  });
}

async function rebuildCalendar(root: string, date: string, now: Date): Promise<string> {
  return writeCalendarFeed(root, buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: await loadMeetingRecords(root),
    skips: await loadMeetingSkips(root),
    articleSlots: await loadArticleSlotOutcomes(root),
    now
  }));
}

export async function writeKvorumDeskMeetingRecord(input: {
  root: string;
  cycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  dry: boolean;
  outcome: KvorumDeskRecordOutcome;
  fixedMonthlyUsd?: number;
}): Promise<string[]> {
  const entries = (await readJson<{ entries: BudgetLedgerEntry[] }>(input.root, "budget/ledger.json", { entries: [] }))
    .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
  const monthApiUsd = entries
    .filter((entry) => entry.ts.slice(0, 7) === input.date.slice(0, 7))
    .reduce((sum, entry) => sum + entry.usd, 0);
  const fixedMonthlyUsd = input.fixedMonthlyUsd ?? await loadFixedMonthlyUsd(configRoot, input.now);
  const record = buildKvorumDeskMeetingRecord({
    ...input,
    monthAllInUsd: Number((fixedMonthlyUsd + monthApiUsd).toFixed(8))
  });
  const recordPath = `meetings/${input.date}-${KVORUM_DESK_MEETING_PHASE}.json`;
  await atomicWriteJson(input.root, recordPath, record);
  return [recordPath, await rebuildCalendar(input.root, input.date, input.now)];
}

export async function writeKvorumDeskSkip(input: {
  root: string;
  date: string;
  now: Date;
  reason: string;
}): Promise<{ skip: MeetingSkip; artifacts: string[] }> {
  const skip = MeetingSkipSchema.parse({
    schemaVersion: "meeting-skip/1",
    date: input.date,
    phase: KVORUM_DESK_MEETING_PHASE,
    reason: input.reason.slice(0, 240),
    decidedAt: input.now.toISOString()
  });
  const skipPath = `meetings/skips/${input.date}-${KVORUM_DESK_MEETING_PHASE}.json`;
  await atomicWriteJson(input.root, skipPath, skip);
  return { skip, artifacts: [skipPath, await rebuildCalendar(input.root, input.date, input.now)] };
}
