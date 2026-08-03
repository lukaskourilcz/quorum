import { ArticlePackageSchema, type ArticlePackage, type EditorialSlate } from "../contracts/mma-files.js";
import { articlePackageHash } from "./hash.js";
import { renderSocialVariants } from "./frame.js";
import { buildSocialVariantPack } from "./social.js";
import { loadStylebook, reviewArticle, stripSourceMarkers, stylebookPacket, validateStylebook, type CopyViolation } from "./style.js";
import { storeArticleMedia, storeArticlePackage, storeSocialVariantPack } from "./store.js";
import { deterministicArticleImage } from "../images/article-image.js";
import { materializeLicensedPhoto, type LicensedPhotoCandidate } from "../images/licensed.js";
import { composeMmaFilesSocialQueue } from "../social/venture-packs.js";

type Localization = ArticlePackage["localizations"]["en"];
type EnglishDraft = Localization & { imageCandidateIndex?: number };
type ArticleSource = ArticlePackage["sources"][number];

export interface ArticleEvidencePacket {
  sources: ArticleSource[];
  fighterRefs: string[];
  eventRef?: string;
  modelVersion?: string;
  heroSpec: ArticlePackage["heroSpec"];
  evidenceText: string;
}

export interface MmaFilesEditorialGateway {
  writeEnglish(input: {
    slate: EditorialSlate;
    slot: "am" | "pm";
    stylebook: string;
    evidence: ArticleEvidencePacket;
    imageCandidates: readonly LicensedPhotoCandidate[];
  }): Promise<EnglishDraft>;
  localizeCzech(input: {
    english: Localization;
    slate: EditorialSlate;
    slot: "am" | "pm";
    stylebook: string;
    evidence: ArticleEvidencePacket;
  }): Promise<Localization>;
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
  const en = await input.gateway.writeEnglish({
    slate: input.slate,
    slot: input.slot,
    stylebook: stylebookPacket(stylebook, "en"),
    evidence: input.evidence,
    imageCandidates: input.imageCandidates ?? []
  });
  const { imageCandidateIndex, imageAlt: enImageAlt, ...enLocalization } = en;
  const localizedCzech = await input.gateway.localizeCzech({
    english: enLocalization,
    slate: input.slate,
    slot: input.slot,
    stylebook: stylebookPacket(stylebook, "cs"),
    evidence: input.evidence
  });
  const { imageAlt: csImageAlt, imageCandidateIndex: _ignoredCzechSelection, ...csLocalization } = localizedCzech;
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
        altEn: enImageAlt ?? `Editorial cover for ${enLocalization.title}`,
        altCs: csImageAlt ?? `Redakční obrázek k článku ${csLocalization.title}`
      });
    } catch {
      articleImage = undefined;
    }
  }
  const content = {
    schemaVersion: "article/1" as const,
    slug: input.slug,
    localizations: { en: enLocalization, cs: csLocalization },
    format: assignment.format,
    sources: input.evidence.sources,
    image: articleImage ?? deterministicArticleImage({
      venture: "mma-files",
      slug: input.slug,
      title: enLocalization.title,
      altEn: `Editorial cover for ${enLocalization.title}`,
      altCs: `Redakční obrázek k článku ${csLocalization.title}`,
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
  // The gate has now checked that every figure carries a marker, so the markers have done
  // their work and come out before the package is hashed. They are repository paths, not
  // citations a reader can follow, and the first published article printed one mid-sentence
  // in both languages. The sources array still carries every path, so nothing is lost.
  const finalContent = {
    ...content,
    localizations: {
      en: { ...content.localizations.en, bodyMDX: stripSourceMarkers(content.localizations.en.bodyMDX) },
      cs: { ...content.localizations.cs, bodyMDX: stripSourceMarkers(content.localizations.cs.bodyMDX) }
    },
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
