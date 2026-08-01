import { z } from "zod";
import { DateSchema, DateTimeSchema, MeetingRefSchema, openObject } from "./common.js";

export const CalendarFeedSchema = openObject({
  schemaVersion: z.literal("calendar/1"),
  weekOf: DateSchema,
  slots: z.array(openObject({
    at: DateTimeSchema,
    tz: z.literal("Europe/Prague"),
    kind: z.enum(["venture-morning", "venture-afternoon", "venture-night", "cu-edition", "cu-product", "tt-marketing", "incubator-scan", "incubator-synthesis", "mma-intake", "mma-analysis", "mag-editorial", "mag-desk", "article-am", "article-pm"]),
    status: z.enum(["scheduled", "held", "missed"]),
    meetingRef: MeetingRefSchema.optional(),
    decisionOneLiner: z.string().trim().min(1).max(180).optional()
  }))
});

export type CalendarFeed = z.infer<typeof CalendarFeedSchema>;
