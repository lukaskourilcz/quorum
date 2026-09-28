import type { EditorialReview } from "../contracts/editorial-review.js";
import { illustrationRung, searchPhrasesFor, type HeroLadderResult, type LadderContext, type LadderDependencies } from "./ladder.js";
import { assessCandidates, GATE_FIT_THRESHOLD } from "./vision-gate.js";
import { discoverLicensedPhotos, materializeLicensedPhoto } from "./licensed.js";
import { heroAltCs } from "./alt.js";

export type EditorialHeroResult = HeroLadderResult & { reviewImages: EditorialReview["images"] };

/** Four distinct reviewed options: up to three licensed photos, with budgeted illustrations filling the remaining slots. */
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
    }).slice(0, 3);
  let first: HeroLadderResult["candidate"] = null;
  let firstIllustration: HeroLadderResult["illustration"];
  const seenBytes = new Set<string>();
  const compositions = ["wide, asymmetrical composition", "close-up detail with strong negative space", "overhead composition with separate objects", "layered geometric editorial composition"];
  for (const [index, id] of (["candidate-1", "candidate-2", "candidate-3", "candidate-4"] as const).entries()) {
    const candidate = eligible[index];
    let image = candidate ? await materializeLicensedPhoto({
      candidate, venture: "caught-up", slug: `${context.illustrationSlug ?? context.seed}-${id}`,
      altCs: heroAltCs(candidate, candidate.title, context.article.titleCs)
    }).catch(() => null) : null;
    if (image && seenBytes.has(image.hero_bytes_base64)) image = null;
    if (image && !first) first = candidate ?? null;
    if (!image) {
      const brief = context.brief ?? { phrases: [context.subjectQuery], concept: null, negatives: [] };
      const generated = await illustrationRung({ ...context, seed: `${context.seed}-${id}`,
        brief: { ...brief, phrases: [...brief.phrases.slice(0, 2), compositions[index]!] },
        illustrationSlug: `${context.illustrationSlug ?? context.seed}-${id}` }, dependencies);
      if (generated.verdict) verdicts.push(generated.verdict);
      image = generated.image;
      if (image && seenBytes.has(image.hero_bytes_base64)) image = null;
      if (image && !firstIllustration) firstIllustration = image;
    }
    if (image) seenBytes.add(image.hero_bytes_base64);
    images.push({ id, image, unavailableReason: image ? null : "No distinct image passed review within the available image budget. Check provider configuration and the image run report." });
  }
  return { candidate: first, ...(!first && firstIllustration ? { illustration: firstIllustration } : {}),
    rung: first ? "search" : firstIllustration ? "illustration" : "plate", verdicts, skippedProviders, reviewImages: images };
}

export function unavailableEditorialImages(): EditorialReview["images"] {
  return (["candidate-1", "candidate-2", "candidate-3", "candidate-4"] as const).map(id => ({ id, image: null,
    unavailableReason: "Image candidates have not been generated for this article." }));
}
