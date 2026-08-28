import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SocialProfileEventSchema, type SocialProfileEvent } from "../contracts/social-distribution.js";

export interface SocialLifecycleHolds {
  pausedProfileIds: Set<string>;
  pausedConnectionIds: Set<string>;
  malformed: number;
}

function supersedes(event: SocialProfileEvent, candidate: SocialProfileEvent): boolean {
  return event.action === "corrected" && event.supersededEventRef !== null
    && (event.supersededEventRef === candidate.eventId || event.supersededEventRef.endsWith(`/${candidate.eventId}.json`));
}

/**
 * Reduce the append-only Admin lifecycle ledger into runtime holds. A lifecycle action can remove
 * authority; it cannot grant it. Later connected/activated evidence only clears this ledger hold,
 * and all independent profile, connection, capability and activation gates still run.
 */
export async function loadSocialLifecycleHolds(stateRoot: string): Promise<SocialLifecycleHolds> {
  const directory = path.join(stateRoot, "social/profile-events");
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (files === null) return { pausedProfileIds: new Set(), pausedConnectionIds: new Set(), malformed: 1 };
  const events: SocialProfileEvent[] = [];
  let malformed = 0;
  for (const file of files.filter((name) => name.endsWith(".json")).sort().slice(0, 2_000)) {
    try {
      const parsed = SocialProfileEventSchema.safeParse(JSON.parse(await readFile(path.join(directory, file), "utf8")) as unknown);
      if (parsed.success) events.push(parsed.data); else malformed += 1;
    } catch { malformed += 1; }
  }
  const corrected = new Set(events.filter((event) => event.action === "corrected").flatMap((event) => events.filter((candidate) => supersedes(event, candidate)).map(({ eventId }) => eventId)));
  const effective = events.filter((event) => event.action !== "corrected" && !corrected.has(event.eventId)).sort((left, right) => right.at.localeCompare(left.at));
  const profileLatest = new Map<string, SocialProfileEvent>();
  const connectionLatest = new Map<string, SocialProfileEvent>();
  for (const event of effective) {
    if (event.connectionId === null) {
      if (!profileLatest.has(event.profileId)) profileLatest.set(event.profileId, event);
    } else if (!connectionLatest.has(event.connectionId)) connectionLatest.set(event.connectionId, event);
  }
  return {
    pausedProfileIds: new Set([...profileLatest.values()].filter(({ action }) => ["paused", "retired", "rejected"].includes(action)).map(({ profileId }) => profileId)),
    pausedConnectionIds: new Set([...connectionLatest.values()].filter(({ action }) => ["paused", "disconnected", "reauthorisation-requested"].includes(action)).flatMap(({ connectionId }) => connectionId ? [connectionId] : [])),
    malformed
  };
}
