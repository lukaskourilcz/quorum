import { safeFetch } from "../security/url.js";

/**
 * Free trending signals, for both magazines, at zero cash cost and zero Apify credit.
 *
 * The $5 Apify credit belongs to GoVIRAL's weekly scout. Everything here is keyless and free, so
 * the magazines get a velocity reading every day without touching that pool.
 *
 * Three rules govern every reading below, and they are the difference between a signal and a
 * story we told ourselves:
 *
 * - **A silent signal is never negative evidence.** A source that returned nothing means we
 *   learned nothing from it. It does not mean the topic is quiet, and it must never lower a
 *   candidate's standing.
 * - **Rank-only data is rank.** Reddit's RSS gives position and no counts. A rank reads as
 *   "top-10 on r/MMA", never as "high engagement", and it carries `kind: "rank"` so a consumer
 *   cannot accidentally add it to an engagement figure.
 * - **Degrade to zero, gracefully.** Reddit has flagged RSS as the next thing it closes. Every
 *   fetch failure here is an absence, logged like any other source's health, never an error that
 *   stops an edition.
 */
const USER_AGENT = "boardlessai-trending/0.1 (https://github.com/lukaskourilcz/quorum)";

export const TRENDING_HOSTS = [
  "hn.algolia.com",
  "trends.google.com",
  "news.google.com",
  "www.reddit.com"
] as const;

export interface TrendingSignal {
  provider: "hn" | "google-trends" | "google-news" | "reddit";
  /** What was measured. `rank` carries a position; `velocity` carries a per-hour figure. */
  kind: "velocity" | "volume" | "rank";
  topic: string;
  value: number;
  /** Only for rank signals: which listing the position is in. */
  scope?: string;
  /** Configured free-only topic sets this measured signal actually names. */
  topicSets?: string[];
  ref: string;
}

export interface TrendingProviderResult {
  provider: TrendingSignal["provider"];
  status: "success" | "empty" | "failed";
  reason: string | null;
  signals: TrendingSignal[];
}

interface FetchInput {
  now: Date;
  fetchImpl?: typeof fetch;
}

async function text(url: string, input: FetchInput): Promise<string> {
  const response = await safeFetch(url, {
    allowHosts: [...TRENDING_HOSTS],
    headers: { "user-agent": USER_AGENT, accept: "application/json, application/rss+xml, application/xml, text/xml" },
    timeoutMs: 8_000,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
  });
  return new TextDecoder().decode(response.body);
}

function failure(provider: TrendingSignal["provider"], error: unknown): TrendingProviderResult {
  return {
    provider,
    status: "failed",
    reason: (error instanceof Error ? error.message : "The request failed").slice(0, 200),
    signals: []
  };
}

function settle(provider: TrendingSignal["provider"], signals: TrendingSignal[]): TrendingProviderResult {
  return signals.length > 0
    ? { provider, status: "success", reason: null, signals }
    : { provider, status: "empty", reason: "The source answered with nothing to measure.", signals: [] };
}

