import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../paths.js";
import { loadSourceRegistry } from "../sources/registry.js";
import { SourceItemSchema, type SourceItem } from "../sources/types.js";
import { writeEditionArtifact } from "./artifact.js";
import { loadEditionQualityConfig } from "./config.js";
import {
  FixtureEditionModelGateway,
  type FixtureModelResponse
} from "./fixture.js";
import { produceEdition } from "./production.js";
import { EditionRunReporter } from "./report.js";

const FIXTURE_ROOT = path.join(
  repoRoot,
  "orchestrator",
  "tests",
  "fixtures",
  "edition"
);

async function fixtureJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(FIXTURE_ROOT, name), "utf8")) as T;
}

export async function runEditionDry(): Promise<{
  status: "edition" | "no_edition";
  packageHash: string;
  files: string[];
  report: ReturnType<EditionRunReporter["build"]>;
}> {
  const now = new Date("2026-08-04T03:55:00.000Z");
  const date = now.toISOString().slice(0, 10);
  const [rawItems, responses, config, registry] = await Promise.all([
    fixtureJson<unknown[]>("source-items.json"),
    fixtureJson<FixtureModelResponse[]>("model-responses.json"),
    loadEditionQualityConfig(),
    loadSourceRegistry()
  ]);
  const items: SourceItem[] = rawItems.map((item) => SourceItemSchema.parse(item));
  const sourceIds = [...new Set(items.map((item) => item.sourceId))];
  const reporter = new EditionRunReporter(
    date,
    "dry_run",
    () => new Date(now),
    `edition-dry-${date}`
  );
  const result = await produceEdition({
    date,
    now,
    items,
    sources: registry.sources,
    sourceResults: sourceIds.map((sourceId) => ({
      sourceId,
      status: "success" as const,
      candidateItems: items.filter((item) => item.sourceId === sourceId).length,
      durationMs: 0,
      errorCode: null,
      errorMessage: null
    })),
    recentEditionTags: [["policy"], ["hardware"], ["research"], ["media"]],
    meetingRef: `meetings/${date}-cu-edition`,
    roomUrl: `https://boardless.example/meetings/${date}-cu-edition`,
    whyThisStory: "Four independent sources document a price cut that changes production budgets.",
    mode: "dry_run",
    config,
    gateway: new FixtureEditionModelGateway(responses),
    reporter,
    heroEnabled: false
  });
  const files = await writeEditionArtifact(result.package, result.report);
  return {
    status: result.package.status,
    packageHash: result.package.idempotencyKey,
    files: files.map((file) => path.relative(repoRoot, file)),
    report: result.report
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const result = await runEditionDry();
  console.log(JSON.stringify(result, null, 2));
}
