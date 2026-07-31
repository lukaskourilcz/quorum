import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parsePublicIdeaLedger, type PublicIdeaEntry } from "@/lib/idea-ledger-model";

function ideasRoot() {
  const repoRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(repoRoot, "state", "ideas");
}

export async function getPublicIdeas(): Promise<readonly PublicIdeaEntry[]> {
  try {
    const root = ideasRoot();
    const entries = await readdir(root, { withFileTypes: true });
    const namespaces = entries
      .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const ledgers = await Promise.all(namespaces.map(async (ventureId) => {
      try {
        return parsePublicIdeaLedger(
          await readFile(path.join(root, ventureId, "ledger.jsonl"), "utf8"),
          ventureId
        ) ?? [];
      } catch {
        return [];
      }
    }));
    return ledgers.flat().sort((left, right) =>
      Date.parse(right.statusHistory.at(-1)!.at) - Date.parse(left.statusHistory.at(-1)!.at)
    );
  } catch {
    try {
      return parsePublicIdeaLedger(
        await readFile(path.join(ideasRoot(), "ledger.jsonl"), "utf8"),
        "global"
      ) ?? [];
    } catch {
      return [];
    }
  }
}
