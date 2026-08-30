import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ContestSocialPilotLaneSchema,
  ContestSocialPilotReceiptSchema,
  SocialContestLeadSchema,
  type ContestSocialPilotLane,
  type ContestSocialPilotReceipt,
  type SocialContestLead,
  type SocialContestPlatform
} from "../../contracts/contest-radar.js";
import { configRoot as defaultConfigRoot } from "../../paths.js";
import { mayContestRadarSpend } from "./spend.js";

/**
 * The optional Instagram and TikTok pilot: what it would measure, and why nothing runs.
 *
 * The question the pilot exists to answer is narrow and worth answering: does bounded public social
 * discovery find unique, entry-ready Czech and Slovak contests the four free structured sources
 * miss, at a cost worth its share of GoVIRAL's Apify quota? Everything here is built to answer that
 * with a fixture and to refuse to answer it with money.
 *
 * **GoVIRAL owns collection.** Actor selection, queries, scheduling, retries, the shared quota
 * reservation and the actual cost are all its decisions. This module owns the shape of a lead, the
 * arithmetic of the yield, and the gate. It instantiates no actor, holds no token and reruns no
 * collection: a live lane would be handed items GoVIRAL already fetched for its own reasons.
 *
 * **Everything a lead touches stays discovery-only.** A lead is a URL and a quoted caption. It can
 * open an investigation and can never close one — the deadline, the prize, the eligibility and the
 * mechanics all come from the contest's own rules page, read afterwards by the extractor that
 * already exists. `leadsAreNeverEntryReady` in the tests is that rule stated as a failure.
 *
 * **The gate fails closed on four separate conditions** and names which one refused. Three of them
 * are outside this repository's power to satisfy — a countersigned capacity decision, owner
 * authority for the specific actors, and a GoVIRAL quota reservation — so the honest current answer
 * is "held", four times over, and the fixture path is what remains useful.
 */

const StableId = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160);

const PilotQuerySchema = z.strictObject({
  id: StableId,
  term: z.string().trim().min(1).max(80),
  language: z.enum(["cs", "sk", "en"]),
  shape: z.enum(["hashtag", "keyword", "profile"])
});

const PilotLaneConfigSchema = z.strictObject({
  platform: z.enum(["instagram", "tiktok"]),
  enabled: z.boolean(),
  heldReason: z.string().trim().min(1).max(600),
  maxResultsPerQuery: z.number().int().min(1).max(200),
  maxResultsPerRun: z.number().int().min(1).max(600),
  maxCostUsd: z.number().min(0).max(0.1),
  leadTtlDays: z.number().int().min(1).max(60),
  queries: z.array(PilotQuerySchema).min(1).max(10)
}).superRefine((lane, context) => {
  if (lane.maxResultsPerRun < lane.maxResultsPerQuery) {
    context.addIssue({ code: "custom", message: "A run envelope cannot be smaller than one query's", path: ["maxResultsPerRun"] });
  }
});

export const ContestSocialPilotConfigSchema = z.strictObject({
  schemaVersion: z.literal("contest-social-pilot-config/1"),
  version: z.string().trim().min(1).max(40),
  decisionRef: z.string().trim().min(1).max(300),
  issueRef: z.string().trim().min(1).max(80),
  collectionOwner: z.literal("goviral"),
  ceilingUsd: z.number().min(0).max(0.1),
  heldReason: z.string().trim().min(1).max(800),
  lanes: z.array(PilotLaneConfigSchema).min(1).max(2),
  terminalHints: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
  noiseHints: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
  /**
   * Recorded so the exclusion is legible, not so it is enforced here.
   *
   * The enforcement is the closed `SocialContestPlatformSchema` enum: a Facebook lane cannot be
   * configured, because it cannot be parsed. This field is the note that says why.
   */
  excludedPlatforms: z.array(z.literal("facebook")).min(1).max(1),
  excludedPlatformsReason: z.string().trim().min(1).max(600)
}).superRefine((config, context) => {
  const laneCost = config.lanes.reduce((total, lane) => total + lane.maxCostUsd, 0);
  if (laneCost > config.ceilingUsd + Number.EPSILON) {
    context.addIssue({ code: "custom", message: "The lanes cannot be budgeted past the pilot ceiling", path: ["lanes"] });
  }
  const ids = config.lanes.flatMap((lane) => lane.queries.map((query) => query.id));
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Query ids are how a query is disabled on its own evidence, so they are unique", path: ["lanes"] });
  }
});

