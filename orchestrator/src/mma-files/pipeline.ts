import { ArticlePackageSchema, type ArticlePackage, type EditorialSlate } from "../contracts/mma-files.js";
import { articlePackageHash } from "./hash.js";
import { renderSocialVariants } from "./frame.js";
import { buildSocialVariantPack } from "./social.js";
import { loadStylebook, reviewArticle, stripSourceMarkers, stylebookPacket, validateStylebook, type CopyViolation } from "./style.js";
import { storeArticleMedia, storeArticlePackage, storeSocialVariantPack } from "./store.js";
import { deterministicArticleImage } from "../images/article-image.js";
import { materializeLicensedPhoto, type LicensedPhotoCandidate } from "../images/licensed.js";
import { composeMmaFilesSocialQueue } from "../social/venture-packs.js";

// Czech is the locale that is always there, so it is the one the shape is taken from. Reading
// it off "en" made the alias optional the moment English became optional.
type Localization = ArticlePackage["localizations"]["cs"];
type CzechDraft = Localization & { imageCandidateIndex?: number };
type ArticleSource = ArticlePackage["sources"][number];

/**
 * The alt text a photograph ships with, and the one place the writer can be overruled about it.
 *
 * The writer is shown captions and never a pixel, so an alt it produces is a guess about a picture
 * it has not seen. Two kinds of candidate know better than it does, and for opposite reasons.
 *
 * A candidate carrying `altCs` describes itself: an entity-linked photograph arrives with alt text
 * built from the Commons file's own description, written by somebody who was looking at it. Asked
 * anyway, the writer invents — the 4 August article captioned a man in a suit at a lectern
 * "Gustavo Lopez v zápasovém postoji", in a fighting stance.
 *
 * An illustrative photograph is the stricter case, and the reason this is a function rather than a
 * chain of `??`. It shows a cage or a hall and nobody the article is about, and the writer knows
 * exactly whose article it is writing; an alt it produces for a stock cage photograph is one
 * sentence away from "Valentina Shevchenko in the UFC cage", which is the lie the whole ladder
 * exists to prevent. So for such a candidate the writer's text is not preferred against, it is
 * unreachable — there is no branch here that can return it — and the last resort is a sentence
 * that still claims nothing rather than the caller's subject-derived fallback.
 */
export function heroAltCs(
  candidate: Pick<LicensedPhotoCandidate, "altCs" | "illustrative">,
  writerAlt: string | undefined,
  fallback: string
): string {
  if (candidate.illustrative) return candidate.altCs ?? "Ilustrační fotografie ze zápasů MMA. Nejde o snímek osoby, o níž článek pojednává.";
  return candidate.altCs ?? writerAlt ?? fallback;
}

export interface ArticleEvidencePacket {
  sources: ArticleSource[];
  fighterRefs: string[];
  eventRef?: string;
  modelVersion?: string;
  heroSpec: ArticlePackage["heroSpec"];
  evidenceText: string;
}

export interface MmaFilesEditorialGateway {
  /** The desk publishes in Czech. One call writes the article; nothing translates it after. */
  writeCzech(input: {
    slate: EditorialSlate;
    slot: "am" | "pm";
    stylebook: string;
    evidence: ArticleEvidencePacket;
    imageCandidates: readonly LicensedPhotoCandidate[];
  }): Promise<CzechDraft>;
}

export interface ArticleProductionResult {
  article: ArticlePackage;
  violations: CopyViolation[];
  articlePath: string;
  socialPath: string | null;
  mediaPaths: string[];
  idempotent: boolean;
  supersededHash?: string;
}

