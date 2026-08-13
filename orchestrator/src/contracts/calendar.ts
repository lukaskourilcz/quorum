import { z } from "zod";
import { DateSchema, DateTimeSchema, MeetingRefSchema, openObject } from "./common.js";

export const CalendarFeedSchema = openObject({
  schemaVersion: z.literal("calendar/1"),
  weekOf: DateSchema,
  slots: z.array(openObject({
    at: DateTimeSchema,
    tz: z.literal("Europe/Prague"),
    kind: z.enum(["venture-morning", "venture-afternoon", "venture-night", "cu-edition", "cu-product", "tt-marketing", "gv-brief", "ms-daily", "bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk", "incubator-scan", "incubator-synthesis", "mma-intake", "mma-analysis", "mag-editorial", "mag-desk", "article-am", "article-pm", "studio"]),
    // "late" is the window between a slot's Prague instant and the moment its run can no longer
    // be delivered. It is not "missed": until that window closes the meeting can still happen,
    // and on 4 August every one of the day's runs arrived inside it.
    status: z.enum(["scheduled", "held", "late", "missed", "not-needed", "skipped"]),
    meetingRef: MeetingRefSchema.optional(),
    decisionOneLiner: z.string().trim().min(1).max(180).optional()
  }))
});

export type CalendarFeed = z.infer<typeof CalendarFeedSchema>;
