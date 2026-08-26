import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ImplementationManifestRegistry,
  ImplementationProbe,
  ImplementationProbeResult
} from "../contracts/implementation-program.js";
import { withinRoot } from "../paths.js";

function safeTarget(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  if (!withinRoot(root, target)) throw new Error("probe path escaped repository root");
  return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function ownerTaskPresent(root: string, probe: ImplementationProbe): Promise<boolean> {
  const raw = JSON.parse(await readFile(safeTarget(root, probe.path), "utf8")) as unknown;
  if (!isRecord(raw) || !probe.ownerTaskKey) return false;
  const values = [raw.approvals, raw.manualTasks, raw.operationalIncidents].flatMap((entry) => Array.isArray(entry) ? entry : []);
  return values.some((entry) => isRecord(entry) && [entry.id, entry.conditionKey, entry.stableConditionKey].includes(probe.ownerTaskKey));
}

async function executeProbe(root: string, probe: ImplementationProbe): Promise<ImplementationProbeResult> {
  const target = safeTarget(root, probe.path);
  try {
    if (probe.kind === "path-exists" || probe.kind === "contract-export-exists" || probe.kind === "test-path-exists") {
      await access(target);
      return { probeId: probe.id, status: "pass", evidenceRef: probe.path, detail: probe.description };
    }
    if (probe.kind === "owner-task") {
      const present = await ownerTaskPresent(root, probe);
      return { probeId: probe.id, status: present ? "pass" : "fail", evidenceRef: probe.path, detail: present ? probe.description : `Owner task ${probe.ownerTaskKey} is not present.` };
    }
    const parsed = JSON.parse(await readFile(target, "utf8")) as unknown;
    if (probe.expectedSchemaVersion && (!isRecord(parsed) || parsed.schemaVersion !== probe.expectedSchemaVersion)) {
      return { probeId: probe.id, status: "fail", evidenceRef: probe.path, detail: `Expected ${probe.expectedSchemaVersion}.` };
    }
    return { probeId: probe.id, status: "pass", evidenceRef: probe.path, detail: probe.description };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      probeId: probe.id,
      status: code === "EACCES" ? "unavailable" : "fail",
      evidenceRef: probe.path,
      detail: code === "ENOENT" ? `Declared evidence is missing: ${probe.path}.` : `Probe unavailable: ${error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)}`
    };
  }
}

export async function runImplementationProbes(input: {
  registry: ImplementationManifestRegistry;
  repoRoot: string;
}): Promise<ReadonlyMap<string, ImplementationProbeResult[]>> {
  const results = await Promise.all(input.registry.workItems.map(async (item) => [
    item.id,
    await Promise.all(item.probes.map((probe) => executeProbe(input.repoRoot, probe)))
  ] as const));
  return new Map(results);
}
