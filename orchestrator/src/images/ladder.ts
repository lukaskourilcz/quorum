import { illustrativeScenePhoto } from "./illustrative-scenes.js";
import { illustrativeSportPhoto } from "./illustrative.js";
import {
  candidatesNaming,
  discoverLicensedPhotos,
  type LicensedImageSearchResult,
  type LicensedPhotoCandidate
} from "./licensed.js";
import { assessCandidates, type GateVerdict } from "./vision-gate.js";
import type { ImageProgramBudget } from "./budget.js";
import type { VisualBrief } from "./visual-brief.js";

/**
 * The certainty ladder, walked in one place instead of two.
 *
 * Both magazines had their own copy of this — DNESKAi's in `edition/live.ts`, MMA Files' in
 * `selectArticleImage` — and the two drifted: the curated scene rung arrived on one desk two
 * days before the other, and the search that ran before the article was written was a DNESKAi bug
 * that MMA never had. The rungs themselves stay exactly where they were defined; what moved here
 * is the order they are tried in and the gate between the last one and the page.
 *
 * The order never varies and the direction never reverses. Each rung is more certain than the one
 * below it, a rung that cannot answer hands down, and nothing hands back up. At the bottom is the
 * FRAME plate, which needs no model, no network and no money — so a failure anywhere above it
 * costs a photograph and never a publication.
 */

export type HeroRung = "entity-linked" | "curated" | "search" | "plate";

export interface HeroLadderResult {
  candidate: LicensedPhotoCandidate | null;
  /** The rung that answered. `plate` means the caller draws the deterministic cover. */
  rung: HeroRung;
  /** Every gate run in order, for the run report and for the record beside the package. */
  verdicts: GateVerdict[];
  skippedProviders: LicensedImageSearchResult["skippedProviders"];
}

export interface LadderContext {
  venture: "caught-up" | "mma-files";
  stateRoot: string;
  cycleId: string;
  budget: ImageProgramBudget;
  article: { titleCs: string; dekCs: string };
  brief: VisualBrief | null;
  /** Decides which curated file is tried first. Never sent anywhere. */
  seed: string;
  dry?: boolean;
}

export interface LadderDependencies {
  scenePhoto?: typeof illustrativeScenePhoto;
  sportPhoto?: typeof illustrativeSportPhoto;
  search?: (input: { phrases: readonly string[] }) => Promise<LicensedImageSearchResult>;
  gate?: typeof assessCandidates;
}

/**
 * The phrases the search runs on: the desk's own, or the tag-derived query it falls back to.
 *
 * The fallback is the path IMG-01 built and it is not a degraded one — it produced every cover
 * this magazine has. It is simply less specific than a desk that has read its own article.
 */
export function searchPhrasesFor(brief: VisualBrief | null, fallbackQuery: string): string[] {
  const phrases = brief?.phrases.filter(Boolean) ?? [];
  if (phrases.length > 0) return phrases;
  return fallbackQuery.trim() ? [fallbackQuery.trim()] : [];
}

async function defaultSearch(input: { phrases: readonly string[] }): Promise<LicensedImageSearchResult> {
  return discoverLicensedPhotos({
    queries: input.phrases,
    pexelsKey: process.env.PEXELS_API_KEY,
    pixabayKey: process.env.PIXABAY_API_KEY,
    maximum: 12
  });
}

/**
 * The licensed search rung: find up to twelve, then let the gate decide whether any may run.
 *
 * This is the rung the whole programme was built for. An archive answering a phrase returns
 * whatever it has, in an order that moves between runs, and until now the pick was made from
 * captions by a writer that had seen no pixels. Now nothing leaves here that has not been
 * looked at.
 */
export async function gatedSearchRung(
  context: LadderContext,
  phrases: readonly string[],
  dependencies: LadderDependencies = {},
  /** Applied before the gate. The event path uses it; the brief-driven path cannot. */
  narrow?: (candidates: LicensedPhotoCandidate[]) => LicensedPhotoCandidate[]
): Promise<{ candidate: LicensedPhotoCandidate | null; verdict: GateVerdict | null; skippedProviders: LicensedImageSearchResult["skippedProviders"] }> {
  if (phrases.length === 0) return { candidate: null, verdict: null, skippedProviders: [] };
  const search = dependencies.search ?? defaultSearch;
  const found = await search({ phrases }).catch(() => ({ candidates: [], skippedProviders: [] }));
  const candidates = narrow ? narrow(found.candidates) : found.candidates;
  if (candidates.length === 0) {
    return { candidate: null, verdict: null, skippedProviders: found.skippedProviders };
  }
  const gate = dependencies.gate ?? assessCandidates;
  const outcome = await gate({
    venture: context.venture,
    article: {
      titleCs: context.article.titleCs,
      dekCs: context.article.dekCs,
      negatives: context.brief?.negatives ?? []
    },
    candidates,
    mode: "search",
    stateRoot: context.stateRoot,
    cycleId: context.cycleId,
    budget: context.budget,
    ...(context.dry === undefined ? {} : { dry: context.dry })
  });
  return {
    candidate: outcome.selected,
    verdict: outcome.verdict,
    skippedProviders: found.skippedProviders
  };
}

