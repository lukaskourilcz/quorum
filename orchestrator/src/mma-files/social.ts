import type { ArticlePackage, SocialVariantPack } from "../contracts/mma-files.js";
import { SocialVariantPackSchema } from "../contracts/mma-files.js";
import { articleRef } from "./hash.js";

export const MMA_FILES_ASSIGNMENT_PROTOCOL = "state/ventures/mma-files/social/ASSIGNMENT.md";

export function buildSocialVariantPack(article: ArticlePackage): SocialVariantPack {
  if (article.status !== "published") throw new Error("Social variants require a finished bilingual article");
  const carousel = (locale: "en" | "cs", variant: "A" | "B") => ({
    template_id: "cover-cta",
    version: "1.0.0",
    content: {
      locale,
      variant,
      strings: {
        "cover-title": article.localizations[locale].title,
        "cover-dek": article.localizations[locale].dek,
        cta: locale === "cs" ? "Přečtěte si celý ozdrojovaný text" : "Read the full sourced story",
        destination: "mma-files.vercel.app"
      }
    }
  });
  return SocialVariantPackSchema.parse({
    schemaVersion: "social-variant/1",
    articleRef: articleRef(article),
    variants: [
      {
        id: "A",
        carousel: { en: carousel("en", "A"), cs: carousel("cs", "A") },
        captions: {
          en: {
            instagram: `${article.localizations.en.dek}\n\nRead the sourced story in MMA Files.`,
            threads: `${article.localizations.en.dek}\n\nRead it in MMA Files.`
          },
          cs: {
            instagram: `${article.localizations.cs.dek}\n\nPřečtěte si ozdrojovaný text v MMA Files.`,
            threads: `${article.localizations.cs.dek}\n\nCelý text najdete v MMA Files.`
          }
        },
        designAxes: {
          templateFamily: "cover-cta",
          colorScheme: "orange-dark",
          headlineFraming: "fact-first",
          captionTone: "plain"
        }
      },
      {
        id: "B",
        carousel: { en: carousel("en", "B"), cs: carousel("cs", "B") },
        captions: {
          en: {
            instagram: `${article.localizations.en.title}\n\n${article.localizations.en.dek}`,
            threads: `${article.localizations.en.title}\n\n${article.localizations.en.dek}`.slice(0, 500)
          },
          cs: {
            instagram: `${article.localizations.cs.title}\n\n${article.localizations.cs.dek}`,
            threads: `${article.localizations.cs.title}\n\n${article.localizations.cs.dek}`.slice(0, 500)
          }
        },
        designAxes: {
          templateFamily: "cover-cta",
          colorScheme: "paper-dark",
          headlineFraming: "question-or-tension",
          captionTone: "curious"
        }
      }
    ],
    assignmentProtocolRef: MMA_FILES_ASSIGNMENT_PROTOCOL,
    status: "draft"
  });
}
