import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  VentureOperationHealthSchema,
  VentureRunReceiptSchema,
  type VentureOperationHealth,
  type VentureRunReceipt
} from "../contracts/venture-operations.js";
import { appendJsonLine, atomicWriteJson, readJson, withFileLock } from "../state.js";

const ROOT = "operations";

function receiptMonth(receipt: VentureRunReceipt): string {
  return receipt.endedAt.slice(0, 7);
}

export async function appendOperationRunReceipt(
  stateRoot: string,
  value: unknown
): Promise<VentureRunReceipt> {
  const receipt = VentureRunReceiptSchema.parse(value);
  const directory = `${ROOT}/run-receipts/${receipt.nodeId}`;
  const ledger = `${directory}/${receiptMonth(receipt)}.jsonl`;
  await withFileLock(stateRoot, `${directory}/writer.lock`, async () => {
    await appendJsonLine(stateRoot, ledger, receipt);
    await atomicWriteJson(stateRoot, `${directory}/${receipt.receiptId}.json`, receipt);
  });
  return receipt;
}

export async function readOperationRunReceipts(
  stateRoot: string,
  nodeId: string
): Promise<unknown[]> {
  const directory = path.join(stateRoot, ROOT, "run-receipts", nodeId);
  let entries: string[];
  try {
    entries = (await readdir(directory)).filter((entry) => /^\d{4}-\d{2}\.jsonl$/u.test(entry)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const receipts: unknown[] = [];
  for (const entry of entries.slice(-3)) {
    const raw = await readFile(path.join(directory, entry), "utf8");
    for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
      try {
        receipts.push(JSON.parse(line) as unknown);
      } catch {
        receipts.push({ malformed: true });
      }
    }
  }
  return receipts;
}

export async function writeCurrentOperationHealth(
  stateRoot: string,
  value: VentureOperationHealth
): Promise<void> {
  const health = VentureOperationHealthSchema.parse(value);
  await withFileLock(stateRoot, `${ROOT}/health/${health.nodeId}/writer.lock`, async () => {
    const currentPath = `${ROOT}/health/${health.nodeId}/current.json`;
    const previous = await readJson<unknown | null>(stateRoot, currentPath, null);
    const parsedPrevious = VentureOperationHealthSchema.safeParse(previous);
    if (parsedPrevious.success && parsedPrevious.data.freshness.state !== "unavailable") {
      await atomicWriteJson(stateRoot, `${ROOT}/health/${health.nodeId}/last-known-good.json`, parsedPrevious.data);
    }
    await atomicWriteJson(stateRoot, currentPath, health);
  });
}
