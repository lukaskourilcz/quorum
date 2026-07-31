import { z } from "zod";
import { DateSchema, openObject } from "./common.js";

const SeasonProductSchema = openObject({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(100),
  concept: z.string().trim().min(1).max(500),
  designDirection: z.string().trim().min(1).max(500),
  status: z.enum(["concept", "sampled", "live", "retired"])
});

export const SeasonFileSchema = openObject({
  schemaVersion: z.literal("season/1"),
  ventureId: z.literal("titty-tuesdays"),
  seasonNumber: z.number().int().positive(),
  startsOn: DateSchema,
  endsOn: DateSchema,
  theme: z.string().trim().min(1).max(160),
  products: z.tuple([
    SeasonProductSchema,
    SeasonProductSchema,
    SeasonProductSchema,
    SeasonProductSchema
  ]),
  campaignArc: z.string().trim().min(1).max(1_200),
  retroOfPrevious: z.string().trim().min(1).max(800).optional()
}).refine(({ startsOn, endsOn }) => startsOn <= endsOn, {
  message: "startsOn must be on or before endsOn",
  path: ["endsOn"]
});

export type SeasonFile = z.infer<typeof SeasonFileSchema>;
