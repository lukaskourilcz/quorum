import { z } from "zod";

/**
 * The surfaces that own a hook library.
 *
 * A surface is not a brand. devShark and geoShark are two verticals of one surface, because they
 * ask the same shape of question and their hooks are gated on the same facts; DNESKAi and MMA Files
 * are separate surfaces because a briefing item and a magazine article carry different metadata and
 * a quiz gate cannot evaluate against either. See `docs/hooks/05-surfaces.md`.
 */
export const SURFACES = ["quiz", "news", "mma"] as const;
export type Surface = (typeof SURFACES)[number];

/** The two verticals of the quiz surface. Other surfaces have exactly one, named `dev` by default. */
export const VERTICALS = ["dev", "geo"] as const;
export type Vertical = (typeof VERTICALS)[number];

export const LANGUAGES = ["en", "cs"] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * A parsed predicate.
 *
 * `truthRequires` is written in the libraries as strings (`"difficultyAtLeast:3"`) because the same
 * JSON ships to the apps, which parse it themselves. In here it is a discriminated union: the
 * `:N`/`:X` suffix is parsed once at load time, so an evaluator branches on `kind` and reads a
 * number that is already a number. Nothing downstream re-splits a string.
 */
export type QuizPredicate =
  | { readonly kind: "always" }
  | { readonly kind: "hasCode" }
  | { readonly kind: "optionsAtLeast"; readonly count: number }
  | { readonly kind: "difficultyAtLeast"; readonly level: number }
  | { readonly kind: "categoryIn"; readonly list: string }
  | { readonly kind: "questionStartsWith"; readonly prefix: string };

/**
 * Sketched from `docs/hooks/05-surfaces.md`, not confirmed against DNESKAi's item JSON.
 *
 * Typed here so the vocabulary check has names to check against and a library author starts from
 * the agreed list rather than inventing one. No evaluator implements them yet — the news library is
 * empty and `evaluateEligible` refuses a non-empty one rather than guessing. Step one of the
 * authoring issue is enumerating the metadata the items actually carry at render time.
 */
export type NewsPredicate =
  | { readonly kind: "always" }
  | { readonly kind: "hasNumber" }
  | { readonly kind: "isFirstReport" }
  | { readonly kind: "followsPriorStory" }
  | { readonly kind: "articleAgeHours"; readonly hours: number }
  | { readonly kind: "sourceCount"; readonly count: number }
  | { readonly kind: "topicIn"; readonly topic: string };

/** Sketched from `docs/hooks/05-surfaces.md`. Same status as the news vocabulary above. */
export type MmaPredicate =
  | { readonly kind: "always" }
  | { readonly kind: "isTitleFight" }
  | { readonly kind: "resultKnown" }
  | { readonly kind: "hasStatEdge" }
  | { readonly kind: "eventWithinDays"; readonly days: number }
  | { readonly kind: "fighterRanked"; readonly rank: number };

export type Predicate = QuizPredicate | NewsPredicate | MmaPredicate;

/** What a surface's predicate names are, and what shape of argument each one takes. */
export type PredicateArity = "none" | "number" | "string";

export interface PredicateSpec {
  readonly arity: PredicateArity;
  /** The union member's argument field, for the arity that has one. */
  readonly field?: string;
}

/**
 * Per-surface predicate vocabularies.
 *
 * A predicate outside its surface's vocabulary is a load-time error naming the hook and the
 * surface, never a silent skip: a skipped gate is an ungated claim, and an ungated claim on a
 * quiz surface is the exact failure `docs/hooks/02-hook-craft-rules.md` calls non-negotiable.
 */
export const VOCABULARIES: Readonly<Record<Surface, Readonly<Record<string, PredicateSpec>>>> = {
  quiz: {
    always: { arity: "none" },
    hasCode: { arity: "none" },
    optionsAtLeast: { arity: "number", field: "count" },
    difficultyAtLeast: { arity: "number", field: "level" },
    categoryIn: { arity: "string", field: "list" },
    questionStartsWith: { arity: "string", field: "prefix" }
  },
  news: {
    always: { arity: "none" },
    hasNumber: { arity: "none" },
    isFirstReport: { arity: "none" },
    followsPriorStory: { arity: "none" },
    articleAgeHours: { arity: "number", field: "hours" },
    sourceCount: { arity: "number", field: "count" },
    topicIn: { arity: "string", field: "topic" }
  },
  mma: {
    always: { arity: "none" },
    isTitleFight: { arity: "none" },
    resultKnown: { arity: "none" },
    hasStatEdge: { arity: "none" },
    eventWithinDays: { arity: "number", field: "days" },
    fighterRanked: { arity: "number", field: "rank" }
  }
};

/**
 * Tier B predicate names, kept out of every vocabulary on purpose.
 *
 * They are specified in `docs/hooks/04-schema-and-gates.md` and each has an open issue. Naming them
 * here buys one thing: a hook gated on `statsReady` fails to load with "not implemented yet, see
 * the Tier B issue" instead of with "unknown predicate", which is the difference between a build
 * order and a typo.
 */
export const TIER_B_PREDICATES = [
  "statsReady",
  "accuracyBelow",
  "accuracyAtLeast",
  "streakAtLeast",
  "missedTopicBefore",
  "timerEnabled",
  "optionsExactly"
] as const;

const VariantTextSchema = z.object({
  en: z.string().min(1),
  cs: z.string().min(1)
});

/** The library file's own shape, before predicates are parsed. */
export const RawHookSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  cooldownDays: z.number().int().min(1).max(30),
  truthRequires: z.array(z.string().min(1)).min(1),
  variants: z.record(z.enum(VERTICALS), VariantTextSchema)
});
export type RawHook = z.infer<typeof RawHookSchema>;

export const RawLibrarySchema = z.array(RawHookSchema);

/**
 * The per-hook research record: the shipping bar from `docs/hooks/02-hook-craft-rules.md`, as
 * fields a check can read.
 *
 * It is a parallel file rather than fields on the hook because the hook file is delivered to the
 * apps and the research is not — an app renders copy and never needs to know what would falsify it.
 */
export const CITATION_CONFIDENCES = ["verified", "recalled", "practitioner", "mechanism-only", "measured"] as const;

export const HookResearchSchema = z.object({
  id: z.string().min(1),
  archetype: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  mechanism: z.string().min(1),
  citation: z.string().min(1),
  citationConfidence: z.enum(CITATION_CONFIDENCES),
  whyItEarnsTheSwipe: z.string().min(1),
  prediction: z.string().min(1),
  falsifiedIf: z.string().min(1),
  cooldownRationale: z.string().min(1),
  risk: z.string().min(1),
  gateJustification: z.string().min(1)
});
export type HookResearch = z.infer<typeof HookResearchSchema>;

export const ResearchFileSchema = z.array(HookResearchSchema);

/** A hook with its predicates parsed and its research attached. */
export interface Hook {
  readonly id: string;
  readonly cooldownDays: number;
  readonly surface: Surface;
  readonly truthRequires: readonly Predicate[];
  /** The strings exactly as written in the library, for delivery and for the lint's char budget. */
  readonly rawRequires: readonly string[];
  readonly variants: Partial<Record<Vertical, { readonly en: string; readonly cs: string }>>;
  readonly research: HookResearch;
}

export interface Library {
  readonly surface: Surface;
  readonly hooks: readonly Hook[];
}
