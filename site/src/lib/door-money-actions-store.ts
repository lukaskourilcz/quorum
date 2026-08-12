import "server-only";
import path from "node:path";
import {
  parseStoredDoorMoneyActionPacket,
  type StoredDoorMoneyActionPacket
} from "./door-money-actions-model";
import {
  DoorMoneyPersistenceError,
  persistDoorMoneyState,
  readDoorMoneyStateJson
} from "./door-money-recommendations-store";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const PACKET_ID = /^action-packet-(\d{4}-\d{2}-\d{2})$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface DoorMoneyActionCompletionInput {
  packetId: string;
  taskId: string;
  outcome: string;
}

export interface DoorMoneyActionCompletionResult {
  packet: StoredDoorMoneyActionPacket;
  taskId: string;
  completionRef: string;
  changed: boolean;
  commits: string[];
}

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseDoorMoneyActionCompletion(value: unknown): DoorMoneyActionCompletionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 3 || keys.some((key) => !["packetId", "taskId", "outcome"].includes(key)) ||
      typeof record.packetId !== "string" || !PACKET_ID.test(record.packetId) ||
      !validDate(PACKET_ID.exec(record.packetId)![1]!) ||
      typeof record.taskId !== "string" || record.taskId.length > 100 || !SLUG.test(record.taskId) ||
      typeof record.outcome !== "string" || !record.outcome.trim() || record.outcome.length > 1_000) return null;
  return { packetId: record.packetId, taskId: record.taskId, outcome: record.outcome.trim() };
}

function relativePacketPath(packetId: string): string {
  const date = PACKET_ID.exec(packetId)?.[1];
  if (!date) throw new DoorMoneyPersistenceError("CONFLICT", "That action packet id is invalid.");
  return `state/ventures/door-money/actions/${date}.json`;
}

export async function applyDoorMoneyActionCompletion(
  input: DoorMoneyActionCompletionInput & { now?: Date },
  root = repositoryRoot
): Promise<DoorMoneyActionCompletionResult> {
  const parsedInput = parseDoorMoneyActionCompletion({ packetId: input.packetId, taskId: input.taskId, outcome: input.outcome });
  if (!parsedInput) throw new DoorMoneyPersistenceError("CONFLICT", "A valid packet, task and required outcome are needed.");
  const relative = relativePacketPath(parsedInput.packetId);
  const current = parseStoredDoorMoneyActionPacket(await readDoorMoneyStateJson(relative, root));
  if (!current) throw new DoorMoneyPersistenceError("CORRUPT", `${relative} is not a valid Door Money action packet.`);
  if (current.id !== parsedInput.packetId) throw new DoorMoneyPersistenceError("CONFLICT", "The packet id does not match its canonical record.");
  const taskIndex = current.tasks.findIndex(({ id }) => id === parsedInput.taskId);
  if (taskIndex < 0) throw new DoorMoneyPersistenceError("UNAVAILABLE", "That Door Money action does not exist.");
  const currentTask = current.tasks[taskIndex]!;
  const completionRef = `completion:${current.id}:${currentTask.id}`;
  if (completionRef.length > 160) throw new DoorMoneyPersistenceError("CONFLICT", "That action id cannot form a bounded completion reference.");
  if (currentTask.completion) {
    if (currentTask.completion.outcome !== parsedInput.outcome) {
      throw new DoorMoneyPersistenceError("CONFLICT", "That action already records a different outcome.");
    }
    return { packet: current, taskId: currentTask.id, completionRef, changed: false, commits: [] };
  }
  const completedAt = (input.now ?? new Date()).toISOString();
  if (Date.parse(completedAt) < Date.parse(current.updatedAt)) {
    throw new DoorMoneyPersistenceError("CONFLICT", "The completion time precedes the saved action packet.");
  }
  const tasks = current.tasks.map((task, index) => index === taskIndex
    ? { ...task, completion: { completedAt, outcome: parsedInput.outcome } }
    : task);
  const packet = parseStoredDoorMoneyActionPacket({ ...current, tasks, updatedAt: completedAt });
  if (!packet) throw new DoorMoneyPersistenceError("CORRUPT", "The owner completion would produce an invalid action packet.");
  const write = await persistDoorMoneyState(
    relative,
    packet,
    `admin: complete Door Money action ${packet.id}/${currentTask.id}`,
    root
  );
  return { packet, taskId: currentTask.id, completionRef, changed: true, commits: write.commit ? [write.commit] : [] };
}