/** Elements of one RSS/Atom tag, in document order. Enough for the four feeds read here. */
export function rssValues(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gu");
  return [...xml.matchAll(pattern)].map((match) => (match[1] ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim());
}

/**
 * Hacker News velocity: points and comments per hour since posting.
 *
 * The HN front page is already one of DNESKAi's 32 sources, but only as a list of links. Algolia
 * returns the counts and the timestamp, so the same stories gain a speed.
 */
export async function fetchHackerNewsVelocity(input: FetchInput & {
  query: string;
}): Promise<TrendingProviderResult> {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(input.query)}&tags=story&hitsPerPage=20`;
    const payload = JSON.parse(await text(url, input)) as { hits?: Array<Record<string, unknown>> };
    const signals: TrendingSignal[] = [];
    for (const hit of payload.hits ?? []) {
      const title = typeof hit.title === "string" ? hit.title : null;
      const created = typeof hit.created_at === "string" ? Date.parse(hit.created_at) : Number.NaN;
      if (!title || Number.isNaN(created)) continue;
      const hours = Math.max((input.now.getTime() - created) / 3_600_000, 1);
      const points = typeof hit.points === "number" ? hit.points : 0;
      const comments = typeof hit.num_comments === "number" ? hit.num_comments : 0;
      if (points + comments === 0) continue;
      signals.push({
        provider: "hn",
        kind: "velocity",
        topic: title.slice(0, 120),
        value: Number(((points + comments) / hours).toFixed(4)),
        ref: `source:trending:hn:${input.now.toISOString().slice(0, 10)}`
      });
    }
    return settle("hn", signals.sort((left, right) => right.value - left.value).slice(0, 10));
  } catch (error) {
    return failure("hn", error);
  }
}

/**
 * Google Trends "Trending Now" RSS, weighted by its own traffic estimate.
 *
 * The only free "the general public is searching this right now" reading available, and `geo=CZ`
 * is Czech-audience data none of the English sources carry. One fetch, two consumers: the AI
 * vocabulary and the fighter/event dictionary both match against the same result.
 */
export async function fetchGoogleTrends(input: FetchInput & {
  geo: "CZ" | "US";
}): Promise<TrendingProviderResult> {
  try {
    const xml = await text(`https://trends.google.com/trending/rss?geo=${input.geo}`, input);
    const titles = rssValues(xml, "title");
    const traffic = rssValues(xml, "ht:approx_traffic");
    const signals: TrendingSignal[] = [];
    // The feed's first <title> is the channel's own, so entries and traffic figures line up
    // one-off. Matching by index without that offset attributes every figure to the wrong term.
    const entries = titles.slice(1);
    for (const [index, title] of entries.entries()) {
      if (!title) continue;
      const parsed = Number((traffic[index] ?? "").replace(/[^0-9]/gu, ""));
      signals.push({
        provider: "google-trends",
        kind: "volume",
        topic: title.slice(0, 120),
        value: Number.isFinite(parsed) ? parsed : 0,
        scope: `geo:${input.geo}`,
        ref: `source:trending:google-trends:${input.now.toISOString().slice(0, 10)}`
      });
    }
    return settle("google-trends", signals.slice(0, 20));
  } catch (error) {
    return failure("google-trends", error);
  }
}

/**
 * Cross-outlet press volume for one entity, in the last day.
 *
 * An article count is real: it is how many newsrooms decided the thing was worth writing about.
 * It is not engagement and is never labelled as such.
 */
export async function fetchGoogleNewsVolume(input: FetchInput & {
  query: string;
  locale: "en" | "cs";
}): Promise<TrendingProviderResult> {
  try {
    const locale = input.locale === "cs" ? "&hl=cs&gl=CZ&ceid=CZ:cs" : "&hl=en-US&gl=US&ceid=US:en";
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${input.query} when:1d`)}${locale}`;
    const xml = await text(url, input);
    // Minus the channel's own title, the same one-off the Trends feed has.
    const count = Math.max(rssValues(xml, "title").length - 1, 0);
    return settle("google-news", count > 0 ? [{
      provider: "google-news",
      kind: "volume",
      topic: input.query.slice(0, 120),
      value: count,
      scope: `locale:${input.locale}`,
      ref: `source:trending:google-news:${input.now.toISOString().slice(0, 10)}`
    }] : []);
  } catch (error) {
    return failure("google-news", error);
  }
}

/**
 * Subreddit rank, and only rank.
 *
 * Reddit's anonymous JSON has answered 403 since 2026-05-28 and its free OAuth tier is
 * non-commercial-only, which a monetized magazine cannot rely on. RSS still answers, gives
 * position and nothing else, and has been flagged as the next thing to close — so this returns
 * `kind: "rank"` and every consumer treats its absence as absence.
 */
