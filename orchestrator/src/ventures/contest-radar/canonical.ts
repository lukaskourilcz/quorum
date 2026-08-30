import { createHash } from "node:crypto";
import type { ContestCandidate } from "../../contracts/contest-radar.js";

/**
 * Turning many listings of the same contest into one thing, before anything is enriched.
 *
 * Order matters and it is the cheap-first order: canonicalize the URL, drop what is obviously not
 * a contest, then cluster what remains. Every step that runs earlier is a step the paid enrichment
 * never pays for, and the founding decision's free path only stays useful if the expensive rungs
 * see as few items as possible.
 *
 * Clustering is deliberately conservative. Two listings merge when their canonical URLs match, or
 * when their titles are near-identical *and* they point at the same host. Merging on title alone
 * would collapse "Soutěž o iPhone" from three different organizers into one record, and a merge is
 * much harder to notice afterwards than a duplicate.
 */

/** Tracking parameters that change nothing about which page a URL addresses. */
const TRACKING_PARAMS = /^(?:utm_|fbclid$|gclid$|mc_|ref$|source$|campaign$)/iu;

export function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    // A trailing slash is the same page. Kept off so two listings of one contest agree.
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return raw;
  }
}

/**
 * Titles reduced to what a comparison should see.
 *
 * Diacritics are folded because the same contest is written both ways across Czech and Slovak
 * listings, and punctuation goes because one site title-cases and another shouts.
 */
export function comparableTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Words that mean a listing is not an opportunity.
 *
 * Kept short and specific on purpose. A broad filter here silently costs real contests, and the
 * cheapest failure in this pipeline is an extra candidate reaching a deterministic extractor that
 * costs nothing to run.
 */
const NOT_A_CONTEST = [
  "vysledky souteze",
  "vyhodnoceni souteze",
  "pravidla souteze",
  "obchodni podminky",
  "ochrana osobnich udaju",
  "zasady cookies",
  "privacy policy",
  "terms of service",
  "winners announced"
];

export interface PrefilterResult {
  kept: ContestCandidate[];
  /** Why each dropped item went, so a quiet day can be explained rather than guessed at. */
  dropCounts: Record<string, number>;
}

export function prefilterCandidates(candidates: readonly ContestCandidate[]): PrefilterResult {
  const kept: ContestCandidate[] = [];
  const dropCounts: Record<string, number> = {};
  const drop = (reason: string): void => {
    dropCounts[reason] = (dropCounts[reason] ?? 0) + 1;
  };

  for (const candidate of candidates) {
    const comparable = comparableTitle(candidate.title);
    if (comparable.length < 8) {
      drop("title-too-short");
      continue;
    }
    if (NOT_A_CONTEST.some((phrase) => comparable.includes(phrase))) {
      drop("not-an-opportunity");
      continue;
    }
    kept.push(candidate);
  }
  return { kept, dropCounts };
}

export interface ContestCluster {
  /** Stable across runs: the same contest gets the same id tomorrow. */
  id: string;
  canonicalUrl: string;
  members: ContestCandidate[];
}

function clusterId(canonicalUrl: string): string {
  return `cr-${createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 16)}`;
}

/**
 * How similar two titles are, as a word-overlap ratio over the smaller title.
 *
 * Overlap over the *smaller* title rather than the union, because one site's "Soutěž o Ninja
 * zmrzlinovač" and another's "Vyhrajte značkový zmrzlinovač Ninja 7v1 — velká letní soutěž" are
 * the same contest and a union-based ratio would call them different.
 */
function titleOverlap(left: string, right: string): number {
  const a = new Set(comparableTitle(left).split(" ").filter((word) => word.length > 2));
  const b = new Set(comparableTitle(right).split(" ").filter((word) => word.length > 2));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/** Titles this close, on the same host, are one contest. Below it they stay separate. */
const TITLE_MERGE_THRESHOLD = 0.8;

export function clusterCandidates(candidates: readonly ContestCandidate[]): ContestCluster[] {
  const clusters: ContestCluster[] = [];

  for (const candidate of candidates) {
    const canonical = canonicalizeUrl(candidate.listingUrl);
    const exact = clusters.find((cluster) => cluster.canonicalUrl === canonical);
    if (exact) {
      exact.members.push(candidate);
      continue;
    }
    let host = "";
    try {
      host = new URL(canonical).hostname;
    } catch {
      host = "";
    }
    // Same host and a near-identical title. Title alone would collapse three organizers' iPhone
    // giveaways into one record, and an over-merge hides a contest rather than duplicating it.
    const similar = clusters.find((cluster) => {
      let clusterHost = "";
      try {
        clusterHost = new URL(cluster.canonicalUrl).hostname;
      } catch {
        return false;
      }
      return clusterHost === host
        && host !== ""
        && titleOverlap(cluster.members[0]!.title, candidate.title) >= TITLE_MERGE_THRESHOLD;
    });
    if (similar) {
      similar.members.push(candidate);
      continue;
    }
    clusters.push({ id: clusterId(canonical), canonicalUrl: canonical, members: [candidate] });
  }
  return clusters;
}
