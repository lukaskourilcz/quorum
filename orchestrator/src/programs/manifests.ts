import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ImplementationManifestRegistrySchema,
  type ImplementationManifestRegistry,
  type ImplementationProgram,
  type ImplementationWorkItem
} from "../contracts/implementation-program.js";
import { repoRoot } from "../paths.js";

export const IMPLEMENTATION_MANIFEST_PATH = "config/implementation-programs.json";

export async function readImplementationManifestRegistry(
  root = repoRoot
): Promise<ImplementationManifestRegistry> {
  const raw = await readFile(path.join(root, IMPLEMENTATION_MANIFEST_PATH), "utf8");
  return ImplementationManifestRegistrySchema.parse(JSON.parse(raw) as unknown);
}

export function indexImplementationManifest(registry: ImplementationManifestRegistry): {
  programs: ReadonlyMap<string, ImplementationProgram>;
  workItems: ReadonlyMap<string, ImplementationWorkItem>;
} {
  return {
    programs: new Map(registry.programs.map((program) => [program.id, program])),
    workItems: new Map(registry.workItems.map((item) => [item.id, item]))
  };
}
