import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ImplementationManifestRegistrySchema,
  type ImplementationManifestRegistry
} from "../contracts/implementation-program.js";
import { repoRoot } from "../paths.js";

export const IMPLEMENTATION_MANIFEST_PATH = "config/implementation-programs.json";

export async function readImplementationManifestRegistry(
  root = repoRoot
): Promise<ImplementationManifestRegistry> {
  const raw = await readFile(path.join(root, IMPLEMENTATION_MANIFEST_PATH), "utf8");
  return ImplementationManifestRegistrySchema.parse(JSON.parse(raw) as unknown);
}
