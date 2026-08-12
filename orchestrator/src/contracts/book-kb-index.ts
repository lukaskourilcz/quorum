import { z } from "zod";

export const BOOK_KB_SCORE_AXES = [
  "entertainment",
  "emotionalImpact",
  "shock",
  "humor",
  "relatability",
  "hipHopRelevance",
  "storytellingStrength",
  "controversy",
  "shareability",
  "educationalValue",
  "quotePotential",
  "carouselPotential",
  "shortVideoPotential",
  "threadPotential",
  "bookCuriosityPotential"
] as const;

const HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ChapterIdSchema = z.string().regex(/^ch\d{2,}$/);
const SceneIdSchema = z.string().regex(/^ch\d{2,}-s\d{2,}$/);
export const BookChunkIdSchema = z.string().regex(/^ch\d{2,}-s\d{2,}-c\d{3,}$/);
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const SummarySchema = z.string().trim().min(1).max(600);
const OneLineSchema = z.string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !/[\r\n]/u.test(value), "Justifications must stay on one line");
const StatePathSchema = z.string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^state\/ventures\/door-money\/[a-zA-Z0-9._/-]+$/)
  .refine((value) => !value.includes(".."), "State paths cannot traverse directories");

const ScoreSchema = z.strictObject({
  score: z.number().int().min(0).max(5),
  justification: OneLineSchema
});

export const BookPassageScoresSchema = z.strictObject({
  entertainment: ScoreSchema,
  emotionalImpact: ScoreSchema,
  shock: ScoreSchema,
  humor: ScoreSchema,
  relatability: ScoreSchema,
  hipHopRelevance: ScoreSchema,
  storytellingStrength: ScoreSchema,
  controversy: ScoreSchema,
  shareability: ScoreSchema,
  educationalValue: ScoreSchema,
  quotePotential: ScoreSchema,
  carouselPotential: ScoreSchema,
  shortVideoPotential: ScoreSchema,
  threadPotential: ScoreSchema,
  bookCuriosityPotential: ScoreSchema
});

const ByteOffsetsSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  /** Exclusive end offset in the private manuscript file. */
  end: z.number().int().positive()
}).superRefine((range, context) => {
  if (range.end <= range.start) {
    context.addIssue({
      code: "custom",
      path: ["end"],
      message: "The exclusive end offset must follow the start offset"
    });
  }
});

export const BookEntityReferenceSchema = z.strictObject({
  id: SlugSchema,
  label: z.string().trim().min(1).max(120),
  kind: z.enum(["person", "venue", "event", "organization", "other"]),
  personSensitive: z.boolean()
}).superRefine((entity, context) => {
  if (entity.kind !== "person" && entity.personSensitive) {
    context.addIssue({
      code: "custom",
      path: ["personSensitive"],
      message: "Only a person entity can carry person sensitivity"
    });
  }
});

export const BookPassageUsageSchema = z.strictObject({
  recommendationId: SlugSchema,
  recommendationPath: StatePathSchema,
  recommendedOn: z.string().date(),
  format: SlugSchema
});

export const BookKbChunkSchema = z.strictObject({
  id: BookChunkIdSchema,
  chapterId: ChapterIdSchema,
  sceneId: SceneIdSchema,
  ordinal: z.number().int().positive(),
  arc: SlugSchema.nullable(),
  byteOffsets: ByteOffsetsSchema,
  summary: SummarySchema,
  entities: z.array(BookEntityReferenceSchema).max(40),
  themes: z.array(SlugSchema).max(24),
  era: SlugSchema,
  storyType: z.enum(["win", "loss", "absurd", "lesson", "travel"]),
  /** Exact, bounded source strings; the public index never carries a passage or full chunk. */
  quotables: z.array(z.string().trim().min(1).max(200)).max(8),
  scores: BookPassageScoresSchema,
  usageHistory: z.array(BookPassageUsageSchema).max(500)
}).superRefine((chunk, context) => {
  if (!chunk.id.startsWith(`${chunk.sceneId}-`)) {
    context.addIssue({ code: "custom", path: ["id"], message: "Chunk id must belong to its scene" });
  }
  if (!chunk.sceneId.startsWith(`${chunk.chapterId}-`)) {
    context.addIssue({ code: "custom", path: ["sceneId"], message: "Scene id must belong to its chapter" });
  }
  for (const [field, values] of [
    ["entities", chunk.entities.map(({ id }) => id)],
    ["themes", chunk.themes],
    ["quotables", chunk.quotables]
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [field], message: `${field} entries must be unique within a chunk` });
    }
  }
});

const ChapterRollupSchema = z.strictObject({
  id: ChapterIdSchema,
  ordinal: z.number().int().positive(),
  summary: SummarySchema,
  chunkIds: z.array(BookChunkIdSchema).min(1)
});

const EntityRollupSchema = BookEntityReferenceSchema.safeExtend({
  chunkIds: z.array(BookChunkIdSchema).min(1)
});

