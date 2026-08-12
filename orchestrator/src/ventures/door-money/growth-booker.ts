import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  BudgetError,
  BudgetLedgerEntrySchema,
  estimateTextCall,
  type ReserveContext
} from "../../budget.js";
import {
  ActionPacketSchema,
  ActionPacketTaskSchema,
  type ActionPacket
} from "../../contracts/action-packet.js";
import { MarketingPlanSchema } from "../../contracts/marketing-plan.js";
import { DateSchema, EvidenceRefSchema } from "../../contracts/common.js";
import { remainingScheduledCycles } from "../../cycle/ledger.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import { loadFixedMonthlyUsd } from "../../money/fixed-costs.js";
import { configRoot, repoRoot } from "../../paths.js";
import { loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import { wrapUntrustedData } from "../../security/content.js";
import { readJson } from "../../state.js";
import type { Stage } from "../../types.js";
import type { DoorMoneyGrowthAgenda } from "./growth.js";
import {
  DoorMoneyPlaybookProposalSchema,
  loadDoorMoneyGrowthMemory,
  type DoorMoneyGrowthMemory,
  type DoorMoneyPlaybookProposal
} from "./growth-playbooks.js";

const BookerRouteSchema = z.object({
  provider: z.literal("openai"),
  model: z.string().trim().min(1),
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive()
});

const FreshBookerTaskSchema = ActionPacketTaskSchema.refine(
  ({ completion, id }) => completion === null && id.length <= 100,
  "BOOKER cannot record owner completion fields and task ids must preserve bounded completion references"
);

const BookerResponseSchema = z.strictObject({
  outcome: z.enum(["ACTIONS", "NO_ACTION"]),
  summary: z.string().trim().min(1).max(1_000),
  noActionReason: z.string().trim().min(1).max(1_000).nullable(),
  tasks: z.array(FreshBookerTaskSchema).max(12),
  playbookRevisions: z.array(DoorMoneyPlaybookProposalSchema).max(24)
}).superRefine((response, context) => {
  const actions = response.outcome === "ACTIONS";
  if (actions !== (response.tasks.length > 0) || actions === (response.noActionReason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["outcome"],
      message: "ACTIONS requires tasks and no reason; NO_ACTION requires a reason and no tasks"
    });
  }
});

export type BookerResponse = z.infer<typeof BookerResponseSchema>;
export type BookerCall = (input: GuardedCallInput<BookerResponse>) => Promise<{
  value: BookerResponse;
  cached: boolean;
  usd: number;
}>;

export interface BookerGoViralBrief {
  ref: string;
  date: string;
  id: string;
  title: string;
  summary: string;
  objective: string;
  tactics: Array<{
    type: string;
    description: string;
    platformPolicyNote: string;
  }>;
  status: string;
  originMeetingRef: string;
}

export interface DoorMoneyBookerContext {
  playbooks: {
    state: "missing" | "present";
    items: DoorMoneyGrowthMemory["playbooks"];
  };
  ownerCompletions: {
    state: "missing" | "present";
    items: DoorMoneyGrowthMemory["ownerCompletions"];
  };
  ownerResults: {
    state: "missing" | "present";
    items: DoorMoneyGrowthMemory["ownerResults"];
  };
  latestGoViralBrief: BookerGoViralBrief | null;
  droppedGoViralBriefs: number;
  droppedPlaybooks: number;
  droppedActionPackets: number;
  droppedOwnerResults: number;
  omittedPlaybooks: number;
  omittedOwnerCompletions: number;
  omittedOwnerResults: number;
  allowedEvidenceRefs: string[];
  availableLearningRefs: string[];
}

