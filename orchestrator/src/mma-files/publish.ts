import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { EdgeReportSchema, EventCardSchema, FighterRecordSchema, ModelRunSchema, OddsSnapshotSchema, SlipOfTenSchema, TrackRecordSchema } from "../contracts/mma.js";
import { FightAiQDeliverySchema, type ArticlePackage, type FightAiQDelivery } from "../contracts/mma-files.js";
import { repoRoot, stateRoot } from "../paths.js";
import { atomicWriteJson, readJson } from "../state.js";
import { canonicalJson, sha256 } from "./hash.js";
import { loadArticlePackages } from "./store.js";

export type MmaDeliveryKind = "article" | "fightaiq";
export type MmaDeliveryStatus = "delivered" | "needs_reconciliation";

export interface PendingMmaDelivery {
  kind: MmaDeliveryKind;
  packagePath: string;
  packageHash: string;
  label: string;
}

async function jsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
      ? jsonFiles(path.join(directory, entry.name))
      : Promise.resolve(entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : [])));
    return nested.flat().sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function parseDirectory<T>(directory: string, schema: z.ZodType<T>): Promise<T[]> {
  const values: T[] = [];
  for (const file of await jsonFiles(directory)) {
    values.push(schema.parse(JSON.parse(await readFile(file, "utf8"))));
  }
  return values;
}

function newestTimestamp(input: {
  fighters: Array<{ updatedAt: string }>;
  events: Array<{ updatedAt: string }>;
  odds: Array<{ capturedAt: string }>;
  modelRuns: Array<{ createdAt: string }>;
  edgeReports: Array<{ generatedAt: string }>;
  slips: Array<{ generatedAt: string }>;
  trackRecord: { updatedAt: string } | null;
}): string | null {
  const values = [
    ...input.fighters.map((item) => item.updatedAt),
    ...input.events.map((item) => item.updatedAt),
    ...input.odds.map((item) => item.capturedAt),
    ...input.modelRuns.map((item) => item.createdAt),
    ...input.edgeReports.map((item) => item.generatedAt),
    ...input.slips.map((item) => item.generatedAt),
    ...(input.trackRecord ? [input.trackRecord.updatedAt] : [])
  ].sort();
  return values.at(-1) ?? null;
}

export function fightAiQDeliveryHash(value: Omit<FightAiQDelivery, "packageHash">): string {
  return sha256(canonicalJson(value));
}

export async function composeFightAiQDelivery(root = stateRoot): Promise<FightAiQDelivery | null> {
  const base = path.join(root, "ventures", "fightaiq");
  const [fighters, events, odds, modelRuns, edgeReports, slips] = await Promise.all([
    parseDirectory(path.join(base, "fighters"), FighterRecordSchema),
    parseDirectory(path.join(base, "events"), EventCardSchema),
    parseDirectory(path.join(base, "odds"), OddsSnapshotSchema),
    parseDirectory(path.join(base, "model-runs"), ModelRunSchema),
    parseDirectory(path.join(base, "edge-reports"), EdgeReportSchema),
    parseDirectory(path.join(base, "slips"), SlipOfTenSchema)
  ]);
  const trackRecord = await readJson<unknown>(root, "ventures/fightaiq/track-record.json", null)
    .then((value) => value === null ? null : TrackRecordSchema.parse(value));
  const generatedAt = newestTimestamp({ fighters, events, odds, modelRuns, edgeReports, slips, trackRecord });
  if (!generatedAt) return null;
  const content = {
    schemaVersion: "fightaiq-delivery/1" as const,
    generatedAt,
    fighters,
    events,
    odds,
    modelRuns,
    edgeReports,
    slips,
    trackRecord
  };
  return FightAiQDeliverySchema.parse({ ...content, packageHash: fightAiQDeliveryHash(content) });
}

