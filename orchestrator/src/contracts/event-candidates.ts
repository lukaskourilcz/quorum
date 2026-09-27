import { z } from "zod";
import { DateSchema, HttpsUrlSchema, openObject } from "./common.js";

/**
 * `event-candidates/1` — suggestions for the DNESKAi Akce store, never records.
 *
 * Deliberately not `boardless-events/1`. That contract is the reader envelope
 * the owner writes by hand and a past entry in it is immutable. This file is
 * the opposite: it is rewritten on every run, it is advisory, and nothing that
 * reads it may write an event. Sharing a contract between the two would put a
 * fetched title one save away from looking like a record the owner made.
 *
 * `sources` is the receipt. A source that failed keeps its line here with the
 * reason, because "we asked and got nothing" and "we never asked" have to stay
 * distinguishable in the admin.
 */
export const EVENT_CANDIDATE_SOURCE_KINDS = ["events-calendar", "confs-tech"] as const;
export type EventCandidateSourceKind = (typeof EVENT_CANDIDATE_SOURCE_KINDS)[number];

export const EventCandidateSchema = openObject({
  /** Stable across runs: sha1 of the source id and the candidate's own link. */
  id: z.string().regex(/^[0-9a-f]{40}$/u, "expected a sha1 hex digest"),
  source: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/u),
  sourceName: z.string().trim().min(1).max(80),
  /** What the owner would pick in the form; Czech listings default to `cz`. */
  scope: z.enum(["cz", "global"]),
  /** The slug the form suggests. The owner may keep or replace it. */
  suggestedId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/u),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(280).optional(),
  starts: DateSchema,
  ends: DateSchema.optional(),
  city: z.string().trim().min(1).max(80).optional(),
  venue: z.string().trim().min(1).max(120).optional(),
  online: z.boolean(),
  /** The event's own page where the listing gives one, else the listing entry. */
  url: HttpsUrlSchema,
  /** Where the candidate was found, when that is not `url` itself. */
  listingUrl: HttpsUrlSchema.optional(),
  price: z.string().trim().min(1).max(80).optional(),
  organizer: z.string().trim().min(1).max(120).optional(),
}).refine((candidate) => !candidate.ends || candidate.ends >= candidate.starts, {
  message: "ends must not precede starts",
  path: ["ends"],
});

export const EventCandidateSourceResultSchema = openObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/u),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(EVENT_CANDIDATE_SOURCE_KINDS),
  host: z.string().trim().min(1).max(120),
  /** Entries the source returned, before any filter. */
  read: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  /** Unparseable, out of window, off topic or over the source's cap. */
  dropped: z.number().int().nonnegative(),
  /** Already in the events store, so not offered again. */
  known: z.number().int().nonnegative(),
  error: z.string().trim().min(1).max(200).optional(),
});

export const EventCandidateFileSchema = openObject({
  schemaVersion: z.literal("event-candidates/1"),
  date: DateSchema,
  /** Candidates starting inside this many days of `date`. */
  windowDays: z.number().int().positive().max(730),
  candidates: z.array(EventCandidateSchema).max(200),
  sources: z.array(EventCandidateSourceResultSchema),
}).refine(
  (file) => new Set(file.candidates.map((candidate) => candidate.id)).size === file.candidates.length,
  { message: "candidate ids must be unique", path: ["candidates"] },
);

export type EventCandidate = z.infer<typeof EventCandidateSchema>;

/**
 * The fields a collector fills in before `id` and `suggestedId` are derived.
 *
 * Spelled with `Pick` rather than `Omit`: `openObject` is `z.looseObject`, so
 * the inferred type carries a string index signature. `keyof` over that is
 * `string | number`, which makes `Omit` subtract nothing and collapse every
 * named field to `unknown`. `Pick` maps the literal keys instead, and a
 * declared property still wins over the index signature.
 */
export type EventCandidateDraft = Pick<
  EventCandidate,
  | "source"
  | "sourceName"
  | "scope"
  | "title"
  | "description"
  | "starts"
  | "ends"
  | "city"
  | "venue"
  | "online"
  | "url"
  | "listingUrl"
  | "price"
  | "organizer"
>;
export type EventCandidateSourceResult = z.infer<typeof EventCandidateSourceResultSchema>;
export type EventCandidateFile = z.infer<typeof EventCandidateFileSchema>;