export async function produceMmaFilesArticle(input: {
  root: string;
  slate: EditorialSlate;
  slot: "am" | "pm";
  slug: string;
  publishAt: Date;
  mode: "data-only" | "live-analysis";
  evidence: ArticleEvidencePacket;
  gateway: MmaFilesEditorialGateway;
  stylebookRaw?: string;
  socialProductionEnabled?: boolean;
  imageCandidates?: readonly LicensedPhotoCandidate[];
  publicRepoRoot?: string;
  socialDestinationBaseUrl?: string;
}): Promise<ArticleProductionResult> {
  const assignment = input.slate.slots.find((slot) => slot.slot === input.slot);
  if (!assignment) throw new Error(`Editorial slate has no ${input.slot} slot`);
  if (assignment.status === "killed") throw new Error(`Editorial slot ${input.slot} was killed: ${assignment.killedReason}`);
  const stylebook = input.stylebookRaw ?? await loadStylebook();
  const stylebookProblems = validateStylebook(stylebook);
  if (stylebookProblems.length) throw new Error(`STYLEBOOK.md failed validation: ${stylebookProblems.join(", ")}`);
  // One Czech call, where there used to be an English one and a translation of it. The desk
  // publishes in Czech only, so the English draft was work paid for and thrown away: 51% of
  // the article cost by the ledger.
  //
  // imageCandidates and imageCandidateIndex have to travel with this call. They only ever
  // reached the English writer, and the Czech one's index was discarded — so a Czech writer
  // that is not handed the candidates picks no photo, every article falls back to the
  // deterministic SVG, image.origin flips to "svg", and that in turn short-circuits the
  // attribution check in the release verifier to a pass. Nothing would error; the photos
  // would just stop, quietly, and the proof would still be green.
  const cs = await input.gateway.writeCzech({
    slate: input.slate,
    slot: input.slot,
    stylebook: stylebookPacket(stylebook, "cs"),
    evidence: input.evidence,
    imageCandidates: input.imageCandidates ?? []
  });
  // The rest-destructure stays. openObject is z.looseObject, so a surviving imageCandidateIndex
  // would be persisted into the localization and folded into the package hash, changing the
  // shape of every future article away from the sealed { title, dek, bodyMDX }.
  const { imageCandidateIndex, imageAlt: csImageAlt, ...csDraft } = cs;
  // Markers come out here, before anything reads the copy, and out of all three fields a reader
  // sees rather than the body alone. Nothing asks the writer for one any more and no gate wants
  // to see one, so this is a normalizer against habit rather than a step the review depends on.
  // Stripping used to happen after `reviewArticle`, which meant the gate judged one body and the
  // reader got another; every rule below now runs on the exact text that is hashed, stored,
  // rendered into the deck and delivered.
  const csLocalization = {
    ...csDraft,
    title: stripSourceMarkers(csDraft.title),
    dek: stripSourceMarkers(csDraft.dek),
    bodyMDX: stripSourceMarkers(csDraft.bodyMDX)
  };
  const candidate = imageCandidateIndex === undefined
    ? undefined
    : input.imageCandidates?.[Math.min(imageCandidateIndex, (input.imageCandidates?.length ?? 1) - 1)];
  let articleImage;
  if (candidate) {
    try {
      articleImage = await materializeLicensedPhoto({
        candidate,
        venture: "mma-files",
        slug: input.slug,
        altCs: heroAltCs(candidate, csImageAlt, `Redakční obrázek k článku ${csLocalization.title}`)
      });
    } catch {
      articleImage = undefined;
    }
  }
  const content = {
    schemaVersion: "article/1" as const,
    slug: input.slug,
    localizations: { cs: csLocalization },
    format: assignment.format,
    sources: input.evidence.sources,
    image: articleImage ?? deterministicArticleImage({
      venture: "mma-files",
      slug: input.slug,
      title: csLocalization.title,
      date: input.publishAt.toISOString().slice(0, 10),
      tags: [assignment.format, ...input.evidence.fighterRefs.map((reference) => reference.split(":").at(-1) ?? "")].filter(Boolean)
    }),
    heroSpec: input.evidence.heroSpec,
    fighterRefs: input.evidence.fighterRefs,
    ...(input.evidence.eventRef ? { eventRef: input.evidence.eventRef } : {}),
    ...(input.evidence.modelVersion ? { modelVersion: input.evidence.modelVersion } : {}),
    publishAt: input.publishAt.toISOString(),
    slot: input.slot,
    status: "draft" as const
  };
  const draft = ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content) });
  const violations = reviewArticle(draft, { mode: input.mode });
  // Only the status changes between the reviewed draft and the stored package, so it is the
  // only reason the content is hashed a second time.
  const finalContent = {
    ...content,
    status: violations.length ? "blocked" as const : "published" as const
  };
  const article = ArticlePackageSchema.parse({ ...finalContent, packageHash: articlePackageHash(finalContent) });
  const stored = await storeArticlePackage(input.root, article);
  const socialPack = article.status === "published" && input.socialProductionEnabled !== false
    ? buildSocialVariantPack(article)
    : null;
  const socialPath = socialPack ? await storeSocialVariantPack(input.root, socialPack) : null;
  const mediaPaths = await storeArticleMedia(
    input.root,
    article,
    socialPack ? renderSocialVariants(socialPack, article) : []
  );
  const queuePaths = socialPack && input.publicRepoRoot && input.socialDestinationBaseUrl
    ? await composeMmaFilesSocialQueue({ stateRoot: input.root, repoRoot: input.publicRepoRoot, article, pack: socialPack, destinationBaseUrl: input.socialDestinationBaseUrl, now: input.publishAt })
    : [];
  return { article, violations, articlePath: stored.path, socialPath, mediaPaths: [...mediaPaths, ...queuePaths], idempotent: stored.idempotent, ...(stored.supersededHash ? { supersededHash: stored.supersededHash } : {}) };
}
