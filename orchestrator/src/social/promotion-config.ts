import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseSafeHttpsUrl } from "../security/url.js";

/**
 * What DNESKAi's edition repost asks for, and whether it has anywhere to go.
 *
 * Separate from the composer because these are the two questions the owner answers and the composer
 * only reports: where a reader is being sent, and which channel the deck is cut for. Both read
 * files the owner edits and neither can enable anything — `config/channels.json` is the only
 * channel registry, and this reads it rather than adding to it.
 *
 * Absent and malformed land on the same answer throughout, the way the magazine's own
 * `lib/banner.ts` reads a slot: a file with a typo in it must not silently become a different call
 * to action, and it must not stop the edition either.
 */

const CONFIG_FILE = "caught-up-promotion.json";

/** The channel registry as this module needs it. A tolerant read; the registry owns the schema. */
const ChannelRegistryReadSchema = z.object({
  channels: z.array(z.object({
    id: z.string(),
    mode: z.string().optional(),
    enabledByHumanAt: z.string().nullable().optional()
  }))
});

const PromotionConfigSchema = z.object({
  schemaVersion: z.literal("caught-up-promotion/1"),
  channelId: z.string().trim().min(1).max(40),
  cta: z.object({
    line: z.string().trim().min(1).max(160).nullable(),
    subscribeUrl: z.string().trim().min(1).nullable()
  })
});

export type PromotionConfig = z.infer<typeof PromotionConfigSchema>;

/** The config as it reads when nobody has written one, and when what they wrote will not parse. */
export const UNCONFIGURED_PROMOTION: PromotionConfig = {
  schemaVersion: "caught-up-promotion/1",
  channelId: "linkedin",
  cta: { line: null, subscribeUrl: null }
};

export async function loadPromotionConfig(configRoot: string): Promise<PromotionConfig> {
  try {
    const raw = JSON.parse(await readFile(path.join(configRoot, CONFIG_FILE), "utf8"));
    const parsed = PromotionConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : UNCONFIGURED_PROMOTION;
  } catch {
    return UNCONFIGURED_PROMOTION;
  }
}

export interface PromotionChannel {
  id: string;
  /** `open` only when the registry holds this channel and a human has switched it on. */
  status: "open" | "held";
  reason: string;
}

/**
 * Whether the deck has anywhere to go, answered by reading the registry rather than by claiming.
 *
 * A configured `channelId` naming a channel nobody registered is the normal state — LinkedIn is
 * not in `config/channels.json` and cannot be put there by an agent — and it reads as held with
 * the id in the reason, so an owner sees the exact word that did not resolve.
 */
export async function resolvePromotionChannel(
  configRoot: string,
  channelId: string
): Promise<PromotionChannel> {
  let registry: z.infer<typeof ChannelRegistryReadSchema>;
  try {
    registry = ChannelRegistryReadSchema.parse(JSON.parse(await readFile(path.join(configRoot, "channels.json"), "utf8")));
  } catch {
    return { id: channelId, status: "held", reason: "The channel registry could not be read." };
  }
  const channel = registry.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    return {
      id: channelId,
      status: "held",
      reason: `No channel "${channelId}" is registered in config/channels.json, so this deck has nowhere to go. Opening one is an owner decision: state/INBOX.md CAUGHT-UP-LINKEDIN-CHANNEL.`
    };
  }
  if (channel.mode !== "autopublish" || !channel.enabledByHumanAt) {
    return { id: channelId, status: "held", reason: `${channelId} is in draft-only mode.` };
  }
  return { id: channelId, status: "open", reason: `${channelId} was enabled by a human at ${channel.enabledByHumanAt}.` };
}

export interface ResolvedCta {
  /** The words on the fifth slide, without the host. */
  line: string;
  /** The slide as it renders: the line and the host the reader is being sent to. */
  slideText: string;
  /** The full URL, which travels in the caption rather than on a slide nobody can click. */
  destination: string;
  /** `subscribe` once a subscribe surface exists; `edition` until then, and the record says so. */
  origin: "subscribe" | "edition";
}

/**
 * The one ask, and the honest version of it while DNESKAi has no subscribe surface.
 *
 * `config/goviral-growth-loops.json` records the capture stage as blocked — "No email provider,
 * list or subscribe form exists" — so a slide reading "subscribe" would point at nothing. Until
 * `cta.subscribeUrl` is set, the ask is the edition itself and `origin` says which one a reader of
 * the record is looking at. Setting that one field is the whole change.
 *
 * A configured URL that is not a safe HTTPS destination falls back to the edition rather than
 * throwing: a typo in the config must not cost the day its repost.
 */
export function resolveCta(config: PromotionConfig, editionUrl: string): ResolvedCta {
  const subscribe = config.cta.subscribeUrl ? safeUrl(config.cta.subscribeUrl) : null;
  const destination = subscribe ?? parseSafeHttpsUrl(editionUrl).toString();
  const origin = subscribe ? "subscribe" as const : "edition" as const;
  const line = config.cta.line?.trim()
    || (origin === "subscribe" ? "Odebírejte DNESKAi" : "Nové vydání každý den");
  return { line, slideText: `${line} · ${new URL(destination).host}`, destination, origin };
}

function safeUrl(value: string): string | null {
  try {
    return parseSafeHttpsUrl(value).toString();
  } catch {
    return null;
  }
}