export async function fetchSubredditRanks(input: FetchInput & {
  subreddit: string;
}): Promise<TrendingProviderResult> {
  try {
    const xml = await text(`https://www.reddit.com/r/${encodeURIComponent(input.subreddit)}/hot.rss`, input);
    const titles = rssValues(xml, "title").slice(1, 11);
    return settle("reddit", titles.filter(Boolean).map((title, index) => ({
      provider: "reddit" as const,
      kind: "rank" as const,
      topic: title.slice(0, 120),
      // Position, counted from 1. Never added to an engagement figure — the kind is what stops
      // that, and it is why this is not expressed as a score.
      value: index + 1,
      scope: `r/${input.subreddit}`,
      ref: `source:trending:reddit:${input.now.toISOString().slice(0, 10)}`
    })));
  } catch (error) {
    return failure("reddit", error);
  }
}

/**
 * The signals whose topic matches something the caller already cares about.
 *
 * A trend nobody in the dictionary is named in is not this system's business: DNESKAi does not
 * write about a spiking football transfer, and MMA Files does not write about a model release.
 * Matching is case-insensitive substring against the dictionary, which is deliberately blunt —
 * a fuzzy matcher here would manufacture relevance rather than find it.
 */
export function matchDictionary(
  signals: readonly TrendingSignal[],
  dictionary: readonly string[]
): TrendingSignal[] {
  const terms = dictionary.map((term) => term.toLowerCase()).filter((term) => term.length >= 3);
  if (terms.length === 0) return [];
  return signals.filter((signal) => {
    const topic = signal.topic.toLowerCase();
    return terms.some((term) => topic.includes(term));
  });
}

/** The AI/tech vocabulary DNESKAi's readings are matched against. */
export const AI_VOCABULARY = [
  "ai", "artificial intelligence", "umělá inteligence", "umela inteligence",
  "openai", "anthropic", "claude", "chatgpt", "gpt", "gemini", "llama", "mistral",
  "llm", "model", "nvidia", "chip", "datacenter", "machine learning", "neural"
] as const;

/**
 * Every free reading for one day, as provider results rather than a merged score.
 *
 * They stay separate on purpose. A consumer has to see which providers answered and which were
 * silent, because a merged number cannot tell the difference between "nothing is trending" and
 * "three of four sources were down".
 */
export async function collectTrendingSignals(input: FetchInput & {
  aiQueries: readonly string[];
  mmaQueries: readonly string[];
  topicQueries?: readonly string[];
  subreddits: readonly string[];
  scopedTopicQueries?: readonly { topicSet: string; query: string }[];
}): Promise<TrendingProviderResult[]> {
  const scopedNews = (topicSet: string, query: string, locale: "cs" | "en") =>
    fetchGoogleNewsVolume({ ...input, query, locale }).then((result) => ({
      ...result,
      signals: result.signals.map((signal) => ({ ...signal, scope: `topic-set:${topicSet}:${locale}` }))
    }));
  const results = await Promise.all([
    ...input.aiQueries.slice(0, 3).map((query) => fetchHackerNewsVelocity({ ...input, query })),
    fetchGoogleTrends({ ...input, geo: "CZ" }),
    fetchGoogleTrends({ ...input, geo: "US" }),
    ...input.mmaQueries.slice(0, 6).flatMap((query) => [
      fetchGoogleNewsVolume({ ...input, query, locale: "en" }),
      fetchGoogleNewsVolume({ ...input, query, locale: "cs" })
    ]),
    ...(input.scopedTopicQueries ?? []).slice(0, 12).flatMap(({ topicSet, query }) => [
      scopedNews(topicSet, query, "en"),
      scopedNews(topicSet, query, "cs")
    ]),
    ...(input.topicQueries ?? []).slice(0, 3)
      .map((query) => fetchGoogleNewsVolume({ ...input, query, locale: "en" })),
    ...input.subreddits.slice(0, 4).map((subreddit) => fetchSubredditRanks({ ...input, subreddit }))
  ]);
  return results;
}
