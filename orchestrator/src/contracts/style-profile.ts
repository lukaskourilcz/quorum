import { z } from "zod";
import { BookChunkIdSchema } from "./book-kb-index.js";

const HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const RatioSchema = z.number().finite().min(0).max(1);
const CountSchema = z.number().int().nonnegative();
const ShortNoteSchema = z.string().trim().min(1).max(280);
const OneLineNoteSchema = ShortNoteSchema.refine(
  (value) => !/[\r\n]/u.test(value),
  "Style notes must stay on one line"
);

const RhythmStatsSchema = z.strictObject({
  sampledSentences: z.number().int().positive(),
  meanWordsPerSentence: z.number().finite().positive(),
  p10WordsPerSentence: z.number().finite().positive(),
  medianWordsPerSentence: z.number().finite().positive(),
  p90WordsPerSentence: z.number().finite().positive(),
  fragmentRatio: RatioSchema,
  oneSentenceParagraphRatio: RatioSchema,
  notes: z.array(OneLineNoteSchema).max(20)
}).superRefine((rhythm, context) => {
  if (rhythm.p10WordsPerSentence > rhythm.medianWordsPerSentence ||
      rhythm.medianWordsPerSentence > rhythm.p90WordsPerSentence) {
    context.addIssue({
      code: "custom",
      path: ["medianWordsPerSentence"],
      message: "Sentence-length percentiles must be ordered p10 <= median <= p90"
    });
  }
});

const VocabularyItemSchema = z.strictObject({
  value: z.string().trim().min(1).max(80),
  occurrences: CountSchema,
  note: OneLineNoteSchema
});

const ProfanityRegisterSchema = z.strictObject({
  level: z.enum(["none", "rare", "moderate", "frequent"]),
  terms: z.array(z.strictObject({
    value: z.string().trim().min(1).max(40),
    occurrences: z.number().int().positive(),
    usage: OneLineNoteSchema
  })).max(40),
  note: OneLineNoteSchema
}).superRefine((register, context) => {
  if ((register.level === "none") !== (register.terms.length === 0)) {
    context.addIssue({
      code: "custom",
      path: ["terms"],
      message: "A none register has no terms; any observed term requires an honest non-none level"
    });
  }
});

const MechanicSchema = z.strictObject({
  name: SlugSchema,
  description: OneLineNoteSchema,
  signals: z.array(z.string().trim().min(1).max(80)).max(12)
});

const PatternSchema = z.strictObject({
  name: SlugSchema,
  description: OneLineNoteSchema
});

const TenseUsageSchema = z.strictObject({
  tense: z.enum(["past", "present", "future", "mixed"]),
  ratio: RatioSchema,
  note: OneLineNoteSchema
});

const FormatAdaptationSchema = z.strictObject({
  format: SlugSchema,
  preserve: z.array(OneLineNoteSchema).min(1).max(12),
  adapt: z.array(OneLineNoteSchema).max(12),
  avoid: z.array(OneLineNoteSchema).max(12)
});

export const StyleExemplarSchema = z.strictObject({
  id: SlugSchema,
  chunkId: BookChunkIdSchema,
  /** Exact source excerpt. The public-repository founding ceiling is 280 characters. */
  text: z.string().min(1).max(280),
  /** Pointer to a vector in the private store; vectors never enter this contract. */
  embeddingId: SlugSchema,
  formats: z.array(SlugSchema).min(1).max(12),
  tags: z.array(SlugSchema).max(16)
});

export const StyleProfileSchema = z.strictObject({
  schemaVersion: z.literal("style-profile/1"),
  ventureId: z.literal("door-money"),
  profileVersion: z.number().int().positive(),
  manuscriptHash: HashSchema,
  fingerprintHash: HashSchema,
  modelVersions: z.strictObject({
    chapterMap: z.string().trim().min(1).max(120),
    synthesis: z.string().trim().min(1).max(120),
    embedding: z.string().trim().min(1).max(120)
  }),
  chapterNoteCount: z.number().int().positive(),
  sentenceRhythm: RhythmStatsSchema,
  vocabularySignature: z.strictObject({
    recurringWords: z.array(VocabularyItemSchema).max(100),
    recurringPhrases: z.array(VocabularyItemSchema).max(100),
    profanityRegister: ProfanityRegisterSchema
  }),
  humorMechanics: z.array(MechanicSchema).max(30),
  storytellingPatterns: z.strictObject({
    openings: z.array(PatternSchema).min(1).max(30),
    turns: z.array(PatternSchema).min(1).max(30),
    landings: z.array(PatternSchema).min(1).max(30),
    firstPersonHabits: z.array(OneLineNoteSchema).min(1).max(30),
    tenseUsage: z.array(TenseUsageSchema).min(1).max(4)
  }),
  negativeSpace: z.array(OneLineNoteSchema).min(1).max(60),
  formatAdaptations: z.array(FormatAdaptationSchema).min(1).max(30),
  exemplarBank: z.array(StyleExemplarSchema).max(40),
  generatedAt: z.string().datetime()
}).superRefine((profile, context) => {
  for (const [field, ids] of [
    ["humorMechanics", profile.humorMechanics.map(({ name }) => name)],
    ["formatAdaptations", profile.formatAdaptations.map(({ format }) => format)],
    ["exemplarBank", profile.exemplarBank.map(({ id }) => id)]
  ] as const) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", path: [field], message: `${field} identifiers must be unique` });
    }
  }

  const tenseTotal = profile.storytellingPatterns.tenseUsage.reduce((sum, item) => sum + item.ratio, 0);
  if (Math.abs(tenseTotal - 1) > 0.000_001) {
    context.addIssue({
      code: "custom",
      path: ["storytellingPatterns", "tenseUsage"],
      message: "Tense ratios must total 1"
    });
  }
});

export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type StyleExemplar = z.infer<typeof StyleExemplarSchema>;
