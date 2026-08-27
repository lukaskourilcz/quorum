export const DEFAULT_CHUNK_MIN_TOKENS = 900;
export const DEFAULT_CHUNK_MAX_TOKENS = 1_200;
export const DEFAULT_CHUNK_TARGET_TOKENS = 1_050;
export const DEFAULT_CONTEXT_RATIO = 0.15;

export interface ByteRange {
  start: number;
  end: number;
}

export interface ManuscriptParagraph {
  text: string;
  byteOffsets: ByteRange;
  estimatedTokens: number;
}

export interface ManuscriptScene {
  id: string;
  chapterId: string;
  ordinal: number;
  title: string | null;
  paragraphs: ManuscriptParagraph[];
}

export interface ManuscriptChapter {
  id: string;
  ordinal: number;
  title: string | null;
  scenes: ManuscriptScene[];
}

export interface ChunkContextWindow {
  text: string;
  byteOffsets: ByteRange;
  estimatedTokens: number;
}

export interface ManuscriptChunk {
  id: string;
  chapterId: string;
  sceneId: string;
  ordinal: number;
  text: string;
  byteOffsets: ByteRange;
  estimatedTokens: number;
  context: {
    before: ChunkContextWindow | null;
    after: ChunkContextWindow | null;
  };
  boundary: "target" | "scene-end" | "oversized-paragraph";
}

export interface ChunkedManuscript {
  estimatedTokens: number;
  chapters: ManuscriptChapter[];
  chunks: ManuscriptChunk[];
}

export interface ChunkerOptions {
  minTokens?: number;
  maxTokens?: number;
  targetTokens?: number;
  contextRatio?: number;
}

interface ParagraphDraft {
  text: string;
  charStart: number;
  charEnd: number;
}

interface SceneDraft {
  chapterOrdinal: number;
  sceneOrdinal: number;
  title: string | null;
  paragraphs: ParagraphDraft[];
}

interface ChapterDraft {
  ordinal: number;
  title: string | null;
  scenes: SceneDraft[];
}

interface ParagraphGroup {
  start: number;
  end: number;
  boundary: ManuscriptChunk["boundary"];
}

/** The repository's established deterministic estimate: four UTF-8 bytes per model token. */
export function estimateBookTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, "utf8") / 4);
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

function lineAt(source: string, start: number): { text: string; end: number; next: number } {
  let end = start;
  while (end < source.length && source[end] !== "\n" && source[end] !== "\r") end += 1;
  let next = end;
  if (source[next] === "\r" && source[next + 1] === "\n") next += 2;
  else if (source[next] === "\r" || source[next] === "\n") next += 1;
  return { text: source.slice(start, end), end, next };
}

function parseHeading(line: string):
  | { kind: "chapter"; ordinal: number; title: string | null }
  | { kind: "scene"; ordinal: number; title: string | null }
  | null {
  const chapter = /^# Chapter (\d+)(?::\s*(.+))?\s*$/u.exec(line);
  if (chapter) return { kind: "chapter", ordinal: Number(chapter[1]), title: chapter[2]?.trim() || null };
  const scene = /^## Scene (\d+)(?::\s*(.+))?\s*$/u.exec(line);
  if (scene) return { kind: "scene", ordinal: Number(scene[1]), title: scene[2]?.trim() || null };
  return null;
}

