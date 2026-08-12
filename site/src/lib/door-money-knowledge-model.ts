import {
  DOOR_MONEY_SCORE_AXES,
  boundedText,
  hasOnlyKeys,
  isDateTime,
  isRecord,
  type DoorMoneyScore
} from "./door-money-recommendation-model";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CHAPTER = /^ch\d{2,}$/u;
const SCENE = /^ch\d{2,}-s\d{2,}$/u;
const CHUNK = /^ch\d{2,}-s\d{2,}-c\d{3,}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

export interface AdminDoorMoneyChapter {
  id: string;
  ordinal: number;
  summary: string;
  chunkIds: string[];
}

export interface AdminDoorMoneyUsage {
  recommendationId: string;
  recommendedOn: string;
  format: string;
}

export interface AdminDoorMoneyChunk {
  id: string;
  chapterId: string;
  sceneId: string;
  ordinal: number;
  arc: string | null;
  summary: string;
  entities: Array<{ id: string; label: string; kind: "person" | "venue" | "event" | "organization" | "other"; personSensitive: boolean }>;
  themes: string[];
  era: string;
  storyType: "win" | "loss" | "absurd" | "lesson" | "travel";
  quotables: string[];
  scores: Record<(typeof DOOR_MONEY_SCORE_AXES)[number], DoorMoneyScore>;
  usageHistory: AdminDoorMoneyUsage[];
}

export interface AdminDoorMoneyKnowledgeIndex {
  manuscriptHash: string;
  ingestionId: string;
  modelVersions: { annotation: string; rollup: string; embedding: string };
  ingestionCostUsd: number;
  chunkCount: number;
  chapters: AdminDoorMoneyChapter[];
  chunks: AdminDoorMoneyChunk[];
  generatedAt: string;
}

export interface AdminDoorMoneyStyleProfile {
  profileVersion: number;
  manuscriptHash: string;
  fingerprintHash: string;
  modelVersions: { chapterMap: string; synthesis: string; embedding: string };
  chapterNoteCount: number;
  sentenceRhythm: {
    sampledSentences: number;
    meanWordsPerSentence: number;
    p10WordsPerSentence: number;
    medianWordsPerSentence: number;
    p90WordsPerSentence: number;
    fragmentRatio: number;
    oneSentenceParagraphRatio: number;
    notes: string[];
  };
  vocabulary: {
    recurringWords: Array<{ value: string; occurrences: number; note: string }>;
    recurringPhrases: Array<{ value: string; occurrences: number; note: string }>;
    profanity: { level: "none" | "rare" | "moderate" | "frequent"; terms: Array<{ value: string; occurrences: number; usage: string }>; note: string };
  };
  humorMechanics: Array<{ name: string; description: string; signals: string[] }>;
  storytelling: {
    openings: Array<{ name: string; description: string }>;
    turns: Array<{ name: string; description: string }>;
    landings: Array<{ name: string; description: string }>;
    firstPersonHabits: string[];
    tenseUsage: Array<{ tense: "past" | "present" | "future" | "mixed"; ratio: number; note: string }>;
  };
  negativeSpace: string[];
  formatAdaptations: Array<{ format: string; preserve: string[]; adapt: string[]; avoid: string[] }>;
  exemplars: Array<{ id: string; chunkId: string; text: string; formats: string[]; tags: string[] }>;
  generatedAt: string;
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isInteger(value) && (value as number) >= minimum;
}

function finite(value: unknown, minimum = 0, maximum = Number.POSITIVE_INFINITY): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function stringArray(value: unknown, maxItems: number, maxLength: number, minimum = 0): string[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maxItems ||
      value.some((item) => !boundedText(item, maxLength))) return null;
  return value.map((item) => (item as string).trim());
}

function modelVersions(value: unknown, keys: readonly string[]): Record<string, string> | null {
  if (!isRecord(value) || !hasOnlyKeys(value, keys) || keys.some((key) => !boundedText(value[key], 120))) return null;
  return Object.fromEntries(keys.map((key) => [key, (value[key] as string).trim()]));
}

