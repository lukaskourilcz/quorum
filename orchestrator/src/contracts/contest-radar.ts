import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, Sha256Schema } from "./common.js";

/**
 * The Contest Radar domain, schema-first.
 *
 * Five contracts and the enums they share, written before any adapter, store, ranking or Admin, so
 * that every later issue in the program agrees about what a contest is. What they encode is mostly
 * refusals: a fact this venture does not have stays absent rather than becoming a zero, a source's
 * own text is evidence and never an instruction, and owner state lives in its own append-only
 * record rather than inside the thing the sources describe.
 *
 * The separation of `contest-record` from `contest-owner-event` is the one worth stating. A record
 * is what the world says about an opportunity and it changes when the world does. An owner event is
 * what the owner did, and it is history. Merging them would mean a re-scrape could overwrite the
 * fact that somebody entered something.
 */

const StableId = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160);

export const ContestTrackSchema = z.enum(["consumer", "developer"]);

export const ContestKindSchema = z.enum([
  "sweepstakes",
  "skill-contest",
  "creative-contest",
  "quiz",
  "hackathon",
  "data-competition",
  "bounty",
  "grant",
  "other"
]);

/**
 * How much a fact is trusted, and why the middle value exists.
 *
 * `stated` is the source saying it outright. `derived` is this system computing it from something
 * stated. `inferred` is a guess with a basis, and it is the only one that may never satisfy a hard
 * gate — a deadline inferred from a page's layout is not a deadline anybody can rely on.
 */
export const ContestConfidenceSchema = z.enum(["stated", "derived", "inferred"]);

export const ContestEffortTierSchema = z.enum(["minutes", "short", "medium", "long", "unknown"]);

export const ContestLifecycleSchema = z.enum([
  "discovered",
  "verified",
  "open",
  "closing",
  "closed",
  "archived",
  "rejected"
]);

export const ContestReadinessSchema = z.enum([
  "ready",
  "needs-detail",
  "needs-owner-decision",
  "blocked",
  "unavailable"
]);

export const ContestSourceVerdictSchema = z.enum(["enabled", "held", "disabled", "rejected"]);

export const ContestSourceOutcomeSchema = z.enum([
  "ok",
  "unchanged",
  "empty",
  "malformed",
  "failed",
  "held",
  "skipped"
]);

export const ContestRunOutcomeSchema = z.enum(["success", "partial", "quiet", "held", "failed"]);

/**
 * A value the system does not have, with the reason it does not have it.
 *
 * Every optional fact in this domain uses this rather than `null` alone, because "no prize stated"
 * and "prize stated but unparseable" lead to different decisions and a bare null hides which one
 * happened. `not-stated` is the source's silence; `unparseable` is our failure; `conflicting` means
 * two sources disagreed and neither wins by default.
 */
export const ContestUnavailableSchema = z.enum([
  "not-stated",
  "unparseable",
  "conflicting",
  "requires-owner-check",
  "not-collected"
]);

interface MeasuredShape {
  value: unknown;
  confidence: unknown;
  unavailableReason: unknown;
}

function measured<T extends z.ZodTypeAny>(value: T) {
  return z.strictObject({
    value: value.nullable(),
    confidence: ContestConfidenceSchema.nullable(),
    unavailableReason: ContestUnavailableSchema.nullable(),
    evidenceRefs: z.array(EvidenceRefSchema).max(10)
  }).superRefine((raw, context) => {
    const field = raw as unknown as MeasuredShape;
    if (field.value === null && field.unavailableReason === null) {
      context.addIssue({ code: "custom", message: "A missing fact must say why it is missing", path: ["unavailableReason"] });
    }
    if (field.value !== null && field.confidence === null) {
      context.addIssue({ code: "custom", message: "A stated fact must carry its confidence", path: ["confidence"] });
    }
    if (field.value !== null && field.unavailableReason !== null) {
      context.addIssue({ code: "custom", message: "A present fact cannot also be unavailable", path: ["value"] });
    }
  });
}

