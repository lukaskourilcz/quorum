import { readFile } from "node:fs/promises";
import path from "node:path";
import { liveTemplateByReference, readLibrary, renderCarouselSlideSvg, type Hook } from "@boardlessai/carousel-studio";
import { beforeAll, describe, expect, it } from "vitest";
import { hookLineFor } from "../src/studio/hook-brain.js";
import { fencedBlocks, QuestionBankSnapshotSchema, type NormalizedQuestion } from "../src/ventures/marketingshark/bank.js";
import { brandLocales, loadMarketingSharkConfig, type Brand } from "../src/ventures/marketingshark/config.js";
import { runFitGate } from "../src/ventures/marketingshark/gates.js";
import { ChumOutput, SLIDE_ROLES, type CarouselCopy } from "../src/ventures/marketingshark/package.js";
import {
  brandTokensFor,
  codeOwnedSlotsFit,
  correctLetter,
  liveVersionOf,
  MARKETINGSHARK_FORMAT,
  renderCarousel,
  slotBudget,
  templateIdFor
} from "../src/ventures/marketingshark/render.js";
import { fixtureChumOutput, topicLabel } from "../src/ventures/marketingshark/run.js";
import { repoRoot } from "../src/paths.js";

// quorum#556, step 4: the regression that would have caught 16 to 24 September 2026, when every
// devShark package died at render with "slides were clipped to fit". It takes the longest question
// of every category the room can be handed, fills every slot the writer owns to the limit the
// packet states, renders every language the brand writes through its live template map, and
// requires that nothing is clipped. A template, font or template-map change that makes the packet's
// promise false fails here, for $0, instead of in the 07:00 room after a paid call.
//
// devShark writes English only since quorum#568. The same checks run for a bilingual devShark as
// well, because the Czech path stays available to a brand that names it and must keep its promise.

const LOCALES = ["cs", "en"] as const;
type Locale = (typeof LOCALES)[number];

let brand: Brand;
let shipped: Brand;
let questions: NormalizedQuestion[];
let hooks: readonly Hook[];

beforeAll(async () => {
  shipped = (await loadMarketingSharkConfig()).brands.find((candidate) => candidate.id === "devshark")!;
  brand = shipped;
  const snapshot = QuestionBankSnapshotSchema.parse(
    JSON.parse(await readFile(path.join(repoRoot, brand.questionBank.snapshotPath), "utf8"))
  );
  questions = snapshot.questions;
  hooks = (await readLibrary("quiz")).hooks;
});

const inLocale = (question: NormalizedQuestion, locale: Locale) => ({
  question: locale === "cs" && question.cs?.question ? question.cs.question : question.en.question,
  options: locale === "cs" && question.cs?.options ? question.cs.options : question.en.options,
  explanation: locale === "cs" && question.cs?.explanation ? question.cs.explanation : question.en.explanation
});

/** What slide 2 carries from the bank in its longer language: the question, its code, its options. */
function contextLength(question: NormalizedQuestion): number {
  return Math.max(...LOCALES.map((locale) => {
    const own = inLocale(question, locale);
    return `${question.en.introduction}\n${own.question}\n${own.options.join("\n")}`.length;
  }));
}

/** The longest question of each category among the ones selection can return. */
function longestSelectablePerCategory(): Map<string, NormalizedQuestion> {
  const longest = new Map<string, NormalizedQuestion>();
  for (const question of questions) {
    // planBrandDay offers only these; a question outside them never reaches a paid call.
    if (!codeOwnedSlotsFit(brand, question)) continue;
    const current = longest.get(question.category);
    if (!current || contextLength(question) > contextLength(current)) longest.set(question.category, question);
  }
  return longest;
}

/** As many whole words of `source` as `maxChars` allows: the longest copy the packet permits. */
function upTo(source: string, maxChars: number): string {
  let kept = "";
  for (const word of source.split(/\s+/u).filter(Boolean)) {
    const next = kept ? `${kept} ${word}` : word;
    if (next.length > maxChars) break;
    kept = next;
  }
  return kept;
}

const prose = (value: string): string => value.replace(/```[\s\S]*?```/gu, " ").replace(/\s+/gu, " ").trim();

