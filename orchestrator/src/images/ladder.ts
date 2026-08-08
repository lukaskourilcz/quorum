import { createHash } from "node:crypto";
import { illustrativeScenePhoto } from "./illustrative-scenes.js";
import { illustrativeSportPhoto } from "./illustrative.js";
import {
  candidatesNaming,
  discoverLicensedPhotos,
  type LicensedImageSearchResult,
  type LicensedPhotoCandidate
} from "./licensed.js";
import {
  assessCandidates,
  type AssessCandidatesInput,
  type GateOutcome,
  type GateVerdict
} from "./vision-gate.js";
import { proposeCuratedScene } from "./scene-proposals.js";
import {
  ILLUSTRATION_USD_PER_IMAGE,
  defaultIllustrationRenderer,
  illustrationEnabled,
  illustrationImage,
  illustrationModel,
  illustrationPrompt,
  type IllustrationRenderer
} from "./illustration.js";
import { recordIllustrationSpend } from "./budget.js";
import type { ArticleImage } from "../contracts/autonomy.js";
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

export type HeroRung = "entity-linked" | "curated" | "search" | "illustration" | "plate";

export interface HeroLadderResult {
  candidate: LicensedPhotoCandidate | null;
  /** A rendered illustration, already in package shape. Set only on the illustration rung. */
  illustration?: ArticleImage;
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
  /** The article's slug, which is where a rendered illustration's asset paths come from. */
  illustrationSlug?: string;
  dry?: boolean;
}

export interface LadderDependencies {
  scenePhoto?: typeof illustrativeScenePhoto;
  sportPhoto?: typeof illustrativeSportPhoto;
  search?: (input: { phrases: readonly string[] }) => Promise<LicensedImageSearchResult>;
  /**
   * The gate, narrowed to the candidates a ladder rung actually hands it. A fake in a test is
   * one function; the real one is generic over anything with an id, a provider and a thumbnail.
   */
  gate?: (input: AssessCandidatesInput<LicensedPhotoCandidate>) => Promise<GateOutcome<LicensedPhotoCandidate>>;
  render?: IllustrationRenderer;
  illustrationEnabled?: () => boolean;
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
  // A photograph that scored highly with no vetoes is worth keeping past the article it ran
  // above. The proposal is a line in a file the owner reads; nothing promotes itself.
  if (outcome.selected) {
    const entry = outcome.verdict.candidates.find((item) => item.candidateId === outcome.selected?.id);
    if (entry) {
      await proposeCuratedScene({
        root: context.stateRoot,
        venture: context.venture,
        candidate: outcome.selected,
        verdict: entry
      }).catch(() => false);
    }
  }
  return {
    candidate: outcome.selected,
    verdict: outcome.verdict,
    skippedProviders: found.skippedProviders
  };
}

/**
 * How many curated files one article will pay to look at before it moves on.
 *
 * The rotation holds nine sport photographs and up to nine scenes, and each look is a gate call
 * against a two-cent article cap. Spending all of it here would leave nothing for the search
 * rung, which is the rung that needs the gate most: a curated file was reviewed by a person once
 * and a search result has been reviewed by nobody. Three refusals is enough to establish that
 * this rotation is not answering today.
 */
export const CURATED_GATE_ATTEMPTS = 3;

/**
 * The gate, wired for one curated file at a time, plus somewhere to keep what it said.
 *
 * A veto here is not a failure. It means a file somebody reviewed at 640px no longer shows what
 * the note beside it says — relicensed, replaced, re-cropped — and the rotation's next entry is
 * the right answer, exactly as it is for a file that will not fetch.
 */
function curatedAcceptor(
  context: LadderContext,
  dependencies: LadderDependencies,
  verdicts: GateVerdict[]
): (candidate: LicensedPhotoCandidate) => Promise<boolean> {
  const gate = dependencies.gate ?? assessCandidates;
  let looked = 0;
  return async (candidate) => {
    if (looked >= CURATED_GATE_ATTEMPTS) return false;
    looked += 1;
    const outcome = await gate({
      venture: context.venture,
      article: {
        titleCs: context.article.titleCs,
        dekCs: context.article.dekCs,
        negatives: context.brief?.negatives ?? []
      },
      candidates: [candidate],
      mode: "curated",
      stateRoot: context.stateRoot,
      cycleId: context.cycleId,
      budget: context.budget,
      ...(context.dry === undefined ? {} : { dry: context.dry })
    });
    verdicts.push(outcome.verdict);
    return outcome.selected !== null;
  };
}

/**
 * The identity rung's verdict, written down and acted on by nobody.
 *
 * The honesty law: an entity-linked photograph is used or the ladder descends. It is never
 * swapped for something that scored better, because "scored better" is a judgement about how a
 * picture looks and the identity rung is a statement about who is in it. What advisory mode buys
 * is a record — if the gate keeps flagging P18 files, that is worth knowing before it is worth
 * acting on.
 */