function scores(value: unknown): AdminDoorMoneyChunk["scores"] | null {
  if (!isRecord(value) || !hasOnlyKeys(value, DOOR_MONEY_SCORE_AXES)) return null;
  const entries: Array<[typeof DOOR_MONEY_SCORE_AXES[number], DoorMoneyScore]> = [];
  for (const axis of DOOR_MONEY_SCORE_AXES) {
    const score = value[axis];
    if (!isRecord(score) || !hasOnlyKeys(score, ["score", "justification"]) ||
        !integer(score.score) || (score.score as number) > 5 || !boundedText(score.justification, 240)) return null;
    entries.push([axis, { score: score.score as number, justification: score.justification.trim() }]);
  }
  return Object.fromEntries(entries) as AdminDoorMoneyChunk["scores"];
}

function chapter(value: unknown): AdminDoorMoneyChapter | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "ordinal", "summary", "chunkIds"]) ||
      typeof value.id !== "string" || !CHAPTER.test(value.id) || !integer(value.ordinal, 1) || !boundedText(value.summary, 600)) return null;
  const chunkIds = stringArray(value.chunkIds, 10_000, 40, 1);
  if (!chunkIds || chunkIds.some((id) => !CHUNK.test(id)) || new Set(chunkIds).size !== chunkIds.length) return null;
  return { id: value.id, ordinal: value.ordinal as number, summary: value.summary.trim(), chunkIds };
}

function entity(value: unknown): AdminDoorMoneyChunk["entities"][number] | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "label", "kind", "personSensitive"]) ||
      !boundedText(value.id, 100) || !SLUG.test(value.id) || !boundedText(value.label, 120) ||
      !["person", "venue", "event", "organization", "other"].includes(String(value.kind)) ||
      typeof value.personSensitive !== "boolean" || (value.kind !== "person" && value.personSensitive)) return null;
  return { id: value.id, label: value.label.trim(), kind: value.kind as AdminDoorMoneyChunk["entities"][number]["kind"], personSensitive: value.personSensitive };
}

function chunk(value: unknown): AdminDoorMoneyChunk | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "id", "chapterId", "sceneId", "ordinal", "arc", "byteOffsets", "summary", "entities", "themes",
    "era", "storyType", "quotables", "scores", "usageHistory"
  ]) || typeof value.id !== "string" || !CHUNK.test(value.id) || typeof value.chapterId !== "string" ||
      !CHAPTER.test(value.chapterId) || typeof value.sceneId !== "string" || !SCENE.test(value.sceneId) ||
      !value.id.startsWith(`${value.sceneId}-`) || !value.sceneId.startsWith(`${value.chapterId}-`) ||
      !integer(value.ordinal, 1) || !(value.arc === null || (boundedText(value.arc, 100) && SLUG.test(value.arc))) ||
      !isRecord(value.byteOffsets) || !hasOnlyKeys(value.byteOffsets, ["start", "end"]) ||
      !integer(value.byteOffsets.start) || !integer(value.byteOffsets.end, 1) ||
      (value.byteOffsets.end as number) <= (value.byteOffsets.start as number) || !boundedText(value.summary, 600)) return null;
  if (!Array.isArray(value.entities) || value.entities.length > 40) return null;
  const entities = value.entities.map(entity);
  const themes = stringArray(value.themes, 24, 100);
  const quotables = stringArray(value.quotables, 8, 200);
  const parsedScores = scores(value.scores);
  if (entities.some((item) => item === null) || !themes || themes.some((item) => !SLUG.test(item)) || !quotables || !parsedScores ||
      !boundedText(value.era, 100) || !SLUG.test(value.era) || !["win", "loss", "absurd", "lesson", "travel"].includes(String(value.storyType)) ||
      !Array.isArray(value.usageHistory) || value.usageHistory.length > 500) return null;
  const usageHistory: AdminDoorMoneyUsage[] = [];
  for (const usage of value.usageHistory) {
    if (!isRecord(usage) || !hasOnlyKeys(usage, ["recommendationId", "recommendationPath", "recommendedOn", "format"]) ||
        !boundedText(usage.recommendationId, 100) || !SLUG.test(usage.recommendationId) ||
        !boundedText(usage.recommendationPath, 300) || !/^state\/ventures\/door-money\//u.test(usage.recommendationPath) ||
        usage.recommendationPath.includes("..") || typeof usage.recommendedOn !== "string" || !DATE.test(usage.recommendedOn) ||
        !boundedText(usage.format, 100) || !SLUG.test(usage.format)) return null;
    usageHistory.push({ recommendationId: usage.recommendationId, recommendedOn: usage.recommendedOn, format: usage.format });
  }
  const entityIds = (entities as AdminDoorMoneyChunk["entities"]).map(({ id }) => id);
  if (new Set(entityIds).size !== entityIds.length || new Set(themes).size !== themes.length ||
      new Set(quotables).size !== quotables.length) return null;
  return {
    id: value.id, chapterId: value.chapterId, sceneId: value.sceneId, ordinal: value.ordinal as number,
    arc: value.arc as string | null, summary: value.summary.trim(), entities: entities as AdminDoorMoneyChunk["entities"],
    themes, era: value.era, storyType: value.storyType as AdminDoorMoneyChunk["storyType"], quotables,
    scores: parsedScores, usageHistory
  };
}

