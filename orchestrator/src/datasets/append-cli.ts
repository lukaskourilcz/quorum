import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../paths.js";
import { DATASET_TARGETS, type DatasetName } from "../contracts/boardless-dataset.js";
import { appendReceipt, planAppend, serializeDataset, type AppendAuthor, type ProposedEntry } from "./append.js";
import { describeVerdict } from "./verify.js";

/**
 * Stage a dataset append and write its receipt.
 *
 * Human-curated by default, which is the cheap and honest path: a person read
 * the source, so the entry's own `source` is the attestation. Pass `--agent ID`
 * only when a model drafted the entries, and then every proposal needs an
 * `evidenceRef` a reviewer can open.
 *
 *   pnpm datasets:append -- \
 *     --dataset ai-facts \
 *     --current ../aifirst/data/ai-facts.json \
 *     --entries ./new-entries.json \
 *     --out ./outbox/ai-facts.json
 *
 * The entries file is either an array of dataset entries or an array of
 * `{ entry, evidenceRef }`. Nothing here talks to GitHub: it produces the file
 * the delivery step ships and the receipt quorum keeps.
 */

const VENTURE_BY_REPO: Record<string, string> = {
  aifirst: "caught-up",
  "mma-files": "mma-files"
};

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function required(args: string[], name: string): string {
  const value = valueAfter(args, name);
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

function normalizeProposals(raw: unknown): ProposedEntry[] {
  if (!Array.isArray(raw)) throw new Error("the entries file must contain an array");
  return raw.map((item) => {
    if (item !== null && typeof item === "object" && "entry" in item) return item as ProposedEntry;
    return { entry: item } as ProposedEntry;
  });
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

export async function main(argv: string[], now: Date): Promise<number> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;

  const dataset = required(args, "--dataset") as DatasetName;
  if (!Object.hasOwn(DATASET_TARGETS, dataset)) {
    console.error(`unknown dataset ${dataset}; expected one of ${Object.keys(DATASET_TARGETS).join(", ")}`);
    return 1;
  }

  const agent = valueAfter(args, "--agent");
  const author: AppendAuthor = agent ? { kind: "agent", id: agent } : { kind: "human", name: valueAfter(args, "--by") ?? "owner" };

  const currentPath = valueAfter(args, "--current");
  const current = currentPath === undefined ? undefined : await readJson(currentPath);
  const entryCountBefore =
    current !== null && typeof current === "object" && Array.isArray((current as { entries?: unknown }).entries)
      ? ((current as { entries: unknown[] }).entries.length)
      : 0;

  const proposals = normalizeProposals(await readJson(required(args, "--entries")));

  // Only read on a bootstrap. A dataset that already exists downstream keeps its own anchor and
  // category labels, because the anchor is a reveal schedule and moving it reorders every day
  // that has already been published.
  const bootstrapPath = valueAfter(args, "--bootstrap");
  const bootstrap = bootstrapPath === undefined
    ? undefined
    : (await readJson(bootstrapPath)) as { anchor: string; categories: Record<string, { en: string; cs: string }> };

  const outcome = planAppend({ dataset, current, proposals, author, ...(bootstrap ? { bootstrap } : {}) });
  if (!outcome.ok) {
    console.error(`refused ${dataset} append:`);
    for (const violation of outcome.refusal.violations) {
      console.error(`  ${violation.code}: ${violation.detail}`);
    }
    return 1;
  }

  const { plan } = outcome;
  const out = valueAfter(args, "--out");
  if (out !== undefined) {
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, serializeDataset(plan.file), "utf8");
  }

  const venture = VENTURE_BY_REPO[plan.target.repo] ?? plan.target.repo;
  const receipt = appendReceipt({
    plan,
    proposals,
    author,
    entryCountBefore,
    recordedAt: now.toISOString()
  });
  const receiptPath = path.join(
    repoRoot,
    "state",
    "ventures",
    venture,
    "datasets",
    `${now.toISOString().slice(0, 10)}-${dataset}.json`
  );
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  console.log(
    `${dataset}: ${describeVerdict({ ok: true, appended: plan.appended, corrected: [] })} ` +
      `→ ${plan.target.repo}:${plan.target.path} [package:${plan.packageHash.slice(0, 12)}]`
  );
  console.log(`receipt: ${path.relative(repoRoot, receiptPath)}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2), new Date())
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