export type ContestSocialPilotConfig = z.infer<typeof ContestSocialPilotConfigSchema>;
export type ContestSocialPilotLaneConfig = z.infer<typeof PilotLaneConfigSchema>;

export const CONTEST_SOCIAL_PILOT_CONFIG_REF = "config/contest-radar-social-pilot.json";

export async function loadContestSocialPilotConfig(
  configRoot: string = defaultConfigRoot
): Promise<ContestSocialPilotConfig> {
  const raw = await readFile(path.join(configRoot, "contest-radar-social-pilot.json"), "utf8");
  return ContestSocialPilotConfigSchema.parse(JSON.parse(raw) as unknown);
}

/* ------------------------------------------------------------------------------------------- */

export interface ContestSocialPilotGate {
  allowed: boolean;
  /** Every condition that refused, not just the first, so one fix does not look like the last. */
  heldReasons: string[];
  authority: ContestSocialPilotReceipt["authority"];
}

/**
 * Whether a lane may collect live, checked against every condition rather than the first failure.
 *
 * Reporting all of them at once is the point. A gate that stops at the first refusal makes the
 * owner satisfy conditions one at a time and re-run to discover the next, which reads as progress
 * while the answer stays "no".
 */
export async function mayRunContestSocialPilotLane(input: {
  lane: ContestSocialPilotLaneConfig;
  stateRoot: string;
  month: string;
  env?: NodeJS.ProcessEnv;
  repoRoot?: string;
  /** GoVIRAL's own reservation against the shared Apify quota, when it has made one. */
  quotaReservationRef?: string | null;
  /** Owner authority for these specific actors, with their terms read at that time. */
  ownerSourceAuthorityRef?: string | null;
}): Promise<ContestSocialPilotGate> {
  const heldReasons: string[] = [];

  if (!input.lane.enabled) {
    heldReasons.push(`The ${input.lane.platform} lane is disabled: ${input.lane.heldReason}`);
  }

  const spend = await mayContestRadarSpend({
    rung: "apify-discovery",
    stateRoot: input.stateRoot,
    month: input.month,
    reserveUsd: input.lane.maxCostUsd,
    ...(input.env ? { env: input.env } : {}),
    ...(input.repoRoot ? { repoRoot: input.repoRoot } : {})
  });
  if (!spend.allowed) heldReasons.push(spend.reason);

  const quotaReservationRef = input.quotaReservationRef ?? null;
  if (quotaReservationRef === null) {
    heldReasons.push("GoVIRAL has reserved no share of the shared Apify quota for this lane, and this venture may not open a second allowance.");
  }

  const ownerSourceAuthorityRef = input.ownerSourceAuthorityRef ?? null;
  if (ownerSourceAuthorityRef === null) {
    heldReasons.push("No owner source authority names these actors with their terms read at the time. A provisional actor name in the brief is not authority.");
  }

  return {
    allowed: heldReasons.length === 0,
    heldReasons,
    authority: {
      capacityDecisionRef: spend.allowed ? "state/decisions/2026-08-30-contest-radar-budget-capacity.md" : null,
      ownerSourceAuthorityRef,
      quotaReservationRef
    }
  };
}

/* ------------------------------------------------------------------------------------------- */

/** A collected item as GoVIRAL would hand it over: public, bounded, and possibly nonsense. */
export interface RawSocialItem {
  url?: unknown;
  caption?: unknown;
  targetUrl?: unknown;
  observedAt?: unknown;
  likes?: unknown;
  comments?: unknown;
  language?: unknown;
}

const CONTEST_HINTS =
  /soutěž|soutez|súťaž|sutaz|vyhraj|vyhrajte|hrajeme\s+o|hrajte\s+o|giveaway|contest|competition/iu;

const DEADLINE_HINTS =
  /(?:do|uzávěrka|uzavierka|deadline|ends?|končí|konci)\s*[:\s]\s*[^.!?\n]{1,80}/iu;
const PRIZE_HINTS =
  /(?:o|vyhraj|vyhrajte|win|prize|cena)\s+[^.!?\n]{2,120}/iu;
const ELIGIBILITY_HINTS =
  /(?:pouze pro|jen pro|only for|18\+|starší\s+\d{2}|residents?\s+of|obyvatel\w*)[^.!?\n]{0,120}/iu;

const URL_IN_TEXT = /https:\/\/[^\s<>"']{4,300}/u;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clip(value: string, limit: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, limit).trim();
}

