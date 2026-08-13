import "server-only";
import path from "node:path";
import { parseTehdejsiProductInsight, parseTehdejsiProductInsightAction, type TehdejsiProductInsight } from "./tehdejsi-product-insight-model";
import { persistTehdejsiState, readTehdejsiStateJson, TehdejsiStateError } from "./tehdejsi-state-store";

const DEFAULT_ROOT = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const transitions: Record<TehdejsiProductInsight["status"], readonly TehdejsiProductInsight["status"][]> = {
  proposed: ["proposed", "accepted", "rejected"], accepted: ["accepted", "done", "rejected"], rejected: ["rejected"], done: ["done"]
};

/** Updates only the owner decision fields. It has no product path, token or mutation capability. */
export async function updateTehdejsiProductInsight(
  raw: unknown,
  options: { now?: Date; root?: string } = {}
): Promise<{ insight: TehdejsiProductInsight; changed: boolean; commits: string[] }> {
  const action = parseTehdejsiProductInsightAction(raw);
  if (!action) throw new TehdejsiStateError("CONFLICT", "Insight id, allowed status and owner note are required.");
  const root = options.root ?? DEFAULT_ROOT;
  const relative = `state/ventures/tehdejsi-svet/product-insights/${action.id}.json`;
  const current = parseTehdejsiProductInsight(await readTehdejsiStateJson(relative, root));
  if (!current) throw new TehdejsiStateError("CORRUPT", `${relative} is malformed.`);
  if (!transitions[current.status].includes(action.status)) throw new TehdejsiStateError("CONFLICT", `Insight cannot move from ${current.status} to ${action.status}.`);
  if (current.status === action.status && current.ownerNote === action.ownerNote) return { insight: current, changed: false, commits: [] };
  const insight = parseTehdejsiProductInsight({ ...current, status: action.status, ownerNote: action.ownerNote, updatedAt: (options.now ?? new Date()).toISOString() });
  if (!insight) throw new TehdejsiStateError("CORRUPT", "The owner status would produce an invalid insight.");
  const write = await persistTehdejsiState(relative, insight, `admin: update Tehdejsi svet product insight ${insight.id}`, root);
  return { insight, changed: true, commits: write.commit ? [write.commit] : [] };
}
