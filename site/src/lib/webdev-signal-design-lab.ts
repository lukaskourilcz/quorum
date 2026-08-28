import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface WebDevDesignLabPanel {
  id: string;
  semantics: string[];
  heading: string;
  body: string;
  sourceRefs: string[];
}

export interface WebDevDesignLabEntry {
  payloadHash: string;
  packageRef: string;
  locale: "cs" | "en";
  edition: "CZ" | "EN";
  status: string;
  template: { id: string; version: string };
  brand: { id: string; version: string };
  panels: WebDevDesignLabPanel[];
  sources: Array<{ url: string; label: string }>;
  checks: Record<string, string>;
  outputHashes: string[];
  cacheState: "new" | "reused";
  outcome: "success" | "held" | "failed";
  reason: string | null;
  correctionSequence: number;
  supersededReceiptRef: string | null;
  receiptRef: string;
  safeActions: readonly ["preview", "rerun-same-payload", "hold"];
  workspaceHref: string | null;
}

export interface WebDevDesignLabSnapshot {
  entries: WebDevDesignLabEntry[];
  unreadable: number;
}

async function jsonFiles(directory: string): Promise<Array<{ name: string; value: unknown }>> {
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse();
    return await Promise.all(names.map(async (name) => ({
      name,
      value: JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown
    })));
  } catch {
    return [];
  }
}

function safePayloadRef(ref: unknown): ref is string {
  return typeof ref === "string"
    && ref.startsWith("state/ventures/webdev-signal/design-lab/payloads/")
    && ref.endsWith(".json")
    && !ref.includes("../")
    && !ref.includes("\\");
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Canonical Admin projection: recorded payload and receipt win; malformed pairs are isolated. */
export async function readWebDevDesignLabSnapshot(root: string): Promise<WebDevDesignLabSnapshot> {
  const receipts = await jsonFiles(path.join(root, "state/ventures/webdev-signal/design-lab/receipts"));
  const entries: WebDevDesignLabEntry[] = [];
  let unreadable = 0;
  for (const receiptFile of receipts) {
    try {
      const receipt = object(receiptFile.value);
      if (!receipt || receipt.schemaVersion !== "webdev-render-receipt/1" || !safePayloadRef(receipt.payloadRef)) throw new Error("invalid receipt");
      const payload = object(JSON.parse(await readFile(path.join(root, receipt.payloadRef), "utf8")) as unknown);
      const template = object(payload?.template);
      const brand = object(payload?.brand);
      const cache = object(receipt.cache);
      const correction = object(payload?.correction);
      const checks = object(receipt.checks);
      const panels = Array.isArray(payload?.panels) ? payload.panels.map(object) : [];
      const sources = Array.isArray(payload?.sources) ? payload.sources.map(object) : [];
      const outputs = Array.isArray(receipt.outputs) ? receipt.outputs.map(object) : [];
      if (!payload || payload.schemaVersion !== "webdev-design-payload/1" || !template || !brand || !cache || !correction || !checks
        || (payload.locale !== "cs" && payload.locale !== "en") || (payload.edition !== "CZ" && payload.edition !== "EN")
        || panels.some((panel) => panel === null) || sources.some((source) => source === null) || outputs.some((output) => output === null)
        || (receipt.outcome !== "success" && receipt.outcome !== "held" && receipt.outcome !== "failed")
        || (cache.status !== "new" && cache.status !== "reused")) throw new Error("invalid payload pair");
      entries.push({
        payloadHash: String(payload.contentHash),
        packageRef: String(payload.packageRef),
        locale: payload.locale,
        edition: payload.edition,
        status: String(payload.status),
        template: { id: String(template.id), version: String(template.version) },
        brand: { id: String(brand.id), version: String(brand.version) },
        panels: (panels as Array<Record<string, unknown>>).map((panel) => ({
          id: String(panel.id),
          semantics: Array.isArray(panel.semantics) ? panel.semantics.map(String) : [],
          heading: String(panel.heading),
          body: String(panel.body),
          sourceRefs: Array.isArray(panel.sourceRefs) ? panel.sourceRefs.map(String) : []
        })),
        sources: (sources as Array<Record<string, unknown>>).map((source) => ({ url: String(source.url), label: String(source.label) })),
        checks: Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, String(value)])),
        outputHashes: (outputs as Array<Record<string, unknown>>).map((output) => String(output.pngHash)),
        cacheState: cache.status,
        outcome: receipt.outcome,
        reason: typeof receipt.reason === "string" ? receipt.reason : null,
        correctionSequence: Number(correction.sequence),
        supersededReceiptRef: typeof receipt.supersededReceiptRef === "string" ? receipt.supersededReceiptRef : null,
        receiptRef: `state/ventures/webdev-signal/design-lab/receipts/${receiptFile.name}`,
        safeActions: ["preview", "rerun-same-payload", "hold"],
        // #445 owns the workspace. Until it exists, Admin must not fabricate a destination.
        workspaceHref: null
      });
    } catch {
      unreadable += 1;
    }
  }
  return { entries, unreadable };
}
