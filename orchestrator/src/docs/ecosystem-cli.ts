import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshEcosystemOperatingTruth } from "./ecosystem.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const result = await refreshEcosystemOperatingTruth({
  repoRoot,
  check: process.argv.includes("--check")
});
console.log(`${result.path}: ${result.changed ? "refreshed" : "current"}`);
