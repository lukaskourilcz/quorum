import { readFile, readdir, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { WebDevRenderReceiptSchema } from "../../contracts/webdev-signal.js";
import { retentionKeepFrom } from "../../social/media/retention.js";

/**
 * How long a rendered WebDev Signal panel stays in `state/ventures/webdev-signal/design-lab/assets/`.
 *
 * Four weeks: the admin draft card shows the last fortnight of packages, so every card it shows
 * still has its panels, with two weeks to spare for a late manual post. A selected day adds one to
 * two megabytes of PNG to every checkout, and Vercel traces the directory into the functions that
 * read it. Every panel can be rendered again from its committed payload, and the render receipt,
 * which stays, keeps each panel's hash.
 */
export const WEBDEV_PANEL_RETENTION_DAYS = 28;

const ASSETS = "ventures/webdev-signal/design-lab/assets";
const RECEIPTS = "ventures/webdev-signal/design-lab/receipts";
const HASH = /^[a-f0-9]{64}$/u;
const ASSET_REF = /^state\/ventures\/webdev-signal\/design-lab\/assets\/([a-f0-9]{64})\/(cs|en)\/\d{2}\.png$/u;
const PACKAGE_DATE = /\/packages\/(\d{4}-\d{2}-\d{2})-(?:cs|en)\.json$/u;

export interface WebDevPanelRetention {
  keepFrom: string;
  /** `<payload hash>/<locale>` directories removed, relative to the assets directory. */
  removed: string[];
  kept: number;
  /** Directories no readable receipt names; never removed. */
  unmanaged: number;
}

async function names(directory: string): Promise<string[]> {
  return readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
}

async function subdirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? [] : Promise.reject(error));
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/**
 * The newest day each rendered directory belongs to, from the receipts that name its files. A
 * cache-reusing receipt names the same files under a later package, and the later day wins.
 */
async function directoryDates(stateRoot: string): Promise<Map<string, string>> {
  const dates = new Map<string, string>();
  const directory = path.join(stateRoot, RECEIPTS);
  for (const name of (await names(directory)).filter((entry) => entry.endsWith(".json"))) {
    const parsed = WebDevRenderReceiptSchema.safeParse(
      await readFile(path.join(directory, name), "utf8").then((raw) => JSON.parse(raw) as unknown).catch(() => null)
    );
    if (!parsed.success) continue;
    const day = parsed.data.packageRef.match(PACKAGE_DATE)?.[1] ?? parsed.data.export.completedAt.slice(0, 10);
    for (const output of parsed.data.outputs) {
      const match = output.assetRef.match(ASSET_REF);
      if (!match) continue;
      const key = `${match[1]}/${match[2]}`;
      if ((dates.get(key) ?? "") < day) dates.set(key, day);
    }
  }
  return dates;
}

/**
 * Remove rendered panel directories whose newest day falls before the retention window.
 *
 * Runs in the cycle's daily queue-health step, which stages only deletions. A directory no
 * readable receipt names stays, because nothing says which day it belongs to.
 */
export async function pruneWebDevSignalPanels(input: {
  stateRoot: string;
  today: string;
  retentionDays?: number;
}): Promise<WebDevPanelRetention> {
  const keepFrom = retentionKeepFrom(input.today, input.retentionDays ?? WEBDEV_PANEL_RETENTION_DAYS);
  const dates = await directoryDates(input.stateRoot);
  const assets = path.join(input.stateRoot, ASSETS);
  const removed: string[] = [];
  let kept = 0;
  let unmanaged = 0;
  for (const hash of await subdirectories(assets)) {
    if (!HASH.test(hash)) { unmanaged += 1; continue; }
    for (const locale of await subdirectories(path.join(assets, hash))) {
      const key = `${hash}/${locale}`;
      const day = dates.get(key);
      if (!day) { unmanaged += 1; continue; }
      if (day >= keepFrom) { kept += 1; continue; }
      await rm(path.join(assets, hash, locale), { recursive: true, force: true });
      removed.push(key);
    }
    if ((await names(path.join(assets, hash))).length === 0) await rmdir(path.join(assets, hash));
  }
  return { keepFrom, removed, kept, unmanaged };
}
