import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

const bannerContractPath = "state/ventures/marketingshark/banner/contract.json";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Only unchecked inbox approvals are still a decision for the owner. */
export function pendingApprovalCount(inbox: string): number {
  return (inbox.match(/^- \[ \] HUMAN_APPROVAL\b/gmu) ?? []).length;
}

/**
 * Delivery must not disappear behind the approval that permitted it. This stays deliberately
 * narrow until the owner-attention collector becomes the canonical, multi-payload source.
 */
export async function readApprovedUndeliveredPayloads(root: string): Promise<string[]> {
  try {
    const contract = record(JSON.parse(await readFile(path.join(root, bannerContractPath), "utf8")));
    const brandId = typeof contract?.brandId === "string" ? contract.brandId : null;
    return contract?.schemaVersion === "marketingshark-banner/1" && contract.status === "staged" && contract.receiptRef === null && brandId
      ? [`${brandId} banner`]
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