/**
 * Turn one collected item into a lead, or into a recorded refusal.
 *
 * Every outcome is a lead. A malformed item, an expired one and a winner announcement all become
 * records with a status and a reason rather than disappearing, because a lane's verdict depends on
 * knowing how much of what it fetched was worthless — a lane that returns nothing useful and a lane
 * that returns nothing at all deserve different decisions.
 */
export function buildSocialContestLead(input: {
  item: RawSocialItem;
  platform: SocialContestPlatform;
  queryId: string;
  collectionRef: string;
  terminalHints: readonly string[];
  noiseHints: readonly string[];
  leadTtlDays: number;
  now: Date;
  costUsd?: number;
}): SocialContestLead {
  const now = input.now.toISOString();
  const costUsd = input.costUsd ?? 0;
  const url = typeof input.item.url === "string" ? input.item.url.trim() : "";
  const observedAtRaw = typeof input.item.observedAt === "string" ? input.item.observedAt : "";
  const observedAt = Number.isNaN(Date.parse(observedAtRaw)) ? now : new Date(observedAtRaw).toISOString();
  const expiresAt = new Date(Date.parse(observedAt) + input.leadTtlDays * 86_400_000).toISOString();

  const base = {
    schemaVersion: "social-contest-lead/1" as const,
    collectionRef: input.collectionRef,
    platform: input.platform,
    queryId: input.queryId,
    observedAt,
    expiresAt,
    costUsd,
    evidenceRefs: [input.collectionRef]
  };

  // A malformed item is the one case with nothing to quote. Its identity is the shape it arrived
  // in, so two identical pieces of nonsense are one lead rather than an accumulating pile.
  if (!url.startsWith("https://")) {
    const contentHash = hash(`${input.platform}|malformed|${JSON.stringify(input.item)}`);
    return SocialContestLeadSchema.parse({
      ...base,
      leadId: contentHash,
      contentHash,
      url: "https://example.invalid/malformed",
      targetUrl: null,
      caption: "",
      stated: { deadlineText: null, prizeText: null, eligibilityText: null },
      engagement: { likes: null, comments: null },
      language: null,
      status: "malformed",
      statusReason: "The item carried no https URL, so there is nothing to look at."
    });
  }

  const caption = clip(typeof input.item.caption === "string" ? input.item.caption : "", 280);
  const contentHash = hash(`${input.platform}|${url}|${caption}`);
  const lower = caption.toLocaleLowerCase("cs-CZ");
  const targetFromText = URL_IN_TEXT.exec(caption)?.[0] ?? null;
  const targetUrl = typeof input.item.targetUrl === "string" && input.item.targetUrl.startsWith("https://")
    ? input.item.targetUrl
    : targetFromText;

  const language = ["cs", "sk", "en"].includes(String(input.item.language))
    ? (input.item.language as "cs" | "sk" | "en")
    : null;
  const engagement = {
    likes: typeof input.item.likes === "number" && Number.isInteger(input.item.likes) && input.item.likes >= 0
      ? input.item.likes
      : null,
    comments: typeof input.item.comments === "number" && Number.isInteger(input.item.comments) && input.item.comments >= 0
      ? input.item.comments
      : null
  };

  const decided = (status: SocialContestLead["status"], statusReason: string): SocialContestLead =>
    SocialContestLeadSchema.parse({
      ...base,
      leadId: contentHash,
      contentHash,
      url,
      targetUrl,
      caption,
      stated: {
        deadlineText: clip(DEADLINE_HINTS.exec(caption)?.[0] ?? "", 120) || null,
        prizeText: clip(PRIZE_HINTS.exec(caption)?.[0] ?? "", 200) || null,
        eligibilityText: clip(ELIGIBILITY_HINTS.exec(caption)?.[0] ?? "", 200) || null
      },
      engagement,
      language,
      status,
      statusReason
    });

  const terminal = input.terminalHints.find((hint) => lower.includes(hint.toLocaleLowerCase("cs-CZ")));
  if (terminal) return decided("expired", `The caption announces a result ("${clip(terminal, 60)}"), so the contest is over.`);

  const noise = input.noiseHints.find((hint) => lower.includes(hint.toLocaleLowerCase("cs-CZ")));
  if (noise) return decided("rejected", `The caption is about a sporting or league competition ("${clip(noise, 60)}"), not a contest to enter.`);

  if (!CONTEST_HINTS.test(caption)) {
    return decided("rejected", "No contest wording appears in the caption, so this is not a lead worth opening.");
  }

  if (Date.parse(expiresAt) <= input.now.getTime()) {
    return decided("expired", "The lead's window closed before it was read.");
  }

  return decided(
    "accepted",
    "The caption reads as an open contest. It is a pointer only: nothing here is a deadline, a prize or an eligibility rule until the rules page says so."
  );
}

