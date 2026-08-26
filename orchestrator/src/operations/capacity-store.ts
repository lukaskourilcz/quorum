import {
  OperationsCapacityPlanSchema,
  OperationsEfficiencyObservationSchema,
  SharedResourceLeaseSchema,
  type OperationsCapacityPlan,
  type OperationsEfficiencyObservation,
  type SharedResourceLease
} from "../contracts/operations-coordination.js";
import { appendJsonLine, atomicWriteJson, withFileLock } from "../state.js";

export async function writeCapacityPlan(stateRoot: string, value: OperationsCapacityPlan): Promise<void> {
  const plan = OperationsCapacityPlanSchema.parse(value);
  await withFileLock(stateRoot, "operations/capacity/writer.lock", async () => {
    await atomicWriteJson(stateRoot, `operations/capacity/${plan.period}.json`, plan);
    await atomicWriteJson(stateRoot, "operations/capacity/current.json", plan);
  });
}

export async function appendEfficiencyObservation(
  stateRoot: string,
  value: OperationsEfficiencyObservation
): Promise<void> {
  const observation = OperationsEfficiencyObservationSchema.parse(value);
  await withFileLock(stateRoot, "operations/efficiency/writer.lock", async () => {
    await appendJsonLine(stateRoot, `operations/efficiency/${observation.observedAt.slice(0, 7)}.jsonl`, observation);
  });
}

export async function writeSharedResourceLease(stateRoot: string, value: SharedResourceLease): Promise<void> {
  const lease = SharedResourceLeaseSchema.parse(value);
  await withFileLock(stateRoot, `operations/leases/${lease.resourceKey}.lock`, async () => {
    await atomicWriteJson(stateRoot, `operations/leases/${lease.leaseId}.json`, lease);
  });
}
