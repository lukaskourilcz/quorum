import {
  OperationsIncidentSnapshotSchema,
  VentureRecoveryAttemptSchema,
  type OperationsIncidentSnapshot,
  type VentureRecoveryAttempt
} from "../contracts/venture-recovery.js";
import { appendJsonLine, atomicWriteJson, withFileLock } from "../state.js";

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