function parseStructure(source: string): ChapterDraft[] {
  const chapters: ChapterDraft[] = [];
  let chapter: ChapterDraft | null = null;
  let scene: SceneDraft | null = null;
  let paragraph: ParagraphDraft | null = null;

  const flushParagraph = (): void => {
    if (!paragraph) return;
    scene!.paragraphs.push({
      ...paragraph,
      text: source.slice(paragraph.charStart, paragraph.charEnd)
    });
    paragraph = null;
  };

  let cursor = 0;
  while (cursor < source.length) {
    const line = lineAt(source, cursor);
    const heading = parseHeading(line.text);
    if (heading) {
      flushParagraph();
      if (heading.ordinal < 1) throw new Error("Chapter and scene ordinals must be positive");
      if (heading.kind === "chapter") {
        if (chapters.some(({ ordinal }) => ordinal === heading.ordinal)) {
          throw new Error(`Duplicate chapter ordinal ${heading.ordinal}`);
        }
        chapter = { ordinal: heading.ordinal, title: heading.title, scenes: [] };
        chapters.push(chapter);
        scene = null;
      } else {
        if (!chapter) throw new Error("A scene heading must follow a chapter heading");
        if (chapter.scenes.some(({ sceneOrdinal }) => sceneOrdinal === heading.ordinal)) {
          throw new Error(`Duplicate scene ordinal ${heading.ordinal} in chapter ${chapter.ordinal}`);
        }
        scene = {
          chapterOrdinal: chapter.ordinal,
          sceneOrdinal: heading.ordinal,
          title: heading.title,
          paragraphs: []
        };
        chapter.scenes.push(scene);
      }
      cursor = line.next;
      continue;
    }

    if (line.text.trim().length === 0) {
      flushParagraph();
      cursor = line.next;
      continue;
    }
    if (!chapter) throw new Error("Manuscript prose must follow a '# Chapter N' heading");
    if (!scene) throw new Error("Manuscript prose must follow a '## Scene N' heading");
    if (!paragraph) {
      paragraph = { text: "", charStart: cursor, charEnd: line.end };
    } else {
      paragraph.charEnd = line.end;
    }
    cursor = line.next;
  }
  flushParagraph();

  if (chapters.length === 0) throw new Error("Manuscript requires at least one chapter");
  if (chapters.some(({ scenes }) => scenes.length === 0)) throw new Error("Every chapter requires at least one scene");
  if (chapters.flatMap(({ scenes }) => scenes).some(({ paragraphs }) => paragraphs.length === 0)) {
    throw new Error("Every scene requires at least one prose paragraph");
  }
  return chapters;
}

function byteOffset(source: string, charOffset: number): number {
  return Buffer.byteLength(source.slice(0, charOffset), "utf8");
}

function rangeText(buffer: Buffer, paragraphs: readonly ManuscriptParagraph[], start: number, end: number): string {
  return buffer.subarray(paragraphs[start]!.byteOffsets.start, paragraphs[end]!.byteOffsets.end).toString("utf8");
}

function rangeTokens(buffer: Buffer, paragraphs: readonly ManuscriptParagraph[], start: number, end: number): number {
  return estimateBookTokens(rangeText(buffer, paragraphs, start, end));
}

function partitionScene(
  buffer: Buffer,
  paragraphs: readonly ManuscriptParagraph[],
  options: Required<Pick<ChunkerOptions, "minTokens" | "maxTokens" | "targetTokens">>
): ParagraphGroup[] {
  const groups: ParagraphGroup[] = [];
  let start = 0;
  while (start < paragraphs.length) {
    const oneParagraphTokens = rangeTokens(buffer, paragraphs, start, start);
    if (oneParagraphTokens > options.maxTokens) {
      groups.push({ start, end: start, boundary: "oversized-paragraph" });
      start += 1;
      continue;
    }

    let end = start;
    let tokens = oneParagraphTokens;
    while (end + 1 < paragraphs.length) {
      const nextTokens = rangeTokens(buffer, paragraphs, start, end + 1);
      if (nextTokens > options.maxTokens) break;
      if (tokens >= options.minTokens &&
          Math.abs(tokens - options.targetTokens) <= Math.abs(nextTokens - options.targetTokens)) break;
      end += 1;
      tokens = nextTokens;
    }
    groups.push({
      start,
      end,
      boundary: end === paragraphs.length - 1 ? "scene-end" : "target"
    });
    start = end + 1;
  }

  if (groups.length >= 2) {
    const last = groups.at(-1)!;
    const previous = groups.at(-2)!;
    const lastTokens = rangeTokens(buffer, paragraphs, last.start, last.end);
    const mergedTokens = rangeTokens(buffer, paragraphs, previous.start, last.end);
    if (lastTokens < options.minTokens && mergedTokens <= options.maxTokens) {
      previous.end = last.end;
      previous.boundary = "scene-end";
      groups.pop();
    }
  }
  return groups;
}

function contextWindow(input: {
  buffer: Buffer;
  paragraphs: readonly ManuscriptParagraph[];
  from: number;
  direction: "before" | "after";
  targetTokens: number;
}): ChunkContextWindow | null {
  const { paragraphs } = input;
  if (input.from < 0 || input.from >= paragraphs.length) return null;
  let start = input.from;
  let end = input.from;
  while (true) {
    const candidate = input.direction === "before" ? start - 1 : end + 1;
    if (candidate < 0 || candidate >= paragraphs.length) break;
    const nextStart = input.direction === "before" ? candidate : start;
    const nextEnd = input.direction === "after" ? candidate : end;
    const nextTokens = rangeTokens(input.buffer, paragraphs, nextStart, nextEnd);
    if (nextTokens > input.targetTokens) break;
    start = nextStart;
    end = nextEnd;
  }
  const byteOffsets = {
    start: paragraphs[start]!.byteOffsets.start,
    end: paragraphs[end]!.byteOffsets.end
  };
  const text = input.buffer.subarray(byteOffsets.start, byteOffsets.end).toString("utf8");
  return { text, byteOffsets, estimatedTokens: estimateBookTokens(text) };
}

