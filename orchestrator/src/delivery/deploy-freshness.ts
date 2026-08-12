import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Whether each magazine is actually serving the last thing we delivered to it.
 *
 * A delivery has three steps and only two of them were ever checked: the package is accepted, the
 * commit lands on the magazine's `main`, and the host rebuilds. On 12 August the third one did not
 * happen. The commit was on `main`, the gate was green, the host reported no errors — and the
 * article was not on the site, because no build was ever triggered for that commit. Nothing
 * anywhere could tell: every record we keep says the delivery succeeded, and it did. What failed
 * was downstream of everything we record.
 *
 * So this asks the only question the receipts cannot answer, and asks it of the live site: is the
 * newest delivered thing actually being served? A receipt says what we sent. This says what a
 * reader can open, which is the difference between publishing and having published.
 *
 * Cheap on purpose — one conditional GET per magazine per day, against a static artifact that only
 * exists once a build has run. It never fails the run: an unreachable site is a network answer,
 * not a verdict, and treating it as one would turn every blip into a false alarm about content
 * that is fine.
 */

export type DeployProbe = (url: string) => Promise<number>;

export interface DeployFreshness {
  venture: "mma-files" | "caught-up";
  /** The artifact a reader could open if the last delivery had been built. */
  url: string;
  /** What we expect to be live, for the owner item. */
  expected: string;
  status: number | null;
  /** Null when nothing has been delivered yet, so there is nothing to be behind on. */
  live: boolean | null;
}

const SITE: Readonly<Record<string, string>> = {
  "mma-files": "https://mma-files.vercel.app",
  "caught-up": "https://caughtup-ai.vercel.app"
};

async function defaultProbe(url: string): Promise<number> {
  const response = await fetch(url, { method: "GET", redirect: "follow" });
  return response.status;
}

/** The newest date with a delivered edition receipt, or null. */
async function newestDeliveredEdition(root: string): Promise<string | null> {
  const directory = path.join(root, "edition", "deliveries");
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse();
    for (const name of names) {
      const receipt = JSON.parse(await readFile(path.join(directory, name), "utf8")) as { status?: unknown; date?: unknown };
      if (receipt.status === "delivered" && typeof receipt.date === "string") return receipt.date;
    }
  } catch {
    return null;
  }
  return null;
}

/** The slug of the newest article with a delivered receipt, or null. */
async function newestDeliveredArticle(root: string): Promise<string | null> {
  const receipts = path.join(root, "ventures", "mma-files", "deliveries", "articles");
  const articles = path.join(root, "ventures", "mma-files", "articles");
  try {
    const delivered = new Set<string>();
    for (const name of await readdir(receipts)) {
      if (!name.endsWith(".json")) continue;
      const receipt = JSON.parse(await readFile(path.join(receipts, name), "utf8")) as { status?: unknown; packageHash?: unknown };
      if (receipt.status === "delivered" && typeof receipt.packageHash === "string") delivered.add(receipt.packageHash);
    }
    const names = (await readdir(articles)).filter((name) => name.endsWith(".json")).sort().reverse();
    for (const name of names) {
      const pkg = JSON.parse(await readFile(path.join(articles, name), "utf8")) as { packageHash?: unknown; slug?: unknown };
      if (typeof pkg.packageHash === "string" && delivered.has(pkg.packageHash) && typeof pkg.slug === "string") return pkg.slug;
    }
  } catch {
    return null;
  }
  return null;
}

async function probeOne(input: {
  venture: DeployFreshness["venture"];
  expected: string | null;
  url: string | null;
  probe: DeployProbe;
}): Promise<DeployFreshness> {
  if (!input.expected || !input.url) {
    return { venture: input.venture, url: "", expected: "", status: null, live: null };
  }
  // A throw is the network, not the magazine. Recorded as unknown rather than as behind, because
  // an owner item that fires on a flaky fetch is one nobody reads by the second week.
  const status = await input.probe(input.url).catch(() => null);
  return {
    venture: input.venture,
    url: input.url,
    expected: input.expected,
    status,
    live: status === null ? null : status === 200
  };
}

export async function readDeployFreshness(input: {
  root: string;
  probe?: DeployProbe;
}): Promise<DeployFreshness[]> {
  const probe = input.probe ?? defaultProbe;
  const [editionDate, articleSlug] = await Promise.all([
    newestDeliveredEdition(input.root),
    newestDeliveredArticle(input.root)
  ]);
  return Promise.all([
    probeOne({
      venture: "caught-up",
      expected: editionDate,
      // The board file, not the article page: it is written by the same delivery and served as a
      // static asset, so a 200 means that build ran rather than that a route happened to resolve.
      url: editionDate ? `${SITE["caught-up"]}/data/board/${editionDate}.json` : null,
      probe
    }),
    probeOne({
      venture: "mma-files",
      expected: articleSlug,
      url: articleSlug ? `${SITE["mma-files"]}/cs/articles/${articleSlug}` : null,
      probe
    })
  ]);
}

export function deployIsBehind(entry: DeployFreshness): boolean {
  return entry.live === false;
}
