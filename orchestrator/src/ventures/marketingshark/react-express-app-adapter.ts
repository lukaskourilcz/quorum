import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  hasFencedCode,
  NormalizedQuestionSchema,
  type NormalizedQuestion,
  type QuestionBankAdapter
} from "./bank.js";

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

/**
 * Which modules a subject's bank is assembled from.
 *
 * Mirrors `lib/question-bank-loader.ts` rather than importing it: that module also pulls
 * `product-scope` and `shared/subject-catalog`, which drag deployment-scope logic this import has
 * no business evaluating. The entry points are pinned here and the subject key is the same one the
 * loader uses, so a bank that moves in the source shows up as a missing export rather than as a
 * quietly smaller import.
 */
const SUBJECT_MODULES: Record<string, {
  questions: Array<{ file: string; exportName: string }>;
  translations: Array<{ file: string; exportName: string }>;
}> = {
  webdev: {
    questions: [
      { file: "lib/quiz-data.ts", exportName: "questions" },
      { file: "lib/roadmap-questions-fix-the-test.ts", exportName: "fixTheTestQuestions" }
    ],
    translations: [
      { file: "lib/quiz-data.cs.ts", exportName: "questionTranslationsCs" },
      { file: "lib/roadmap-questions-fix-the-test.cs.ts", exportName: "fixTheTestTranslationsCs" }
    ]
  },
  geography: {
    questions: [
      { file: "lib/roadmap-questions.geography.ts", exportName: "allRoadmapGeographyQuestions" }
    ],
    translations: [
      { file: "lib/roadmap-questions.geography.cs.ts", exportName: "geographyTranslationsCs" }
    ]
  }
};

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
    const modules = SUBJECT_MODULES[source.subject];
    if (!modules) {
      throw new Error(`No react-express-app entry points for subject ${source.subject}`);
    }

    const questionGroups = await Promise.all(modules.questions.map(({ file, exportName }) =>
      importNamed<SourceQuestion[]>(source.localPath, file, exportName)));
    const translationGroups = await Promise.all(modules.translations.map(({ file, exportName }) =>
      importNamed<Record<string, SourceTranslation>>(source.localPath, file, exportName)));

    const translations: Record<string, SourceTranslation> = Object.assign({}, ...translationGroups);
    const seen = new Set<string>();
    const normalized: NormalizedQuestion[] = [];

    for (const question of questionGroups.flat()) {
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

export const SUPPORTED_SUBJECTS = Object.keys(SUBJECT_MODULES);
