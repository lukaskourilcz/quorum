import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseTehdejsiSignalHarvest, parseTehdejsiSignalHarvestInput, type TehdejsiSignalHarvest } from "./tehdejsi-signal-model";
import { persistTehdejsiState, readTehdejsiStateJson, TehdejsiStateError } from "./tehdejsi-state-store";

const DEFAULT_ROOT = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const APPROVAL = "TS-RESULTS-005";

function stable(value: unknown): string { return JSON.stringify(value); }

async function assertApproval(root: string): Promise<void> {
  const inbox = await readFile(path.join(root, "state", "INBOX.md"), "utf8").catch(() => "");
  if (!/^- \[[xX]\] HUMAN_APPROVAL TS-RESULTS-005\b/mu.test(inbox)) {
    throw new TehdejsiStateError("CONFLICT", `${APPROVAL} is pending; community paste-in remains disabled.`);
  }
}

export async function saveTehdejsiSignalHarvest(
  raw: unknown,
  options: { now?: Date; root?: string } = {}
): Promise<{ harvest: TehdejsiSignalHarvest; changed: boolean; commits: string[] }> {
  const input = parseTehdejsiSignalHarvestInput(raw);
  if (!input) throw new TehdejsiStateError("CONFLICT", "A source label and 1–50 unique comment lines are required.");
  const root = options.root ?? DEFAULT_ROOT;
  await assertApproval(root);
  const id = `ts-signal-harvest-${createHash("sha256").update(stable(input)).digest("hex").slice(0, 20)}`;
  const relative = `state/ventures/tehdejsi-svet/signals/harvests/${id}.json`;
  try {
    const existing = parseTehdejsiSignalHarvest(await readTehdejsiStateJson(relative, root));
    if (!existing) throw new TehdejsiStateError("CORRUPT", `${relative} is malformed.`);
    if (stable({ sourceLabel: existing.sourceLabel, comments: existing.comments }) !== stable(input)) {
      throw new TehdejsiStateError("CONFLICT", `${id} already stores different owner input.`);
    }
    return { harvest: existing, changed: false, commits: [] };
  } catch (error) {
    if (!(error instanceof TehdejsiStateError) || error.code !== "UNAVAILABLE") throw error;
  }
  const harvest = parseTehdejsiSignalHarvest({
    schemaVersion: "ts-signal/1",
    kind: "harvest",
    id,
    ventureId: "tehdejsi-svet",
    source: "owner-paste",
    sourceLabel: input.sourceLabel,
    pastedAt: (options.now ?? new Date()).toISOString(),
    comments: input.comments
  });
  if (!harvest) throw new TehdejsiStateError("CORRUPT", "The canonical harvest would be invalid.");
  const write = await persistTehdejsiState(relative, harvest, `admin: save Tehdejsi svet signal harvest ${id}`, root);
  return { harvest, changed: true, commits: write.commit ? [write.commit] : [] };
}