export const ContestSourceSchema = z.strictObject({
  schemaVersion: z.literal("contest-source/1"),
  id: StableId,
  name: z.string().trim().min(1).max(160),
  track: ContestTrackSchema,
  type: z.enum(["json-api", "rss", "html", "manual", "discovery"]),
  host: z.string().trim().min(1).max(200),
  endpoint: HttpsUrlSchema,
  /** Logged-out only. An authenticated source needs an owner credential and its own verdict. */
  authPosture: z.enum(["public", "owner-read-credential"]),
  /** Env var name only. A credential value never reaches a config file. */
  credentialEnvName: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/u).max(80).nullable(),
  geography: z.array(z.enum(["CZ", "SK", "global"])).min(1).max(3),
  /** Discovery-only sources may open an investigation and may never establish a fact. */
  discoveryOnly: z.boolean(),
  robotsPosture: z.string().trim().min(1).max(300),
  termsRef: EvidenceRefSchema.nullable(),
  parserId: StableId.nullable(),
  fixtureId: StableId.nullable(),
  cadence: z.enum(["daily", "weekly", "monthly", "manual"]),
  maxRequestsPerRun: z.number().int().min(0).max(20),
  maxBodyBytes: z.number().int().min(0).max(5_000_000),
  costAuthorityRef: EvidenceRefSchema.nullable(),
  verdict: ContestSourceVerdictSchema,
  verdictReason: z.string().trim().min(1).max(400),
  lastVerifiedOn: DateSchema,
  verificationDueOn: DateSchema
}).superRefine((source, context) => {
  if (source.authPosture === "owner-read-credential" && source.credentialEnvName === null) {
    context.addIssue({ code: "custom", message: "A credentialed source must name its env var", path: ["credentialEnvName"] });
  }
  if (source.authPosture === "public" && source.credentialEnvName !== null) {
    context.addIssue({ code: "custom", message: "A public source takes no credential", path: ["credentialEnvName"] });
  }
  // A discovery-only source makes no request of its own — GoVIRAL's recorded evidence and the
  // owner's manual import are both enabled and both fetch nothing — so the budget rule applies to
  // the sources that actually reach a host.
  if (source.verdict === "enabled" && !source.discoveryOnly && source.maxRequestsPerRun === 0) {
    context.addIssue({ code: "custom", message: "An enabled fetching source needs a request budget", path: ["maxRequestsPerRun"] });
  }
  if (source.discoveryOnly && source.maxRequestsPerRun > 0) {
    context.addIssue({ code: "custom", message: "A discovery-only source fetches nothing", path: ["maxRequestsPerRun"] });
  }
});

export const ContestCandidateSchema = z.strictObject({
  schemaVersion: z.literal("contest-candidate/1"),
  sourceId: StableId,
  sourceItemId: z.string().trim().min(1).max(200),
  listingUrl: HttpsUrlSchema,
  targetUrl: HttpsUrlSchema.nullable(),
  rulesUrl: HttpsUrlSchema.nullable(),
  title: z.string().trim().min(1).max(300),
  snippet: z.string().trim().max(1_000).nullable(),
  organizer: z.string().trim().max(200).nullable(),
  /** Hints, not facts. Nothing here has been checked against a rules page yet. */
  hints: z.strictObject({
    track: ContestTrackSchema.nullable(),
    kind: ContestKindSchema.nullable(),
    language: z.enum(["cs", "sk", "en"]).nullable(),
    location: z.string().trim().max(200).nullable(),
    prizeText: z.string().trim().max(300).nullable(),
    deadlineText: z.string().trim().max(120).nullable(),
    mechanics: z.array(z.string().trim().min(1).max(160)).max(10)
  }),
  observedAt: DateTimeSchema,
  contentHash: Sha256Schema
  // No raw page body. The founding decision forbids an archive and a candidate is the place it
  // would otherwise creep in.
});

