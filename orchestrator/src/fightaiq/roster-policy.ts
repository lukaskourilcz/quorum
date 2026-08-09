import path from "node:path";
import { z } from "zod";
import { readJson } from "../state.js";

/**
 * FightAIQ tracks a curated roster rather than every fighter a crawl can reach.
 *
 * The previous behaviour wrote a card for every category member it saw, which produced 840
 * cards that were all UFC, all `status: "unknown"`, 560 of them with no bout history at all,
 * and only 12 ever reviewed. It also could not reach Oktagon: the hardcoded category name
 * `Oktagon MMA fighters` does not exist on Wikipedia, so that organization returned nothing
 * on every run. Breadth was costing depth on the fighters that actually compete.
 *
 * This policy is the allowlist. Only listed fighters get cards, so intake, backfill and
 * roster-sync all narrow to the same set instead of each applying its own rule.
 */
export const RosterPolicyFighterSchema = z.object({
  id: z.string().regex(/^(ufc|oktagon):[a-z0-9-]+$/u),
  name: z.string().min(1).max(160),
  wikipediaTitle: z.string().min(1).max(160).optional(),
  eventRef: z.string().regex(/^(ufc|oktagon):event:[a-z0-9]+(?:-[a-z0-9]+)*$/u).optional(),
  tier: z.enum(["champion", "current-roster"])
}).refine((fighter) => fighter.wikipediaTitle || fighter.eventRef, {
  message: "A roster fighter needs a reviewed Wikipedia title or event reference"
});

export const RosterPolicyOrganizationSchema = z.object({
  cap: z.number().int().positive().max(500),
  category: z.string().min(1),
  fighters: z.array(RosterPolicyFighterSchema)
});

export const RosterPolicySchema = z.object({
  schemaVersion: z.literal("mma-roster-policy/1"),
  note: z.string().optional(),
  selectedAt: z.string().optional(),
  source: z.string().optional(),
  organizations: z.object({
    ufc: RosterPolicyOrganizationSchema,
    oktagon: RosterPolicyOrganizationSchema
  })
});

export type RosterPolicy = z.infer<typeof RosterPolicySchema>;
export type RosterPolicyFighter = z.infer<typeof RosterPolicyFighterSchema>;

export async function loadRosterPolicy(configRootPath: string): Promise<RosterPolicy> {
  const raw = await readJson<unknown>(configRootPath, "mma-roster.json", null);
  if (raw === null) throw new Error("config/mma-roster.json is missing; FightAIQ has no roster policy");
  const policy = RosterPolicySchema.parse(raw);
  for (const [org, entry] of Object.entries(policy.organizations)) {
    if (entry.fighters.length > entry.cap) {
      throw new Error(`Roster policy lists ${entry.fighters.length} ${org} fighters above its cap of ${entry.cap}`);
    }
    const ids = entry.fighters.map((fighter) => fighter.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Roster policy repeats a fighter id in ${org}`);
    const foreign = ids.filter((id) => !id.startsWith(`${org}:`));
    if (foreign.length > 0) throw new Error(`Roster policy lists ${foreign[0]} under ${org}`);
    const foreignEvent = entry.fighters.find((fighter) => fighter.eventRef && !fighter.eventRef.startsWith(`${org}:event:`));
    if (foreignEvent) throw new Error(`Roster policy lists ${foreignEvent.eventRef} under ${org}`);
  }
  return policy;
}

/** Every id the policy permits, across both organizations. */
export function rosterPolicyIds(policy: RosterPolicy): Set<string> {
  return new Set(
    Object.values(policy.organizations).flatMap((entry) => entry.fighters.map((fighter) => fighter.id))
  );
}

/** The Wikipedia titles to resolve, so a sync asks for named pages instead of crawling a category. */
export function rosterPolicyTitles(policy: RosterPolicy, org: "ufc" | "oktagon"): string[] {
  return policy.organizations[org].fighters.flatMap((fighter) => fighter.wikipediaTitle ? [fighter.wikipediaTitle] : []);
}

export function isRosterMember(policy: RosterPolicy, fighterId: string): boolean {
  return rosterPolicyIds(policy).has(fighterId);
}

export function rosterPolicyPath(configRootPath: string): string {
  return path.join(configRootPath, "mma-roster.json");
}
