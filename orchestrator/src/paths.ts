import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(moduleDirectory, "../..");
export const stateRoot = path.join(repoRoot, "state");
export const configRoot = path.join(repoRoot, "config");
/** Room contracts and personas, read at runtime so a prompt change needs no code change. */
export const promptRoot = path.join(repoRoot, "orchestrator", "prompts");

const nestedPersonaDirectories: Readonly<Record<string, string>> = {
  booker: "door-money",
  ghost: "door-money"
};

export function personaPromptRelativePath(slug: string): string {
  const directory = nestedPersonaDirectories[slug];
  return directory ? path.join(directory, `${slug}.md`) : `${slug}.md`;
}

export function personaPromptPath(slug: string): string {
  return path.join(promptRoot, personaPromptRelativePath(slug));
}

export function withinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
