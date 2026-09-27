import type { EditorialReview } from "../contracts/editorial-review.js";
import { illustrationRung, searchPhrasesFor, type HeroLadderResult, type LadderContext, type LadderDependencies } from "./ladder.js";
import { assessCandidates, GATE_FIT_THRESHOLD } from "./vision-gate.js";
import { discoverLicensedPhotos, materializeLicensedPhoto } from "./licensed.js";
import { heroAltCs } from "./alt.js";

export type EditorialHeroResult = HeroLadderResult & { reviewImages: EditorialReview["images"] };

/** Two separate, vision-approved free-provider photos and one budgeted fal illustration. */
export async function selectEditorialCandidates(context: LadderContext & { subjectQuery: string }, dependencies: LadderDependencies = {}): Promise<EditorialHeroResult> {
  const images: EditorialReview["images"] = [];
  const verdicts: HeroLadderResult["verdicts"] = [];
  const skippedProviders: HeroLadderResult["skippedProviders"] = [];
  const search = dependencies.search ?? ((input: { phrases: readonly string[] }) => discoverLicensedPhotos({
    queries: input.phrases, pexelsKey: process.env.PEXELS_API_KEY, pixabayKey: process.env.PIXABAY_API_KEY, maximum: 6
  }));
  const found = await search({ phrases: searchPhrasesFor(context.brief, context.subjectQuery) }).catch(() => ({ candidates: [], skippedProviders: [] }));
  skippedProviders.push(...found.skippedProviders);
  const gate = await (dependencies.gate ?? assessCandidates)({
    venture: context.venture, article: { ...context.article, negatives: context.brief?.negatives ?? [] },
    candidates: found.candidates.slice(0, 6), mode: "search", stateRoot: context.stateRoot,
    cycleId: context.cycleId, budget: context.budget, ...(context.dry === undefined ? {} : { dry: context.dry })
  });
  verdicts.push(gate.verdict);
  const seen = new Set<string>();
  const eligible = gate.verdict.candidates.filter(candidate => candidate.fit >= GATE_FIT_THRESHOLD && candidate.vetoes.length === 0)
    .sort((a, b) => b.fit - a.fit).flatMap(verdict => {
      const candidate = found.candidates.find(candidate => candidate.id === verdict.candidateId);
      if (!candidate || seen.has(candidate.sourceUrl)) return [];
      seen.add(candidate.sourceUrl);
      return [candidate];
    }).slice(0, 2);
  let first: HeroLadderResult["candidate"] = null;
  for (const [index, id] of (["photo-1", "photo-2"] as const).entries()) {
    const candidate = eligible[index];
    const image = candidate ? await materializeLicensedPhoto({
      candidate, venture: "caught-up", slug: `${context.illustrationSlug ?? context.seed}-${id}`,
      altCs: heroAltCs(candidate, candidate.title, context.article.titleCs)
    }).catch(() => null) : null;
    if (image && !first) first = candidate ?? null;
    images.push({ id, image, unavailableReason: image ? null : "No licensed photograph passed image review within the available budget." });
  }
  const generated = await illustrationRung({ ...context, illustrationSlug: `${context.illustrationSlug ?? context.seed}-fal` }, dependencies);
  if (generated.verdict) verdicts.push(generated.verdict);
  images.push({ id: "fal", image: generated.image, unavailableReason: generated.image ? null : "The fal illustration is unavailable: check image generation configuration, budget and image review." });
  return { candidate: first, ...(generated.image && !first ? { illustration: generated.image } : {}),
    rung: first ? "search" : generated.image ? "illustration" : "plate", verdicts, skippedProviders, reviewImages: images };
}

export function unavailableEditorialImages(): EditorialReview["images"] {
  return ["photo-1", "photo-2", "fal"].map(id => ({ id: id as "photo-1" | "photo-2" | "fal", image: null,
    unavailableReason: "Image candidates have not been generated for this article." }));
}
