import { readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import path from "node:path";
import { SocialActivationSchema, type SocialActivation } from "../contracts/autonomy.js";
import { MarketingPlanSchema } from "../contracts/marketing-plan.js";
import { ReleaseProofSchema } from "../contracts/autonomy.js";
import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";
import {
  loadSocialPublisherRegistry,
  type SocialPublisherRegistry
} from "./publisher-targets.js";

export type DeliveryHealth = "passed" | "failed" | "no-edition";
export type SocialVenture = "caught-up" | "mma-files" | "titty-tuesdays";

export const SOCIAL_VENTURES: readonly SocialVenture[] = ["caught-up", "mma-files", "titty-tuesdays"];

/**
 * Whether a queue item's venture owns a social account at all.
 *
 * Not every venture that writes a queue item publishes from one. marketingShark drafts bilingual
 * carousels for a human to review and has no channel, no credentials and no activation record, so
 * the publisher has to be able to tell "switched off" from "was never a publisher" -- reading
 * `.status` off a missing activation record would have thrown and taken the whole run with it.
 */
export function isPublishingVenture(venture: string): venture is SocialVenture {
  return (SOCIAL_VENTURES as readonly string[]).includes(venture);
}

export const SOCIAL_DECISION_REFERENCE = "D2-autonomy-build-2026-08-01" as const;

export function caughtUpUnlockCounter(events: readonly DeliveryHealth[]): number {
  let count = 0;
  for (const event of events) {
    if (event === "passed") count += 1;
    else if (event === "failed") count = 0;
  }
  return count;
}

export function mmaFilesUnlockCounter(events: readonly Exclude<DeliveryHealth, "no-edition">[]): number {
  let count = 0;
  for (const event of events) count = event === "passed" ? count + 1 : 0;
  return Math.min(10, count);
}

export function socialCredentialReferences(venture: SocialVenture, registry: SocialPublisherRegistry): string[] {
  const mapping = registry.legacyQueueMappings.find((candidate) => candidate.venture === venture);
  if (!mapping) return [];
  return Object.values(mapping.connections).flatMap((connectionId) => {
    const connection = registry.connections.find((candidate) => candidate.id === connectionId);
    return connection?.credentialRef && connection.nativeAccountIdRef
      ? [connection.credentialRef, connection.nativeAccountIdRef]
      : [];
  });
}

export function missingSocialCredentials(
  venture: SocialVenture,
  environment: NodeJS.ProcessEnv,
  registry: SocialPublisherRegistry
): string[] {
  const references = socialCredentialReferences(venture, registry);
  return references.length > 0
    ? references.filter((name) => !environment[name]?.trim())
    : ["SOCIAL_PUBLISHER_REGISTRY_UNAVAILABLE"];
}

/**
 * Whether the pipeline may COMPOSE social drafts. Not whether it may send them.
 *
 * These were the same check, which made the code stricter than the decision it implements.
 * social-2026-08a says in as many words: "The pipeline still composes social drafts and queues
 * them; `draft` only stops the send." Gating composition on the same "enabled" flag as posting
 * meant no carousel was ever built for either magazine, so on the day the counters unlock there
 * would be no evidence any of it works — and nothing to look at in the meantime.
 *
 * "paused" is the owner turning a venture off and stays off for both. "locked" is the counter
 * not yet reached, which is exactly the state the decision describes: compose, queue, do not send.
 */
export async function socialContentGenerationEnabled(
  stateRoot: string,
  venture: SocialVenture
): Promise<boolean> {
  const raw = await readJson<unknown>(stateRoot, "social/activation.json", null);
  const parsed = SocialActivationSchema.safeParse(raw);
  return parsed.success && parsed.data.ventures[venture].status !== "paused";
}

/**
 * Whether any channel exists for composed inventory to reach.
 *
 * The activation counters answer "is this venture allowed to produce drafts", which is a
 * different question from "is there anywhere for them to go". Both channels have
 * `enabledByHumanAt: null` and no credentials, and have had for about a month, while the
 * pipeline committed roughly 1.4-2.1 MB of PNG frames per edition day into `site/public/social/`
 * plus MMA SVG variants -- inventory no channel can consume, deterministically re-buildable from
 * the packages that are already committed, and re-rendered on request by the admin decks tab
 * anyway.
 *
 * This gates composition, not the queue: the queue plumbing, its idempotency and its INBOX items
 * are untouched, so switching a channel on is what starts composition again rather than a code
 * change.
 */
export async function socialChannelsEnabled(configRoot: string): Promise<boolean> {
  const raw = await readFile(path.join(configRoot, "channels.json"), "utf8").catch(() => null);
  if (raw === null) return false;
  const parsed = z.object({
    channels: z.array(z.object({ enabledByHumanAt: z.string().nullable().optional() }))
  }).safeParse(JSON.parse(raw));
  return parsed.success && parsed.data.channels.some((channel) => Boolean(channel.enabledByHumanAt));
}

/** Whether a validated queue item may actually be sent. Unchanged: posting needs "enabled". */
export async function socialPostingEnabled(
  stateRoot: string,
  venture: SocialVenture
): Promise<boolean> {
  const raw = await readJson<unknown>(stateRoot, "social/activation.json", null);
  const parsed = SocialActivationSchema.safeParse(raw);
  return parsed.success && parsed.data.ventures[venture].status === "enabled";
}

async function jsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function releaseEvents(stateRoot: string, venture: "caught-up" | "mma-files"): Promise<Array<{ at: string; health: "passed" | "failed" }>> {
  const events: Array<{ at: string; health: "passed" | "failed" }> = [];
  for (const file of await jsonFiles(path.join(stateRoot, "release-proofs", venture))) {
    try {
      const proof = ReleaseProofSchema.parse(JSON.parse(await readFile(file, "utf8")));
      events.push({ at: proof.completedAt, health: proof.status === "passed" ? "passed" : "failed" });
    } catch {
      // Invalid evidence is not a pass.
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

async function caughtUpEvents(stateRoot: string): Promise<DeliveryHealth[]> {
  const proofEvents = await releaseEvents(stateRoot, "caught-up");
  const events: Array<{ at: string; health: DeliveryHealth }> = [...proofEvents];
  for (const file of await jsonFiles(path.join(stateRoot, "edition", "deliveries"))) {
    try {
      const receipt = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
      if (receipt.editionStatus !== "no-edition" && receipt.status !== "no-edition") continue;
      const at = typeof receipt.completedAt === "string"
        ? receipt.completedAt
        : typeof receipt.attemptedAt === "string" ? receipt.attemptedAt : path.basename(file, ".json");
      events.push({ at, health: "no-edition" });
    } catch {
      // Unreadable receipts are ignored rather than promoted to evidence.
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at)).map((event) => event.health);
}

async function launchReadyCampaignCount(stateRoot: string): Promise<number> {
  let count = 0;
  for (const file of await jsonFiles(path.join(stateRoot, "ventures", "titty-tuesdays", "plans"))) {
    try {
      const plan = MarketingPlanSchema.parse(JSON.parse(await readFile(file, "utf8")));
      if (plan.status === "approved" && plan.postable_assets.length > 0 && plan.audienceRefs.length > 0) count += 1;
    } catch {
      // Invalid plans do not count toward automatic activation.
    }
  }
  return count;
}

function initialActivation(now: Date): SocialActivation {
  const updatedAt = now.toISOString();
  const venture = (required: number, reason: string) => ({
    status: "locked" as const,
    counter: 0,
    required,
    reason,
    updatedAt,
    unlockedAt: null,
    decisionReference: SOCIAL_DECISION_REFERENCE
  });
  return SocialActivationSchema.parse({
    schemaVersion: "social-activation/1",
    ventures: {
      "caught-up": venture(7, "Waiting for seven consecutive verified deliveries."),
      "mma-files": venture(10, "Waiting for ten verified article deliveries with no unresolved failure."),
      "titty-tuesdays": venture(4, "Waiting for four complete campaigns, credentials and the safety checker.")
    },
    updatedAt
  });
}

async function recordMissingCredentials(repoRoot: string, missing: Record<SocialVenture, string[]>): Promise<void> {
  const names = Object.entries(missing)
    .filter(([, values]) => values.length > 0)
    .map(([venture, values]) => `${venture}: ${values.join(", ")}`);
  if (names.length === 0) return;
  const marker = "SOCIAL-PLATFORM-CREDENTIALS";
  const current = await readText(repoRoot, "docs/NEEDED.md", "# Needs your help now\n");
  if (current.includes(marker)) return;
  const item = `\n## ${marker}\n\nAdd the Instagram and Threads account IDs and access tokens as GitHub Actions secrets/variables for each brand. Missing now: ${names.join("; ")}. The per-venture gates remain locked and no post is attempted.\n`;
  await atomicWriteText(repoRoot, "docs/NEEDED.md", `${current.trimEnd()}\n${item}`);
}

export async function refreshSocialActivation(input: {
  repoRoot: string;
  stateRoot: string;
  configRoot?: string;
  publisherRegistry?: SocialPublisherRegistry;
  environment?: NodeJS.ProcessEnv;
  now?: Date;
  safetyCheckerReady?: boolean;
}): Promise<SocialActivation> {
  const now = input.now ?? new Date();
  const environment = input.environment ?? process.env;
  const previousRaw = await readJson<unknown>(input.stateRoot, "social/activation.json", null);
  const previousParsed = SocialActivationSchema.safeParse(previousRaw);
  const previous = previousParsed.success ? previousParsed.data : initialActivation(now);
  const [caughtEvents, mmaEvents, campaignCount] = await Promise.all([
    caughtUpEvents(input.stateRoot),
    releaseEvents(input.stateRoot, "mma-files"),
    launchReadyCampaignCount(input.stateRoot)
  ]);
  const counters: Record<SocialVenture, number> = {
    "caught-up": caughtUpUnlockCounter(caughtEvents),
    "mma-files": mmaFilesUnlockCounter(mmaEvents.map((event) => event.health)),
    "titty-tuesdays": Math.min(4, campaignCount)
  };
  const publisherRegistry = input.publisherRegistry
    ?? await loadSocialPublisherRegistry(input.configRoot).catch(() => null);
  const missing = Object.fromEntries(SOCIAL_VENTURES.map((venture) => [
    venture,
    publisherRegistry
      ? missingSocialCredentials(venture, environment, publisherRegistry)
      : ["SOCIAL_PUBLISHER_REGISTRY_UNAVAILABLE"]
  ])) as Record<SocialVenture, string[]>;
  const gateReady: Record<SocialVenture, boolean> = {
    "caught-up": counters["caught-up"]! >= 7,
    "mma-files": counters["mma-files"]! >= 10,
    "titty-tuesdays": counters["titty-tuesdays"]! >= 4 && input.safetyCheckerReady === true
  };
  const requirements: Record<SocialVenture, number> = { "caught-up": 7, "mma-files": 10, "titty-tuesdays": 4 };
  const ventures = Object.fromEntries((Object.keys(requirements) as SocialVenture[]).map((venture) => {
    const prior = previous.ventures[venture]!;
    if (prior.status === "paused") return [venture, { ...prior, counter: counters[venture]!, updatedAt: now.toISOString() }];
    const enabled = gateReady[venture]! && missing[venture]!.length === 0;
    const status = enabled ? "enabled" as const : "locked" as const;
    const reason = enabled
      ? `Posting checks passed under ${SOCIAL_DECISION_REFERENCE}.`
      : missing[venture]!.length > 0 && gateReady[venture]
        ? `Delivery or campaign check passed; missing ${missing[venture]!.join(", ")}.`
        : venture === "titty-tuesdays" && input.safetyCheckerReady !== true
          ? "Waiting for the tested Titty Tuesdays safety checker."
          : `Ready count ${counters[venture]!}/${requirements[venture]!}.`;
    return [venture, {
      status,
      counter: counters[venture]!,
      required: requirements[venture]!,
      reason,
      updatedAt: now.toISOString(),
      unlockedAt: status === "enabled" ? prior.unlockedAt ?? now.toISOString() : null,
      decisionReference: SOCIAL_DECISION_REFERENCE
    }];
  }));
  const activation = SocialActivationSchema.parse({ schemaVersion: "social-activation/1", ventures, updatedAt: now.toISOString() });
  for (const venture of Object.keys(activation.ventures) as SocialVenture[]) {
    if (previous.ventures[venture]!.status !== "enabled" && activation.ventures[venture]!.status === "enabled") {
      await atomicWriteJson(input.stateRoot, `notify/social-unlocks/${venture}.json`, {
        schemaVersion: "social-unlock-note/1",
        venture,
        decisionReference: SOCIAL_DECISION_REFERENCE,
        counter: activation.ventures[venture]!.counter,
        unlockedAt: activation.ventures[venture]!.unlockedAt
      });
    }
  }
  await Promise.all([
    atomicWriteJson(input.stateRoot, "social/activation.json", activation),
    recordMissingCredentials(input.repoRoot, missing)
  ]);
  return activation;
}

export async function pauseVentureSocial(input: {
  stateRoot: string;
  venture: SocialVenture;
  reason: string;
  now?: Date;
}): Promise<SocialActivation> {
  const now = input.now ?? new Date();
  const raw = SocialActivationSchema.parse(await readJson(input.stateRoot, "social/activation.json", initialActivation(now)));
  const activation = SocialActivationSchema.parse({
    ...raw,
    ventures: {
      ...raw.ventures,
      [input.venture]: {
        ...raw.ventures[input.venture]!,
        status: "paused",
        reason: input.reason.slice(0, 500),
        updatedAt: now.toISOString()
      }
    },
    updatedAt: now.toISOString()
  });
  await Promise.all([
    atomicWriteJson(input.stateRoot, "social/activation.json", activation),
    atomicWriteJson(input.stateRoot, `notify/social-failures/${input.venture}-${now.toISOString().replaceAll(/[^0-9]/gu, "").slice(0, 14)}.json`, {
      schemaVersion: "social-failure-digest/1",
      venture: input.venture,
      reason: input.reason.slice(0, 500),
      pausedAt: now.toISOString()
    })
  ]);
  return activation;
}
