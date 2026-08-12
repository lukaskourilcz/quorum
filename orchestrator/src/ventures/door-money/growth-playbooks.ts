import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ActionPacketSchema } from "../../contracts/action-packet.js";
import type { ActionPacket, ActionPacketTask } from "../../contracts/action-packet.js";
import { EvidenceRefSchema } from "../../contracts/common.js";
import {
  DoorMoneyLearningRefSchema,
  DoorMoneyPlaybookSchema,
  type DoorMoneyPlaybook
} from "../../contracts/door-money-playbook.js";
import { OwnerResultEntrySchema } from "../../contracts/owner-result-entry.js";
import { atomicWriteJson } from "../../state.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
export const DoorMoneyPlaybookProposalSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  channel: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1_000),
  steps: z.array(z.string().trim().min(1).max(500)).min(1).max(24),
  evidenceRefs: z.array(DoorMoneyLearningRefSchema).min(1).max(20)
}).superRefine((proposal, context) => {
  if (new Set(proposal.evidenceRefs).size !== proposal.evidenceRefs.length) {
    context.addIssue({ code: "custom", path: ["evidenceRefs"], message: "Playbook evidence references must be unique" });
  }
});

export type DoorMoneyPlaybookProposal = z.infer<typeof DoorMoneyPlaybookProposalSchema>;
export const DOOR_MONEY_MEMORY_REF_LIMIT = 99;

export interface DoorMoneyGrowthMemory {
  playbooks: Array<{
    ref: string;
    id: string;
    channel: string;
    title: string;
    revision: number;
    summary: string;
    steps: string[];
    evidenceRefs: string[];
    updatedAt: string;
  }>;
  ownerCompletions: Array<{
    id: string;
    packetId: string;
    taskId: string;
    title: string;
    outcome: string;
    completedAt: string;
  }>;
  ownerResults: Array<{
    ref: string;
    id: string;
    recommendationId: string;
    platform: string;
    metrics: Record<string, number>;
    outcome: string;
    capturedAt: string;
  }>;
  droppedPlaybooks: number;
  droppedActionPackets: number;
  droppedOwnerResults: number;
  omittedPlaybooks: number;
  omittedOwnerCompletions: number;
  omittedOwnerResults: number;
}

export function doorMoneyCompletionRef(packetId: string, taskId: string): string {
  return DoorMoneyLearningRefSchema.parse(`completion:${packetId}:${taskId}`);
}

export function doorMoneyOwnerResultRef(id: string): string {
  return DoorMoneyLearningRefSchema.parse(`result:${id}`);
}

async function jsonNames(directory: string): Promise<{ names: string[]; unreadable: number }> {
  try {
    return {
      names: (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(({ name }) => name)
        .sort(),
      unreadable: 0
    };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { names: [], unreadable: 0 }
      : { names: [], unreadable: 1 };
  }
}

/** Reserves the hundredth action-packet context ref for an optional GoVIRAL brief. */
export function boundDoorMoneyGrowthMemory(memory: DoorMoneyGrowthMemory): DoorMoneyGrowthMemory {
  const ownerSignals = [
    ...memory.ownerCompletions.map((item) => ({ kind: "completion" as const, at: item.completedAt, id: item.id })),
    ...memory.ownerResults.map((item) => ({ kind: "result" as const, at: item.capturedAt, id: item.ref }))
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at) || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  const selected = new Set(ownerSignals.slice(0, DOOR_MONEY_MEMORY_REF_LIMIT).map(({ id }) => id));
  const ownerCompletions = memory.ownerCompletions
    .filter(({ id }) => selected.has(id))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt) || left.id.localeCompare(right.id));
  const ownerResults = memory.ownerResults
    .filter(({ ref }) => selected.has(ref))
    .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt) || left.ref.localeCompare(right.ref));
  const remaining = DOOR_MONEY_MEMORY_REF_LIMIT - ownerCompletions.length - ownerResults.length;
  const playbooks = [...memory.playbooks]
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, remaining);
  return {
    ...memory,
    playbooks,
    ownerCompletions,
    ownerResults,
    omittedPlaybooks: memory.omittedPlaybooks + memory.playbooks.length - playbooks.length,
    omittedOwnerCompletions: memory.omittedOwnerCompletions + memory.ownerCompletions.length - ownerCompletions.length,
    omittedOwnerResults: memory.omittedOwnerResults + memory.ownerResults.length - ownerResults.length
  };
}

