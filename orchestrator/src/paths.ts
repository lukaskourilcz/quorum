import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(moduleDirectory, "../..");
export const stateRoot = path.join(repoRoot, "state");
export const configRoot = path.join(repoRoot, "config");

export function withinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

