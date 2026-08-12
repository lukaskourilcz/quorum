import type { GoViralActor, GoViralRecipeStep, GoViralSourceRegistry } from "./apify.js";
import { runApifyActor } from "./apify.js";
import type { TrendItem } from "./goviral-trends.js";

/**
 * The bridge between a scraped dataset row and the one bounded shape this system stores.
 *
 * Every actor here returns a different row. None of them is trusted: the mapper reads a fixed set
 * of fields, clips the text at 280 characters, and drops everything else on the floor — no
 * captions in full, no author bios, no image bytes, no follower counts. What survives is what a
 * room needs to say "this is rising and here is the number", which is the only question GoVIRAL
 * asks of it.
 */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/gu, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Actors return seconds or milliseconds depending on the surface they scraped.
    const millis = value > 1e12 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function hashtags(row: Record<string, unknown>, caption: string | null): string[] {
  const declared = Array.isArray(row.hashtags)
    ? row.hashtags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const found = caption ? caption.match(/#[\p{L}\p{N}_]+/gu) ?? [] : [];
  return [...new Set([...declared.map((tag) => tag.startsWith("#") ? tag : `#${tag}`), ...found])]
    .map((tag) => tag.toLowerCase().slice(0, 80))
    .slice(0, 20);
}

function first(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

export function mapDatasetRow(input: {
  row: Record<string, unknown>;
  step: GoViralRecipeStep;
  topicSet: string;
}): TrendItem | null {
  const { row, step } = input;
  const platform = step.mode === "search-top" || step.mode === "profile-monitor" ? "threads" : "instagram";
  const kind = platform === "threads" ? "thread" : step.mode === "reels" ? "reel" : "post";
  const caption = text(first(row, ["caption", "text", "title", "description"]), 280);
  const url = text(first(row, ["url", "postUrl", "link", "permalink"]), 400);
  // A row with neither text nor a URL is not an observation, it is noise from a partial page.
  if (!caption && !url) return null;
  const music = (row.musicInfo ?? row.audio ?? null) as Record<string, unknown> | null;
  return {
    platform,
    kind,
    topicSet: input.topicSet,
    text: caption ?? "",
    likes: count(first(row, ["likesCount", "likeCount", "likes"])),
    comments: count(first(row, ["commentsCount", "commentCount", "replies", "repliesCount"])),
    reshares: count(first(row, ["resharesCount", "repostCount", "reposts", "sharesCount"])),
    postedAt: timestamp(first(row, ["timestamp", "takenAt", "publishedAt", "createdAt", "postedAt"])),
    url,
    hashtags: hashtags(row, caption),
    audioTitle: music ? text(first(music, ["song_name", "songName", "title"]), 160) : null,
    audioArtist: music ? text(first(music, ["artist_name", "artistName", "artist"]), 160) : null,
    exploreSection: text(first(row, ["sectionName", "section", "exploreSection"]), 80)
  };
}

/**
 * The inputs one recipe step asks its actor for, drawn from the owner-editable topic sets.
 *
 * Every step is capped twice: once per input, and once by the step's own `maxResults`. That is
 * belt and braces on purpose — Apify prices per result, and an actor that ignores a per-input
 * limit would otherwise bill for whatever it felt like returning.
 */
export function stepPayload(input: {
  step: GoViralRecipeStep;
  registry: GoViralSourceRegistry;
  topicSet: string | null;
}): Record<string, unknown> | null {
  const { step, registry } = input;
  const set = input.topicSet ? registry.topicSets[input.topicSet] : null;
  if (set?.sourceMode === "free") return null;
  switch (step.inputs) {
    case "keyword": {
      if (!set || set.keywords.length === 0) return null;
      return {
        search: set.keywords.slice(0, 4),
        searchType: step.mode === "reels" ? "reels" : "top",
        resultsLimit: step.perInput,
        maxResults: step.maxResults
      };
    }
    case "hashtag": {
      if (!set || set.hashtags.length === 0) return null;
      return {
        hashtags: set.hashtags.map((tag) => tag.replace(/^#/u, "")).slice(0, 4),
        resultsLimit: step.perInput,
        maxResults: step.maxResults
      };
    }
    case "account": {
      if (registry.trackedAccounts.length === 0) return null;
      return {
        profiles: registry.trackedAccounts,
        monitorMode: true,
        resultsLimit: step.perInput,
        maxResults: step.maxResults
      };
    }
    case "none":
      return { maxResults: step.maxResults };
    default:
      return null;
  }
}

/** Which topic sets a step runs over. Explore has no query, so it runs once with no set. */
export function stepTopicSets(step: GoViralRecipeStep, registry: GoViralSourceRegistry): Array<string | null> {
  if (step.inputs === "none") return [null];
  if (step.inputs === "account") return [null];
  return Object.entries(registry.topicSets)
    .filter(([, topicSet]) => topicSet.sourceMode === "apify")
    .map(([id]) => id);
}

export interface StepOutcome {
  items: TrendItem[];
  count: number;
  failure: string | null;
}

/**
 * One recipe step, over every topic set it applies to.
 *
 * A step that throws is reported and the run continues. That is the §2.3 contract in code: a
 * refused or failed scout is a $0 stale-data outcome, never an error, because a room that cannot
 * meet is a better answer than a cycle that crashes.
 */
export async function runRecipeStep(input: {
  step: GoViralRecipeStep;
  actor: GoViralActor;
  registry: GoViralSourceRegistry;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<StepOutcome> {
  const items: TrendItem[] = [];
  let failure: string | null = null;
  for (const topicSet of stepTopicSets(input.step, input.registry)) {
    const payload = stepPayload({ step: input.step, registry: input.registry, topicSet });
    if (!payload) continue;
    try {
      const rows = await runApifyActor({
        actor: input.actor,
        token: input.token,
        payload,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
      });
      for (const row of rows.slice(0, input.step.maxResults)) {
        const mapped = mapDatasetRow({ row, step: input.step, topicSet: topicSet ?? "writer" });
        if (mapped) items.push(mapped);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message.slice(0, 300) : "The actor call failed.";
    }
  }
  return { items, count: items.length, failure };
}
