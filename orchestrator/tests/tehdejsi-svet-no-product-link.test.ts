import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

/**
 * The product repository is not reachable from here, and this is what says so.
 *
 * Tehdejsi svet markets an application that lives in `lukaskourilcz/dontwannaknow`. The owner's
 * rule is that the two repositories stay strangers: no workflow, CLI, clone, token or API call
 * crosses. What crosses is a facts file a human copies in by hand.
 *
 * A read-only pin would have assumed a connection worth keeping read-only. This is stronger and
 * cheaper: nothing that runs may name the product repository at all, so there is no connection
 * to misuse, forget about or quietly widen later.
 *
 * Prose may name it — the design docs, the founding decision and this comment all have to. Only
 * the code, configuration and workflows are held to silence.
 */
const EXECUTABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".sh"]);
const SKIPPED_DIRECTORIES = new Set([
  "node_modules", ".git", "dist", ".next", "coverage", "tmp", "docs", "state", ".claude", ".agents"
]);
const FORBIDDEN = /dontwannaknow|tehdejsisvet\.(?:cz|com)/iu;

async function executableFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...await executableFiles(full));
      continue;
    }
    if (EXECUTABLE_EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

describe("Tehdejsi svet keeps no link to the product repository", () => {
  it("names it nowhere that runs", async () => {
    const roots = ["orchestrator/src", "orchestrator/prompts", "site/src", "studio/src", "config", "scripts", ".github"];
    const offenders: string[] = [];
    for (const relative of roots) {
      const directory = path.join(repoRoot, relative);
      for (const file of await executableFiles(directory).catch(() => [])) {
        if (FORBIDDEN.test(await readFile(file, "utf8"))) offenders.push(path.relative(repoRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the product's host out of the network allowlist", async () => {
    const allowlist = await readFile(path.join(repoRoot, "config/network-allowlist.json"), "utf8");
    expect(FORBIDDEN.test(allowlist)).toBe(false);
  });
});