/** Strictly validate the public derivative and omit byte ranges, indexes and repository paths. */
export function parseDoorMoneyKnowledgeIndex(value: unknown): AdminDoorMoneyKnowledgeIndex | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "schemaVersion", "ventureId", "ingestionId", "manuscriptHash", "manuscriptBytes", "modelVersions",
    "ingestionCostUsd", "chunkCount", "chapters", "entityIndex", "themeIndex", "chunks", "generatedAt"
  ]) || value.schemaVersion !== "book-kb-index/1" || value.ventureId !== "door-money" ||
      !boundedText(value.ingestionId, 100) || !SLUG.test(value.ingestionId) || typeof value.manuscriptHash !== "string" ||
      !HASH.test(value.manuscriptHash) || !integer(value.manuscriptBytes, 1) || !finite(value.ingestionCostUsd) ||
      !integer(value.chunkCount, 1) || !Array.isArray(value.chapters) || value.chapters.length < 1 ||
      !Array.isArray(value.chunks) || value.chunks.length < 1 || !Array.isArray(value.entityIndex) ||
      !Array.isArray(value.themeIndex) || !isDateTime(value.generatedAt)) return null;
  const versions = modelVersions(value.modelVersions, ["annotation", "rollup", "embedding"]);
  const chapters = value.chapters.map(chapter);
  const chunks = value.chunks.map(chunk);
  if (!versions || chapters.some((item) => item === null) || chunks.some((item) => item === null) ||
      value.chunkCount !== chunks.length || new Set(chunks.map((item) => item!.id)).size !== chunks.length ||
      new Set(chapters.map((item) => item!.id)).size !== chapters.length) return null;
  const chapterIds = new Set(chapters.map((item) => item!.id));
  if (chunks.some((item) => !chapterIds.has(item!.chapterId))) return null;

  let previousEnd = 0;
  for (const rawChunk of value.chunks) {
    if (!isRecord(rawChunk) || !isRecord(rawChunk.byteOffsets) ||
        (rawChunk.byteOffsets.start as number) < previousEnd ||
        (rawChunk.byteOffsets.end as number) > (value.manuscriptBytes as number)) return null;
    previousEnd = rawChunk.byteOffsets.end as number;
  }
  const parsedChunks = chunks as AdminDoorMoneyChunk[];
  const byChunkId = new Map(parsedChunks.map((item) => [item.id, item]));
  for (const item of chapters as AdminDoorMoneyChapter[]) {
    if (item.chunkIds.some((id) => byChunkId.get(id)?.chapterId !== item.id)) return null;
  }
  const entityIds = new Set<string>();
  for (const item of value.entityIndex) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["id", "label", "kind", "personSensitive", "chunkIds"]) ||
        !boundedText(item.id, 100) || !SLUG.test(item.id) || entityIds.has(item.id) || !boundedText(item.label, 120) ||
        !["person", "venue", "event", "organization", "other"].includes(String(item.kind)) ||
        typeof item.personSensitive !== "boolean" || (item.kind !== "person" && item.personSensitive)) return null;
    const chunkIds = stringArray(item.chunkIds, 10_000, 40, 1);
    if (!chunkIds || new Set(chunkIds).size !== chunkIds.length || chunkIds.some((id) => {
      const candidate = byChunkId.get(id);
      return !candidate?.entities.some((entity) => entity.id === item.id && entity.label === item.label &&
        entity.kind === item.kind && entity.personSensitive === item.personSensitive);
    })) return null;
    entityIds.add(item.id);
  }
  const themes = new Set<string>();
  for (const item of value.themeIndex) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["theme", "chunkIds"]) || !boundedText(item.theme, 100) ||
        !SLUG.test(item.theme) || themes.has(item.theme)) return null;
    const chunkIds = stringArray(item.chunkIds, 10_000, 40, 1);
    if (!chunkIds || new Set(chunkIds).size !== chunkIds.length ||
        chunkIds.some((id) => !byChunkId.get(id)?.themes.includes(item.theme as string))) return null;
    themes.add(item.theme);
  }
  return {
    manuscriptHash: value.manuscriptHash, ingestionId: value.ingestionId,
    modelVersions: versions as AdminDoorMoneyKnowledgeIndex["modelVersions"], ingestionCostUsd: value.ingestionCostUsd,
    chunkCount: value.chunkCount, chapters: chapters as AdminDoorMoneyChapter[], chunks: chunks as AdminDoorMoneyChunk[],
    generatedAt: value.generatedAt
  };
}

