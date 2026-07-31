import path from "node:path";
import { pathToFileURL } from "node:url";
import { stateRoot } from "../paths.js";
import { migrateLegacyIdeaLedger } from "./migration.js";

async function main(): Promise<void> {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : stateRoot;
  console.log(JSON.stringify(await migrateLegacyIdeaLedger(root), null, 2));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) {
  await main();
}