function projectGoViralBrief(plan: z.infer<typeof MarketingPlanSchema>): BookerGoViralBrief | null {
  const idMatch = /^plan-(\d{4}-\d{2}-\d{2})-weekly-brief$/u.exec(plan.id);
  const meetingMatch = /^(\d{4}-\d{2}-\d{2})-gv-brief$/u.exec(plan.originMeetingRef);
  if (!idMatch || !meetingMatch || idMatch[1] !== meetingMatch[1]) return null;
  const reference = `goviral-plan:${plan.id}`;
  if (reference.length > 160) return null;
  return {
    ref: reference,
    date: idMatch[1]!,
    id: plan.id,
    title: plan.title,
    summary: plan.summary,
    objective: plan.objective,
    tactics: plan.tactics.slice(0, 24).map((tactic) => ({
      type: tactic.type,
      description: tactic.description,
      platformPolicyNote: tactic.platformPolicyNote
    })),
    status: plan.status,
    originMeetingRef: plan.originMeetingRef
  };
}

export function doorMoneyBookerEvidenceRefs(
  memory: DoorMoneyGrowthMemory,
  latestGoViralBrief: BookerGoViralBrief | null
): string[] {
  const references = [
    ...[
      ...memory.ownerCompletions.map(({ id, completedAt }) => ({ ref: id, at: completedAt, kind: "completion" })),
      ...memory.ownerResults.map(({ ref, capturedAt }) => ({ ref, at: capturedAt, kind: "result" }))
    ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at) || left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref))
      .map(({ ref }) => ref),
    ...memory.playbooks.map(({ ref }) => ref),
    ...(latestGoViralBrief ? [latestGoViralBrief.ref] : [])
  ];
  if (new Set(references).size !== references.length) {
    throw new Error("Door Money growth context contains duplicate evidence references");
  }
  return z.array(EvidenceRefSchema).max(100).parse(references);
}

/** Read bounded, contract-valid manual learning and the latest eligible GoVIRAL brief. */
export async function loadDoorMoneyBookerContext(
  root: string,
  asOfDate: string,
  asOfTime = `${asOfDate}T23:59:59.999Z`
): Promise<DoorMoneyBookerContext> {
  const throughDate = DateSchema.parse(asOfDate);
  const directory = path.join(root, "ventures", "goviral", "plans");
  const memory = await loadDoorMoneyGrowthMemory(root, throughDate, asOfTime);
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(({ name }) => name)
      .sort();
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      playbooks: { state: memory.playbooks.length ? "present" : "missing", items: memory.playbooks },
      ownerCompletions: { state: memory.ownerCompletions.length ? "present" : "missing", items: memory.ownerCompletions },
      ownerResults: { state: memory.ownerResults.length ? "present" : "missing", items: memory.ownerResults },
      latestGoViralBrief: null,
      droppedGoViralBriefs: missing ? 0 : 1,
      droppedPlaybooks: memory.droppedPlaybooks,
      droppedActionPackets: memory.droppedActionPackets,
      droppedOwnerResults: memory.droppedOwnerResults,
      omittedPlaybooks: memory.omittedPlaybooks,
      omittedOwnerCompletions: memory.omittedOwnerCompletions,
      omittedOwnerResults: memory.omittedOwnerResults,
      allowedEvidenceRefs: doorMoneyBookerEvidenceRefs(memory, null),
      availableLearningRefs: doorMoneyBookerEvidenceRefs(memory, null)
        .filter((reference) => reference.startsWith("completion:") || reference.startsWith("result:"))
    };
  }

  const briefs: BookerGoViralBrief[] = [];
  let droppedGoViralBriefs = 0;
  for (const name of names) {
    try {
      const parsed = MarketingPlanSchema.safeParse(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown);
      const projected = parsed.success && parsed.data.ventureId === "goviral"
        ? projectGoViralBrief(parsed.data)
        : null;
      if (projected && projected.date <= throughDate) briefs.push(projected);
      else droppedGoViralBriefs += 1;
    } catch {
      droppedGoViralBriefs += 1;
    }
  }
  briefs.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  const latestGoViralBrief = briefs[0] ?? null;
  return {
    playbooks: { state: memory.playbooks.length ? "present" : "missing", items: memory.playbooks },
    ownerCompletions: { state: memory.ownerCompletions.length ? "present" : "missing", items: memory.ownerCompletions },
    ownerResults: { state: memory.ownerResults.length ? "present" : "missing", items: memory.ownerResults },
    latestGoViralBrief,
    droppedGoViralBriefs,
    droppedPlaybooks: memory.droppedPlaybooks,
    droppedActionPackets: memory.droppedActionPackets,
    droppedOwnerResults: memory.droppedOwnerResults,
    omittedPlaybooks: memory.omittedPlaybooks,
    omittedOwnerCompletions: memory.omittedOwnerCompletions,
    omittedOwnerResults: memory.omittedOwnerResults,
    allowedEvidenceRefs: doorMoneyBookerEvidenceRefs(memory, latestGoViralBrief),
    availableLearningRefs: doorMoneyBookerEvidenceRefs(memory, null)
      .filter((reference) => reference.startsWith("completion:") || reference.startsWith("result:"))
  };
}

