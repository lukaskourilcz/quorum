import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { BoutRecordSchema, EventCardSchema, FightAiQStatsEntrySchema, FighterRecordSchema } from "../contracts/mma.js";
import { FightAiQDeliverySchema, type ArticlePackage, type FightAiQDelivery } from "../contracts/mma-files.js";
import { repoRoot, stateRoot } from "../paths.js";
import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";
import { canonicalJson, sha256 } from "./hash.js";
import { loadArticlePackages } from "./store.js";
import { publicBoutMirror, publicEventMirror, publicFighterMirror } from "../fightaiq/store.js";
import {
  composeMmaBanner,
  MMA_BANNER_CONTRACT_PATH,
  mmaAdsPackageHash,
  MmaAdsDeliverySchema,
  MmaFilesBannerContractSchema
} from "./banners.js";

export type MmaDeliveryKind = "article" | "fightaiq" | "banner";
export type MmaDeliveryStatus = "delivered" | "needs_reconciliation";

export interface PendingMmaDelivery {
  kind: MmaDeliveryKind;
  packagePath: string;
  packageHash: string;
  label: string;
  slug?: string;
  imageHeroPath?: string;
  imageThumbPath?: string;
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
  bouts: Array<{ updatedAt: string }>;
  statsEntries: Array<{ generatedAt: string }>;
}): string | null {
  const values = [
    ...input.fighters.map((item) => item.updatedAt),
    ...input.events.map((item) => item.updatedAt),
    ...input.bouts.map((item) => item.updatedAt),
    ...input.statsEntries.map((item) => item.generatedAt)
  ].sort();
  return values.at(-1) ?? null;
}

export function fightAiQDeliveryHash(value: Omit<FightAiQDelivery, "packageHash">): string {
  return sha256(canonicalJson(value));
}

export async function composeFightAiQDelivery(root = stateRoot): Promise<FightAiQDelivery | null> {
  const base = path.join(root, "mma");
  const [privateFighters, privateEvents, privateBouts, statsEntries] = await Promise.all([
    parseDirectory(path.join(base, "fighters"), FighterRecordSchema),
    parseDirectory(path.join(base, "events"), EventCardSchema),
    parseDirectory(path.join(base, "bouts"), BoutRecordSchema),
    parseDirectory(path.join(base, "stats"), FightAiQStatsEntrySchema)
  ]);
  const fighters = privateFighters.map(publicFighterMirror);
  const events = privateEvents.map(publicEventMirror);
  const bouts = privateBouts.map(publicBoutMirror);
  const generatedAt = newestTimestamp({ fighters, events, bouts, statsEntries });
  if (!generatedAt) return null;
  const content = {
    schemaVersion: "fightaiq-delivery/2" as const,
    generatedAt,
    fighters,
    events,
    bouts,
    statsEntries
  };
  return FightAiQDeliverySchema.parse({ ...content, packageHash: fightAiQDeliveryHash(content) });
}

function receiptPath(kind: MmaDeliveryKind, packageHash: string): string {
  return kind === "article"
    ? `ventures/mma-files/deliveries/articles/${packageHash}.json`
    : kind === "fightaiq"
      ? `ventures/fightaiq/deliveries/${packageHash}.json`
      : `ventures/mma-files/deliveries/banners/${packageHash}.json`;
}

/**
 * Failure codes a byte-identical retry can still clear.
 *
 * Everything else is a verdict on these exact bytes: the magazine refused them once and will
 * refuse them again for the same reason. Sending them back costs a run and, in an oldest-first
 * queue that ships one package per run, holds every later article behind them.
 */
const RETRYABLE_DELIVERY_CODES = new Set(["unreachable", "push_rejected"]);

/**
 * `parked` is the state this queue used to have no word for.
 *
 * `delivered()` answered a yes/no question, so a receipt that said `needs_reconciliation` read
 * exactly like no receipt at all and the package stayed at the head of the queue. One rejected
 * article stopped MMA Files publishing for a week: every run re-sent the same bytes, the magazine
 * refused them the same way, and the three articles written since never got a turn. A parked
 * package is not lost — its receipt says what happened and the queue health report counts it.
 */
export type MmaDeliveryState = "pending" | "delivered" | "parked";

async function deliveryReceipt(
  root: string,
  kind: MmaDeliveryKind,
  packageHash: string
): Promise<{ status?: unknown; code?: unknown } | null> {
  return readJson<{ status?: unknown; code?: unknown } | null>(root, receiptPath(kind, packageHash), null);
}

function stateOfReceipt(receipt: { status?: unknown; code?: unknown } | null): MmaDeliveryState {
  if (receipt?.status === "delivered") return "delivered";
  if (receipt?.status !== "needs_reconciliation") return "pending";
  return typeof receipt.code === "string" && RETRYABLE_DELIVERY_CODES.has(receipt.code)
    ? "pending"
    : "parked";
}

export async function deliveryState(
  root: string,
  kind: MmaDeliveryKind,
  packageHash: string
): Promise<MmaDeliveryState> {
  return stateOfReceipt(await deliveryReceipt(root, kind, packageHash));
}

