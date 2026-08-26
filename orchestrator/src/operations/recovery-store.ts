import {
  OperationsIncidentSnapshotSchema,
  VentureRecoveryAttemptSchema,
  type OperationsIncidentSnapshot,
  type VentureRecoveryAttempt
} from "../contracts/venture-recovery.js";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { appendJsonLine, atomicWriteJson, withFileLock } from "../state.js";

export async function readRecoveryAttempts(stateRoot: string, nodeId: string): Promise<unknown[]> {
  const directory = path.join(stateRoot, "operations/recovery", nodeId);
  let entries: string[];
  try {
    entries = (await readdir(directory)).filter((entry) => /^\d{4}-\d{2}\.jsonl$/u.test(entry)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const attempts: unknown[] = [];
  for (const entry of entries.slice(-3)) {
    const target = path.join(directory, entry);
    const metadata = await stat(target);
    if (metadata.size > 256 * 1_024) {
      attempts.push({ malformed: true });
      continue;
    }
    const raw = await readFile(target, "utf8");
    for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
      try {
        attempts.push(JSON.parse(line) as unknown);
      } catch {
        attempts.push({ malformed: true });
      }
    }
  }
  return attempts.slice(-256);
}

export async function appendRecoveryAttempt(stateRoot: string, value: VentureRecoveryAttempt): Promise<void> {
  const attempt = VentureRecoveryAttemptSchema.parse(value);
  await withFileLock(stateRoot, `operations/recovery/${attempt.nodeId}/writer.lock`, async () => {
    await appendJsonLine(stateRoot, `operations/recovery/${attempt.nodeId}/${attempt.endedAt.slice(0, 7)}.jsonl`, attempt);
    await atomicWriteJson(stateRoot, `operations/recovery/${attempt.attemptId}.json`, attempt);
  });
}

export async function writeIncidentSnapshot(stateRoot: string, value: OperationsIncidentSnapshot): Promise<void> {
  const snapshot = OperationsIncidentSnapshotSchema.parse(value);
  await withFileLock(stateRoot, "operations/incidents/writer.lock", async () => {
    await atomicWriteJson(stateRoot, "operations/incidents/current.json", snapshot);
  });
}
