import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * The newest weekly trend snapshot, bounded for the GoVIRAL workspace.
 *
 * The owner's ask, verbatim in spirit: "in the GoVIRAL studio I need to see what things are
 * viral, so I can decide what to do." The Monday room writes `state/goviral/trends/<date>.json`
 * (`goviral-trends/1`); this reads the newest one into a view small enough to look at. Scraped
 * text stays out on purpose — a snapshot's raw items are transient, untrusted material, so the
 * panel shows the aggregate signals (topics, hashtags, audio, the two magazine shortlists) and
 * never a stranger's post.
 *
 * Missing is not malformed: no snapshot at all is the venture's honest pre-token state, while a
 * file that will not parse is dropped and counted, per the admin's null-over-guess doctrine.
 */
export interface AdminGoViralTopic {
  label: string;
  items: number;
  medianEngagementPerHour: number;
  topHashtags: string[];
}

/**
 * The signal vocabulary a snapshot written after 2026-09-16 carries on every reading. Each field
 * is null when the stored snapshot predates it or holds something outside the vocabulary: the
 * panel says "not recorded" rather than guessing a window or calling an unknown trend regular.
 */
export interface AdminGoViralSignal {
  /** The half-life of the source that produced the reading: 24h, 48h, 7d or 30d. */
  window: string | null;
  /** Active while the reading holds or climbs; lasted once it fell below the prior one. */
  status: "active" | "lasted" | null;
  /** Independent providers showing the topic this week. */
  breadth: number | null;
  /** Exploding, regular or peaked; null when there was nothing to compare against. */
  label: "exploding" | "regular" | "peaked" | null;
}

export interface AdminGoViralHashtag extends AdminGoViralSignal {
  hashtag: string;
  topicSet: string;
  posts: number;
  engagementPerHour: number;
  /** Change against the previous snapshot. Null when there was nothing to compare against. */
  weekOverWeekDelta: number | null;
}

export interface AdminGoViralMagazineLead extends AdminGoViralSignal {
  topic: string;
  engagementPerHour: number;
  weekOverWeekDelta: number | null;
}

export interface AdminGoViralTrends {
  state: "present" | "missing";
  snapshotDate: string | null;
  generatedAt: string | null;
  topics: AdminGoViralTopic[];
  hashtags: AdminGoViralHashtag[];
  audio: Array<{ title: string; artist: string | null; reels: number }>;
  forMagazines: { ai: AdminGoViralMagazineLead[]; mma: AdminGoViralMagazineLead[] };
  /** Snapshot files that exist but could not be read. Visible, never silently skipped. */
  droppedSnapshots: number;
}

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const TRENDS_DIRECTORY = "state/goviral/trends";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function words(value: unknown, cap: number): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").slice(0, cap) : [];
}

const SIGNAL_WINDOWS = new Set(["24h", "48h", "7d", "30d"]);
const SIGNAL_STATUSES = new Set(["active", "lasted"]);
const SIGNAL_LABELS = new Set(["exploding", "regular", "peaked"]);

function oneOf<T extends string>(value: unknown, allowed: ReadonlySet<string>): T | null {
  return typeof value === "string" && allowed.has(value) ? value as T : null;
}

/** Parse-or-null per field: a snapshot from before the vocabulary shows every field as not recorded. */
function signal(source: Record<string, unknown> | null): AdminGoViralSignal {
  const breadth = finite(source?.breadth);
  return {
    window: oneOf(source?.window, SIGNAL_WINDOWS),
    status: oneOf<"active" | "lasted">(source?.status, SIGNAL_STATUSES),
    breadth: breadth !== null && Number.isInteger(breadth) && breadth >= 1 ? breadth : null,
    label: oneOf<"exploding" | "regular" | "peaked">(source?.label, SIGNAL_LABELS)
  };
}

function magazineLeads(value: unknown): AdminGoViralMagazineLead[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const lead = record(entry);
    const engagement = finite(lead?.engagementPerHour);
    return typeof lead?.topic === "string" && engagement !== null
      ? [{ topic: lead.topic, engagementPerHour: engagement, weekOverWeekDelta: finite(lead.weekOverWeekDelta), ...signal(lead) }]
      : [];
  });
}

function parseSnapshot(raw: string): Omit<AdminGoViralTrends, "state" | "droppedSnapshots"> | null {
  const snapshot = record(JSON.parse(raw));
  if (snapshot?.schemaVersion !== "goviral-trends/1" || typeof snapshot.date !== "string") return null;
  const signals = record(snapshot.signals);
  const forMagazines = record(snapshot.forMagazines);
  const topics: AdminGoViralTopic[] = Array.isArray(signals?.perTopicSet)
    ? signals.perTopicSet.flatMap((entry) => {
        const topic = record(entry);
        const median = finite(topic?.medianEngagementPerHour);
        return typeof topic?.label === "string" && typeof topic.items === "number" && median !== null
          ? [{ label: topic.label, items: topic.items, medianEngagementPerHour: median, topHashtags: words(topic.topHashtags, 5) }]
          : [];
      })
    : [];
  const hashtags: AdminGoViralHashtag[] = Array.isArray(signals?.topHashtags)
    ? signals.topHashtags.flatMap((entry) => {
        const tag = record(entry);
        const engagement = finite(tag?.engagementPerHour);
        return typeof tag?.hashtag === "string" && typeof tag?.topicSet === "string" && typeof tag.posts === "number" && engagement !== null
          ? [{ hashtag: tag.hashtag, topicSet: tag.topicSet, posts: tag.posts, engagementPerHour: engagement, weekOverWeekDelta: finite(tag.weekOverWeekDelta), ...signal(tag) }]
          : [];
      }).slice(0, 12)
    : [];
  const audio = Array.isArray(signals?.topAudio)
    ? signals.topAudio.flatMap((entry) => {
        const track = record(entry);
        return typeof track?.title === "string" && typeof track.reels === "number"
          ? [{ title: track.title, artist: typeof track.artist === "string" ? track.artist : null, reels: track.reels }]
          : [];
      }).slice(0, 8)
    : [];
  return {
    snapshotDate: snapshot.date,
    generatedAt: typeof snapshot.generatedAt === "string" ? snapshot.generatedAt : null,
    topics,
    hashtags,
    audio,
    forMagazines: { ai: magazineLeads(forMagazines?.ai), mma: magazineLeads(forMagazines?.mma) }
  };
}

export async function readGoViralTrends(root = repositoryRoot): Promise<AdminGoViralTrends> {
  const empty: AdminGoViralTrends = {
    state: "missing",
    snapshotDate: null,
    generatedAt: null,
    topics: [],
    hashtags: [],
    audio: [],
    forMagazines: { ai: [], mma: [] },
    droppedSnapshots: 0
  };
  let names: string[];
  try {
    names = await readdir(path.join(root, TRENDS_DIRECTORY));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty;
    throw error;
  }
  // Newest first by the dated filename, which is the snapshot's own key.
  const dated = names.filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse();
  let dropped = 0;
  for (const name of dated) {
    try {
      const parsed = parseSnapshot(await readFile(path.join(root, TRENDS_DIRECTORY, name), "utf8"));
      if (parsed) return { state: "present", ...parsed, droppedSnapshots: dropped };
      dropped += 1;
    } catch {
      dropped += 1;
    }
  }
  return { ...empty, droppedSnapshots: dropped };
}
