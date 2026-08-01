import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SocialActivationSchema, type SocialActivation } from "../contracts/autonomy.js";
import { MarketingPlanSchema } from "../contracts/marketing-plan.js";
import { ReleaseProofSchema } from "../contracts/autonomy.js";
import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";

export type DeliveryHealth = "passed" | "failed" | "no-edition";
export type SocialVenture = "caught-up" | "mma-files" | "titty-tuesdays";

export const SOCIAL_DECISION_REFERENCE = "D2-autonomy-build-2026-08-01" as const;

export const SOCIAL_CREDENTIALS: Record<SocialVenture, readonly string[]> = {
  "caught-up": [
    "CAUGHT_UP_THREADS_ACCESS_TOKEN",
    "CAUGHT_UP_THREADS_USER_ID",
    "CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN",
    "CAUGHT_UP_INSTAGRAM_USER_ID"
  ],
  "mma-files": [
    "MMA_FILES_THREADS_ACCESS_TOKEN",
    "MMA_FILES_THREADS_USER_ID",
    "MMA_FILES_INSTAGRAM_ACCESS_TOKEN",
    "MMA_FILES_INSTAGRAM_USER_ID"
  ],
  "titty-tuesdays": [
    "TITTY_TUESDAYS_THREADS_ACCESS_TOKEN",
    "TITTY_TUESDAYS_THREADS_USER_ID",
    "TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN",
    "TITTY_TUESDAYS_INSTAGRAM_USER_ID"
  ]
};

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

export function missingSocialCredentials(venture: SocialVenture, environment: NodeJS.ProcessEnv): string[] {
  return SOCIAL_CREDENTIALS[venture]!.filter((name) => !environment[name]?.trim());
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
  const current = await readText(repoRoot, "NEEDS_YOUR_HELP_NOW.md", "# Needs your help now\n");
  if (current.includes(marker)) return;
  const item = `\n## ${marker}\n\nAdd the Instagram and Threads account IDs and access tokens as GitHub Actions secrets/variables for each brand. Missing now: ${names.join("; ")}. The per-venture gates remain locked and no post is attempted.\n`;
  await atomicWriteText(repoRoot, "NEEDS_YOUR_HELP_NOW.md", `${current.trimEnd()}\n${item}`);
}

export async function refreshSocialActivation(input: {
  repoRoot: string;
  stateRoot: string;
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
  const missing = Object.fromEntries(
    (Object.keys(SOCIAL_CREDENTIALS) as SocialVenture[]).map((venture) => [venture, missingSocialCredentials(venture, environment)])
  ) as Record<SocialVenture, string[]>;
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
      ? `Automatic social gate passed under ${SOCIAL_DECISION_REFERENCE}.`
      : missing[venture]!.length > 0 && gateReady[venture]
        ? `Health gate passed; missing ${missing[venture]!.join(", ")}.`
        : venture === "titty-tuesdays" && input.safetyCheckerReady !== true
          ? "Waiting for the tested Titty Tuesdays safety checker."
          : `Health counter ${counters[venture]!}/${requirements[venture]!}.`;
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
