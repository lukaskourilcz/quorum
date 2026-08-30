import { createHash } from "node:crypto";
import {
  ContestCandidateSchema,
  type ContestCandidate,
  type ContestSource
} from "../../contracts/contest-radar.js";

/**
 * Turning a source's bytes into bounded candidates, one adapter per shape.
 *
 * A candidate is a *hint*, not a fact. Nothing an adapter reads has been checked against the
 * contest's own rules page, so every date, prize and mechanic it extracts lands in `hints` and
 * carries no confidence at all. The extraction step is where a hint becomes a measured fact with a
 * confidence and an evidence ref; conflating the two is how a listing page's marketing copy would
 * become a deadline somebody relies on.
 *
 * One malformed item costs one item. An adapter that threw on a bad entry would let a single
 * mangled row cost the whole source, and the founding decision says a source may fail without
 * failing the run — which starts here, with an item failing without failing the source.
 */

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function trimmed(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/gu, " ").trim();
  return text.length > 0 ? text.slice(0, maximum) : null;
}

/** Strip tags and entities from a feed's HTML summary without keeping any of the markup. */
function plainText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  return trimmed(
    value
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/&nbsp;/gu, " ")
      .replace(/&amp;/gu, "&")
      .replace(/&quot;/gu, '"')
      .replace(/&#0?39;|&apos;/gu, "'")
      .replace(/&lt;/gu, "<")
      .replace(/&gt;/gu, ">"),
    maximum
  );
}

function httpsOnly(value: unknown): string | null {
  const text = trimmed(value, 2_000);
  if (!text) return null;
  try {
    const url = new URL(text);
    // http:// downgrades and javascript: URLs both arrive from real feeds. Neither is followed.
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface AdapterResult {
  candidates: ContestCandidate[];
  /** Items the adapter could not read. Counted so a quiet source and a broken one differ. */
  malformed: number;
}

function candidate(input: {
  source: ContestSource;
  sourceItemId: string;
  listingUrl: string;
  title: string;
  snippet?: string | null;
  organizer?: string | null;
  targetUrl?: string | null;
  observedAt: string;
  hints?: Partial<ContestCandidate["hints"]>;
}): ContestCandidate | null {
  const body = {
    schemaVersion: "contest-candidate/1" as const,
    sourceId: input.source.id,
    sourceItemId: input.sourceItemId,
    listingUrl: input.listingUrl,
    targetUrl: input.targetUrl ?? null,
    rulesUrl: null,
    title: input.title,
    snippet: input.snippet ?? null,
    organizer: input.organizer ?? null,
    hints: {
      track: input.hints?.track ?? input.source.track,
      kind: input.hints?.kind ?? null,
      language: input.hints?.language ?? null,
      location: input.hints?.location ?? null,
      prizeText: input.hints?.prizeText ?? null,
      deadlineText: input.hints?.deadlineText ?? null,
      mechanics: input.hints?.mechanics ?? []
    },
    observedAt: input.observedAt,
    contentHash: "0".repeat(64)
  };
  const parsed = ContestCandidateSchema.safeParse({ ...body, contentHash: hash({ ...body, contentHash: "" }) });
  return parsed.success ? parsed.data : null;
}

/** Devpost's public JSON: `{ hackathons: [{ id, title, url, displayed_location, ... }] }`. */
function devpostAdapter(source: ContestSource, body: string, observedAt: string): AdapterResult {
  const candidates: ContestCandidate[] = [];
  let malformed = 0;
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { candidates: [], malformed: 1 };
  }
  const rows = (payload as { hackathons?: unknown })?.hackathons;
  if (!Array.isArray(rows)) return { candidates: [], malformed: 1 };

  for (const row of rows) {
    const item = row as Record<string, unknown>;
    const id = item.id === undefined ? null : String(item.id);
    const title = trimmed(item.title, 300);
    const url = httpsOnly(item.url);
    if (!id || !title || !url) {
      malformed += 1;
      continue;
    }
    const location = (item.displayed_location as { location?: unknown } | undefined)?.location;
    const built = candidate({
      source,
      sourceItemId: id,
      listingUrl: url,
      title,
      snippet: plainText(item.tagline, 1_000),
      organizer: trimmed(item.organization_name, 200),
      observedAt,
      hints: {
        kind: "hackathon",
        language: "en",
        location: trimmed(location, 200),
        prizeText: trimmed(item.prize_amount, 300),
        deadlineText: trimmed(item.submission_period_dates, 120)
      }
    });
    if (built) candidates.push(built);
    else malformed += 1;
  }
  return { candidates, malformed };
}

/** WordPress REST: an array of posts with `id`, `link`, `title.rendered`, `excerpt.rendered`. */
function wordpressRestAdapter(source: ContestSource, body: string, observedAt: string): AdapterResult {
  const candidates: ContestCandidate[] = [];
  let malformed = 0;
  let rows: unknown;
  try {
    rows = JSON.parse(body);
  } catch {
    return { candidates: [], malformed: 1 };
  }
  if (!Array.isArray(rows)) return { candidates: [], malformed: 1 };

  for (const row of rows) {
    const item = row as Record<string, unknown>;
    const id = item.id === undefined ? null : String(item.id);
    const title = plainText((item.title as { rendered?: unknown } | undefined)?.rendered, 300);
    const url = httpsOnly(item.link);
    if (!id || !title || !url) {
      malformed += 1;
      continue;
    }
    const built = candidate({
      source,
      sourceItemId: id,
      listingUrl: url,
      title,
      snippet: plainText((item.excerpt as { rendered?: unknown } | undefined)?.rendered, 1_000),
      observedAt,
      hints: { language: "cs" }
    });
    if (built) candidates.push(built);
    else malformed += 1;
  }
  return { candidates, malformed };
}

/**
 * RSS 2.0, parsed by structure rather than by a library.
 *
 * The feeds this venture reads are small and well-formed WordPress output, so a bounded regex over
 * `<item>` blocks is enough and adds no dependency. It reads only the four elements it needs and
 * ignores everything else, which is also what keeps a feed's `<content:encoded>` — often the whole
 * article — out of a candidate that must not carry a page body.
 */
function rssAdapter(source: ContestSource, body: string, observedAt: string): AdapterResult {
  const candidates: ContestCandidate[] = [];
  let malformed = 0;
  const items = body.match(/<item[\s>][\s\S]*?<\/item>/giu) ?? [];

  for (const block of items) {
    const field = (name: string): string | null => {
      const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "iu").exec(block);
      if (!match?.[1]) return null;
      return match[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/u, "$1");
    };
    const title = plainText(field("title"), 300);
    const url = httpsOnly(field("link"));
    const guid = trimmed(field("guid"), 200) ?? url;
    if (!title || !url || !guid) {
      malformed += 1;
      continue;
    }
    const built = candidate({
      source,
      sourceItemId: guid,
      listingUrl: url,
      title,
      snippet: plainText(field("description"), 1_000),
      observedAt,
      hints: { language: source.geography.includes("SK") ? "sk" : "cs" }
    });
    if (built) candidates.push(built);
    else malformed += 1;
  }
  return { candidates, malformed };
}

