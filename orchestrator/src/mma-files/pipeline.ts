import { ArticlePackageSchema, type ArticlePackage, type EditorialSlate } from "../contracts/mma-files.js";
import { articlePackageHash } from "./hash.js";
import { renderArticleHero, renderSocialVariants } from "./frame.js";
import { buildSocialVariantPack } from "./social.js";
import { loadStylebook, reviewArticle, stylebookPacket, validateStylebook, type CopyViolation } from "./style.js";
import { storeArticleMedia, storeArticlePackage, storeSocialVariantPack } from "./store.js";
import { deterministicArticleImage } from "../images/article-image.js";

type Localization = ArticlePackage["localizations"]["en"];
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
  }): Promise<Localization>;
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
    evidence: input.evidence
  });
  const cs = await input.gateway.localizeCzech({
    english: en,
    slate: input.slate,
    slot: input.slot,
    stylebook: stylebookPacket(stylebook, "cs"),
    evidence: input.evidence
  });
  const content = {
    schemaVersion: "article/1" as const,
    slug: input.slug,
    localizations: { en, cs },
    format: assignment.format,
    sources: input.evidence.sources,
    image: deterministicArticleImage({
      venture: "mma-files",
      slug: input.slug,
      title: en.title,
      altEn: `Editorial cover for ${en.title}`,
      altCs: `Redakční obrázek k článku ${cs.title}`
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
  const finalContent = { ...content, status: violations.length ? "blocked" as const : "published" as const };
  const article = ArticlePackageSchema.parse({ ...finalContent, packageHash: articlePackageHash(finalContent) });
  const stored = await storeArticlePackage(input.root, article);
  const socialPack = article.status === "published" && input.socialProductionEnabled !== false
    ? buildSocialVariantPack(article)
    : null;
  const socialPath = socialPack ? await storeSocialVariantPack(input.root, socialPack) : null;
  const mediaPaths = await storeArticleMedia(
    input.root,
    article,
    renderArticleHero(article),
    socialPack ? renderSocialVariants(socialPack, article) : []
  );
  return { article, violations, articlePath: stored.path, socialPath, mediaPaths, idempotent: stored.idempotent };
}
