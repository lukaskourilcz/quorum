import { z } from "zod";
import { DateSchema, HttpsUrlSchema, openObject } from "./common.js";

/**
 * `boardless-events/1` — conferences and meetups the magazine renders at /akce.
 *
 * The owner maintains these by hand in the admin; nothing fetches them. Titles
 * and descriptions are Czech because they are written rather than quoted, which
 * is what separates them from a stream item's title.
 */
export const EVENT_SCOPES = ["cz", "global"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export const MagazineEventSchema = openObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/u, "expected a lowercase slug"),
  scope: z.enum(EVENT_SCOPES),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(280).nullable().optional(),
  starts: DateSchema,
  ends: DateSchema.nullable().optional(),
  city: z.string().trim().min(1).max(80).nullable().optional(),
  venue: z.string().trim().min(1).max(120).nullable().optional(),
  online: z.boolean(),
  url: HttpsUrlSchema,
  price: z.string().trim().min(1).max(80).nullable().optional(),
  organizer: z.string().trim().min(1).max(120).nullable().optional(),
  added: DateSchema.optional(),
}).refine((event) => !event.ends || event.ends >= event.starts, {
  message: "ends must not precede starts",
  path: ["ends"],
});

export const BoardlessEventsSchema = openObject({
  schemaVersion: z.literal("boardless-events/1"),
  updated: DateSchema,
  events: z.array(MagazineEventSchema),
}).refine(
  (file) => new Set(file.events.map((event) => event.id)).size === file.events.length,
  { message: "event ids must be unique", path: ["events"] },
);

export type MagazineEvent = z.infer<typeof MagazineEventSchema>;
export type BoardlessEvents = z.infer<typeof BoardlessEventsSchema>;