/**
 * A bounded HTML listing reader.
 *
 * Anchors whose text looks like a contest title, deduplicated by href. Deliberately shallow: this
 * venture does not maintain a DOM parser per site, and a listing page that needs one is `disabled`
 * in the registry rather than given a bespoke scraper that breaks on the next redesign.
 */
function htmlListingAdapter(source: ContestSource, body: string, observedAt: string): AdapterResult {
  const candidates: ContestCandidate[] = [];
  let malformed = 0;
  const seen = new Set<string>();
  const anchors = body.match(/<a\b[^>]*href="[^"]+"[^>]*>[\s\S]*?<\/a>/giu) ?? [];

  for (const anchor of anchors) {
    const href = /href="([^"]+)"/iu.exec(anchor)?.[1];
    const title = plainText(anchor.replace(/<a\b[^>]*>/iu, "").replace(/<\/a>/iu, ""), 300);
    if (!href || !title || title.length < 12) continue;
    let absolute: string | null;
    try {
      absolute = new URL(href, source.endpoint).toString();
    } catch {
      malformed += 1;
      continue;
    }
    if (!absolute.startsWith("https://") || seen.has(absolute)) continue;
    seen.add(absolute);
    const built = candidate({
      source,
      sourceItemId: absolute,
      listingUrl: absolute,
      title,
      observedAt,
      hints: { language: source.geography.includes("SK") ? "sk" : "cs" }
    });
    if (built) candidates.push(built);
    else malformed += 1;
  }
  return { candidates, malformed };
}

const ADAPTERS: Record<string, (source: ContestSource, body: string, observedAt: string) => AdapterResult> = {
  devpost: devpostAdapter,
  "wordpress-rest": wordpressRestAdapter,
  rss: rssAdapter
};

export function runContestAdapter(input: {
  source: ContestSource;
  body: string;
  observedAt: string;
}): AdapterResult {
  const adapter = input.source.parserId ? ADAPTERS[input.source.parserId] : undefined;
  if (adapter) return adapter(input.source, input.body, input.observedAt);
  // Every remaining enabled source is an HTML listing; an unknown parser id falls to the shallow
  // reader rather than throwing, because a registry typo must not cost the run.
  return htmlListingAdapter(input.source, input.body, input.observedAt);
}
