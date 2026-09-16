import { z } from "zod";
import { DateSchema, openObject } from "./common.js";

/**
 * One day of edition runs, regraded against the committed rubric.
 *
 * The receipt is the visible pass/fail record #535 asks for, and it is built from two things that
 * are already on disk: the run reports under `state/edition/runs/` and the rubric in
 * `config/edition-quality.json`. Nothing here calls a model, a provider or the network, which is
 * the only reason it can be a gate that runs on every push.
 *
 * **There is no `generatedAt`.** Every other receipt in this repository carries one, and this one
 * must not: the CI step compares the committed bytes against a fresh build, so a timestamp would
 * make every receipt stale the moment it was written and the gate would fail for the one reason
 * that means nothing. The date it covers and the rubric revision that graded it are the whole of
 * the provenance a reader needs, and both are recorded.
 *
 * **`action` is deliberately not graded.** `evaluateEditionQuality` returns `publish`,
 * `regenerate` or `no_edition`, and that choice reads the regeneration attempt the gate was
 * called with. A run report records the run's *final* attempt count, not the count at the moment
 * of each call, so `action` cannot be reproduced from the record — two of the forty-nine
 * committed reports differ on `action` alone for exactly that reason. The rubric grades the
 * fourteen violation codes, which are a pure function of the recorded metrics and the committed
 * thresholds, and says nothing about what the run did next.
 */
export const EditionRubricCriterionGradeSchema = openObject({
  code: z.string().regex(/^[a-z][a-z0-9_]*$/u).max(60),
  category: z.enum(["evidence", "independence", "originality", "cost"]),
  outcome: z.enum(["met", "failed"])
});
export type EditionRubricCriterionGrade = z.infer<typeof EditionRubricCriterionGradeSchema>;

export const EditionRubricGradeSchema = openObject({
  criteria: z.array(EditionRubricCriterionGradeSchema).min(1).max(40),
  /** The violations the run itself recorded, sorted. */
  recorded: z.array(z.string().min(1).max(60)).max(40),
  /** The violations the rubric produces from the same metrics today, sorted. */
  regraded: z.array(z.string().min(1).max(60)).max(40),
  /** Codes the two disagree about. Empty is the healthy state; non-empty is the finding. */
  divergence: z.array(z.string().min(1).max(60)).max(40)
});
export type EditionRubricGrade = z.infer<typeof EditionRubricGradeSchema>;

/**
 * One run's grade, or a stated reason it has none.
 *
 * A run that ended before the quality gate ran carries no metrics, and eighteen of the committed
 * reports are exactly that. `grade: null` with a reason is the honest record; counting such a run
 * as passing would report a gate that never ran as a gate that was satisfied.
 */
export const EditionRubricRunGradeSchema = openObject({
  runId: z.string().min(1).max(120),
  /** The report this grade was read from, as a repository path a reviewer can open. */
  reportRef: z.string().min(1).max(200),
  status: z.enum(["edition", "no_edition", "failed"]),
  grade: EditionRubricGradeSchema.nullable(),
  ungraded: z.string().min(10).max(200).nullable()
}).superRefine((run, context) => {
  if ((run.grade === null) === (run.ungraded === null)) {
    context.addIssue({
      code: "custom",
      message: "A run carries either a grade or a stated reason it has none, never both and never neither.",
      path: ["grade"]
    });
  }
});
export type EditionRubricRunGrade = z.infer<typeof EditionRubricRunGradeSchema>;

export const EditionRubricReceiptSchema = openObject({
  schemaVersion: z.literal("edition-rubric-receipt/1"),
  date: DateSchema,
  rubric: openObject({
    version: z.literal("edition-rubric/1"),
    revision: z.number().int().positive()
  }),
  runs: z.array(EditionRubricRunGradeSchema).min(1).max(24),
  summary: openObject({
    runs: z.number().int().positive(),
    graded: z.number().int().nonnegative(),
    ungraded: z.number().int().nonnegative(),
    /** Graded runs whose every criterion was met. */
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    diverged: z.number().int().nonnegative()
  })
}).superRefine((receipt, context) => {
  if (receipt.summary.runs !== receipt.runs.length) {
    context.addIssue({
      code: "custom",
      message: "The summary counts a different number of runs than the receipt lists.",
      path: ["summary", "runs"]
    });
  }
  if (receipt.summary.graded + receipt.summary.ungraded !== receipt.runs.length) {
    context.addIssue({
      code: "custom",
      message: "Every run is either graded or ungraded; the two counts must cover the list exactly.",
      path: ["summary", "graded"]
    });
  }
  if (receipt.summary.passed + receipt.summary.failed !== receipt.summary.graded) {
    context.addIssue({
      code: "custom",
      message: "A graded run either passed or failed; an ungraded run is neither.",
      path: ["summary", "passed"]
    });
  }
});
export type EditionRubricReceipt = z.infer<typeof EditionRubricReceiptSchema>;
