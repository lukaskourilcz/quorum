import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { configRoot, stateRoot } from "../paths.js";
import { loadOperationsNodeRegistry } from "./nodes.js";
import { loadVentureSloRegistry } from "./slo.js";
import { migrateOperationsEvidence } from "./migration.js";

async function migrationInputs(root: string): Promise<{ candidates: unknown[]; sourceRefs: string[] }> {
  const relative = "operations/migration-input";
  let filenames: string[];
  try {
    filenames = (await readdir(path.join(root, relative))).filter((name) => /^[a-zA-Z0-9._-]+\.json$/u.test(name)).sort().slice(0, 500);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { candidates: [], sourceRefs: [] };
    throw error;
  }
  const candidates: unknown[] = [];
  for (const filename of filenames) {
    try {
      const target = path.join(root, relative, filename);
      if ((await stat(target)).size > 256 * 1_024) {
        candidates.push({ oversizedMigrationInput: filename });
      } else {
        candidates.push(JSON.parse(await readFile(target, "utf8")) as unknown);
      }
    } catch {
      candidates.push({ malformedMigrationInput: filename });
    }
  }
  return { candidates, sourceRefs: filenames.map((filename) => `state/${relative}/${filename}`) };
}

async function main(): Promise<void> {
  const [nodes, slos, inputs] = await Promise.all([
    loadOperationsNodeRegistry(configRoot), loadVentureSloRegistry(configRoot), migrationInputs(stateRoot)
  ]);
  const stageByNode = new Map(slos.policies.map((policy) => [policy.nodeId, policy.lifecycleStage]));
  const report = await migrateOperationsEvidence({
    stateRoot,
    candidates: inputs.candidates,
    sourceRefs: inputs.sourceRefs,
    nodes: nodes.nodes.map((node) => ({ id: node.id, lifecycleStage: stageByNode.get(node.id) ?? "setup-needed" })),
    generatedAt: new Date().toISOString()
  });
  console.log(JSON.stringify(report, null, 2));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) await main();
