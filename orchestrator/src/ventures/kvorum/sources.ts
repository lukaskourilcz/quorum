import { readFile } from "node:fs/promises";
import path from "node:path";
import { KvorumSourceRegistrySchema, type KvorumSourceRegistry } from "../../contracts/kvorum-sources.js";
import { configRoot } from "../../paths.js";

export async function loadKvorumSourceRegistry(
  filePath = path.join(configRoot, "kvorum-sources.json")
): Promise<KvorumSourceRegistry> {
  return KvorumSourceRegistrySchema.parse(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}
