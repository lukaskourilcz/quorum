import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  QUIZ_SLIDE_LIMITS,
  liveTemplateByReference,
  liveTemplates,
  postSlidePlacement,
  postSlideRenderInput,
  postSlideSlots,
  postSlideVariant,
  postSlotField,
  renderCarouselSlidePng,
  reviewPostSlides,
  type PostDeckFacts,
  type PostSlideCopy
} from "../src/index.js";

// quorum#576 (B9): marketingShark's spotlight, challenge teaser, weekly note and announcement are
// five-slide decks on the quiz's single-slide templates, without the quiz's facts.

const brand = CAROUSEL_BRANDS.devshark;
const live = (id: string) => liveTemplateByReference(id, liveTemplates().find((template) => template.id === id && template.status === "live")!.version);
const facts: PostDeckFacts = { displayName: "devShark", productUrl: "https://devshark.app" };

function deck(overrides: Partial<Record<number, Partial<PostSlideCopy>>> = {}): PostSlideCopy[] {
  const base: PostSlideCopy[] = [
    { role: "hook", template: live("minimal-text-poster"), headline: "This week on devShark", body: "", alt: "Slide 1: this week on devShark" },
    { role: "theme", template: live("stat-highlight"), headline: "TypeScript", body: "Types came up more than anything else.", alt: "Slide 2: the theme" },
    { role: "recap", template: live("quiz-question-context"), headline: "Monday to Thursday", body: "Mon · React: What does useState return?\nTue · Inside devShark: the Today queue\nWed · Easy challenge: Double numbers", alt: "Slide 3: the week" },
    { role: "pick", template: live("quote-card"), headline: "Worth a look", body: "Wednesday's challenge takes five minutes and teaches map.", alt: "Slide 4: the pick" },
    { role: "footer", template: live("minimal-text-poster"), headline: "A week of devShark, one post a day.", body: "", alt: "Slide 5: devShark" }
  ];
  return base.map((slide, index) => ({ ...slide, ...overrides[index] }));
}

const review = (slides: PostSlideCopy[]) => reviewPostSlides({ slides, facts, locale: "en", brand, format: "instagram-portrait" });

describe("the post-deck slot mapping", () => {
  it("fills each template from a headline, a body, the brand's name and its link", () => {
    const [hook, theme, recap, pick, footer] = deck();
    expect(postSlideSlots({ ...hook!, placement: "open", facts })).toEqual({ "poster-line": "This week on devShark", "poster-note": "devShark" });
    expect(postSlideSlots({ ...footer!, placement: "close", facts })).toEqual({ "poster-line": footer!.headline, "poster-note": "devshark.app" });
    expect(postSlideSlots({ ...theme!, placement: "middle", facts })).toEqual({ stat: "TypeScript", "stat-label": theme!.body, source: "devShark" });
    expect(postSlideSlots({ ...pick!, placement: "middle", facts })).toEqual({ quote: pick!.body, attribution: "Worth a look" });
    expect(postSlideSlots({ ...pick!, template: live("story-quote"), body: "", placement: "middle", facts })).toEqual({ quote: "Worth a look", attribution: "devShark" });
    // The recap prints one line per slot, unlettered, and leaves a missing day empty.
    expect(postSlideSlots({ ...recap!, placement: "middle", facts })).toEqual({
      "question-line": "Monday to Thursday",
      "option-a": "Mon · React: What does useState return?",
      "option-b": "Tue · Inside devShark: the Today queue",
      "option-c": "Wed · Easy challenge: Double numbers",
      "option-d": ""
    });
    expect(() => postSlideSlots({ ...pick!, template: live("quiz-code-context"), placement: "middle", facts })).toThrow(/No post-deck slot mapping/u);
  });

  it("opens and closes on different poster variants and names the field a slot takes", () => {
    expect([0, 1, 2, 3, 4].map((index) => postSlidePlacement(index, 5))).toEqual(["open", "middle", "middle", "middle", "close"]);
    const poster = live("minimal-text-poster");
    expect(postSlideVariant("open", poster)).toBe("A");
    expect(postSlideVariant("close", poster)).toBe("B");
    expect(postSlideVariant("middle", live("quiz-question-context"))).toBeUndefined();
    expect(postSlotField("stat-highlight", "stat", true)).toBe("headline");
    expect(postSlotField("stat-highlight", "stat-label", true)).toBe("body");
    expect(postSlotField("quote-card", "quote", false)).toBe("headline");
    expect(postSlotField("quiz-question-context", "option-c", true)).toBe("body");
  });

  it("passes a deck that fits and names every slot that would clip", () => {
    expect(review(deck())).toEqual([]);
    const problems = review(deck({ 1: { headline: "A theme far too long for the stat" } }));
    expect(problems).toEqual([expect.objectContaining({ slide: 2, field: "headline", slot: "stat" })]);
    expect(problems[0]!.message).toBe("Slide 2 (theme): the headline would clip in stat, which holds 18 characters on 1 line.");
    const long = "x".repeat(QUIZ_SLIDE_LIMITS.hookChars + 1);
    expect(review(deck({ 0: { headline: long } })).map((problem) => problem.field)).toContain("headline");
    expect(review(deck({ 3: { alt: " " } })).map((problem) => problem.message)).toContain("Slide 4 (pick): the alt text is empty; every slide needs one.");
  });

  it("renders the same PNG bytes for the same slide every time", async () => {
    const slide = deck()[2]!;
    const input = postSlideRenderInput({ ...slide, placement: "middle", facts, locale: "en", brand, format: "instagram-portrait" });
    const [first, second] = await Promise.all([renderCarouselSlidePng(input), renderCarouselSlidePng(input)]);
    expect(first!.pngHash).toBe(second!.pngHash);
    expect(first!.truncatedSlots).toEqual([]);
  });
});
