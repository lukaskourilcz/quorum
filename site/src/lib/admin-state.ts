import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot =
  process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const stateDirectory = path.join(repositoryRoot, "state");

async function readStateFile(relativePath: string): Promise<string> {
  const target = path.resolve(stateDirectory, relativePath);
  const relative = path.relative(stateDirectory, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Admin state path escaped its root");
  }
  try {
    return await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "Unavailable in this runtime.";
    }
    throw error;
  }
}

export interface AdminSnapshot {
  generatedAt: string;
  brand: string;
  business: string;
  finance: string;
  experiments: string;
  inbox: string;
  opportunities: string;
  social: string;
  budgetLedger: string;
  financeLedger: string;
  treasuryLedger: string;
}

export async function readAdminSnapshot(): Promise<AdminSnapshot> {
  const [
    brand,
    business,
    finance,
    experiments,
    inbox,
    opportunities,
    social,
    budgetLedger,
    financeLedger,
    treasuryLedger
  ] = await Promise.all([
    readStateFile("BRAND.md"),
    readStateFile("BUSINESS.md"),
    readStateFile("FINANCE.md"),
    readStateFile("EXPERIMENTS.md"),
    readStateFile("INBOX.md"),
    readStateFile("OPPORTUNITIES.md"),
    readStateFile("SOCIAL_STRATEGY.md"),
    readStateFile("budget/ledger.json"),
    readStateFile("finance/ledger.json"),
    readStateFile("treasury/ledger.json")
  ]);
  return {
    generatedAt: new Date().toISOString(),
    brand,
    business,
    finance,
    experiments,
    inbox,
    opportunities,
    social,
    budgetLedger,
    financeLedger,
    treasuryLedger
  };
}