export interface MmaQueueEntry {
  packageHash: string;
  label: string;
  publishAt: string;
  state: MmaDeliveryState;
  code?: string;
}

/** Every published article package with the delivery state of its exact bytes, oldest first. */
export async function articleQueue(root = stateRoot): Promise<MmaQueueEntry[]> {
  const articles = (await loadArticlePackages(root))
    .filter((article) => article.status === "published")
    .sort((left, right) => left.publishAt.localeCompare(right.publishAt) || left.slot.localeCompare(right.slot));
  const entries: MmaQueueEntry[] = [];
  for (const article of articles) {
    const receipt = await deliveryReceipt(root, "article", article.packageHash);
    entries.push({
      packageHash: article.packageHash,
      label: `${article.publishAt.slice(0, 10)} ${article.slot.toUpperCase()} ${article.slug}`,
      publishAt: article.publishAt,
      state: stateOfReceipt(receipt),
      ...(typeof receipt?.code === "string" ? { code: receipt.code } : {})
    });
  }
  return entries;
}

export async function nextArticleDelivery(root = stateRoot): Promise<PendingMmaDelivery | null> {
  const articles = (await loadArticlePackages(root))
    .filter((article) => article.status === "published")
    .sort((left, right) => left.publishAt.localeCompare(right.publishAt) || left.slot.localeCompare(right.slot));
  for (const article of articles) {
    if (await deliveryState(root, "article", article.packageHash) !== "pending") continue;
    const filename = `${article.publishAt.slice(0, 10)}-${article.slot}-${article.slug}.json`;
    return {
      kind: "article",
      packagePath: path.join(root, "ventures", "mma-files", "articles", filename),
      packageHash: article.packageHash,
      label: `${article.publishAt.slice(0, 10)} ${article.slot.toUpperCase()} ${article.slug}`,
      slug: article.slug,
      imageHeroPath: article.image.hero_path,
      imageThumbPath: article.image.thumb_path
    };
  }
  return null;
}