/** The longest line the quiz library can put on slide 1 for this topic, in one language. */
function longestHookLine(question: NormalizedQuestion, locale: Locale): string {
  return hooks
    .map((hook) => hookLineFor({ hook, vertical: brand.tone, language: locale, topic: topicLabel(question.category) }) ?? "")
    .reduce((longest, line) => (line.length > longest.length ? line : longest), "");
}

/**
 * A writer's reply at the edge of every limit the packet states, in the question's own words.
 *
 * Each slot the writer fills is cut from the question's text and explanation to the template's own
 * `maxChars`, so the copy carries the category's real vocabulary -- its identifiers and long
 * compounds -- at the most characters the packet allows. Code fills the rest: the hook from the
 * library, the context slide's code and options from the bank, the reveal's letter, the footer.
 */
function replyAtTheLimits(question: NormalizedQuestion): ChumOutput {
  const slides = (locale: Locale) => {
    const own = inLocale(question, locale);
    // Repeated so that even the shortest question in the bank yields enough words for every slot.
    const words = prose(`${own.explanation} ${own.question} ${own.options.join(" ")}`);
    const pool = `${words} ${words} ${words}`;
    const context = templateIdFor("context", brand, question);
    const code = fencedBlocks(`${question.en.introduction}\n${question.en.question}`).join("\n\n");
    return [
      { role: "hook" as const, headline: longestHookLine(question, locale), alt: "Slide 1" },
      {
        role: "context" as const,
        headline: upTo(`${prose(own.question)} ${pool}`, slotBudget(context, "question-line").maxChars),
        ...(code ? { body: code } : {}),
        alt: "Slide 2"
      },
      {
        role: "reveal" as const,
        headline: correctLetter(question),
        body: upTo(`${own.options[question.correctIndex]} ${pool}`, slotBudget("stat-highlight", "stat-label").maxChars),
        alt: "Slide 3"
      },
      {
        role: "why" as const,
        headline: upTo(`${topicLabel(question.category)} ${pool}`, slotBudget("quote-card", "attribution").maxChars),
        body: upTo(pool, slotBudget("quote-card", "quote").maxChars),
        alt: "Slide 4"
      },
      { role: "footer" as const, headline: brand.slide5[locale], alt: "Slide 5" }
    ];
  };
  return ChumOutput.parse({
    carousels: { cs: { slides: slides("cs") }, en: { slides: slides("en") } },
    descriptions: {
      instagram: { cs: "Otázka dne.", en: "Question of the day." },
      threads: { cs: "Otázka dne.", en: "Question of the day." },
      linkedin: { en: "One question for working developers." }
    },
    hashtags: {
      instagram: { cs: brand.hashtags.instagram.cs, en: brand.hashtags.instagram.en },
      threads: { cs: [brand.hashtags.threadsTopic.cs], en: [brand.hashtags.threadsTopic.en] },
      linkedin: { en: [] }
    }
  });
}

function copyOf(output: ChumOutput, locale: Locale): CarouselCopy {
  return {
    slides: output.carousels[locale]!.slides.map((slide, index) => ({
      role: SLIDE_ROLES[index]!,
      templateId: "",
      headline: slide.headline,
      ...(slide.body ? { body: slide.body } : {}),
      alt: slide.alt
    }))
  };
}

/** Every clipped slot of the brand's carousels, named `locale/role:slot` as the room's own record names them. */
function clippedSlots(output: ChumOutput, question: NormalizedQuestion): string[] {
  return brandLocales(brand).flatMap((locale) => renderCarousel({ brand, locale, copy: copyOf(output, locale), question })
    .flatMap((slide) => slide.truncatedSlots.map((slot) => `${locale}/${slide.role}:${slot}`)));
}