function validatedOptions(options: ChunkerOptions): Required<ChunkerOptions> {
  const result = {
    minTokens: options.minTokens ?? DEFAULT_CHUNK_MIN_TOKENS,
    maxTokens: options.maxTokens ?? DEFAULT_CHUNK_MAX_TOKENS,
    targetTokens: options.targetTokens ?? DEFAULT_CHUNK_TARGET_TOKENS,
    contextRatio: options.contextRatio ?? DEFAULT_CONTEXT_RATIO
  };
  if (!Number.isInteger(result.minTokens) || !Number.isInteger(result.maxTokens) ||
      !Number.isInteger(result.targetTokens) || result.minTokens < 1 ||
      result.minTokens > result.targetTokens || result.targetTokens > result.maxTokens) {
    throw new Error("Chunk targets must be positive integers ordered min <= target <= max");
  }
  if (!Number.isFinite(result.contextRatio) || result.contextRatio < 0 || result.contextRatio > 0.5) {
    throw new Error("Context ratio must be between 0 and 0.5");
  }
  return result;
}

/**
 * Pure structural chunking. Headings and paragraph boundaries alone decide every byte range;
 * no model, provider, clock, random value or filesystem state participates.
 */
export function chunkManuscript(source: string, options: ChunkerOptions = {}): ChunkedManuscript {
  const resolved = validatedOptions(options);
  const buffer = Buffer.from(source, "utf8");
  const drafts = parseStructure(source);
  let chunkOrdinal = 0;
  const chunks: ManuscriptChunk[] = [];
  const chapters: ManuscriptChapter[] = drafts.map((chapterDraft) => {
    const chapterId = `ch${pad(chapterDraft.ordinal, 2)}`;
    const scenes: ManuscriptScene[] = chapterDraft.scenes.map((sceneDraft) => {
      const sceneId = `${chapterId}-s${pad(sceneDraft.sceneOrdinal, 2)}`;
      const paragraphs = sceneDraft.paragraphs.map((paragraph) => {
        const byteOffsets = {
          start: byteOffset(source, paragraph.charStart),
          end: byteOffset(source, paragraph.charEnd)
        };
        const text = buffer.subarray(byteOffsets.start, byteOffsets.end).toString("utf8");
        return { text, byteOffsets, estimatedTokens: estimateBookTokens(text) };
      });
      const groups = partitionScene(buffer, paragraphs, resolved);
      for (const group of groups) {
        chunkOrdinal += 1;
        const byteOffsets = {
          start: paragraphs[group.start]!.byteOffsets.start,
          end: paragraphs[group.end]!.byteOffsets.end
        };
        const text = buffer.subarray(byteOffsets.start, byteOffsets.end).toString("utf8");
        const estimatedTokens = estimateBookTokens(text);
        const contextTarget = Math.max(1, Math.round(estimatedTokens * resolved.contextRatio));
        chunks.push({
          id: `${sceneId}-c${pad(chunkOrdinal, 3)}`,
          chapterId,
          sceneId,
          ordinal: chunkOrdinal,
          text,
          byteOffsets,
          estimatedTokens,
          context: {
            before: contextWindow({
              buffer,
              paragraphs,
              from: group.start - 1,
              direction: "before",
              targetTokens: contextTarget
            }),
            after: contextWindow({
              buffer,
              paragraphs,
              from: group.end + 1,
              direction: "after",
              targetTokens: contextTarget
            })
          },
          boundary: group.boundary
        });
      }
      return {
        id: sceneId,
        chapterId,
        ordinal: sceneDraft.sceneOrdinal,
        title: sceneDraft.title,
        paragraphs
      };
    });
    return {
      id: chapterId,
      ordinal: chapterDraft.ordinal,
      title: chapterDraft.title,
      scenes
    };
  });
  return { estimatedTokens: estimateBookTokens(source), chapters, chunks };
}
