import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditOperationsRelease } from "./release-audit.js";

async function main(): Promise<void> {
  const audit = await auditOperationsRelease();
  console.log(JSON.stringify(audit, null, 2));
  if (audit.status !== "pass") process.exitCode = 1;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) await main();
