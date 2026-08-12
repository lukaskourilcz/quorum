import { z } from "zod";
import { DateSchema, DateTimeSchema, MeetingRefSchema } from "./common.js";

const PriorValueSchema = z.strictObject({
  czechRelevance: z.number().min(0).max(100),
  internationalRelevance: z.number().min(0).max(100),
  recognition: z.number().min(0).max(100),
  significance: z.number().min(0).max(100),
  storytellingPotential: z.number().min(0).max(100),
  audienceFamiliarity: z.number().min(0).max(100)
});

const PriorWeightsSchema = z.strictObject({
  czechRelevance: z.number().min(0).max(1),
  internationalRelevance: z.number().min(0).max(1),
  recognition: z.number().min(0).max(1),
  significance: z.number().min(0).max(1),
  storytellingPotential: z.number().min(0).max(1),
  audienceFamiliarity: z.number().min(0).max(1)
});

export const BhOpportunityFactorsSchema = z.strictObject({
  priors: z.strictObject({
    score: z.number().min(0).max(100),
    weights: PriorWeightsSchema,
    values: PriorValueSchema
  }),
  anniversary: z.strictObject({
    multiplier: z.number().min(1).max(1.25),
    strength: z.number().min(0).max(1),
    events: z.array(z.strictObject({
      kind: z.enum(["publication", "author-born", "author-died"]),
      milestone: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100), z.literal(150)]),
      daysAway: z.number().int().min(0).max(60).nullable()
    })).max(6)
  }),
  trendCrossover: z.strictObject({
    multiplier: z.number().min(1).max(1.2),
    strength: z.number().min(0).max(1),
    matchedSignalIds: z.array(z.string().min(1).max(120)).max(20)
  }),
  diversityPressure: z.strictObject({
    multiplier: z.number().min(0.65).max(1),
    pressure: z.number().min(0).max(1),
    byDimension: z.strictObject({
      genres: z.number().min(0).max(1),
      geographies: z.number().min(0).max(1),
      period: z.number().min(0).max(1),
      angleTypes: z.number().min(0).max(1)
    })
  }),
  lanePerformance: z.strictObject({
    multiplier: z.number().min(0.75).max(1.25),
    lanes: z.strictObject({
      cs: z.number().min(0.75).max(1.25),
      en: z.number().min(0.75).max(1.25)
    })
  }),
  shelfBonus: z.strictObject({
    multiplier: z.union([z.literal(1), z.literal(1.6)]),
    eligibleStoryIds: z.array(z.string().min(1).max(120)).max(30),
    highestScore: z.number().min(70).max(100).nullable()
  })
});

export const BhShortlistEntrySchema = z.strictObject({
  rank: z.number().int().min(1).max(10),
  bookId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  bookRef: MeetingRefSchema,
  title: z.string().trim().min(1).max(240),
  author: z.string().trim().min(1).max(160),
  totalScore: z.number().min(0).max(400),
  culturalMoment: z.boolean(),
  factors: BhOpportunityFactorsSchema
});

export const BhShortlistSchema = z.strictObject({
  schemaVersion: z.literal("bh-shortlist/1"),
  date: DateSchema,
  cycleId: z.string().min(1).max(120),
  asOf: DateTimeSchema,
  seedRef: MeetingRefSchema,
  contextRefs: z.strictObject({
    trendPlan: MeetingRefSchema.nullable(),
    recentFeatures: z.array(MeetingRefSchema).max(30),
    lanePerformance: z.array(MeetingRefSchema).max(30),
    shelfDossiers: z.array(MeetingRefSchema).max(30)
  }),
  entries: z.array(BhShortlistEntrySchema).min(1).max(10),
  recordedAt: DateTimeSchema
}).superRefine((shortlist, context) => {
  const ids = shortlist.entries.map(({ bookId }) => bookId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Shortlist book ids must be unique", path: ["entries"] });
  }
  shortlist.entries.forEach((entry, index) => {
    if (entry.rank !== index + 1) {
      context.addIssue({ code: "custom", message: "Shortlist ranks must be sequential", path: ["entries", index, "rank"] });
    }
    const previous = shortlist.entries[index - 1];
    if (previous && entry.totalScore > previous.totalScore) {
      context.addIssue({ code: "custom", message: "Shortlist scores must descend", path: ["entries", index, "totalScore"] });
    }
    if (entry.factors.shelfBonus.eligibleStoryIds.length === 0 !== (entry.factors.shelfBonus.highestScore === null)) {
      context.addIssue({ code: "custom", message: "Shelf score exists exactly when an eligible story exists", path: ["entries", index, "factors", "shelfBonus"] });
    }
  });
});

export type BhShortlist = z.infer<typeof BhShortlistSchema>;