/**
 * DNESKAi's ladder, walked after the article exists.
 *
 * Curated scene first, because a hand-reviewed photograph of the day's concept is more
 * predictable than anything a live search returns; then the gated search; then the plate. The
 * concept comes from the desk's brief when it wrote a usable one and from the tag-derived query
 * otherwise, which is why both paths still earn their keep.
 */
export async function selectEditionHero(
  context: LadderContext & { subjectQuery: string },
  dependencies: LadderDependencies = {}
): Promise<HeroLadderResult> {
  const verdicts: GateVerdict[] = [];
  const scenePhoto = dependencies.scenePhoto ?? illustrativeScenePhoto;
  const conceptQuery = context.brief?.concept ?? context.subjectQuery;
  const scene = conceptQuery
    ? await scenePhoto({ subjectQuery: conceptQuery, seed: context.seed }).catch(() => null)
    : null;
  if (scene) return { candidate: scene, rung: "curated", verdicts, skippedProviders: [] };

  const searched = await gatedSearchRung(
    context,
    searchPhrasesFor(context.brief, context.subjectQuery),
    dependencies
  );
  if (searched.verdict) verdicts.push(searched.verdict);
  if (searched.candidate) {
    return {
      candidate: searched.candidate,
      rung: "search",
      verdicts,
      skippedProviders: searched.skippedProviders
    };
  }
  return { candidate: null, rung: "plate", verdicts, skippedProviders: searched.skippedProviders };
}

export interface ArticleLadderInput extends LadderContext {
  /** The subject refs, whose shape decides the route. Never sent to an archive. */
  subjectRefs: readonly string[];
  /** The person rung, resolved by the caller because it needs the fighter records on disk. */
  identityPhoto?: () => Promise<LicensedPhotoCandidate | null>;
  /** The query the event path falls back to when the desk wrote no usable brief. */
  fallbackQuery: string;
  personShaped: boolean;
  eventShaped: boolean;
}

/**
 * MMA Files' ladder. The route is decided by the ref's shape, and that has not changed.
 *
 * A person is resolved through their own Wikidata item or not at all: no search runs for them,
 * because a name is not an identity and the archives cannot tell two people with one name apart.
 * An event has no identity to confuse, so a search may run — and now it runs on the desk's
 * phrases, which are forbidden from containing the event's name, with the gate reading the
 * pictures afterwards.
 *
 * A ref of neither shape still gets nothing. An unclassifiable ref is not evidence that the
 * subject is not a person, and guessing wrong there costs somebody their likeness.
 */
export async function selectArticleHero(
  input: ArticleLadderInput,
  dependencies: LadderDependencies = {}
): Promise<HeroLadderResult> {
  const verdicts: GateVerdict[] = [];
  const sportPhoto = dependencies.sportPhoto ?? illustrativeSportPhoto;
  const seed = input.seed;

  if (input.personShaped) {
    const identity = await input.identityPhoto?.().catch(() => null) ?? null;
    if (identity) return { candidate: identity, rung: "entity-linked", verdicts, skippedProviders: [] };
    const curated = await sportPhoto({ seed }).catch(() => null);
    return curated
      ? { candidate: curated, rung: "curated", verdicts, skippedProviders: [] }
      : { candidate: null, rung: "plate", verdicts, skippedProviders: [] };
  }

  if (!input.eventShaped) {
    return { candidate: null, rung: "plate", verdicts, skippedProviders: [] };
  }

  const phrases = searchPhrasesFor(input.brief, input.fallbackQuery);
  // `candidatesNaming` only applies to the fallback query, which is built from the event's own
  // ref. The desk's phrases are forbidden from containing that name, so requiring the caption to
  // carry every word of it would refuse every candidate the brief was written to find.
  const usingFallback = (input.brief?.phrases.length ?? 0) === 0;
  const searched = await gatedSearchRung(
    input,
    phrases,
    dependencies,
    usingFallback && input.fallbackQuery
      ? (candidates) => candidatesNaming(candidates, input.fallbackQuery)
      : undefined
  );
  if (searched.verdict) verdicts.push(searched.verdict);
  if (searched.candidate) {
    return {
      candidate: searched.candidate,
      rung: "search",
      verdicts,
      skippedProviders: searched.skippedProviders
    };
  }
  // The licensed search found nothing that may run, so the curated sport photographs get their
  // turn. They are a scene rather than a person, so the risk that makes a name search unusable
  // for people does not arise: nothing about the subject is sent anywhere.
  const curated = await sportPhoto({ seed }).catch(() => null);
  return curated
    ? { candidate: curated, rung: "curated", verdicts, skippedProviders: searched.skippedProviders }
    : { candidate: null, rung: "plate", verdicts, skippedProviders: searched.skippedProviders };
}
