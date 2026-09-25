import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  promisesEngagementReward,
  CAROUSEL_BRANDS,
  QUIZ_SLIDE_LIMITS,
  liveTemplates,
  liveTemplateByReference,
  quizFrameJpeg,
  quizSlideRenderInput,
  quizSlideSlots,
  quizSlideVariant,
  quizSlotField,
  renderCarouselSlidePng,
  reviewQuizSlides,
  type QuizDeckFacts,
  type QuizSlideCopy
} from "../src/index.js";

// quorum#575 (B8): marketingShark's quiz carousel as one render path, shared by the daily room and
// the Design Lab's package editor.

const brand = CAROUSEL_BRANDS.devshark;
const live = (id: string) => liveTemplateByReference(id, liveTemplates().find((template) => template.id === id && template.status === "live")!.version);
const CODE = "const [value, setValue] = useState(0);";
const facts: QuizDeckFacts = {
  displayName: "devShark",
  productUrl: "https://devshark.app",
  correctLetter: "B",
  options: ["A single value", "An array with value and setter", "An object", "A promise"],
  codeBlocks: [CODE]
};

function deck(overrides: Partial<Record<number, Partial<QuizSlideCopy>>> = {}): QuizSlideCopy[] {
  const base: QuizSlideCopy[] = [
    { role: "hook", template: live("minimal-text-poster"), headline: "Memory only. The docs will still be there after.", body: "", alt: "Slide 1: the hook" },
    { role: "context", template: live("quiz-code-context"), headline: "What does useState return?", body: CODE, alt: "Slide 2: the question" },
    { role: "reveal", template: live("stat-highlight"), headline: "B", body: "An array with value and setter", alt: "Slide 3: the answer" },
    { role: "why", template: live("quote-card"), headline: "Why", body: "useState returns the value and its setter, in that order.", alt: "Slide 4: why" },
    { role: "footer", template: live("minimal-text-poster"), headline: "One question from devShark.", body: "", alt: "Slide 5: devShark" }
  ];
  return base.map((slide, index) => ({ ...slide, ...overrides[index] }));
}

const review = (slides: QuizSlideCopy[]) => reviewQuizSlides({ slides, facts, locale: "en", brand, format: "instagram-portrait" });

describe("the quiz slot mapping", () => {
  it("gives code the reveal's letter, the footer's link and the options the writer left out", () => {
    const [hook, context, reveal, why, footer] = deck();
    expect(quizSlideSlots({ ...hook!, facts })).toEqual({ "poster-line": hook!.headline, "poster-note": "devShark" });
    expect(quizSlideSlots({ ...footer!, facts })["poster-note"]).toBe("devshark.app");
    expect(quizSlideSlots({ ...context!, facts })).toEqual({
      "question-line": "What does useState return?",
      "code-block": CODE,
      options: "A. A single value\nB. An array with value and setter\nC. An object\nD. A promise"
    });
    expect(quizSlideSlots({ ...context!, body: `${CODE}\nA. One\nB. Two`, facts }).options).toBe("A. One\nB. Two");
    expect(quizSlideSlots({ ...reveal!, body: "B. An array", facts })).toEqual({ stat: "B", "stat-label": "An array", source: "devShark" });
    expect(quizSlideSlots({ ...why!, facts })).toEqual({ quote: why!.body, attribution: "Why" });
    expect(quizSlideSlots({ ...why!, body: "", facts })).toEqual({ quote: "Why", attribution: "devShark" });
    expect(quizSlideSlots({ role: "context", template: live("quiz-question-context"), headline: "Which?", body: "", facts })).toMatchObject({ "option-b": "B. An array with value and setter" });
  });

  it("opens and closes the deck on different poster variants", () => {
    const poster = live("minimal-text-poster");
    expect(quizSlideVariant("hook", poster)).not.toBe(quizSlideVariant("footer", poster));
  });

  it("names the copy field that fills a slot", () => {
    expect(quizSlotField("stat-highlight", "stat-label", true)).toBe("body");
    expect(quizSlotField("quote-card", "quote", false)).toBe("headline");
    expect(quizSlotField("quiz-code-context", "code-block", true)).toBe("code");
    expect(quizSlotField("quiz-code-context", "question-line", true)).toBe("headline");
  });
});

describe("the review an owner's edit has to pass", () => {
  it("passes a deck that fits", () => {
    expect(review(deck())).toEqual([]);
  });

  it("refuses an edit that would clip and names the slot, the field and its budget", () => {
    const problems = review(deck({ 2: { body: "An array holding the current value first and the function that replaces it second, always in that order, on every render" } }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ slide: 3, field: "body", slot: "stat-label" });
    expect(problems[0]!.message).toBe("Slide 3 (reveal): the body would clip in stat-label, which holds 100 characters on 3 lines.");
  });

  it("holds each field to the room's own caps", () => {
    const problems = review(deck({
      0: { headline: "x".repeat(QUIZ_SLIDE_LIMITS.hookChars + 1) },
      3: { body: Array.from({ length: QUIZ_SLIDE_LIMITS.whyWords + 1 }, () => "word").join(" ") },
      4: { alt: " " }
    }));
    expect(problems.map((problem) => [problem.slide, problem.field])).toEqual(expect.arrayContaining([[1, "headline"], [4, "body"], [5, "alt"]]));
    expect(review(deck(Object.fromEntries([0, 1, 2, 3, 4].map((index) => [index, { alt: "a".repeat(QUIZ_SLIDE_LIMITS.altChars) }])))))
      .toEqual([expect.objectContaining({ slide: 0, field: "alt", message: "The five alt texts are 1004 characters together; they hold 1000." })]);
  });

  it("refuses a slide that promises a reward for engagement, in any field", () => {
    const problems = review(deck({ 4: { headline: "Follow devShark this week and get 50 coins" }, 3: { alt: "Share this post for a free month of premium" } }));
    expect(problems.map(({ slide, field }) => [slide, field])).toEqual([[4, "alt"], [5, "headline"]]);
    expect(problems[0]!.message).toBe("Slide 4 (why): no slide, caption or hashtag may promise coins, discounts, access or any reward for following, liking, sharing or commenting.");
    // A plain invitation is not bait: nothing is promised for it.
    expect(review(deck({ 4: { headline: "Share this with a friend who still uses var" } }))).toEqual([]);
    expect(promisesEngagementReward("Follow us for 50 coins")).toBe(true);
  });

  it("keeps the two truth rules: the right letter on the reveal and the question's code on the context slide", () => {
    expect(review(deck({ 2: { body: "C. An object" } }))).toEqual([expect.objectContaining({ slide: 3, message: "Slide 3 (reveal): the reveal names C; the correct answer is B." })]);
    expect(review(deck({ 1: { body: "const value = useState(0);" } }))).toEqual([expect.objectContaining({ slide: 2, field: "code" })]);
  });
});

describe("the frames", () => {
  it("encodes the JPEG copy as an sRGB JPEG of the same canvas, the same bytes every time", async () => {
    const [hook] = deck();
    const rendered = await renderCarouselSlidePng(quizSlideRenderInput({ ...hook!, facts, locale: "en", brand, format: "instagram-portrait" }));
    const first = await quizFrameJpeg(rendered!.png, brand.colors.background!);
    const second = await quizFrameJpeg(rendered!.png, brand.colors.background!);
    expect(first.equals(second)).toBe(true);
    expect(await sharp(first).metadata()).toMatchObject({ format: "jpeg", space: "srgb", width: 1_080, height: 1_350 });
  });
});
