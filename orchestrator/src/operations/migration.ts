import type { VentureRunReceipt } from "../contracts/venture-operations.js";
import { VentureRunReceiptSchema } from "../contracts/venture-operations.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { atomicWriteJson, readJson } from "../state.js";
import { appendOperationRunReceipt, readOperationRunReceipts } from "./health-store.js";

export type OperationsMigrationStatus = "migrated" | "unchanged" | "held" | "unavailable" | "dropped" | "malformed";

export interface OperationsMigrationEntry {
  key: string;
  nodeId: string | null;
  status: OperationsMigrationStatus;
  reason: string;
  sourceRef: string | null;
  targetRef: string | null;
}

export interface OperationsMigrationReport {
  schemaVersion: "operations-migration-report/1";
  generatedAt: string;
  sourceDirectory: "state/operations/migration-input";
  entries: OperationsMigrationEntry[];
  counts: Record<OperationsMigrationStatus, number>;
  rollback: {
    sourcePreserved: true;
    automaticDeletion: false;
    instructionsRef: "docs/AUTONOMOUS-OPERATIONS.md#migration-and-rollback";
  };
  reportHash: string;
}

function migrationKey(value: unknown, index: number): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return `candidate-${index + 1}`;
  const receiptId = (value as Record<string, unknown>).receiptId;
  return typeof receiptId === "string" && receiptId.length <= 160 ? receiptId : `candidate-${index + 1}`;
}

function emptyCounts(): Record<OperationsMigrationStatus, number> {
  return { migrated: 0, unchanged: 0, held: 0, unavailable: 0, dropped: 0, malformed: 0 };
}

function targetRef(receipt: VentureRunReceipt): string {
  return `state/operations/run-receipts/${receipt.nodeId}/${receipt.receiptId}.json`;
}

/**
 * Copy already-valid common receipts into the append-only Operations ledger. This migration never
 * derives a run from a domain artifact: callers must provide a complete receipt which references
 * canonical domain evidence. Legacy inputs remain untouched so rollback is an evidence-led manual
 * operation, not an automatic destructive rewrite.
 */
export async function migrateOperationsEvidence(input: {
  stateRoot: string;
  candidates: readonly unknown[];
  nodes: readonly { id: string; lifecycleStage: "operating" | "exploration" | "planned" | "paused" | "setup-needed" }[];
  generatedAt: string;
  sourceRefs?: readonly string[];
}): Promise<OperationsMigrationReport> {
  const known = new Map(input.nodes.map((node) => [node.id, node]));
  const existingByNode = new Map<string, VentureRunReceipt[]>();
  for (const node of input.nodes) {
    const values = await readOperationRunReceipts(input.stateRoot, node.id);
    existingByNode.set(node.id, values.flatMap((value) => {
      const parsed = VentureRunReceiptSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }));
  }
  const entries: OperationsMigrationEntry[] = [];
  const coveredNodes = new Set<string>();
  for (const [index, value] of input.candidates.slice(0, 500).entries()) {
    const key = migrationKey(value, index);
    const sourceRef = input.sourceRefs?.[index] ?? null;
    const parsed = VentureRunReceiptSchema.safeParse(value);
    if (!parsed.success) {
      entries.push({ key, nodeId: null, status: "malformed", reason: "The candidate is not a valid venture-run-receipt/1 record.", sourceRef, targetRef: null });
      continue;
    }
    const receipt = parsed.data;
    const node = known.get(receipt.nodeId);
    if (!node) {
      entries.push({ key, nodeId: receipt.nodeId, status: "dropped", reason: "The receipt references an unregistered operational node.", sourceRef, targetRef: null });
      continue;
    }
    coveredNodes.add(receipt.nodeId);
    if (receipt.mode === "dry" || receipt.mode === "fixture") {
      entries.push({ key, nodeId: receipt.nodeId, status: "dropped", reason: "Dry and fixture evidence is never migrated into live operational history.", sourceRef, targetRef: null });
      continue;
    }
    if (receipt.domainReceiptRefs.length === 0) {
      entries.push({ key, nodeId: receipt.nodeId, status: "malformed", reason: "Migration cannot fabricate history: a canonical domain receipt reference is required.", sourceRef, targetRef: null });
      continue;
    }
    if (node.lifecycleStage === "planned" || node.lifecycleStage === "paused") {
      entries.push({ key, nodeId: receipt.nodeId, status: "held", reason: "The node is intentionally planned or paused; its legacy evidence remains at the source.", sourceRef, targetRef: null });
      continue;
    }
    let exactTarget: unknown = null;
    try {
      exactTarget = await readJson<unknown | null>(input.stateRoot, `operations/run-receipts/${receipt.nodeId}/${receipt.receiptId}.json`, null);
    } catch {
      entries.push({ key, nodeId: receipt.nodeId, status: "malformed", reason: "The exact target receipt is unreadable; migration preserved it for manual reconciliation.", sourceRef, targetRef: targetRef(receipt) });
      continue;
    }
    const parsedExactTarget = VentureRunReceiptSchema.safeParse(exactTarget);
    const existing = parsedExactTarget.success
      ? parsedExactTarget.data
      : existingByNode.get(receipt.nodeId)?.find((candidate) => candidate.receiptId === receipt.receiptId);
    if (existing) {
      const identical = canonicalJson(existing) === canonicalJson(receipt);
      entries.push({
        key, nodeId: receipt.nodeId, status: identical ? "unchanged" : "malformed",
        reason: identical ? "The exact append-only receipt already exists." : "The receipt id already exists with different evidence; migration held the conflict.",
        sourceRef, targetRef: targetRef(existing)
      });
      continue;
    }
    await appendOperationRunReceipt(input.stateRoot, receipt);
    existingByNode.set(receipt.nodeId, [...(existingByNode.get(receipt.nodeId) ?? []), receipt]);
    entries.push({ key, nodeId: receipt.nodeId, status: "migrated", reason: "The exact validated receipt was copied without changing domain evidence.", sourceRef, targetRef: targetRef(receipt) });
  }
  for (let index = 500; index < input.candidates.length; index += 1) {
    entries.push({
      key: `candidate-${index + 1}`,
      nodeId: null,
      status: "dropped",
      reason: "The migration input exceeded the bounded 500-candidate batch.",
      sourceRef: input.sourceRefs?.[index] ?? null,
      targetRef: null
    });
  }
  for (const node of [...input.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (coveredNodes.has(node.id) || (existingByNode.get(node.id)?.length ?? 0) > 0) continue;
    const held = node.lifecycleStage === "planned" || node.lifecycleStage === "paused";
    entries.push({
      key: `coverage-${node.id}`, nodeId: node.id, status: held ? "held" : "unavailable",
      reason: held ? "The registered node intentionally has no live migration input." : "No valid legacy or current common receipt is available; no history was invented.",
      sourceRef: null, targetRef: null
    });
  }
  entries.sort((left, right) => left.key.localeCompare(right.key));
  const counts = emptyCounts();
  for (const entry of entries) counts[entry.status] += 1;
  const withoutHash = {
    schemaVersion: "operations-migration-report/1" as const,
    generatedAt: input.generatedAt,
    sourceDirectory: "state/operations/migration-input" as const,
    entries,
    counts,
    rollback: {
      sourcePreserved: true as const,
      automaticDeletion: false as const,
      instructionsRef: "docs/AUTONOMOUS-OPERATIONS.md#migration-and-rollback" as const
    }
  };
  const report = { ...withoutHash, reportHash: sha256(canonicalJson(withoutHash)) };
  await atomicWriteJson(input.stateRoot, "operations/migration/current.json", report);
  return report;
}