async function advise(
  context: LadderContext,
  dependencies: LadderDependencies,
  verdicts: GateVerdict[],
  candidate: LicensedPhotoCandidate
): Promise<void> {
  const gate = dependencies.gate ?? assessCandidates;
  const outcome = await gate({
    venture: context.venture,
    article: {
      titleCs: context.article.titleCs,
      dekCs: context.article.dekCs,
      negatives: context.brief?.negatives ?? []
    },
    candidates: [candidate],
    mode: "identity-advisory",
    stateRoot: context.stateRoot,
    cycleId: context.cycleId,
    budget: context.budget,
    ...(context.dry === undefined ? {} : { dry: context.dry })
  }).catch(() => null);
  if (outcome) verdicts.push(outcome.verdict);
}

/**
 * The illustration rung: rendered, gated, labelled, and skipped in every keyless environment.
 *
 * It sits between the licensed search and the plate because it is less certain than a photograph
 * of a real place and more useful than a panel of coloured bars. Nothing about it is presented as
 * photography — see `illustration.ts`, where the alt text and the licence block are built.
 *
 * The render is billed the moment it happens, before the gate is asked. An illustration the gate
 * refuses cost exactly what an accepted one cost, so the attempt burns: the day's two are two
 * renders, not two successes.
 */
async function illustrationRung(
  context: LadderContext,
  dependencies: LadderDependencies
): Promise<{ image: ArticleImage | null; verdict: GateVerdict | null }> {
  const enabled = dependencies.illustrationEnabled ?? illustrationEnabled;
  if (!enabled()) return { image: null, verdict: null };
  const brief = context.brief;
  if (!brief || brief.phrases.length === 0) return { image: null, verdict: null };
  if (context.budget.reserveGeneratedImage(ILLUSTRATION_USD_PER_IMAGE)) {
    return { image: null, verdict: null };
  }
  if (context.dry) return { image: null, verdict: null };

  const model = await illustrationModel().catch(() => null);
  if (!model) return { image: null, verdict: null };
  const prompt = illustrationPrompt(context.venture, brief);
  const render = dependencies.render ?? defaultIllustrationRenderer;
  const rendered = await render({ prompt, model, apiKey: process.env.FAL_KEY ?? "" }).catch(() => null);
  if (!rendered) return { image: null, verdict: null };

  // Billed here, before anything is judged, because the renderer has already charged for it.
  context.budget.record(ILLUSTRATION_USD_PER_IMAGE, "generated-image");
  await recordIllustrationSpend({
    stateRoot: context.stateRoot,
    cycleId: context.cycleId,
    ventureId: context.venture,
    model,
    usd: ILLUSTRATION_USD_PER_IMAGE,
    requestHash: createHash("sha256").update(`${context.cycleId}|${context.seed}|${prompt}`).digest("hex"),
    now: new Date()
  }).catch(() => undefined);

  const gate = dependencies.gate ?? assessCandidates;
  const outcome = await gate({
    venture: context.venture,
    article: {
      titleCs: context.article.titleCs,
      dekCs: context.article.dekCs,
      negatives: brief.negatives
    },
    // The gate reads bytes, not archives, so a rendered picture is handed to it the same way a
    // fixture is in a test: through the injected reader, with a candidate that exists only to
    // carry an id.
    candidates: [{
      id: `illustration:${context.seed}`,
      provider: "boardlessai",
      thumbnailUrl: `boardlessai:illustration/${context.seed}`
    } as unknown as LicensedPhotoCandidate],
    mode: "generated",
    stateRoot: context.stateRoot,
    cycleId: context.cycleId,
    budget: context.budget,
    fetchBytes: async () => rendered.bytes
  }).catch(() => null);
  if (!outcome?.selected) return { image: null, verdict: outcome?.verdict ?? null };

  const sceneCs = outcome.verdict.candidates[0]?.sceneCs?.trim();
  const image = await illustrationImage({
    bytes: rendered.bytes,
    venture: context.venture,
    slug: context.illustrationSlug ?? context.seed,
    sceneCs: sceneCs || brief.phrases[0] || "abstraktni ilustrace"
  }).catch(() => null);
  return { image, verdict: outcome.verdict };
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
    ? await scenePhoto({
        subjectQuery: conceptQuery,
        seed: context.seed,
        accept: curatedAcceptor(context, dependencies, verdicts)
      }).catch(() => null)
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
  const rendered = await illustrationRung(context, dependencies);
  if (rendered.verdict) verdicts.push(rendered.verdict);
  if (rendered.image) {
    return {
      candidate: null,
      illustration: rendered.image,
      rung: "illustration",
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
    if (identity) {
      await advise(input, dependencies, verdicts, identity);
      return { candidate: identity, rung: "entity-linked", verdicts, skippedProviders: [] };
    }
    const curated = await sportPhoto({
      seed,
      accept: curatedAcceptor(input, dependencies, verdicts)
    }).catch(() => null);
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
  const curated = await sportPhoto({
    seed,
    accept: curatedAcceptor(input, dependencies, verdicts)
  }).catch(() => null);
  if (curated) {
    return { candidate: curated, rung: "curated", verdicts, skippedProviders: searched.skippedProviders };
  }
  const rendered = await illustrationRung(input, dependencies);
  if (rendered.verdict) verdicts.push(rendered.verdict);
  if (rendered.image) {
    return {
      candidate: null,
      illustration: rendered.image,
      rung: "illustration",
      verdicts,
      skippedProviders: searched.skippedProviders
    };
  }
  return { candidate: null, rung: "plate", verdicts, skippedProviders: searched.skippedProviders };
}
