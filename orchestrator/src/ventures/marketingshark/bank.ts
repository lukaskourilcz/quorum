import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { repoRoot } from "../../paths.js";

/** A fenced code block in the English question or its introduction. */
export const FENCED_CODE = /```/;

export const NormalizedQuestionSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  importance: z.number().int().min(1).max(10).nullable(),
  hasCode: z.boolean(),
  correctIndex: z.number().int().min(0),
  en: z.object({
    introduction: z.string(),
    question: z.string().min(1),
    options: z.array(z.string()).min(2),
    explanation: z.string()
  }),
  /**
   * Partial on purpose.
   *
   * The source stores Czech as per-field overrides that fall back to English, so a question can
   * carry a Czech explanation and no Czech options. Filling the gaps with the English text here
   * would hand CHUM a "Czech" reference that is half English and invite it to keep the English.
   * What exists is preserved and what does not is absent; CHUM writes native Czech either way
   * and uses this only as reference.
   */
  cs: z.object({
    question: z.string().optional(),
    options: z.array(z.string()).optional(),
    explanation: z.string().optional()
  }).optional()
}).superRefine((question, context) => {
  if (question.correctIndex >= question.en.options.length) {
    context.addIssue({
      code: "custom",
      message: `correctIndex ${question.correctIndex} is outside ${question.en.options.length} options`,
      path: ["correctIndex"]
    });
  }
  if (question.cs?.options && question.cs.options.length !== question.en.options.length) {
    // The Czech options array is parallel to the English one and the correct answer is an index
    // into it. A shorter array would silently move the right answer.
    context.addIssue({
      code: "custom",
      message: "Czech options must be parallel to the English options",
      path: ["cs", "options"]
    });
  }
});
export type NormalizedQuestion = z.infer<typeof NormalizedQuestionSchema>;

export const QuestionBankSnapshotSchema = z.object({
  schemaVersion: z.literal("marketingshark-bank/1"),
  brandId: z.enum(["devshark", "geoshark"]),
  sourceRepo: z.string().min(1),
  sourceCommit: z.string().min(7),
  sourceSubject: z.string().min(1),
  importedAt: z.iso.datetime({ offset: true }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  questions: z.array(NormalizedQuestionSchema).min(1)
});
export type QuestionBankSnapshot = z.infer<typeof QuestionBankSnapshotSchema>;

/**
 * JSON with every object's keys sorted, at every depth.
 *
 * The content hash has to be a property of the questions, not of the order a loader happened to
 * serialise them in. Two imports of the same source commit produce the same hash, and the epoch
 * order is seeded from that hash -- so an unstable hash would silently reshuffle the whole
 * rotation on a re-import that changed nothing.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function contentHashOf(questions: readonly NormalizedQuestion[]): string {
  return createHash("sha256").update(canonicalJson(questions)).digest("hex");
}

export function hasFencedCode(question: { introduction?: string; question: string }): boolean {
  return FENCED_CODE.test(question.question) || FENCED_CODE.test(question.introduction ?? "");
}

/**
 * The seam every question source maps through.
 *
 * react-express-app is the first implementation and the only one today. Anything that can produce
 * NormalizedQuestion deterministically for a given source commit is a legal second one, and the
 * daily room never sees an adapter at all -- it reads the committed snapshot.
 */
export interface QuestionBankAdapter {
  /** Stable id, recorded in provenance. */
  readonly sourceId: string;
  /** Load and normalize the full bank; must be deterministic for a given source commit. */
  load(source: { repo: string; commit: string; subject: string; localPath: string }):
    Promise<NormalizedQuestion[]>;
}

export function parseQuestionBankSnapshot(value: unknown): QuestionBankSnapshot {
  return QuestionBankSnapshotSchema.parse(value);
}

/**
 * Read a committed snapshot and prove its questions are the ones its envelope claims.
 *
 * The envelope's hash is not decoration: it seeds the epoch order. A snapshot edited by hand
 * without rehashing would keep serving an order derived from questions that are no longer there,
 * so a mismatch is an abort rather than a warning.
 */
export async function loadQuestionBankSnapshot(
  snapshotPath: string,
  root = repoRoot
): Promise<QuestionBankSnapshot> {
  const absolute = path.isAbsolute(snapshotPath) ? snapshotPath : path.join(root, snapshotPath);
  const snapshot = parseQuestionBankSnapshot(JSON.parse(await readFile(absolute, "utf8")));
  const actual = contentHashOf(snapshot.questions);
  if (actual !== snapshot.contentHash) {
    throw new Error(
      `${snapshotPath} contentHash ${snapshot.contentHash.slice(0, 12)} does not match its questions (${actual.slice(0, 12)})`
    );
  }
  return snapshot;
}

export function truthSubjectOf(question: NormalizedQuestion) {
  return {
    difficulty: question.difficulty,
    hasCode: question.hasCode,
    category: question.category,
    optionCount: question.en.options.length,
    englishQuestion: question.en.question
  };
}
