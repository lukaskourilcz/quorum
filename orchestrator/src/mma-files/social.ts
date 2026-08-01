import type { ArticlePackage, SocialVariantPack } from "../contracts/mma-files.js";
import { SocialVariantPackSchema } from "../contracts/mma-files.js";
import { articleRef } from "./hash.js";

export const MMA_FILES_ASSIGNMENT_PROTOCOL = "state/ventures/mma-files/social/ASSIGNMENT.md";

export function buildSocialVariantPack(article: ArticlePackage): SocialVariantPack {
  if (article.status !== "published") throw new Error("Social variants require a finished bilingual article");
  return SocialVariantPackSchema.parse({
    schemaVersion: "social-variant/1",
    articleRef: articleRef(article),
    variants: [
      {
        id: "A",
        carouselSpec: {
          template: "stat-led",
          bindings: {
            enHeadline: article.localizations.en.title,
            csHeadline: article.localizations.cs.title,
            format: article.format
          }
        },
        captions: {
          en: `${article.localizations.en.dek}\n\nRead the sourced story in MMA Files.`,
          cs: `${article.localizations.cs.dek}\n\nPřečtěte si ozdrojovaný text v MMA Files.`
        },
        designAxes: {
          templateFamily: "stat-led",
          colorScheme: "orange-dark",
          headlineFraming: "fact-first",
          captionTone: "plain"
        }
      },
      {
        id: "B",
        carouselSpec: {
          template: "question-led",
          bindings: {
            enHeadline: article.localizations.en.title,
            csHeadline: article.localizations.cs.title,
            format: article.format
          }
        },
        captions: {
          en: `${article.localizations.en.title}\n\n${article.localizations.en.dek}`,
          cs: `${article.localizations.cs.title}\n\n${article.localizations.cs.dek}`
        },
        designAxes: {
          templateFamily: "question-led",
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