async function routeAndPrompt(): Promise<{
  route: z.infer<typeof BookerRouteSchema>;
  system: string;
}> {
  const [modelsRaw, booker] = await Promise.all([
    readFile(path.join(configRoot, "models.json"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator", "prompts", "door-money", "booker.md"), "utf8")
  ]);
  const models = JSON.parse(modelsRaw) as { roles?: Record<string, unknown> };
  return {
    route: BookerRouteSchema.parse(models.roles?.OPENAI_SPECIALIST),
    system: `${booker.trim()}\n\nReturn one JSON object with exactly outcome, summary, noActionReason, tasks and playbookRevisions. Every task must match action-packet/1, include at least one prepared template and return completion:null. A task may cite only an allowedEvidenceRef; do not invent a citation. Every playbook revision must cite at least one availableLearningRef, and each such ref must resolve to a recorded completion or owner result in this packet. NO_ACTION must carry a specific reason and an empty tasks array.`
  };
}

async function defaultBudgetContext(input: {
  root: string;
  cycleId: string;
  now: Date;
  stage: Stage;
}): Promise<ReserveContext> {
  const [ledger, limits, fixedMonthlyUsd] = await Promise.all([
    readJson<{ entries?: unknown[] }>(input.root, "budget/ledger.json", { entries: [] }),
    loadRuntimeBudgetLimits(),
    loadFixedMonthlyUsd(configRoot, input.now)
  ]);
  return {
    now: input.now,
    cycleId: input.cycleId,
    stage: input.stage,
    ledger: (ledger.entries ?? []).map((entry) => BudgetLedgerEntrySchema.parse(entry)),
    allInNonApiSpentUsd: fixedMonthlyUsd,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    remainingScheduledCycles: remainingScheduledCycles(input.now),
    limits
  };
}

export async function callDoorMoneyBooker(input: {
  root: string;
  cycleId: string;
  now: Date;
  date: string;
  stage: Stage;
  agenda: DoorMoneyGrowthAgenda;
  envelopeUsd: number;
  call?: BookerCall;
  budgetContext?: ReserveContext;
}): Promise<{
  packet: ActionPacket;
  playbookRevisions: DoorMoneyPlaybookProposal[];
  usd: number;
  context: DoorMoneyBookerContext;
}> {
  const [context, routePrompt] = await Promise.all([
    loadDoorMoneyBookerContext(input.root, input.date, input.now.toISOString()),
    routeAndPrompt()
  ]);
  const packetInput = wrapUntrustedData("door-money-growth-context", JSON.stringify({
    schedule: {
      date: input.date,
      isoWeek: input.agenda.isoWeek,
      weekOf: input.agenda.weekOf,
      topic: input.agenda.topic
    },
    playbooks: context.playbooks,
    ownerCompletions: context.ownerCompletions,
    ownerResults: context.ownerResults,
    latestGoViralBrief: context.latestGoViralBrief,
    droppedGoViralBriefs: context.droppedGoViralBriefs,
    droppedPlaybooks: context.droppedPlaybooks,
    droppedActionPackets: context.droppedActionPackets,
    droppedOwnerResults: context.droppedOwnerResults,
    omittedPlaybooks: context.omittedPlaybooks,
    omittedOwnerCompletions: context.omittedOwnerCompletions,
    omittedOwnerResults: context.omittedOwnerResults,
    allowedEvidenceRefs: context.allowedEvidenceRefs,
    availableLearningRefs: context.availableLearningRefs,
    constraints: {
      ownerExecutesEveryTask: true,
      sendOrPostOrCreateAccountOrTouchChannelOrSpend: false,
      unsupportedTaskOutcome: "NO_ACTION"
    }
  }));
  const estimatedTokens = Math.ceil((routePrompt.system.length + packetInput.length) / 3.5);
  if (estimatedTokens > routePrompt.route.maxInputTokens) {
    throw new Error(`BOOKER packet estimate ${estimatedTokens} exceeds ${routePrompt.route.maxInputTokens} tokens`);
  }
  const estimate = estimateTextCall({
    provider: routePrompt.route.provider,
    model: routePrompt.route.model,
    promptChars: routePrompt.system.length + packetInput.length,
    maxOutputTokens: routePrompt.route.maxOutputTokens,
    at: input.now
  });
  if (estimate.estimatedUsd > input.envelopeUsd) {
    throw new BudgetError(
      "CYCLE_CAP",
      `BOOKER call graph $${estimate.estimatedUsd.toFixed(6)} exceeds the dm-growth envelope $${input.envelopeUsd.toFixed(2)}`
    );
  }
  const response = await (input.call ?? guardedJsonCall)({
    stateRoot: input.root,
    cycleId: input.cycleId,
    phase: "dm-growth",
    ventureId: "door-money",
    agent: "BOOKER",
    provider: routePrompt.route.provider,
    model: routePrompt.route.model,
    system: routePrompt.system,
    input: packetInput,
    maxOutputTokens: routePrompt.route.maxOutputTokens,
    budgetContext: input.budgetContext ?? await defaultBudgetContext(input),
    parse: (text) => {
      const parsed = BookerResponseSchema.parse(JSON.parse(text) as unknown);
      const allowed = new Set(context.allowedEvidenceRefs);
      if (parsed.tasks.some((task) => task.evidenceRefs.some((reference) => !allowed.has(reference)))) {
        throw new Error("BOOKER cited evidence that was not supplied in its bounded context");
      }
      const learning = new Set(context.availableLearningRefs);
      if (parsed.playbookRevisions.some((revision) => revision.evidenceRefs.some((reference) => !learning.has(reference)))) {
        throw new Error("BOOKER cited a playbook completion or result that was not recorded in its bounded context");
      }
      return parsed;
    }
  });
  const generatedAt = input.now.toISOString();
  return {
    packet: ActionPacketSchema.parse({
      schemaVersion: "action-packet/1",
      id: `action-packet-${input.date}`,
      ventureId: "door-money",
      date: input.date,
      weekOf: input.agenda.weekOf,
      agenda: {
        isoWeek: input.agenda.isoWeek,
        topicId: input.agenda.topic.id,
        title: input.agenda.topic.title
      },
      title: `Door Money actions: ${input.agenda.topic.title}`,
      summary: response.value.summary,
      outcome: response.value.outcome,
      noActionReason: response.value.noActionReason,
      contextRefs: context.allowedEvidenceRefs,
      tasks: response.value.tasks,
      generatedAt,
      updatedAt: generatedAt
    }),
    playbookRevisions: response.value.playbookRevisions,
    usd: response.usd,
    context
  };
}
