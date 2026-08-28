import path from "node:path";
import process from "node:process";
import { repoRoot } from "../paths.js";
import { auditSocialDistributionMigration, persistSocialDistributionMigrationAudit } from "./migration-audit.js";

const write = process.argv.includes("--write");
const stateRoot = process.env.BOARDLESSAI_STATE_ROOT ?? path.join(repoRoot, "state");
const result = write
  ? await persistSocialDistributionMigrationAudit({ repoRoot, stateRoot })
  : { audit: await auditSocialDistributionMigration({ repoRoot, stateRoot }), path: null, written: false };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