/* ------------------------------------------------------------------------------------------- */

export interface SocialPilotLaneRun {
  lane: ContestSocialPilotLane;
  leads: SocialContestLead[];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

/**
 * Run one lane against items somebody else collected, and score what came back.
 *
 * `entryReadyCount` is supplied by the caller rather than computed here, and that separation is
 * deliberate: whether a lead became an entry-ready record is Contest Radar's verification answering,
 * after reading a rules page. A collector deciding its own leads were entry-ready is the failure this
 * whole venture is arranged to avoid.
 */
export function runSocialPilotLane(input: {
  lane: ContestSocialPilotLaneConfig;
  config: ContestSocialPilotConfig;
  /** Items per query id, as GoVIRAL recorded them. Fixture-backed while the lane is held. */
  itemsByQuery: Readonly<Record<string, readonly RawSocialItem[]>>;
  collectionRef: string;
  now: Date;
  gate: ContestSocialPilotGate;
  costUsd?: number;
  /** Queries whose actor failed outright, so a failure costs a query and not the lane. */
  failedQueryIds?: readonly string[];
  entryReadyCount?: number;
  /** Canonical URLs the direct sources already carry, so the pilot is scored on what it adds. */
  knownUrls?: ReadonlySet<string>;
}): SocialPilotLaneRun {
  const failed = new Set(input.failedQueryIds ?? []);
  const costUsd = input.gate.allowed ? (input.costUsd ?? 0) : 0;
  const leads: SocialContestLead[] = [];
  const queries: ContestSocialPilotLane["queries"] = [];
  const seen = new Set<string>();
  const known = input.knownUrls ?? new Set<string>();
  let duplicates = 0;
  let budgetLeft = input.lane.maxResultsPerRun;

  for (const query of input.lane.queries) {
    if (failed.has(query.id)) {
      queries.push({ queryId: query.id, fetched: 0, kept: 0, unique: 0, noise: 0 });
      continue;
    }
    const raw = (input.itemsByQuery[query.id] ?? []).slice(0, input.lane.maxResultsPerQuery);
    const budgeted = raw.slice(0, Math.max(0, budgetLeft));
    budgetLeft -= budgeted.length;

    let kept = 0;
    let unique = 0;
    let noise = 0;
    for (const item of budgeted) {
      const lead = buildSocialContestLead({
        item,
        platform: input.lane.platform,
        queryId: query.id,
        collectionRef: input.collectionRef,
        terminalHints: input.config.terminalHints,
        noiseHints: input.config.noiseHints,
        leadTtlDays: input.lane.leadTtlDays,
        now: input.now,
        costUsd: 0
      });
      leads.push(lead);
      if (lead.status === "accepted") {
        kept += 1;
        // Unique means unique to this pilot: neither collected twice nor already known from a
        // source that costs nothing. A lead the free path already has is not worth paying for.
        const duplicate = seen.has(lead.contentHash) || known.has(lead.url) || (lead.targetUrl !== null && known.has(lead.targetUrl));
        if (duplicate) duplicates += 1;
        else unique += 1;
        seen.add(lead.contentHash);
      } else if (lead.status === "rejected") {
        noise += 1;
      }
    }
    queries.push({ queryId: query.id, fetched: budgeted.length, kept, unique, noise });
  }

  const fetched = queries.reduce((total, query) => total + query.fetched, 0);
  const contestLike = leads.filter((lead) => lead.status === "accepted").length;
  const unique = queries.reduce((total, query) => total + query.unique, 0);
  const entryReady = Math.min(unique, input.entryReadyCount ?? 0);
  const expired = leads.filter((lead) => lead.status === "expired").length;
  const noise = leads.filter((lead) => lead.status === "rejected").length;
  const malformed = leads.filter((lead) => lead.status === "malformed").length;
  const announcement = leads.filter((lead) =>
    lead.status === "expired" && lead.statusReason.includes("announces a result")).length;
  const actorFailures = failed.size;

  const outcome: ContestSocialPilotLane["outcome"] = input.gate.allowed
    ? (fetched === 0 && actorFailures > 0 ? "failed" : "ran")
    : (input.lane.enabled ? "held" : "disabled");

  // Held reasons live in full on the receipt, which is the record the owner reads. The lane says
  // how many there are and names the first, because a lane row that carried all four verbatim
  // would be a wall of text in every table this appears in.
  const reason = input.gate.allowed
    ? `Read ${fetched} recorded ${fetched === 1 ? "item" : "items"} across ${queries.length} ${queries.length === 1 ? "query" : "queries"}.`
    : `Held for ${input.gate.heldReasons.length} ${input.gate.heldReasons.length === 1 ? "reason" : "reasons"}. First: ${clip(input.gate.heldReasons[0] ?? "no reason recorded", 300)}`;

  const verdict = decideLaneVerdict({ unique, entryReady, fetched, costUsd, ran: input.gate.allowed });

  return {
    leads,
    lane: ContestSocialPilotLaneSchema.parse({
      platform: input.lane.platform,
      enabled: input.lane.enabled,
      outcome,
      reason,
      queries,
      fetched,
      contestLike,
      unique,
      entryReady,
      expired,
      announcement,
      noise,
      malformed,
      duplicates,
      costUsd,
      costPerUniqueUsd: unique === 0 ? null : Math.round((costUsd / unique) * 1_000_000) / 1_000_000,
      costPerEntryReadyUsd: entryReady === 0 ? null : Math.round((costUsd / entryReady) * 1_000_000) / 1_000_000,
      actorFailures,
      failureRate: ratio(actorFailures, input.lane.queries.length),
      verdict: verdict.verdict,
      verdictReason: verdict.reason
    })
  };
}

/**
 * Retain or disable this lane, on this lane's evidence.
 *
 * The two lanes never decide together. Instagram producing nothing is a reason to disable Instagram
 * and says nothing about TikTok, which is why the issue asks for independent gates and why a single
 * pilot verdict would have been the wrong shape.
 */
export function decideLaneVerdict(input: {
  unique: number;
  entryReady: number;
  fetched: number;
  costUsd: number;
  ran: boolean;
}): { verdict: ContestSocialPilotLane["verdict"]; reason: string } {
  if (!input.ran) {
    return {
      verdict: "undecided",
      reason: "The lane has not run, so there is no evidence to retain or disable it on."
    };
  }
  if (input.fetched === 0) {
    return { verdict: "disable", reason: "The lane fetched nothing, so it costs quota and returns no evidence." };
  }
  if (input.unique === 0) {
    return {
      verdict: "disable",
      reason: `Nothing among ${input.fetched} fetched items was a contest the free sources did not already have.`
    };
  }
  if (input.entryReady === 0) {
    return {
      verdict: "undecided",
      reason: `${input.unique} unique ${input.unique === 1 ? "lead" : "leads"} and none verified to entry-ready yet, so the lane has not shown its value.`
    };
  }
  return {
    verdict: "retain",
    reason: `${input.entryReady} entry-ready ${input.entryReady === 1 ? "record" : "records"} from ${input.unique} unique ${input.unique === 1 ? "lead" : "leads"} at $${input.costUsd.toFixed(4)}.`
  };
}

/* ------------------------------------------------------------------------------------------- */

export function buildContestSocialPilotReceipt(input: {
  date: string;
  now: Date;
  config: ContestSocialPilotConfig;
  lanes: readonly ContestSocialPilotLane[];
  gates: readonly ContestSocialPilotGate[];
}): ContestSocialPilotReceipt {
  const live = input.gates.length > 0 && input.gates.every((gate) => gate.allowed);
  const authority = live && input.gates[0]
    ? input.gates[0].authority
    : { capacityDecisionRef: null, ownerSourceAuthorityRef: null, quotaReservationRef: null };

  return ContestSocialPilotReceiptSchema.parse({
    schemaVersion: "contest-social-pilot/1",
    date: input.date,
    generatedAt: input.now.toISOString(),
    mode: live ? "live" : "fixture",
    lanes: input.lanes,
    totalCostUsd: Math.round(input.lanes.reduce((total, lane) => total + lane.costUsd, 0) * 1_000_000) / 1_000_000,
    ceilingUsd: input.config.ceilingUsd,
    authority,
    heldReasons: [...new Set(input.gates.flatMap((gate) => gate.heldReasons))].slice(0, 20)
  });
}

export const CONTEST_SOCIAL_PILOT_RECEIPT_DIRECTORY = "ventures/contest-radar/social-pilot";

export function contestSocialPilotRef(date: string): string {
  return `state/${CONTEST_SOCIAL_PILOT_RECEIPT_DIRECTORY}/${date}.json`;
}
