import { repoRoot } from "../paths.js";
import { atomicWriteText, readText } from "../state.js";

/**
 * A provider the licensed search could not use, written where the owner reads their own to-do list.
 *
 * Never a key, present or absent as a value. The run report and this file may say that a provider
 * was skipped for want of one and may say nothing else about it.
 *
 * Both magazines had their own copy of this and both wrote the same sentence into the same file.
 * One copy, so a change to where the owner document lives is one edit rather than two.
 */
export async function recordSkippedProviders(
  skipped: readonly { provider: string; reason: string }[]
): Promise<void> {
  if (skipped.length === 0) return;
  const relative = "docs/NEEDED.md";
  const current = await readText(repoRoot, relative, "# Needs your help now\n");
  const additions = skipped
    .filter(({ provider }) => !current.includes(`${provider.toUpperCase()}_API_KEY`))
    .map(({ provider }) => `- [ ] Add \`${provider.toUpperCase()}_API_KEY\` to GitHub Actions so the licensed-photo search can use ${provider}. Openverse and Wikimedia remain active without it.`);
  if (additions.length === 0) return;
  await atomicWriteText(repoRoot, relative, `${current.trimEnd()}\n\n${additions.join("\n")}\n`);
}