const ThemeRollupSchema = z.strictObject({
  theme: SlugSchema,
  chunkIds: z.array(BookChunkIdSchema).min(1)
});

export const BookKbIndexSchema = z.strictObject({
  schemaVersion: z.literal("book-kb-index/1"),
  ventureId: z.literal("door-money"),
  ingestionId: SlugSchema,
  manuscriptHash: HashSchema,
  manuscriptBytes: z.number().int().positive(),
  modelVersions: z.strictObject({
    annotation: z.string().trim().min(1).max(120),
    rollup: z.string().trim().min(1).max(120),
    embedding: z.string().trim().min(1).max(120)
  }),
  ingestionCostUsd: z.number().finite().nonnegative(),
  chunkCount: z.number().int().positive(),
  chapters: z.array(ChapterRollupSchema).min(1),
  entityIndex: z.array(EntityRollupSchema),
  themeIndex: z.array(ThemeRollupSchema),
  chunks: z.array(BookKbChunkSchema).min(1),
  generatedAt: z.string().datetime()
}).superRefine((index, context) => {
  const chunks = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
  if (chunks.size !== index.chunks.length) {
    context.addIssue({ code: "custom", path: ["chunks"], message: "Chunk ids must be unique" });
  }
  if (index.chunkCount !== index.chunks.length) {
    context.addIssue({ code: "custom", path: ["chunkCount"], message: "Chunk count must match chunks" });
  }

  let previousEnd = 0;
  index.chunks.forEach((chunk, chunkIndex) => {
    if (chunk.byteOffsets.start < previousEnd) {
      context.addIssue({
        code: "custom",
        path: ["chunks", chunkIndex, "byteOffsets", "start"],
        message: "Primary chunk byte ranges must be ordered and non-overlapping"
      });
    }
    if (chunk.byteOffsets.end > index.manuscriptBytes) {
      context.addIssue({
        code: "custom",
        path: ["chunks", chunkIndex, "byteOffsets", "end"],
        message: "Chunk byte range exceeds the private manuscript byte count"
      });
    }
    previousEnd = chunk.byteOffsets.end;
  });

  const checkRollup = (
    path: "chapters" | "entityIndex" | "themeIndex",
    rollupIndex: number,
    chunkIds: readonly string[],
    matches: (chunk: z.infer<typeof BookKbChunkSchema>) => boolean
  ): void => {
    if (new Set(chunkIds).size !== chunkIds.length) {
      context.addIssue({ code: "custom", path: [path, rollupIndex, "chunkIds"], message: "Rollup chunk ids must be unique" });
    }
    for (const chunkId of chunkIds) {
      const chunk = chunks.get(chunkId);
      if (!chunk || !matches(chunk)) {
        context.addIssue({
          code: "custom",
          path: [path, rollupIndex, "chunkIds"],
          message: `Rollup contains an unknown or inconsistent chunk id: ${chunkId}`
        });
      }
    }
  };

  const chapterIds = new Set<string>();
  index.chapters.forEach((chapter, chapterIndex) => {
    if (chapterIds.has(chapter.id)) {
      context.addIssue({ code: "custom", path: ["chapters", chapterIndex, "id"], message: `Duplicate chapter ${chapter.id}` });
    }
    chapterIds.add(chapter.id);
    checkRollup("chapters", chapterIndex, chapter.chunkIds, (chunk) => chunk.chapterId === chapter.id);
  });
  index.chunks.forEach((chunk, chunkIndex) => {
    if (!chapterIds.has(chunk.chapterId)) {
      context.addIssue({ code: "custom", path: ["chunks", chunkIndex, "chapterId"], message: "Chunk chapter has no rollup" });
    }
  });

  const entityIds = new Set<string>();
  index.entityIndex.forEach((entity, entityIndex) => {
    if (entityIds.has(entity.id)) {
      context.addIssue({ code: "custom", path: ["entityIndex", entityIndex, "id"], message: `Duplicate entity ${entity.id}` });
    }
    entityIds.add(entity.id);
    checkRollup("entityIndex", entityIndex, entity.chunkIds, (chunk) =>
      chunk.entities.some((candidate) => candidate.id === entity.id && candidate.label === entity.label &&
        candidate.kind === entity.kind && candidate.personSensitive === entity.personSensitive));
  });

  const themes = new Set<string>();
  index.themeIndex.forEach((theme, themeIndex) => {
    if (themes.has(theme.theme)) {
      context.addIssue({ code: "custom", path: ["themeIndex", themeIndex, "theme"], message: `Duplicate theme ${theme.theme}` });
    }
    themes.add(theme.theme);
    checkRollup("themeIndex", themeIndex, theme.chunkIds, (chunk) => chunk.themes.includes(theme.theme));
  });
});

export type BookKbIndex = z.infer<typeof BookKbIndexSchema>;
export type BookKbChunk = z.infer<typeof BookKbChunkSchema>;