describe.each([
  ["English only, as shipped", () => shipped],
  ["bilingual", () => ({ ...shipped, locales: ["cs", "en"] }) as Brand]
])("the devShark carousel on the canvas (quorum#556), %s", (_label, variant) => {
  beforeAll(() => {
    brand = variant();
  });

  it("keeps a selectable question in every category of the bank", () => {
    const categories = [...new Set(questions.map((question) => question.category))].sort();
    expect([...longestSelectablePerCategory().keys()].sort()).toEqual(categories);
  });

  it("renders the longest selectable question of every category with no clipped slot, at the packet's limits, in every language it writes", () => {
    const longest = longestSelectablePerCategory();
    for (const [category, question] of longest) {
      const output = replyAtTheLimits(question);
      // The copy really is at the edge: every writer slot within one word of its limit.
      for (const locale of brandLocales(brand)) {
        const [, context, reveal, why] = output.carousels[locale]!.slides;
        expect(context!.headline.length, `${category} ${locale} question line`).toBeGreaterThan(slotBudget(templateIdFor("context", brand, question), "question-line").maxChars * 0.8);
        expect(reveal!.body!.length, `${category} ${locale} reveal label`).toBeGreaterThan(slotBudget("stat-highlight", "stat-label").maxChars * 0.8);
        expect(why!.body!.length, `${category} ${locale} why quote`).toBeGreaterThan(slotBudget("quote-card", "quote").maxChars * 0.8);
      }
      // Through the brand's live template map: the roles land where the room puts them.
      const templates = renderCarousel({ brand, locale: "en", copy: copyOf(output, "en"), question }).map((slide) => slide.templateId);
      expect(templates).toEqual(SLIDE_ROLES.map((role) => templateIdFor(role, brand, question)));
      expect(templates.slice(2, 4)).toEqual([brand.templateMap.reveal, brand.templateMap.why]);

      expect({ category, id: question.id, clipped: clippedSlots(output, question) }).toEqual({ category, id: question.id, clipped: [] });
      // The fit gate agrees with the canvas, so the retry is never spent on copy that would fit.
      expect(runFitGate({ output, brand, question })).toEqual([]);
    }
  });

  it("drafts the dry room's fixture reply for the same questions with no clipped slot", () => {
    for (const [category, question] of longestSelectablePerCategory()) {
      const output = fixtureChumOutput({
        brand,
        question,
        hookA: longestHookLine(question, "en"),
        hookACs: longestHookLine(question, "cs")
      });
      expect({ category, id: question.id, clipped: clippedSlots(output, question) }).toEqual({ category, id: question.id, clipped: [] });
    }
  });
});

describe("the devShark templates' writer slots", () => {
  beforeAll(() => {
    brand = shipped;
  });

  it("holds each writer slot's stated budget of the bank's own prose, so the packet's numbers are the canvas's", () => {
    // Step 1's measurement, kept as a check. On 2026-09-25 every writer-owned slot of devShark's
    // five templates held its declared `maxChars` for every one of 400 explanations per language:
    // stat-highlight/stat-label 100 on 3 lines, quote-card/quote 190 on 6, quote-card/attribution
    // 80 on 2, quiz-question-context/question-line 120 on 4, quiz-code-context/question-line 160
    // on 4, minimal-text-poster/poster-line 100 on 4. The reveal's `stat` holds 18 on one line and
    // is code's (the letter). If a font or a frame moves and a budget stops holding, the packet
    // would be promising room the canvas does not have; this is where that shows.
    const slots: ReadonlyArray<readonly [string, string]> = [
      ["quiz-question-context", "question-line"],
      ["quiz-code-context", "question-line"],
      ["stat-highlight", "stat-label"],
      ["quote-card", "quote"],
      ["quote-card", "attribution"],
      ["minimal-text-poster", "poster-line"]
    ];
    const samples = (locale: Locale) => questions
      .map((question) => prose(inLocale(question, locale).explanation))
      // Long enough to fill the largest slot, and no single token wider than a line at the
      // smallest size: a word that long is a separate failure, which the fit gate names.
      .filter((text) => text.length >= 200 && text.split(" ").every((word) => word.length <= 24))
      .filter((_, index) => index % 10 === 0)
      .slice(0, 40);
    for (const [templateId, slot] of slots) {
      const template = liveTemplateByReference(templateId, liveVersionOf(templateId));
      const { maxChars } = slotBudget(templateId, slot);
      for (const locale of LOCALES) {
        const clipped = samples(locale).filter((text) => {
          const strings = Object.fromEntries(template.requiredSlots.map((required) => [required, ""]));
          strings[slot] = upTo(text, maxChars);
          const rendered = renderCarouselSlideSvg({
            template,
            brand: brandTokensFor(brand),
            format: MARKETINGSHARK_FORMAT,
            index: 0,
            payload: { locale, strings }
          });
          return rendered!.truncatedSlots.includes(slot);
        });
        expect({ templateId, slot, locale, clipped }).toEqual({ templateId, slot, locale, clipped: [] });
      }
    }
  });
});
