import type { ArticlePackage, SocialVariantPack } from "../contracts/mma-files.js";
import { SocialVariantPackSchema } from "../contracts/mma-files.js";
import { articleRef } from "./hash.js";

export const MMA_FILES_ASSIGNMENT_PROTOCOL = "state/ventures/mma-files/social/ASSIGNMENT.md";

export function buildSocialVariantPack(article: ArticlePackage): SocialVariantPack {
  if (article.status !== "published") throw new Error("Social variants require a finished article");
  const carousel = (locale: "en" | "cs", variant: "A" | "B") => ({
    template_id: "cover-cta",
    version: "1.0.0",
    content: {
      locale,
      variant,
      strings: {
        "cover-title": article.localizations[locale]!.title,
        "cover-dek": article.localizations[locale]!.dek,
        cta: locale === "cs" ? "Přečtěte si celý ozdrojovaný text" : "Read the full sourced story",
        destination: "mma-files.vercel.app"
      }
    }
  });
  // Only the locales the article was written in. A carousel and caption for a locale that does
  // not exist would be built from undefined, and a queue item carries its destination to the
  // platform: once /en goes, a published post would link a page that is not there, and a post
  // cannot be edited back.
  const english = article.localizations.en;
  const perLocale = <T,>(build: (locale: "en" | "cs") => T) => ({
    ...(english ? { en: build("en") } : {}),
    cs: build("cs")
  });
  return SocialVariantPackSchema.parse({
    schemaVersion: "social-variant/1",
    articleRef: articleRef(article),
    variants: [
      {
        id: "A",
        carousel: perLocale((locale) => carousel(locale, "A")),
        captions: perLocale((locale) => locale === "cs"
          ? {
              instagram: `${article.localizations.cs.dek}\n\nPřečtěte si ozdrojovaný text v MMA Files.`,
              threads: `${article.localizations.cs.dek}\n\nCelý text najdete v MMA Files.`
            }
          : {
              instagram: `${english!.dek}\n\nRead the sourced story in MMA Files.`,
              threads: `${english!.dek}\n\nRead it in MMA Files.`
            }),
        designAxes: {
          templateFamily: "cover-cta",
          colorScheme: "orange-dark",
          headlineFraming: "fact-first",
          captionTone: "plain"
        }
      },
      {
        id: "B",
        carousel: perLocale((locale) => carousel(locale, "B")),
        captions: perLocale((locale) => locale === "cs"
          ? {
              instagram: `${article.localizations.cs.title}\n\n${article.localizations.cs.dek}`,
              threads: `${article.localizations.cs.title}\n\n${article.localizations.cs.dek}`.slice(0, 500)
            }
          : {
              instagram: `${english!.title}\n\n${english!.dek}`,
              threads: `${english!.title}\n\n${english!.dek}`.slice(0, 500)
            }),
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
