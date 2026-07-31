import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  throw new Error("usage: node scripts/sync-contracts.mjs <target-repository>");
}

const source = path.resolve("contracts");
const destination = path.resolve(target, "contracts");
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