/** Loads only bounded, contract-valid learning recorded no later than this room's date. */
export async function loadDoorMoneyGrowthMemory(
  root: string,
  asOfDate: string,
  asOfTime = `${asOfDate}T23:59:59.999Z`
): Promise<DoorMoneyGrowthMemory> {
  const asOfMillis = Date.parse(asOfTime);
  if (!Number.isFinite(asOfMillis)) throw new Error("Door Money growth memory requires a valid as-of timestamp");
  const playbookDirectory = path.join(root, "ventures", "door-money", "playbooks");
  const actionDirectory = path.join(root, "ventures", "door-money", "actions");
  const resultDirectory = path.join(root, "ventures", "door-money", "results");
  const [playbookNames, actionNames, resultNames] = await Promise.all([
    jsonNames(playbookDirectory),
    jsonNames(actionDirectory),
    jsonNames(resultDirectory)
  ]);
  const memory: DoorMoneyGrowthMemory = {
    playbooks: [],
    ownerCompletions: [],
    ownerResults: [],
    droppedPlaybooks: playbookNames.unreadable,
    droppedActionPackets: actionNames.unreadable,
    droppedOwnerResults: resultNames.unreadable,
    omittedPlaybooks: 0,
    omittedOwnerCompletions: 0,
    omittedOwnerResults: 0
  };

  for (const name of playbookNames.names) {
    try {
      const playbook = DoorMoneyPlaybookSchema.parse(JSON.parse(await readFile(path.join(playbookDirectory, name), "utf8")) as unknown);
      if (name !== `${playbook.id}.json`) throw new Error("Playbook filename does not match its canonical id");
      const eligible = playbook.revisions.filter(({ updatedAt }) => Date.parse(updatedAt) <= asOfMillis);
      const revision = eligible.at(-1);
      if (!revision) {
        memory.droppedPlaybooks += 1;
        continue;
      }
      memory.playbooks.push({
        ref: EvidenceRefSchema.parse(`playbook:${playbook.id}:r${revision.revision}`),
        id: playbook.id,
        channel: playbook.channel,
        title: playbook.title,
        revision: revision.revision,
        summary: revision.summary,
        steps: revision.steps,
        evidenceRefs: revision.evidenceRefs,
        updatedAt: new Date(revision.updatedAt).toISOString()
      });
    } catch {
      memory.droppedPlaybooks += 1;
    }
  }
  for (const name of actionNames.names) {
    try {
      const packet = ActionPacketSchema.parse(JSON.parse(await readFile(path.join(actionDirectory, name), "utf8")) as unknown);
      if (name !== `${packet.date}.json`) throw new Error("Action filename does not match its canonical date");
      if (packet.date > asOfDate) {
        memory.droppedActionPackets += 1;
        continue;
      }
      packet.tasks.forEach((task) => {
        if (task.completion && Date.parse(task.completion.completedAt) <= asOfMillis) memory.ownerCompletions.push({
          id: doorMoneyCompletionRef(packet.id, task.id),
          packetId: packet.id,
          taskId: task.id,
          title: task.title,
          outcome: task.completion.outcome,
          completedAt: new Date(task.completion.completedAt).toISOString()
        });
      });
    } catch {
      memory.droppedActionPackets += 1;
    }
  }
  for (const name of resultNames.names) {
    try {
      const result = OwnerResultEntrySchema.parse(JSON.parse(await readFile(path.join(resultDirectory, name), "utf8")) as unknown);
      if (result.ventureId !== "door-money" || name !== `${result.id}.json`) {
        throw new Error("Owner-result filename or venture does not match its canonical identity");
      }
      if (Date.parse(result.capturedAt) > asOfMillis) {
        memory.droppedOwnerResults += 1;
        continue;
      }
      memory.ownerResults.push({
        ref: doorMoneyOwnerResultRef(result.id),
        id: result.id,
        recommendationId: result.recommendationId,
        platform: result.platform,
        metrics: result.metrics,
        outcome: result.outcome,
        capturedAt: new Date(result.capturedAt).toISOString()
      });
    } catch {
      memory.droppedOwnerResults += 1;
    }
  }
  return boundDoorMoneyGrowthMemory(memory);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function taskWithoutCompletion(task: ActionPacketTask): ActionPacketTask {
  return { ...task, completion: null };
}

/** Keeps owner-entered outcomes across an idempotent same-day growth-room rerun. */
export async function preserveDoorMoneyActionCompletions(
  root: string,
  relative: string,
  fresh: ActionPacket
): Promise<ActionPacket> {
  let existing: ActionPacket;
  try {
    existing = ActionPacketSchema.parse(JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fresh;
    throw error;
  }
  if (existing.id !== fresh.id) throw new Error("The canonical action packet path already holds a different packet id");
  const completions = existing.tasks.filter(({ completion }) => completion !== null);
  if (completions.length === 0) return fresh;
  const tasks = fresh.tasks.map((task) => {
    const completed = completions.find(({ id }) => id === task.id);
    if (!completed) return task;
    if (!same(taskWithoutCompletion(completed), taskWithoutCompletion(task))) {
      throw new Error(`BOOKER changed completed task ${task.id}; owner outcome was not overwritten`);
    }
    return { ...task, completion: completed.completion };
  });
  const missing = completions.find((completed) => !fresh.tasks.some(({ id }) => id === completed.id));
  if (missing) throw new Error(`BOOKER removed completed task ${missing.id}; owner outcome was not overwritten`);
  return ActionPacketSchema.parse({
    ...fresh,
    tasks,
    generatedAt: existing.generatedAt,
    updatedAt: [fresh.updatedAt, existing.updatedAt].sort().at(-1)!
  });
}

/** The dm-growth room is the sole caller that may create or revise canonical playbooks. */
export async function writeDoorMoneyGrowthPlaybooks(input: {
  root: string;
  cycleId: string;
  now: Date;
  proposals: DoorMoneyPlaybookProposal[];
  availableLearningRefs: ReadonlySet<string>;
}): Promise<string[]> {
  const plan = await prepareDoorMoneyGrowthPlaybooks(input);
  await commitDoorMoneyGrowthPlaybookPlan(input.root, plan);
  return plan.paths;
}

export interface DoorMoneyGrowthPlaybookPlan {
  paths: string[];
  writes: Array<{ relative: string; playbook: DoorMoneyPlaybook }>;
}

export async function commitDoorMoneyGrowthPlaybookPlan(
  root: string,
  plan: DoorMoneyGrowthPlaybookPlan
): Promise<void> {
  for (const item of plan.writes) await atomicWriteJson(root, item.relative, item.playbook);
}

/** Resolves every citation and conflict before the growth room writes its first revision. */
export async function prepareDoorMoneyGrowthPlaybooks(input: {
  root: string;
  cycleId: string;
  now: Date;
  proposals: DoorMoneyPlaybookProposal[];
  availableLearningRefs: ReadonlySet<string>;
}): Promise<DoorMoneyGrowthPlaybookPlan> {
  if (new Set(input.proposals.map(({ id }) => id)).size !== input.proposals.length) {
    throw new Error("BOOKER proposed the same playbook more than once");
  }
  const paths: string[] = [];
  const writes: DoorMoneyGrowthPlaybookPlan["writes"] = [];
  for (const proposal of input.proposals) {
    const parsedProposal = DoorMoneyPlaybookProposalSchema.parse(proposal);
    if (parsedProposal.evidenceRefs.some((reference) => !input.availableLearningRefs.has(reference))) {
      throw new Error("BOOKER cited a playbook completion or result that was not recorded in its bounded context");
    }
    const relative = `ventures/door-money/playbooks/${parsedProposal.id}.json`;
    let existing: DoorMoneyPlaybook | null = null;
    try {
      existing = DoorMoneyPlaybookSchema.parse(JSON.parse(await readFile(path.join(input.root, relative), "utf8")) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (existing && (existing.channel !== parsedProposal.channel || existing.title !== parsedProposal.title)) {
      throw new Error(`BOOKER cannot rename the canonical ${parsedProposal.id} playbook`);
    }
    const prior = existing?.revisions.find(({ sourceCycleId }) => sourceCycleId === input.cycleId);
    const content = {
      summary: parsedProposal.summary,
      steps: parsedProposal.steps,
      evidenceRefs: parsedProposal.evidenceRefs
    };
    if (prior) {
      if (!same(content, { summary: prior.summary, steps: prior.steps, evidenceRefs: prior.evidenceRefs })) {
        throw new Error(`Growth cycle ${input.cycleId} already wrote a different ${parsedProposal.id} revision`);
      }
      paths.push(relative);
      continue;
    }
    const next = DoorMoneyPlaybookSchema.parse({
      schemaVersion: "door-money-playbook/1",
      id: parsedProposal.id,
      ventureId: "door-money",
      channel: parsedProposal.channel,
      title: parsedProposal.title,
      revisions: [
        ...(existing?.revisions ?? []),
        { revision: (existing?.revisions.length ?? 0) + 1, sourceCycleId: input.cycleId, ...content, updatedAt: input.now.toISOString() }
      ]
    });
    writes.push({ relative, playbook: next });
    paths.push(relative);
  }
  return { paths, writes };
}