export const ContestRecordSchema = z.strictObject({
  schemaVersion: z.literal("contest-record/1"),
  id: StableId,
  canonicalUrl: HttpsUrlSchema,
  sourceRefs: z.array(z.strictObject({
    sourceId: StableId,
    sourceItemId: z.string().trim().min(1).max(200),
    listingUrl: HttpsUrlSchema
  })).min(1).max(20),
  title: z.string().trim().min(1).max(300),
  organizer: z.string().trim().max(200).nullable(),
  track: ContestTrackSchema,
  kind: ContestKindSchema,
  categories: z.array(StableId).max(20),
  language: z.enum(["cs", "sk", "en"]).nullable(),
  eligibility: z.strictObject({
    facts: z.array(z.strictObject({
      statement: z.string().trim().min(1).max(400),
      confidence: ContestConfidenceSchema,
      evidenceRefs: z.array(EvidenceRefSchema).max(10)
    })).max(30),
    minimumAge: measured(z.number().int().min(0).max(120)),
    residency: measured(z.array(z.string().trim().min(1).max(80)).max(20))
  }),
  dates: z.strictObject({
    registrationOpens: measured(DateSchema),
    submissionCloses: measured(DateSchema),
    eventStarts: measured(DateSchema),
    deadline: measured(DateSchema),
    resultsAnnounced: measured(DateSchema)
  }),
  prize: z.strictObject({
    description: measured(z.string().trim().min(1).max(400)),
    valueAmount: measured(z.number().min(0).max(100_000_000)),
    currency: measured(z.enum(["CZK", "EUR", "USD"]))
  }),
  cost: z.strictObject({
    purchaseRequired: measured(z.boolean()),
    entryFee: measured(z.number().min(0).max(1_000_000))
  }),
  mechanics: z.array(z.string().trim().min(1).max(200)).max(20),
  repeatHints: z.array(z.string().trim().min(1).max(200)).max(10),
  judging: measured(z.string().trim().min(1).max(300)),
  participation: measured(z.number().int().min(0).max(100_000_000)),
  effort: z.strictObject({
    tier: ContestEffortTierSchema,
    minutes: measured(z.number().int().min(0).max(10_000)),
    basis: z.string().trim().min(1).max(300)
  }),
  legitimacy: z.strictObject({
    state: z.enum(["trusted", "unverified", "suspect", "rejected"]),
    reasons: z.array(z.string().trim().min(1).max(300)).max(20)
  }),
  readiness: ContestReadinessSchema,
  readinessReasons: z.array(z.string().trim().min(1).max(300)).max(20),
  /** Fields two sources disagreed about. Recorded rather than silently resolved. */
  conflicts: z.array(z.strictObject({
    field: z.string().trim().min(1).max(80),
    values: z.array(z.string().trim().min(1).max(300)).min(2).max(10),
    sourceIds: z.array(StableId).min(2).max(10)
  })).max(20),
  rankingRefs: z.array(EvidenceRefSchema).max(10),
  preparationRefs: z.array(EvidenceRefSchema).max(10),
  firstSeenAt: DateTimeSchema,
  lastSeenAt: DateTimeSchema,
  lifecycle: ContestLifecycleSchema,
  staleAfter: DateSchema.nullable(),
  versions: z.strictObject({
    source: z.string().trim().min(1).max(40),
    extraction: z.string().trim().min(1).max(40),
    enrichment: z.string().trim().min(1).max(40).nullable(),
    ranking: z.string().trim().min(1).max(40).nullable()
  }),
  /** An owner correction outranks extraction and locks the field against re-derivation. */
  lockedFields: z.array(z.string().trim().min(1).max(80)).max(40),
  supersedesRef: EvidenceRefSchema.nullable()
});

export const ContestRunSchema = z.strictObject({
  schemaVersion: z.literal("contest-run/1"),
  idempotencyKey: z.string().trim().min(1).max(200),
  date: DateSchema,
  trigger: z.enum(["schedule", "manual", "fixture"]),
  mode: z.enum(["live", "dry", "fixture"]),
  startedAt: DateTimeSchema,
  endedAt: DateTimeSchema,
  durationMs: z.number().int().min(0).max(86_400_000),
  sources: z.array(z.strictObject({
    sourceId: StableId,
    outcome: ContestSourceOutcomeSchema,
    reason: z.string().trim().min(1).max(300),
    requestCount: z.number().int().min(0).max(20),
    itemsFetched: z.number().int().min(0).max(10_000),
    itemsKept: z.number().int().min(0).max(10_000),
    malformedItems: z.number().int().min(0).max(10_000)
  })).max(80),
  candidates: z.number().int().min(0).max(100_000),
  records: z.number().int().min(0).max(100_000),
  cacheReused: z.number().int().min(0).max(100_000),
  callsAvoided: z.number().int().min(0).max(100_000),
  spend: z.strictObject({
    modelCalls: z.number().int().min(0).max(1_000),
    modelUsd: z.number().min(0).max(10),
    apifyUsd: z.number().min(0).max(10),
    reservationRef: EvidenceRefSchema.nullable(),
    actualCostRef: EvidenceRefSchema.nullable()
  }),
  outcome: ContestRunOutcomeSchema,
  reason: z.string().trim().min(1).max(400),
  /** Sanitized: a message, never a stack, a URL with a token or a page body. */
  errors: z.array(z.string().trim().min(1).max(300)).max(40),
  nextSafeAction: z.string().trim().min(1).max(300)
});

