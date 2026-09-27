import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseAdminCostSnapshot, type AdminCostSnapshot } from "./admin-cost-model";

/**
 * The bounded read boundary for `state/money/cost-report.json`.
 *
 * One server-only module, one plain-JSON view model, the same shape the other admin snapshots
 * keep. The parsing lives beside it in `admin-cost-model.ts` so a test can drive it without a
 * filesystem: `server-only` refuses to load outside a server component, which would otherwise
 * make the parser untestable.
 *
 * A missing file is not an error and is not $0. The orchestrator writes the report on every
 * non-dry cycle; before the first one runs there is nothing to show, and the panel says that.
 */

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

export type { AdminCostSnapshot } from "./admin-cost-model";

export async function readAdminCost(root = repositoryRoot): Promise<AdminCostSnapshot | null> {
  try {
    const raw = await readFile(path.join(root, "state", "money", "cost-report.json"), "utf8");
    return parseAdminCostSnapshot(JSON.parse(raw));
  } catch {
    // An absent, unreadable or malformed report reads the same to the panel: not recorded yet.
    return null;
  }
}