function namedNotes(value: unknown, minimum = 0): Array<{ name: string; description: string }> | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > 30) return null;
  const out: Array<{ name: string; description: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["name", "description"]) || !boundedText(item.name, 100) ||
        !SLUG.test(item.name) || !boundedText(item.description, 280)) return null;
    out.push({ name: item.name, description: item.description.trim() });
  }
  return out;
}

function vocabularyItems(value: unknown): Array<{ value: string; occurrences: number; note: string }> | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const out: Array<{ value: string; occurrences: number; note: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["value", "occurrences", "note"]) || !boundedText(item.value, 80) ||
        !integer(item.occurrences) || !boundedText(item.note, 280)) return null;
    out.push({ value: item.value.trim(), occurrences: item.occurrences as number, note: item.note.trim() });
  }
  return out;
}

/** Parse the voice derivative while removing every private embedding pointer. */
export function parseDoorMoneyStyleProfile(value: unknown): AdminDoorMoneyStyleProfile | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "schemaVersion", "ventureId", "profileVersion", "manuscriptHash", "fingerprintHash", "modelVersions",
    "chapterNoteCount", "sentenceRhythm", "vocabularySignature", "humorMechanics", "storytellingPatterns",
    "negativeSpace", "formatAdaptations", "exemplarBank", "generatedAt"
  ]) || value.schemaVersion !== "style-profile/1" || value.ventureId !== "door-money" ||
      !integer(value.profileVersion, 1) || typeof value.manuscriptHash !== "string" || !HASH.test(value.manuscriptHash) ||
      typeof value.fingerprintHash !== "string" || !HASH.test(value.fingerprintHash) || !integer(value.chapterNoteCount, 1) ||
      !isDateTime(value.generatedAt)) return null;
  const versions = modelVersions(value.modelVersions, ["chapterMap", "synthesis", "embedding"]);
  const rhythm = value.sentenceRhythm;
  if (!versions || !isRecord(rhythm) || !hasOnlyKeys(rhythm, [
    "sampledSentences", "meanWordsPerSentence", "p10WordsPerSentence", "medianWordsPerSentence",
    "p90WordsPerSentence", "fragmentRatio", "oneSentenceParagraphRatio", "notes"
  ]) || !integer(rhythm.sampledSentences, 1) || !finite(rhythm.meanWordsPerSentence, Number.MIN_VALUE) ||
      !finite(rhythm.p10WordsPerSentence, Number.MIN_VALUE) || !finite(rhythm.medianWordsPerSentence, Number.MIN_VALUE) ||
      !finite(rhythm.p90WordsPerSentence, Number.MIN_VALUE) || !finite(rhythm.fragmentRatio, 0, 1) ||
      !finite(rhythm.oneSentenceParagraphRatio, 0, 1) ||
      (rhythm.p10WordsPerSentence as number) > (rhythm.medianWordsPerSentence as number) ||
      (rhythm.medianWordsPerSentence as number) > (rhythm.p90WordsPerSentence as number)) return null;
  const rhythmNotes = stringArray(rhythm.notes, 20, 280);
  const vocabulary = value.vocabularySignature;
  if (!rhythmNotes || !isRecord(vocabulary) || !hasOnlyKeys(vocabulary, ["recurringWords", "recurringPhrases", "profanityRegister"])) return null;
  const recurringWords = vocabularyItems(vocabulary.recurringWords);
  const recurringPhrases = vocabularyItems(vocabulary.recurringPhrases);
  const profanity = vocabulary.profanityRegister;
  if (!recurringWords || !recurringPhrases || !isRecord(profanity) || !hasOnlyKeys(profanity, ["level", "terms", "note"]) ||
      !["none", "rare", "moderate", "frequent"].includes(String(profanity.level)) || !Array.isArray(profanity.terms) ||
      profanity.terms.length > 40 || !boundedText(profanity.note, 280)) return null;
  const terms: AdminDoorMoneyStyleProfile["vocabulary"]["profanity"]["terms"] = [];
  for (const term of profanity.terms) {
    if (!isRecord(term) || !hasOnlyKeys(term, ["value", "occurrences", "usage"]) || !boundedText(term.value, 40) ||
        !integer(term.occurrences, 1) || !boundedText(term.usage, 280)) return null;
    terms.push({ value: term.value.trim(), occurrences: term.occurrences as number, usage: term.usage.trim() });
  }
  if ((profanity.level === "none") !== (terms.length === 0) || !Array.isArray(value.humorMechanics) || value.humorMechanics.length > 30) return null;
  const humor: AdminDoorMoneyStyleProfile["humorMechanics"] = [];
  for (const item of value.humorMechanics) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["name", "description", "signals"]) || !boundedText(item.name, 100) ||
        !SLUG.test(item.name) || !boundedText(item.description, 280)) return null;
    const signals = stringArray(item.signals, 12, 80);
    if (!signals) return null;
    humor.push({ name: item.name, description: item.description.trim(), signals });
  }
  const story = value.storytellingPatterns;
  if (!isRecord(story) || !hasOnlyKeys(story, ["openings", "turns", "landings", "firstPersonHabits", "tenseUsage"])) return null;
  const openings = namedNotes(story.openings, 1); const turns = namedNotes(story.turns, 1); const landings = namedNotes(story.landings, 1);
  const habits = stringArray(story.firstPersonHabits, 30, 280, 1);
  if (!openings || !turns || !landings || !habits || !Array.isArray(story.tenseUsage) || story.tenseUsage.length < 1 || story.tenseUsage.length > 4) return null;
  const tense: AdminDoorMoneyStyleProfile["storytelling"]["tenseUsage"] = [];
  for (const item of story.tenseUsage) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["tense", "ratio", "note"]) ||
        !["past", "present", "future", "mixed"].includes(String(item.tense)) || !finite(item.ratio, 0, 1) || !boundedText(item.note, 280)) return null;
    tense.push({ tense: item.tense as typeof tense[number]["tense"], ratio: item.ratio, note: item.note.trim() });
  }
  if (Math.abs(tense.reduce((sum, item) => sum + item.ratio, 0) - 1) > 0.000_001) return null;
  const negativeSpace = stringArray(value.negativeSpace, 60, 280, 1);
  if (!negativeSpace || !Array.isArray(value.formatAdaptations) || value.formatAdaptations.length < 1 || value.formatAdaptations.length > 30) return null;
  const adaptations: AdminDoorMoneyStyleProfile["formatAdaptations"] = [];
  for (const item of value.formatAdaptations) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["format", "preserve", "adapt", "avoid"]) || !boundedText(item.format, 100) || !SLUG.test(item.format)) return null;
    const preserve = stringArray(item.preserve, 12, 280, 1); const adapt = stringArray(item.adapt, 12, 280); const avoid = stringArray(item.avoid, 12, 280);
    if (!preserve || !adapt || !avoid) return null;
    adaptations.push({ format: item.format, preserve, adapt, avoid });
  }
  if (!Array.isArray(value.exemplarBank) || value.exemplarBank.length > 40) return null;
  const exemplars: AdminDoorMoneyStyleProfile["exemplars"] = [];
  for (const item of value.exemplarBank) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["id", "chunkId", "text", "embeddingId", "formats", "tags"]) ||
        !boundedText(item.id, 100) || !SLUG.test(item.id) || typeof item.chunkId !== "string" || !CHUNK.test(item.chunkId) ||
        !boundedText(item.text, 280) || !boundedText(item.embeddingId, 100) || !SLUG.test(item.embeddingId)) return null;
    const formats = stringArray(item.formats, 12, 100, 1); const tags = stringArray(item.tags, 16, 100);
    if (!formats || !tags || [...formats, ...tags].some((entry) => !SLUG.test(entry))) return null;
    exemplars.push({ id: item.id, chunkId: item.chunkId, text: item.text, formats, tags });
  }
  if (new Set(humor.map(({ name }) => name)).size !== humor.length ||
      new Set(adaptations.map(({ format }) => format)).size !== adaptations.length ||
      new Set(exemplars.map(({ id }) => id)).size !== exemplars.length) return null;
  return {
    profileVersion: value.profileVersion as number, manuscriptHash: value.manuscriptHash, fingerprintHash: value.fingerprintHash,
    modelVersions: versions as AdminDoorMoneyStyleProfile["modelVersions"], chapterNoteCount: value.chapterNoteCount as number,
    sentenceRhythm: { sampledSentences: rhythm.sampledSentences as number, meanWordsPerSentence: rhythm.meanWordsPerSentence as number,
      p10WordsPerSentence: rhythm.p10WordsPerSentence as number, medianWordsPerSentence: rhythm.medianWordsPerSentence as number,
      p90WordsPerSentence: rhythm.p90WordsPerSentence as number, fragmentRatio: rhythm.fragmentRatio as number,
      oneSentenceParagraphRatio: rhythm.oneSentenceParagraphRatio as number, notes: rhythmNotes },
    vocabulary: { recurringWords, recurringPhrases, profanity: { level: profanity.level as AdminDoorMoneyStyleProfile["vocabulary"]["profanity"]["level"], terms, note: profanity.note.trim() } },
    humorMechanics: humor, storytelling: { openings, turns, landings, firstPersonHabits: habits, tenseUsage: tense },
    negativeSpace, formatAdaptations: adaptations, exemplars, generatedAt: value.generatedAt
  };
}
