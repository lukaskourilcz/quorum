import { z } from "zod";
import { atomicWriteJson, readJson } from "../state.js";
import type { ChannelPost } from "@boardlessai/carousel-studio";

/**
 * Channel hook history, beside the studio's other state.
 *
 * `state/ventures/carousel-studio/` already holds the template overrides and the inspiration
 * records; the assignment brain's own state belongs with them rather than under a venture, because
 * one channel's cooldown is a fact about the studio's rotation and outlives any single venture's
 * pack builder.
 */
export const HOOK_CHANNELS_PATH = "ventures/carousel-studio/hook-channels.json";

/** How much history a channel keeps. Twice the longest channel cooldown, with room to read. */
export const CHANNEL_HISTORY_LIMIT = 80;

export const ChannelPostSchema = z.object({
  date: z.iso.date(),
  hookId: z.string().min(1),
  archetype: z.string().min(1),
  itemId: z.string().min(1),
  /** Recorded so the /admin panel can show eligible-set sizes without reopening every pack. */
  eligibleCount: z.number().int().min(0),
  fallback: z.enum(["empty-library", "empty-eligible-set"]).nullable().default(null)
});
export type ChannelPostRecord = z.infer<typeof ChannelPostSchema>;

export const HookChannelsSchema = z.object({
  schemaVersion: z.literal("hook-channels/1"),
  channels: z.record(z.string(), z.array(ChannelPostSchema))
});
export type HookChannels = z.infer<typeof HookChannelsSchema>;

export const EMPTY_HOOK_CHANNELS: HookChannels = {
  schemaVersion: "hook-channels/1",
  channels: {}
};

export async function readHookChannels(stateRoot: string): Promise<HookChannels> {
  return HookChannelsSchema.parse(await readJson<unknown>(stateRoot, HOOK_CHANNELS_PATH, EMPTY_HOOK_CHANNELS));
}

/**
 * One channel's history, oldest first.
 *
 * A `no-hook` post is kept in the record but never returned as history: it has no hook to cool and
 * no archetype to vary against, so counting it would let a fallback day silently block whichever
 * archetype it did not have.
 */
export function historyFor(channels: HookChannels, channel: string): ChannelPost[] {
  return (channels.channels[channel] ?? [])
    .filter((post) => post.fallback === null)
    .map((post) => ({ date: post.date, hookId: post.hookId, archetype: post.archetype }));
}

/** Every post a channel recorded, newest first, for the /admin panel. */
export function recentPosts(channels: HookChannels, limit: number): Array<ChannelPostRecord & { channel: string }> {
  return Object.entries(channels.channels)
    .flatMap(([channel, posts]) => posts.map((post) => ({ ...post, channel })))
    .sort((left, right) => (left.date === right.date
      ? (left.channel < right.channel ? 1 : -1)
      : (left.date < right.date ? 1 : -1)))
    .slice(0, limit);
}

/**
 * Record a post, idempotently on (channel, date, item).
 *
 * Reruns and backstop sweeps reach this with the same pack identity, and a second entry would both
 * double-count the cooldown and make the rotation look busier than it is. The date is the key, not
 * the invocation — the same rule the question ledger follows.
 */
export function recordPost(channels: HookChannels, channel: string, post: ChannelPostRecord): HookChannels {
  const existing = (channels.channels[channel] ?? [])
    .filter((entry) => !(entry.date === post.date && entry.itemId === post.itemId));
  const next = [...existing, post]
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : (left.itemId < right.itemId ? -1 : 1)))
    .slice(-CHANNEL_HISTORY_LIMIT);
  return { ...channels, channels: { ...channels.channels, [channel]: next } };
}

export async function writeHookChannels(stateRoot: string, channels: HookChannels): Promise<string> {
  await atomicWriteJson(stateRoot, HOOK_CHANNELS_PATH, HookChannelsSchema.parse(channels));
  return HOOK_CHANNELS_PATH;
}

/** Per-channel occupancy: how many of a channel's recent posts are still inside their cooldown. */
export function cooldownOccupancy(
  channels: HookChannels,
  channel: string,
  today: string,
  requiredDaysFor: (hookId: string) => number | null
): number {
  return historyFor(channels, channel).filter((post) => {
    const required = requiredDaysFor(post.hookId);
    if (required === null) return false;
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${post.date}T00:00:00Z`)) / 86_400_000);
    return days < required;
  }).length;
}
