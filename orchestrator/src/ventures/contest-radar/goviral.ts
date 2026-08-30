import { readdir } from "node:fs/promises";
import { resolveVentureCapability } from "../capabilities.js";
import { readJson, resolveStatePath } from "../../state.js";

/**
 * The one way a social lead reaches Contest Radar, and everything it is not allowed to be.
 *
 * GoVIRAL owns Instagram and TikTok collection for the whole portfolio. Contest Radar schedules
 * none of its own — the source audit rejects every social Apify actor on that ground — and reads
 * what GoVIRAL already recorded. The read costs nothing incremental because the collection already
 * happened for another venture's reasons.
 *
 * What comes back is **discovery-only**. A lead may open an investigation and may never establish
 * a fact: it produces a URL worth looking at, not a deadline, a prize or an eligibility rule.
 * Merging it into the fetchable set is how a social post's caption would become a date the owner
 * plans around, so the two stay separate all the way through the pipeline.
 *
 * The edge is resolved through the capability map on every call and fails closed. An unregistered
 * or held edge yields no leads and a reason, rather than an exception or a silent empty list that
 * looks identical to a quiet week.
 */

export interface ContestGoViralLead {
  /** Where the lead points. The only thing a lead carries that is worth acting on. */
  url: string;
  /** The scout line it came from, clipped. Untrusted text, never an instruction. */
  note: string;
  observedAt: string;
  evidenceRef: string;
}

export interface ContestGoViralRead {
  leads: ContestGoViralLead[];
  /** Why there are none, when there are none. Absent and denied are different answers. */
  reason: string;
  decision: "allowed" | "held" | "denied" | "unregistered";
}

/** Scraped text is clipped and never grows: a lead is a pointer, not a payload. */
const NOTE_LIMIT = 280;

export async function readContestGoViralLeads(input: {
  stateRoot: string;
  asOfDate: string;
  configRoot?: string;
  /** Days after which a recorded snapshot is too old to be worth reading. */
  staleAfterDays?: number;
}): Promise<ContestGoViralRead> {
  const resolution = await resolveVentureCapability({
    source: "goviral",
    target: "contest-radar",
    capability: "intelligence-read",
    schemaVersion: "goviral-intelligence-packet/1"
  }, input.configRoot === undefined ? {} : { configRoot: input.configRoot });

  if (resolution.decision !== "allowed") {
    return {
      leads: [],
      reason: `The GoVIRAL bridge is ${resolution.decision}, so no lead was read.`,
      decision: resolution.decision === "held" || resolution.decision === "denied" ? resolution.decision : "unregistered"
    };
  }

  let names: string[];
  try {
    names = (await readdir(resolveStatePath(input.stateRoot, "goviral/trends")))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(name))
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // GoVIRAL has never produced a snapshot, which is the state of that venture rather than a
    // fault here. The five other consumers report the same thing the same way.
    return { leads: [], reason: "GoVIRAL has recorded no trend snapshot yet.", decision: "allowed" };
  }

  const newest = names[0];
  if (!newest) return { leads: [], reason: "GoVIRAL has recorded no trend snapshot yet.", decision: "allowed" };

  const snapshotDate = newest.slice(0, 10);
  const ageDays = Math.round(
    (Date.parse(`${input.asOfDate}T00:00:00.000Z`) - Date.parse(`${snapshotDate}T00:00:00.000Z`)) / 86_400_000
  );
  const staleAfter = input.staleAfterDays ?? 14;
  if (Number.isFinite(ageDays) && ageDays > staleAfter) {
    return {
      leads: [],
      reason: `The newest GoVIRAL snapshot is ${ageDays} days old, past the ${staleAfter}-day staleness limit.`,
      decision: "allowed"
    };
  }

  const snapshot = await readJson<{ items?: unknown } | null>(
    input.stateRoot,
    `goviral/trends/${newest}`,
    null
  ).catch(() => null);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];

  const leads: ContestGoViralLead[] = [];
  for (const value of items) {
    const item = value as { url?: unknown; text?: unknown; observedAt?: unknown };
    if (typeof item.url !== "string" || !item.url.startsWith("https://")) continue;
    leads.push({
      url: item.url,
      note: typeof item.text === "string" ? item.text.replace(/\s+/gu, " ").trim().slice(0, NOTE_LIMIT) : "",
      observedAt: typeof item.observedAt === "string" ? item.observedAt : `${snapshotDate}T00:00:00.000Z`,
      evidenceRef: `state/goviral/trends/${newest}`
    });
  }

  return {
    leads,
    reason: leads.length === 0
      ? `The ${snapshotDate} snapshot carried no usable lead.`
      : `${leads.length} discovery-only ${leads.length === 1 ? "lead" : "leads"} from the ${snapshotDate} snapshot.`,
    decision: "allowed"
  };
}