export const ContestOwnerEventSchema = z.strictObject({
  schemaVersion: z.literal("contest-owner-event/1"),
  id: StableId,
  contestId: StableId,
  recordedAt: DateTimeSchema,
  action: z.enum([
    "shortlist",
    "unshortlist",
    "hide",
    "restore",
    "entered",
    "note",
    "result",
    "correction"
  ]),
  result: z.enum(["won", "lost", "pending", "claimed", "unclaimed"]).nullable(),
  note: z.string().trim().max(1_000).nullable(),
  actualMinutes: z.number().int().min(0).max(10_000).nullable(),
  realizedValue: z.strictObject({
    amount: z.number().min(0).max(100_000_000),
    currency: z.enum(["CZK", "EUR", "USD"])
  }).nullable(),
  /** A correction supersedes an earlier event; nothing is ever edited in place. */
  supersedesEventId: StableId.nullable()
}).superRefine((event, context) => {
  if (event.action === "result" && event.result === null) {
    context.addIssue({ code: "custom", message: "A result event must say what the result was", path: ["result"] });
  }
  if (event.action === "correction" && event.supersedesEventId === null) {
    context.addIssue({ code: "custom", message: "A correction must name the event it supersedes", path: ["supersedesEventId"] });
  }
  if (event.action !== "correction" && event.supersedesEventId !== null) {
    context.addIssue({ code: "custom", message: "Only a correction supersedes an earlier event", path: ["supersedesEventId"] });
  }
});

export type ContestSource = z.infer<typeof ContestSourceSchema>;
export type ContestCandidate = z.infer<typeof ContestCandidateSchema>;
export type ContestRecord = z.infer<typeof ContestRecordSchema>;
export type ContestRun = z.infer<typeof ContestRunSchema>;
export type ContestOwnerEvent = z.infer<typeof ContestOwnerEventSchema>;
export type ContestTrack = z.infer<typeof ContestTrackSchema>;
export type ContestKind = z.infer<typeof ContestKindSchema>;

/**
 * A social lead as GoVIRAL would hand it over, bounded to what a lead may carry.
 *
 * The optional Instagram and TikTok pilot is held, and this contract exists so that the shape is
 * settled before any of it runs rather than invented under time pressure afterwards. Everything
 * about it is a ceiling: a URL, a clipped caption, a platform and when it was seen.
 *
 * What it deliberately cannot carry is the reason the pilot is safe to consider at all — no
 * handle, no author, no follower count, no audience identity, no comment, no DM, no media bytes.
 * A lead points at a page that might be a contest. Everything that makes it a contest comes from
 * that page's own rules, read afterwards.
 */
export const SocialContestLeadSchema = z.strictObject({
  schemaVersion: z.literal("social-contest-lead/1"),
  /** GoVIRAL owns collection; this names the run its evidence came from. */
  collectionRef: EvidenceRefSchema,
  platform: z.enum(["instagram", "tiktok"]),
  url: HttpsUrlSchema,
  /** Untrusted text, clipped. Never an instruction and never a fact. */
  caption: z.string().trim().max(280),
  observedAt: DateTimeSchema,
  /** When this lead stops being worth looking at, so nothing accumulates silently. */
  expiresAt: DateTimeSchema,
  language: z.enum(["cs", "sk", "en"]).nullable()
});

export type SocialContestLead = z.infer<typeof SocialContestLeadSchema>;
