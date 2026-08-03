/**
 * Turn a finished article into a carousel deck.
 *
 * Five to ten slides, none longer than thirty words, chosen deterministically from text the
 * desk already wrote and already gated. No model call: splitting prose at a sentence boundary
 * is arithmetic, and paying a model to do it would add cost, latency and a way for the deck to
 * say something the article does not.
 *
 * The two magazines hand in different shapes. A Caught Up edition arrives with the editor's own
 * structure — what changed, why it matters, what is still open — and those become slides
 * directly. An MMA Files article is a title, a dek and a body, so its middle is cut out of the
 * body. Both land in the same five-to-ten range through different routes, which is why this is
 * two readers over one splitter rather than one clever function.
 */

/** No slide may exceed this. The owner's constraint, and the only hard rule here. */
export const MAX_SLIDE_WORDS = 30;
export const MIN_SLIDES = 5;
export const MAX_SLIDES = 10;

export interface Slide {
  /** cover and outro bracket the deck; body carries the argument. */
  kind: "cover" | "body" | "outro";
  text: string;
}

export interface ArticleDeckInput {
  title: string;
  dek: string;
  /** A Caught Up edition's structured points, in the order the editor put them. */
  points?: readonly string[];
  /** An MMA Files body, MDX. Used only when there are no structured points. */
  bodyMdx?: string;
  /** The closing line. Czech, because that is what both magazines publish. */
  outro: string;
}

/**
 * A sentence boundary in Czech.
 *
 * Not simply "a period followed by a space". Czech writes ordinals with a trailing period, so
 * "UFC 306 dne 14. září 2024" contains two of them and a naive split puts "září 2024 a
 * vyústila…" on its own slide, starting mid-sentence in lower case. The period after a bare
 * number is an ordinal, and a real sentence starts with a capital, a digit or an opening quote.
 */
const SENTENCE_END = /(?<![\d])(?<=[.!?…])\s+(?=[\p{Lu}\d"„«(])/u;

function words(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

export function wordCount(value: string): number {
  return words(value).length;
}

/**
 * Strip MDX to the prose a reader would see.
 *
 * Headings, list markers, source markers, links and images all carry syntax that would be
 * counted as words and printed on a slide. The link's label survives because it is the
 * sentence; its URL does not, because a slide cannot be clicked.
 */
export function proseFromMdx(mdx: string): string {
  return mdx
    .split(/\r?\n/u)
    .filter((line) => !/^\s*(?:import|export)\b/u.test(line))
    .join("\n")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\[\^source-\d+\]|\[source:[^\]]+\]/gu, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replace(/^\s{0,3}[-*+]\s+/gmu, "")
    .replace(/^\s{0,3}>\s?/gmu, "")
    .replace(/[*_`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Break one sentence that is already over the cap.
 *
 * Czech runs long compound sentences, so a clause boundary is tried first — a comma, semicolon,
 * colon or dash is a place a reader expects to pause, and splitting there keeps each piece
 * readable. Only when no clause boundary falls inside the cap does this cut at the word count,
 * which is a worse slide but an honest one: the alternative is dropping the sentence, and a
 * deck that silently omits a fact the article makes is worse than a deck that reads abruptly.
 */
function splitLongSentence(sentence: string): string[] {
  const all = words(sentence);
  if (all.length <= MAX_SLIDE_WORDS) return [sentence.trim()];
  const pieces: string[] = [];
  let remaining = all;
  while (remaining.length > MAX_SLIDE_WORDS) {
    const window = remaining.slice(0, MAX_SLIDE_WORDS);
    let cut = -1;
    for (let index = window.length - 1; index >= Math.ceil(MAX_SLIDE_WORDS / 3); index -= 1) {
      if (/[,;:–—-]$/u.test(window[index]!)) { cut = index + 1; break; }
    }
    if (cut < 0) cut = MAX_SLIDE_WORDS;
    pieces.push(remaining.slice(0, cut).join(" ").trim());
    remaining = remaining.slice(cut);
  }
  if (remaining.length > 0) pieces.push(remaining.join(" ").trim());
  return pieces;
}

/** Pack whole sentences into slides, never exceeding the cap, never cutting one needlessly. */
export function packIntoSlides(prose: string): string[] {
  const sentences = prose.split(SENTENCE_END).map((value) => value.trim()).filter(Boolean);
  const units = sentences.flatMap(splitLongSentence);
  const packed: string[] = [];
  let current: string[] = [];
  for (const unit of units) {
    const unitWords = wordCount(unit);
    const currentWords = current.reduce((total, value) => total + wordCount(value), 0);
    if (current.length > 0 && currentWords + unitWords > MAX_SLIDE_WORDS) {
      packed.push(current.join(" "));
      current = [];
    }
    current.push(unit);
  }
  if (current.length > 0) packed.push(current.join(" "));
  return packed;
}

/** One slide's worth of text, trimmed to the cap without leaving a dangling clause. */
function capped(value: string): string {
  const [first] = packIntoSlides(value);
  return first ?? words(value).slice(0, MAX_SLIDE_WORDS).join(" ");
}

/**
 * Build the deck.
 *
 * The count follows the article: a short piece has less to say and gets fewer slides. What it
 * will not do is pad — if the text cannot fill five slides, the deck is short and the caller
 * decides whether that is publishable. Inventing a slide to reach a number is how a carousel
 * starts saying things the article does not.
 */
export function buildArticleDeck(input: ArticleDeckInput): Slide[] {
  const middle = input.points && input.points.length > 0
    ? input.points.flatMap((point) => packIntoSlides(point))
    : packIntoSlides(proseFromMdx(input.bodyMdx ?? ""));
  const room = MAX_SLIDES - 3;
  return [
    { kind: "cover" as const, text: capped(input.title) },
    { kind: "body" as const, text: capped(input.dek) },
    ...middle.slice(0, room).map((text) => ({ kind: "body" as const, text })),
    { kind: "outro" as const, text: capped(input.outro) }
  ];
}

export interface DeckReview {
  slides: Slide[];
  publishable: boolean;
  problems: string[];
}

/** Check a deck against the rules rather than trusting the builder that made it. */
export function reviewDeck(slides: readonly Slide[]): DeckReview {
  const problems: string[] = [];
  if (slides.length < MIN_SLIDES) {
    problems.push(`A deck needs at least ${MIN_SLIDES} slides; this one has ${slides.length}.`);
  }
  if (slides.length > MAX_SLIDES) {
    problems.push(`A deck may not exceed ${MAX_SLIDES} slides; this one has ${slides.length}.`);
  }
  slides.forEach((slide, index) => {
    const count = wordCount(slide.text);
    if (count > MAX_SLIDE_WORDS) {
      problems.push(`Slide ${index + 1} has ${count} words, over the ${MAX_SLIDE_WORDS}-word limit.`);
    }
    if (count === 0) problems.push(`Slide ${index + 1} is empty.`);
  });
  return { slides: [...slides], publishable: problems.length === 0, problems };
}
