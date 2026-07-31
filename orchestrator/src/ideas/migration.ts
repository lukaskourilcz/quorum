import { readFile, rm } from "node:fs/promises";
import {
  atomicWriteBuffer,
  resolveStatePath
} from "../state.js";
import {
  GLOBAL_IDEA_NAMESPACE,
  ideaIndexPath,
  ideaLedgerPath
} from "./ledger.js";

const LEGACY_LEDGER_PATH = "ideas/ledger.jsonl";
const LEGACY_INDEX_PATH = "ideas/INDEX.md";

async function optionalBuffer(root: string, relativePath: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveStatePath(root, relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export interface IdeaLedgerMigrationResult {
  status: "migrated" | "already_migrated";
  ledgerBytes: number;
  indexBytes: number;
}

export async function migrateLegacyIdeaLedger(
  root: string
): Promise<IdeaLedgerMigrationResult> {
  const [legacyLedger, legacyIndex] = await Promise.all([
    optionalBuffer(root, LEGACY_LEDGER_PATH),
    optionalBuffer(root, LEGACY_INDEX_PATH)
  ]);
  if (!legacyLedger && !legacyIndex) {
    const [ledger, index] = await Promise.all([
      optionalBuffer(root, ideaLedgerPath(GLOBAL_IDEA_NAMESPACE)),
      optionalBuffer(root, ideaIndexPath(GLOBAL_IDEA_NAMESPACE))
    ]);
    if (!ledger || !index) {
      throw new Error("Idea ledger migration found neither a complete legacy pair nor a complete global pair");
    }
    return {
      status: "already_migrated",
      ledgerBytes: ledger.byteLength,
      indexBytes: index.byteLength
    };
  }
  if (!legacyLedger || !legacyIndex) {
    throw new Error("Legacy idea ledger migration requires both ledger.jsonl and INDEX.md");
  }

  const targetLedgerPath = ideaLedgerPath(GLOBAL_IDEA_NAMESPACE);
  const targetIndexPath = ideaIndexPath(GLOBAL_IDEA_NAMESPACE);
  const [targetLedger, targetIndex] = await Promise.all([
    optionalBuffer(root, targetLedgerPath),
    optionalBuffer(root, targetIndexPath)
  ]);
  if (targetLedger && !targetLedger.equals(legacyLedger)) {
    throw new Error("Global idea ledger already exists with different bytes");
  }
  if (targetIndex && !targetIndex.equals(legacyIndex)) {
    throw new Error("Global idea index already exists with different bytes");
  }

  if (!targetLedger) await atomicWriteBuffer(root, targetLedgerPath, legacyLedger);
  if (!targetIndex) await atomicWriteBuffer(root, targetIndexPath, legacyIndex);
  await Promise.all([
    rm(resolveStatePath(root, LEGACY_LEDGER_PATH)),
    rm(resolveStatePath(root, LEGACY_INDEX_PATH))
  ]);
  return {
    status: "migrated",
    ledgerBytes: legacyLedger.byteLength,
    indexBytes: legacyIndex.byteLength
  };
}
