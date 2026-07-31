import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePublicIdeaLedger, type PublicIdeaEntry } from "@/lib/idea-ledger-model";

function ledgerPath() {
  const repoRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(repoRoot, "state", "ideas", "ledger.jsonl");
}

export async function getPublicIdeas(): Promise<readonly PublicIdeaEntry[]> {
  try {
    return parsePublicIdeaLedger(await readFile(ledgerPath(), "utf8")) ?? [];
  } catch {
    return [];
  }
}
