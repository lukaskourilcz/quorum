import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  channelCooldownDays,
  fixtureAssignment,
  FIXTURE_ITEMS,
  readLibrary,
  SURFACES,
  type Hook,
  type Surface,
  type Vertical
} from "@boardlessai/carousel-studio";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

/** How many recent assignments the panel shows. */
export const RECENT_ASSIGNMENT_LIMIT = 20;

export interface HookSurfaceCount {
  surface: Surface;
  hooks: number;
  /** Distinct archetypes, so a library that is large but repetitive reads as one. */
  archetypes: number;
  /** Present when the library has not been authored yet. */
  note: string | null;
}

export interface HookChannelOccupancy {
  channel: string;
  /** Hooks still inside their channel cooldown, over the library that could serve them. */
  cooling: number;
  librarySize: number;
  posts: number;
  lastPostedOn: string | null;
}

export interface HookAssignmentRow {
  channel: string;
  date: string;
  itemId: string;
  hookId: string | null;
  archetype: string | null;
  eligibleCount: number;
  fallback: string | null;
}

export interface HookPreviewRow {
  vertical: Vertical;
  topic: string;
  hookId: string | null;
  archetype: string | null;
  eligibleCount: number;
  en: string | null;
  cs: string | null;
  /** The gates that had to hold for this line to be allowed on this item. */
  gates: string[];
}

export interface HookBrainSnapshot {
  surfaces: HookSurfaceCount[];
  channels: HookChannelOccupancy[];
  recent: HookAssignmentRow[];
  previews: HookPreviewRow[];
  fallbackCount: number;
}

async function optionalJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

interface ChannelPostRecord {
  date: string;
  hookId: string;
  archetype: string;
  itemId: string;
  eligibleCount: number;
  fallback: string | null;
}

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

/**
 * Everything the Hook Brain panel shows, resolved on the server.
 *
 * The same boundary the office walkthrough uses: this reads state and the library, and hands the
 * page plain JSON. Nothing here is a live evaluation for a real pack — the previews run the real
 * assignment against fixture items so the panel shows what the gates do, and the recent rows come
 * from what actually posted.
 */
export async function readHookBrain(
  root = repositoryRoot,
  today = new Date().toISOString().slice(0, 10)
): Promise<HookBrainSnapshot> {
  const libraries = await Promise.all(SURFACES.map(async (surface) => [surface, await readLibrary(surface)] as const));
  const byId = new Map<string, Hook>();
  for (const [, library] of libraries) {
    for (const hook of library.hooks) byId.set(hook.id, hook);
  }

  const surfaces: HookSurfaceCount[] = libraries.map(([surface, library]) => ({
    surface,
    hooks: library.hooks.length,
    archetypes: new Set(library.hooks.map((hook) => hook.research.archetype)).size,
    note: library.hooks.length === 0
      ? "Not authored yet — every pack on this surface takes the no-hook fallback."
      : null
  }));

  const channelState = await optionalJson<{ channels: Record<string, ChannelPostRecord[]> }>(
    path.join(root, "state", "ventures", "carousel-studio", "hook-channels.json")
  );
  const channels = Object.entries(channelState?.channels ?? {}).map(([channel, posts]): HookChannelOccupancy => {
    const withHooks = posts.filter((post) => post.fallback === null);
    const cooling = withHooks.filter((post) => {
      const hook = byId.get(post.hookId);
      return hook !== undefined && daysBetween(post.date, today) < channelCooldownDays(hook);
    }).length;
    return {
      channel,
      cooling,
      // The library that could serve this channel: quiz for the shark brands, and the surface's
      // own for anything else. Shown beside the cooling count so occupancy reads as a fraction.
      librarySize: (libraries.find(([surface]) => channel.startsWith(surface) || surface === "quiz")?.[1].hooks.length) ?? 0,
      posts: posts.length,
      lastPostedOn: posts.at(-1)?.date ?? null
    };
  }).sort((left, right) => left.channel.localeCompare(right.channel));

  const recent: HookAssignmentRow[] = Object.entries(channelState?.channels ?? {})
    .flatMap(([channel, posts]) => posts.map((post) => ({
      channel,
      date: post.date,
      itemId: post.itemId,
      hookId: post.fallback === null ? post.hookId : null,
      archetype: post.fallback === null ? post.archetype : null,
      eligibleCount: post.eligibleCount,
      fallback: post.fallback
    })))
    .sort((left, right) => (left.date === right.date ? left.channel.localeCompare(right.channel) : right.date.localeCompare(left.date)))
    .slice(0, RECENT_ASSIGNMENT_LIMIT);

  const quiz = libraries.find(([surface]) => surface === "quiz")![1];
  const previews: HookPreviewRow[] = FIXTURE_ITEMS.map((item) => {
    const resolved = fixtureAssignment(quiz, item);
    return {
      vertical: item.vertical,
      topic: item.topic,
      hookId: resolved.assignment?.hook.id ?? null,
      archetype: resolved.assignment?.hook.research.archetype ?? null,
      eligibleCount: resolved.assignment?.eligible.ids.length ?? 0,
      en: resolved.line?.en ?? null,
      cs: resolved.line?.cs ?? null,
      gates: [...(resolved.assignment?.hook.rawRequires ?? [])]
    };
  });

  return {
    surfaces,
    channels,
    recent,
    previews,
    fallbackCount: recent.filter((row) => row.fallback !== null).length
  };
}