export async function nextFightAiQDelivery(root = stateRoot, workspaceRoot = repoRoot): Promise<PendingMmaDelivery | null> {
  const feed = await composeFightAiQDelivery(root);
  if (!feed || await deliveryState(root, "fightaiq", feed.packageHash) !== "pending") return null;
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

export async function nextBannerDelivery(root = stateRoot, workspaceRoot = repoRoot): Promise<PendingMmaDelivery | null> {
  const contract = MmaFilesBannerContractSchema.parse(await readJson(root, MMA_BANNER_CONTRACT_PATH, null));
  if (contract.status === "delivered") return null;
  const composed = await composeMmaBanner(root);
  if (await deliveryState(root, "banner", composed.packageHash) !== "pending") return null;
  const directory = path.join(workspaceRoot, "tmp", "mma-files-delivery");
  await mkdir(directory, { recursive: true });
  const packagePath = path.join(directory, `banner-${composed.packageHash}.json`);
  await writeFile(packagePath, `${JSON.stringify(composed.delivery, null, 2)}\n`);
  return {
    kind: "banner",
    packagePath,
    packageHash: composed.packageHash,
    label: `Banner set ${composed.delivery.updatedAt}`
  };
}

export async function nextMmaDelivery(kind: MmaDeliveryKind, root = stateRoot, workspaceRoot = repoRoot): Promise<PendingMmaDelivery | null> {
  if (kind === "article") return nextArticleDelivery(root);
  if (kind === "fightaiq") return nextFightAiQDelivery(root, workspaceRoot);
  return nextBannerDelivery(root, workspaceRoot);
}

/** Where MMA Files serves a delivered article. Both locales are prefixed. */
const MMA_FILES_SITE = "https://mma-files.vercel.app";

/**
 * What the owner reads when a delivery does not complete.
 *
 * The failure code and the runner's log belong in the INBOX item and nowhere else — the edition
 * path learned that after a public decision summary published a CI path and a command line.
 */
const MMA_DELIVERY_FAILURE_SENTENCE: Record<string, string> = {
  schema_invalid: "The finished article did not match the delivery format the magazine accepts, so it was not published.",
  content_invalid: "The finished article failed its content checks on the way out, so it was not published.",
  push_rejected: "The magazine repository refused the delivery, so the article is not published yet.",
  target_gate_failed: "The magazine could not build the delivered article, so it is not published yet.",
  hash_conflict: "A different article already holds this date and slot in the magazine, so this one was held back.",
  post_deploy_verification: "The delivered article did not verify on the live site, so it was rolled back.",
  unreachable: "The magazine could not be reached, so the article is waiting to be delivered."
};

/**
 * Raise the owner item a failed MMA delivery never raised.
 *
 * The edition path has done this since 5 August; this one wrote a receipt and stopped. So a
 * delivery could fail every run for a week with the room reading as a success, no item on the
 * owner's list, and nothing anywhere that said the magazine had stopped publishing.
 */
async function raiseMmaInboxOnce(
  root: string,
  label: string,
  code: string,
  detail: string
): Promise<boolean> {
  const existing = await readText(root, "INBOX.md", "# INBOX\n");
  const marker = `MMA-FILES-DELIVERY-${label}`;
  if (existing.includes(marker)) return false;
  const sentence = MMA_DELIVERY_FAILURE_SENTENCE[code] ?? "The delivery stopped before the magazine accepted it.";
  const item = [
    `- [ ] **${marker}** — ${code}: ${detail.replace(/\s+/gu, " ").trim().slice(0, 300)}.`,
    `  ${sentence} RELAY marked the delivery \`needs_reconciliation\`; same-slot content must not be overwritten automatically.`,
    "  [imp:5] [owner:me] [time:20m] [kind:deploy]"
  ].join("\n");
  await atomicWriteText(root, "INBOX.md", `${existing.trimEnd()}\n\n${item}\n`);
  return true;
}

/** Tick the item for a slot the moment that slot actually delivers, so the list does not grow forever. */
async function closeMmaInboxItem(root: string, label: string, now: Date): Promise<boolean> {
  const existing = await readText(root, "INBOX.md", "# INBOX\n");
  const open = `- [ ] **MMA-FILES-DELIVERY-${label}**`;
  if (!existing.includes(open)) return false;
  await atomicWriteText(root, "INBOX.md", existing.replace(
    open,
    `- [x] **MMA-FILES-DELIVERY-${label}** — Resolved ${now.toISOString().slice(0, 10)}: this slot delivered on a later run. Original report:`
  ));
  return true;
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
  let articleUrl: string | null = null;
  let articleLabel: string | null = null;
  let bannerManifest: ReturnType<typeof MmaAdsDeliverySchema.parse> | null = null;
  if (input.kind === "article") {
    const article = JSON.parse(await readFile(input.packagePath, "utf8")) as ArticlePackage;
    if (article.packageHash !== input.packageHash) throw new Error("Article receipt hash differs from package");
    articleLabel = `${article.publishAt.slice(0, 10)}-${article.slot}`;
    // The receipt named a commit and a hash and nothing a reader could open. The desk knows
    // where the magazine serves the article the moment it delivers it.
    if (input.status === "delivered") articleUrl = `${MMA_FILES_SITE}/cs/articles/${article.slug}`;
  } else if (input.kind === "fightaiq") {
    const feed = FightAiQDeliverySchema.parse(JSON.parse(await readFile(input.packagePath, "utf8")));
    if (feed.packageHash !== input.packageHash || fightAiQDeliveryHash((({ packageHash: _packageHash, ...content }) => content)(feed)) !== feed.packageHash) {
      throw new Error("FightAIQ receipt hash differs from package");
    }
  } else {
    const banner = MmaAdsDeliverySchema.parse(JSON.parse(await readFile(input.packagePath, "utf8")));
    bannerManifest = banner;
    const composed = await composeMmaBanner(root);
    if (
      mmaAdsPackageHash(banner) !== input.packageHash
      || composed.packageHash !== input.packageHash
      || canonicalJson(composed.delivery) !== canonicalJson(banner)
    ) {
      throw new Error("MMA banner receipt hash differs from the staged package");
    }
  }
  const relative = input.kind === "article"
    ? `ventures/mma-files/deliveries/articles/${input.packageHash}.json`
    : input.kind === "fightaiq"
      ? `ventures/fightaiq/deliveries/${input.packageHash}.json`
      : `ventures/mma-files/deliveries/banners/${input.packageHash}.json`;
  await atomicWriteJson(root, relative, {
    schemaVersion: "mma-files-delivery-receipt/1",
    kind: input.kind,
    packageHash: input.packageHash,
    status: input.status,
    targetRepository: "lukaskourilcz/mma-files",
    ...(input.targetCommit ? { targetCommit: input.targetCommit } : {}),
    ...(articleUrl ? { articleUrl } : {}),
    ...(input.code ? { code: input.code } : {}),
    ...(input.detail ? { detail: input.detail.replace(/\s+/gu, " ").trim().slice(0, 500) } : {}),
    recordedAt: (input.now ?? new Date()).toISOString()
  });
  if (articleLabel) {
    const now = input.now ?? new Date();
    if (input.status === "delivered") await closeMmaInboxItem(root, articleLabel, now);
    else await raiseMmaInboxOnce(root, articleLabel, input.code ?? "push_rejected", input.detail ?? "Delivery stopped without a reconciled target commit");
  }
  if (input.kind === "banner" && input.status === "delivered") {
    const contract = MmaFilesBannerContractSchema.parse(await readJson(root, MMA_BANNER_CONTRACT_PATH, null));
    await atomicWriteJson(root, MMA_BANNER_CONTRACT_PATH, {
      ...contract,
      status: "delivered",
      receiptRef: relative
    });
    await atomicWriteJson(root, "ventures/mma-files/banners/delivered.json", {
      schemaVersion: bannerManifest!.schemaVersion,
      updatedAt: bannerManifest!.updatedAt,
      slots: Object.fromEntries(Object.entries(bannerManifest!.slots).map(([slotId, slot]) => [
        slotId,
        {
          ...slot,
          image: slot.image ? (({ bytes_base64: _bytes, ...image }) => image)(slot.image) : null
        }
      ]))
    });
  }
  return relative;
}
