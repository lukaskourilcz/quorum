import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot } from "../paths.js";
import {
  SourceRegistrySchema,
  type SourceRegistry
} from "./types.js";

export async function loadSourceRegistry(
  registryPath = path.join(configRoot, "sources.json")
): Promise<SourceRegistry> {
  return SourceRegistrySchema.parse(
    JSON.parse(await readFile(registryPath, "utf8")) as unknown
  );
}
