import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  hasFencedCode,
  NormalizedQuestionSchema,
  type NormalizedQuestion,
  type QuestionBankAdapter
} from "./bank.js";
import { ChallengeSchema, type Challenge } from "./challenges.js";

/** The shape react-express-app's `lib/quiz-data.ts` exports, narrowed to what the import reads. */
interface SourceQuestion {
  id: string;
  introduction?: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category: string;
  explanation?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  importance?: number;
}

interface SourceTranslation {
  introduction?: string;
  question?: string;
  options?: string[];
  explanation?: string;
}

async function importNamed<T>(localPath: string, file: string, exportName: string): Promise<T> {
  const absolute = path.join(localPath, file);
  const module = await import(pathToFileURL(absolute).href) as Record<string, unknown>;
  const value = module[exportName];
  if (value === undefined) {
    throw new Error(`${file} does not export ${exportName}`);
  }
  return value as T;
}

/** Czech fields that are present and actually differ from nothing. Absent stays absent. */
function normalizeCzech(translation: SourceTranslation | undefined, optionCount: number): NormalizedQuestion["cs"] {
  if (!translation) return undefined;
  const options = Array.isArray(translation.options) && translation.options.length === optionCount
    ? translation.options
    : undefined;
  const czech = {
    ...(translation.question ? { question: translation.question } : {}),
    ...(options ? { options } : {}),
    ...(translation.explanation ? { explanation: translation.explanation } : {})
  };
  return Object.keys(czech).length > 0 ? czech : undefined;
}

export const reactExpressAppAdapter: QuestionBankAdapter = {
  sourceId: "react-express-app",
  async load(source): Promise<NormalizedQuestion[]> {
    // webdev is the only subject left in react-express-app, and it ships its own loader. The
    // geography entry points left with StudyShark, so any other subject fails here instead of
    // importing a file that no longer exists.
    if (source.subject !== "webdev") {
      throw new Error(`No react-express-app entry points for subject ${source.subject}`);
    }

    const loadQuestions = await importNamed<() => Promise<SourceQuestion[]>>(source.localPath, "lib/webdev-bank.ts", "loadWebdevQuestions");
    const loadTranslations = await importNamed<() => Promise<Record<string, SourceTranslation>>>(source.localPath, "lib/webdev-bank.ts", "loadWebdevTranslations");
    const [questions, translations] = await Promise.all([loadQuestions(), loadTranslations()]);

    const seen = new Set<string>();
    const normalized: NormalizedQuestion[] = [];

    for (const question of questions) {
      // The source concatenates several banks and a duplicate id would make the ledger's
      // served-once guarantee a lie -- two different questions under one id, one of which can
      // never be reached. First occurrence wins and the count difference is reported.
      if (seen.has(question.id)) continue;
      seen.add(question.id);
      const introduction = question.introduction ?? "";
      normalized.push(NormalizedQuestionSchema.parse({
        id: question.id,
        category: question.category,
        difficulty: question.difficulty,
        importance: typeof question.importance === "number" ? question.importance : null,
        hasCode: hasFencedCode({ introduction, question: question.question }),
        correctIndex: question.correctAnswer,
        en: {
          introduction,
          question: question.question,
          options: question.options,
          explanation: question.explanation ?? ""
        },
        cs: normalizeCzech(translations[question.id], question.options.length)
      }));
    }

    // Stable order before the epoch shuffle ever sees it, so a re-import cannot reorder the bank
    // by accident and change a hash that nothing about the questions changed.
    return normalized.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }
};

/** The fields of react-express-app's `CodingTask` the challenge import reads, and nothing else. */
interface SourceCodingTask {
  id: string;
  track: string;
  tier: number;
  title: { en: string };
  prompt: { en: string };
  hints: { en: string[] };
  verify: string;
  format?: string;
}

const TEASER_TRACKS: ReadonlySet<string> = new Set(["javascript", "typescript", "react", "algorithms"]);

/**
 * devShark's issuable standalone coding challenges, each with devShark's own difficulty label
 * (quorum#576).
 *
 * The label comes from `difficultyOf` in `shared/coding-catalog.ts`, which devShark's step D5 adds.
 * A checkout without it is refused rather than labelled here from the tier: the product may
 * override a label, and a copy of its rule in this repository would not see that. Only what a
 * teaser shows is read — title, prompt and the first hint — from the gated list the product issues
 * (`lib/coding/active.ts`). Evolving stages, checklists, guided designs and drills are left out:
 * a teaser is a task a reader can take on its own, and its prompt has to stand alone.
 */
export async function loadDevSharkChallenges(localPath: string): Promise<{ challenges: Challenge[]; dropped: string[] }> {
  const catalog = await import(pathToFileURL(path.join(localPath, "shared/coding-catalog.ts")).href) as Record<string, unknown>;
  const difficultyOf = catalog.difficultyOf;
  if (typeof difficultyOf !== "function") {
    throw new Error("devShark has not shipped its difficulty labels (step D5): shared/coding-catalog.ts exports no difficultyOf, so no challenge can be labelled.");
  }
  const tasks = await importNamed<readonly SourceCodingTask[]>(localPath, "lib/coding/active.ts", "ACTIVE_CODING_TASKS");
  const summarize = await importNamed<(task: SourceCodingTask) => unknown>(localPath, "lib/coding/catalog.ts", "summarize");
  const evolvingStage = await importNamed<(id: string) => unknown>(localPath, "shared/evolving.ts", "evolvingStage");

  const challenges: Challenge[] = [];
  // A task that is a teaser candidate but does not fit the snapshot's bounds is named, not lost.
  const dropped: string[] = [];
  for (const task of tasks) {
    if (!TEASER_TRACKS.has(task.track) || evolvingStage(task.id) || task.verify !== "tests" || (task.format ?? "implement") !== "implement") continue;
    const parsed = ChallengeSchema.safeParse({
      id: task.id,
      track: task.track,
      title: task.title.en.trim(),
      difficulty: (difficultyOf as (summary: unknown) => unknown)(summarize(task)),
      prompt: task.prompt.en.trim(),
      firstHint: task.hints.en[0]?.trim() ?? ""
    });
    if (parsed.success) challenges.push(parsed.data);
    else dropped.push(task.id);
  }
  return {
    challenges: challenges.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
    dropped: dropped.sort()
  };
}
