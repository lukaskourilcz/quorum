import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { configRoot, repoRoot } from "../paths.js";
import { createDigest } from "./digest.js";
import { summarizeSourceProbes } from "./probe.js";
import { loadSourceRegistry } from "./registry.js";
import { runScrapersDetailed } from "./run.js";

interface NetworkAllowlist {
  runtimeHosts: string[];
}

export async function runSourceShadow(
  now = new Date(),
  outputPath = path.join(repoRoot, "orchestrator", ".dry-run", "sources", "latest.json")
) {
  const [registry, allowlist] = await Promise.all([
    loadSourceRegistry(),
    readFile(path.join(configRoot, "network-allowlist.json"), "utf8").then(
      (value) => JSON.parse(value) as NetworkAllowlist
    )
  ]);
  const run = await runScrapersDetailed(registry.sources, {
    allowHosts: allowlist.runtimeHosts,
    now
  });
  const artifact = {
    schemaVersion: 1,
    mode: "shadow" as const,
    generatedAt: now.toISOString(),
    consumed: false,
    probe: summarizeSourceProbes(run.sources),
    sources: run.sources,
    digest: createDigest(run.items, 50)
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { artifact, outputPath };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const { artifact, outputPath } = await runSourceShadow();
  console.log(
    JSON.stringify(
      {
        mode: artifact.mode,
        consumed: artifact.consumed,
        sources: artifact.sources.length,
        digestItems: artifact.digest.length,
        probe: artifact.probe,
        outputPath: path.relative(repoRoot, outputPath)
      },
      null,
      2
    )
  );
}
