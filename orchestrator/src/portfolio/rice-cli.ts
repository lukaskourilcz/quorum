import { repoRoot, stateRoot } from "../paths.js";
import { atomicWriteJson, readJson } from "../state.js";
import { loadVentureRegistry } from "../ventures/registry.js";
import { buildQuarterlyRiceRanking, riceRankingPath, type KpiStatusRow } from "./rice.js";

/**
 * Writes `state/kpis/rice/<quarter>.json` from the registry, the owner's input file and the
 * quarterly KPI snapshot. It reads four files and calls nothing: no model, no network, no spend.
 *
 * `--check` exits non-zero when the committed ranking differs from what the inputs produce, so a
 * stale ranking is visible without this silently rewriting a recorded artifact.
 */

const check = process.argv.includes("--check");

const [registry, snapshot] = await Promise.all([
  loadVentureRegistry(),
  readJson<{ quarterId?: string; statuses?: KpiStatusRow[] }>(stateRoot, "kpis/latest.json", {})
]);

const quarterId = snapshot.quarterId;
if (!quarterId) {
  console.error("state/kpis/latest.json has no quarterId; run the daily money and KPI step first.");
  process.exit(1);
}

const built = await buildQuarterlyRiceRanking({
  repoRoot,
  registry,
  kpiStatuses: snapshot.statuses ?? [],
  quarterId,
  // Generated on demand, so its own stamp is the only clock this reads. Every factor that feeds
  // a score comes from a file.
  now: new Date()
});
if (!built.ranking) {
  console.error(`Portfolio RICE ranking unavailable: ${built.reason}`);
  process.exit(1);
}

const ranking = built.ranking;
const relative = riceRankingPath(quarterId);
const scored = ranking.rows.filter((row) => row.status === "scored").length;
const unavailable = ranking.rows.length - scored;

if (check) {
  const committed = await readJson<Record<string, unknown> | null>(stateRoot, relative, null);
  // `generatedAt` moves on every run and is not a difference in the ranking itself.
  const comparable = (value: Record<string, unknown>) => JSON.stringify({ ...value, generatedAt: null });
  if (!committed || comparable(committed) !== comparable(ranking)) {
    console.error(`state/${relative} is missing or stale. Run pnpm portfolio:rice.`);
    process.exit(1);
  }
  console.log(`state/${relative}: current (${scored} scored, ${unavailable} unavailable)`);
} else {
  await atomicWriteJson(stateRoot, relative, ranking);
  console.log(
    `state/${relative}: ${scored} scored, ${unavailable} unavailable, enforcement ${ranking.enforcement}`
  );
}
