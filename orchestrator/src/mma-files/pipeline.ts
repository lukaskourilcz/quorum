import { ArticlePackageSchema, type ArticlePackage, type EditorialSlate } from "../contracts/mma-files.js";
import { articlePackageHash } from "./hash.js";
import { effectiveRecipe } from "../social/deck-style.js";
import { renderSocialVariants } from "./frame.js";
import { buildSocialVariantPack } from "./social.js";
import { loadStylebook, reviewArticle, stripSourceMarkers, stylebookPacket, validateStylebook, type CopyViolation } from "./style.js";
import { storeArticleMedia, storeArticlePackage, storeSocialVariantPack } from "./store.js";
import { deterministicArticleImage } from "../images/article-image.js";
import { materializeLicensedPhoto } from "../images/licensed.js";
import { checkVisualBrief, type VisualBrief } from "../images/visual-brief.js";
import type { HeroLadderResult } from "../images/ladder.js";
import { composeMmaFilesSocialQueue } from "../social/venture-packs.js";

// Czech is the locale that is always there, so it is the one the shape is taken from. Reading
// it off "en" made the alias optional the moment English became optional.
type Localization = ArticlePackage["localizations"]["cs"];
type CzechDraft = Localization & {
  imageSearchPhrases?: string[];
  visualConcept?: string;
  imageNegatives?: string[];
};
type ArticleSource = ArticlePackage["sources"][number];

import { heroAltCs } from "../images/alt.js";

// Re-exported: this module was heroAltCs's home before the edition desk needed the same rule,
// and every existing importer names it here.
export { heroAltCs };

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
  /** What the desk asked the picture desk for, once it survived validation. */
  visualBrief?: VisualBrief;
  /** The ladder's whole trace, for the caller to record beside the package. */
  imageSelection?: HeroLadderResult;
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
  /**
   * The image ladder, walked after the article exists.
   *
   * It used to run before this function was called, and the candidates travelled into the
   * writer's packet so the writer could pick one by index — from captions, having seen no
   * pixels. Both halves of that are gone. The caller still owns the network, the fighter
   * records and the money; what it is handed here is the desk's own brief and the article's
   * own words for the gate to judge against.
   */
  selectHero?: (input: {
    brief: VisualBrief | null;
    article: { titleCs: string; dekCs: string };
  }) => Promise<HeroLadderResult>;
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
  // No candidates travel with this call any more. They used to, so the writer could name one by
  // index from its caption; what it produced was a pick nobody had looked at and an alt text
  // invented for a picture it had never seen. The writer now writes the article and briefs the
  // picture desk, and the choosing happens below, after the words exist.
  const cs = await input.gateway.writeCzech({
    slate: input.slate,
    slot: input.slot,
    stylebook: stylebookPacket(stylebook, "cs"),
    evidence: input.evidence
  });
  // The rest-destructure stays, and the brief fields are what it now catches. openObject is
  // z.looseObject, so a field left in would be persisted into the localization and folded into
  // the package hash, changing the shape of every future article away from the sealed
  // { title, dek, bodyMDX }. The brief is the picture desk's, not the reader's.
  const {
    imageAlt: csImageAlt,
    imageSearchPhrases,
    visualConcept,
    imageNegatives,
    ...csDraft
  } = cs;
  // Checked against the article's own subject, never trusted. A phrase carrying a fighter's name
  // would turn the licensed search back into the name search that put a government official
  // above an article about a bantamweight.
  const visualBrief = checkVisualBrief({
    phrases: imageSearchPhrases,
    concept: visualConcept,
    negatives: imageNegatives,
    nameSources: [...input.evidence.fighterRefs, ...(input.evidence.eventRef ? [input.evidence.eventRef] : [])]
  }).brief;
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
    ...(csDraft.altHeadline ? { altHeadline: stripSourceMarkers(csDraft.altHeadline) } : {}),
    bodyMDX: stripSourceMarkers(csDraft.bodyMDX)
  };
  const chosen = await input.selectHero?.({
    brief: visualBrief,
    article: { titleCs: csLocalization.title, dekCs: csLocalization.dek }
  }).catch(() => null) ?? null;
  const candidate = chosen?.candidate ?? undefined;
  // A rendered illustration arrives already in package shape: there is no archive to fetch it
  // from and no licence to read, because the company made it and says so.
  let articleImage = chosen?.illustration;
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
    ? buildSocialVariantPack(article, await effectiveRecipe({
        root: input.root,
        venture: "mma-files",
        slug: article.slug,
        date: article.publishAt.slice(0, 10),
        hasHero: Boolean(article.image?.hero_bytes_base64)
      }))
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
  return { article, violations, articlePath: stored.path, socialPath, mediaPaths: [...mediaPaths, ...queuePaths], idempotent: stored.idempotent, ...(stored.supersededHash ? { supersededHash: stored.supersededHash } : {}), ...(visualBrief ? { visualBrief } : {}), ...(chosen ? { imageSelection: chosen } : {}) };
}
