import { CAROUSEL_BRANDS, renderCarouselPng, type TemplateReference } from "@boardlessai/carousel-studio";
import type { DatasetEntry } from "../contracts/boardless-dataset.js";
import type { PracticalShape } from "../contracts/practical.js";
import { resolveLiveCarouselTemplate } from "../studio/catalog.js";
import { validateSocialImage } from "./media/validate.js";

/**
 * What a DNESKAi social pack carries beyond the carousel, the captions and the quote card
 * (quorum#592): the 9:16 story card for the "one practical thing today" story, and the evening
 * Threads question. Both are deterministic and $0 — the words are the edition's own, laid out by a
 * studio template — and neither is a new way to post: the story is exported for manual posting,
 * and the question is one more Threads draft that waits for the owner like every other.
 */

/** A link tagged the way every launch link is (the cross-repository UTM convention, CONTRACTS.md §4). */
export function withUtm(url: string, source: "instagram" | "threads", medium: "story" | "post" | "reply" | "bio", campaign: string): string {
  const tagged = new URL(url);
  tagged.searchParams.set("utm_source", source);
  tagged.searchParams.set("utm_medium", medium);
  tagged.searchParams.set("utm_campaign", campaign);
  return tagged.toString();
}

/** Whole words within a character count, with an ellipsis when cut. */
export function wordsWithin(text: string, maximum: number): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (clean.length <= maximum) return clean;
  let kept = "";
  for (const word of clean.split(" ")) {
    const next = kept ? `${kept} ${word}` : word;
    if (next.length > maximum - 1) break;
    kept = next;
  }
  return `${(kept || clean.slice(0, maximum - 1)).replace(/[\s,;:.–—-]+$/u, "")}…`;
}

/** A caption within a character count: paragraphs and lines kept, cut at a word with an ellipsis. */
export function clipCaption(text: string, maximum: number): string {
  const clean = text.trim();
  if (clean.length <= maximum) return clean;
  const cut = clean.slice(0, maximum - 1);
  const boundary = cut.search(/\s\S*$/u);
  return `${(boundary > 0 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.–—-]+$/u, "")}…`;
}

/** The story template's two slots hold 190 and 80 characters (`story-quote`, studio library). */
const STORY_QUOTE_MAXIMUM = 190;
const STORY_LINE_MAXIMUM = 80;

export interface StoryCard {
  source: "practical" | "lesson";
  /** The link sticker's target, UTM-tagged for the story. */
  link: string;
  /** The line printed on the card, pointing at the sticker. */
  linkLine: string;
  visual: TemplateReference;
}

/**
 * The day's story card: the edition's practical item when it has one, otherwise the day's lesson,
 * otherwise nothing. The practical item is only ever the edition's own grounded one; the lesson is
 * the entry the reader reveals that day. Nothing is written that neither of them says.
 */
export function storyCard(input: {
  practical: PracticalShape | null | undefined;
  lesson: DatasetEntry | null | undefined;
  destination: string;
}): StoryCard | null {
  const linkLine = "Celé vydání: odkaz v příběhu";
  if (input.practical) {
    const lead = `${input.practical.title}: `;
    const quote = `${lead}${wordsWithin(input.practical.text, STORY_QUOTE_MAXIMUM - lead.length)}`;
    const line = wordsWithin(`1 praktická věc dnes · ${linkLine}`, STORY_LINE_MAXIMUM);
    return {
      source: "practical",
      link: withUtm(input.destination, "instagram", "story", "practical"),
      linkLine: line,
      visual: { template_id: "story-quote", version: "1.0.0", content: { locale: "cs", strings: { quote: wordsWithin(quote, STORY_QUOTE_MAXIMUM), attribution: line } } }
    };
  }
  if (input.lesson) {
    const term = input.lesson.term ?? input.lesson.cs.short;
    const quote = input.lesson.term ? `${term}: ${input.lesson.cs.short}` : input.lesson.cs.short;
    const line = wordsWithin(`Pojem dne · ${linkLine}`, STORY_LINE_MAXIMUM);
    return {
      source: "lesson",
      link: withUtm(input.destination, "instagram", "story", "lesson"),
      linkLine: line,
      visual: { template_id: "story-quote", version: "1.0.0", content: { locale: "cs", strings: { quote: wordsWithin(quote, STORY_QUOTE_MAXIMUM), attribution: line } } }
    };
  }
  return null;
}

/** Render the story card at 1080 × 1920 and prove the canvas, the way every pack frame is proved. */
export async function renderStoryCard(card: StoryCard): Promise<{ png: Buffer; pngHash: string }> {
  const [slide] = await renderCarouselPng({
    template: resolveLiveCarouselTemplate(card.visual.template_id, card.visual.version),
    payload: card.visual.content,
    brand: CAROUSEL_BRANDS["caught-up"],
    format: "instagram-story"
  });
  if (!slide) throw new Error("The story card rendered no frame");
  const validation = await validateSocialImage(slide.png);
  if (validation.width !== 1080 || validation.height !== 1920) throw new Error("The story card must be 1080x1920");
  return { png: slide.png, pngHash: slide.pngHash };
}

/**
 * The evening Threads question, from the edition's first open question. It asks the reader what
 * they think about something the edition says is still unknown, so it claims nothing new; the link
 * is the edition's own, tagged for Threads.
 */
export function threadsQuestionText(input: { uncertainty: readonly string[]; destination: string }): string | null {
  const open = input.uncertainty[0]?.replace(/\s+/gu, " ").trim();
  if (!open) return null;
  const link = withUtm(input.destination, "threads", "post", "edition");
  const frame = "Otevřená otázka dnešního vydání:";
  const ask = "Jak to vidíte vy?";
  const room = 500 - frame.length - ask.length - link.length - 6;
  if (room < 40) return null;
  return `${frame} ${wordsWithin(open, room)}\n\n${ask}\n\n${link}`;
}
