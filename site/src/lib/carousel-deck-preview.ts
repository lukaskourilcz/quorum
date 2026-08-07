import type { CarouselSummary } from "@boardlessai/carousel-studio";
import type { CarouselTemplateSpec, PassageLengthIndex } from "@/lib/carousel-templates";

/**
 * A summary laid out as slides, for the studio's previews.
 *
 * One slide per thing the summary says, in the order the desk said it: the headline over the
 * standfirst, then each passage, then the closing line over the sources. Nothing is invented to
 * reach a slide count — a summary with three passages renders five slides and the template's
 * declared plan of "3–5 passages" is simply not filled. Padding it is how a carousel starts
 * making claims the article never made.
 *
 * The renderer that produces the shipped PNG lives in `studio/` and is schema-validated. This is
 * the same content arranged for the on-screen preview, so what the owner clicks through is what
 * an agent would send.
 */

export interface PreviewSlide {
  /** The small mono line above the headline. */
  kicker: string;
  /** The large line. On a passage slide this is the passage. */
  title: string;
  /** The smaller line under it. Often empty on a passage slide. */
  body: string;
  /** What this slide is, for the strip's label. */
  role: "hero" | "passage" | "closing";
}

export function buildPreviewDeck(summary: CarouselSummary): PreviewSlide[] {
  const total = summary.passages.length + 2;
  const step = (index: number) => `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  return [
    { kicker: summary.kicker, title: summary.headline, body: summary.standfirst, role: "hero" },
    ...summary.passages.map((passage, index) => ({
      kicker: step(index + 1),
      title: passage,
      body: "",
      role: "passage" as const
    })),
    {
      kicker: step(total - 1),
      title: summary.closing,
      // The credit is a licence obligation, not decoration: a carousel that reaches a feed
      // without it is a breach rather than a formatting slip, so it rides on the closing slide.
      body: [summary.heroCredit, ...summary.sources.map((source) => source.label)]
        .filter(Boolean)
        .join(" · "),
      role: "closing" as const
    }
  ];
}

/**
 * Which of the three declared type sizes a piece of text gets.
 *
 * Short ≤ 90 characters, Medium 90–190, Long beyond. Derived from the text rather than chosen,
 * which is what keeps the render deterministic: the same passage is always set at the same size,
 * whoever opens the studio and whenever.
 */
export function lengthIndexFor(text: string): PassageLengthIndex {
  const length = text.trim().length;
  if (length <= 90) return 0;
  return length <= 190 ? 1 : 2;
}

/**
 * The three passages worth checking a template against: shortest, median and longest.
 *
 * The gallery is how the owner confirms a template survives a real article before an agent uses
 * it, and the only passages that can break it are the extremes. Picking them out of the article
 * rather than out of a lorem sample means the check is against text that actually shipped.
 */
export function stressPassages(summary: CarouselSummary): [string, string, string] {
  const candidates = [summary.headline, ...summary.passages, summary.standfirst]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((left, right) => left.length - right.length);
  if (candidates.length === 0) return ["", "", ""];
  return [
    candidates[0]!,
    candidates[Math.floor((candidates.length - 1) / 2)]!,
    candidates.at(-1)!
  ];
}

/** How many slides a template's declared plan expects, for the "does this article fill it" note. */
export function planFits(template: CarouselTemplateSpec, passages: number): boolean {
  const match = /(\d+)\s*[–-]\s*(\d+)\s*passages?/u.exec(template.plan);
  if (!match) return true;
  return passages >= Number(match[1]);
}
