import "../env.js";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { configRoot, stateRoot } from "../paths.js";
import { loadRosterPolicy, rosterPolicyIds } from "./roster-policy.js";

/**
 * Delete every fighter card outside config/mma-roster.json.
 *
 * Run with --dry (the default) to list what would go; pass --apply to delete. Cards are
 * regenerable from Wikipedia by id, so this is not the destruction of irreplaceable
 * evidence: bout records, model runs and the evidence ledger are untouched.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const policy = await loadRosterPolicy(configRoot);
  const keep = rosterPolicyIds(policy);
  const fightersDir = path.join(stateRoot, "mma", "fighters");

  let files: string[];
  try {
    files = (await readdir(fightersDir)).filter((name) => name.endsWith(".json"));
  } catch {
    console.log(JSON.stringify({ status: "no-fighter-directory", directory: fightersDir }, null, 2));
    return;
  }

  const surplus = files.filter((name) => !keep.has(name.replace(/\.json$/u, "")));
  const kept = files.length - surplus.length;
  const missing = [...keep].filter((id) => !files.includes(`${id}.json`));

  if (apply) {
    for (const name of surplus) await rm(path.join(fightersDir, name));
  }

  console.log(JSON.stringify({
    status: apply ? "pruned" : "dry-run",
    policyIds: keep.size,
    filesBefore: files.length,
    kept,
    removed: apply ? surplus.length : 0,
    wouldRemove: apply ? 0 : surplus.length,
    // Cards the policy wants that do not exist yet. A roster sync fills these.
    missingFromDisk: missing.length,
    sampleMissing: missing.slice(0, 5)
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