async function delivered(root: string, kind: MmaDeliveryKind, packageHash: string): Promise<boolean> {
  const relative = kind === "article"
    ? `ventures/mma-files/deliveries/articles/${packageHash}.json`
    : `ventures/fightaiq/deliveries/${packageHash}.json`;
  const receipt = await readJson<{ status?: unknown } | null>(root, relative, null);
  return receipt?.status === "delivered";
}

export async function nextArticleDelivery(root = stateRoot): Promise<PendingMmaDelivery | null> {
  const articles = (await loadArticlePackages(root))
    .filter((article) => article.status === "published")
    .sort((left, right) => left.publishAt.localeCompare(right.publishAt) || left.slot.localeCompare(right.slot));
  for (const article of articles) {
    if (await delivered(root, "article", article.packageHash)) continue;
    const filename = `${article.publishAt.slice(0, 10)}-${article.slot}-${article.slug}.json`;
    return {
      kind: "article",
      packagePath: path.join(root, "ventures", "mma-files", "articles", filename),
      packageHash: article.packageHash,
      label: `${article.publishAt.slice(0, 10)} ${article.slot.toUpperCase()} ${article.slug}`
    };
  }
  return null;
}

export async function nextFightAiQDelivery(root = stateRoot, workspaceRoot = repoRoot): Promise<PendingMmaDelivery | null> {
  const feed = await composeFightAiQDelivery(root);
  if (!feed || await delivered(root, "fightaiq", feed.packageHash)) return null;
  const directory = path.join(workspaceRoot, "tmp", "mma-files-delivery");
  await mkdir(directory, { recursive: true });
  const packagePath = path.join(directory, `fightaiq-${feed.packageHash}.json`);
  await writeFile(packagePath, `${JSON.stringify(feed, null, 2)}\n`);
  return {
    kind: "fightaiq",
    packagePath,
    packageHash: feed.packageHash,
    label: `FightAIQ snapshot ${feed.generatedAt}`
  };
}

export async function nextMmaDelivery(kind: MmaDeliveryKind, root = stateRoot, workspaceRoot = repoRoot): Promise<PendingMmaDelivery | null> {
  return kind === "article" ? nextArticleDelivery(root) : nextFightAiQDelivery(root, workspaceRoot);
}

export async function recordMmaDelivery(input: {
  kind: MmaDeliveryKind;
  packageHash: string;
  packagePath: string;
  status: MmaDeliveryStatus;
  targetCommit?: string;
  code?: string;
  detail?: string;
  now?: Date;
  root?: string;
}): Promise<string> {
  const root = input.root ?? stateRoot;
  if (!/^[a-f0-9]{64}$/u.test(input.packageHash)) throw new Error("Invalid MMA Files package hash");
  if (input.kind === "article") {
    const article = JSON.parse(await readFile(input.packagePath, "utf8")) as ArticlePackage;
    if (article.packageHash !== input.packageHash) throw new Error("Article receipt hash differs from package");
  } else {
    const feed = FightAiQDeliverySchema.parse(JSON.parse(await readFile(input.packagePath, "utf8")));
    if (feed.packageHash !== input.packageHash || fightAiQDeliveryHash((({ packageHash: _packageHash, ...content }) => content)(feed)) !== feed.packageHash) {
      throw new Error("FightAIQ receipt hash differs from package");
    }
  }
  const relative = input.kind === "article"
    ? `ventures/mma-files/deliveries/articles/${input.packageHash}.json`
    : `ventures/fightaiq/deliveries/${input.packageHash}.json`;
  await atomicWriteJson(root, relative, {
    schemaVersion: "mma-files-delivery-receipt/1",
    kind: input.kind,
    packageHash: input.packageHash,
    status: input.status,
    targetRepository: "lukaskourilcz/mma-files",
    ...(input.targetCommit ? { targetCommit: input.targetCommit } : {}),
    ...(input.code ? { code: input.code } : {}),
    ...(input.detail ? { detail: input.detail.replace(/\s+/gu, " ").trim().slice(0, 500) } : {}),
    recordedAt: (input.now ?? new Date()).toISOString()
  });
  return relative;
}
