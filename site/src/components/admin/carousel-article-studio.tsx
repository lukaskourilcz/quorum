"use client";

import { useMemo, useState } from "react";
import type { StudioArticle } from "@/lib/carousel-summaries";
import {
  buildPreviewDeck,
  lengthIndexFor,
  stressPassages,
  type PreviewSlide
} from "@/lib/carousel-deck-preview";
import { brandTint } from "@/lib/venture-brand";
import {
  CAROUSEL_FORMATS,
  CAROUSEL_TEMPLATES,
  PASSAGE_LENGTHS,
  rhythmLabel,
  slideStyle,
  type CarouselFormatId,
  type CarouselTemplateSpec,
  type PassageLengthIndex
} from "@/lib/carousel-templates";

/**
 * The Design Lab: every delivered article, in every template.
 *
 * The point of the gallery is that it is the check. An agent picks a template and sends passages;
 * this is where the owner confirms, before that happens, that the template survives *this*
 * article — its longest passage, at both output formats, with no text landing on the hero and
 * nothing clipped. Every canvas is drawn from the same declaration the renderer uses and
 * multiplied down, so a 176px gallery card and a 320px detail preview are the same design at two
 * sizes rather than two designs that can disagree.
 *
 * The text is the article's own summary — headline, standfirst, the desk's passages, the closing
 * line and its sources. Nothing here is sample copy, and nothing is padded to fill a slide.
 */

const GALLERY_WIDTH = 176;
const DETAIL_WIDTH = 300;
const STRIP_WIDTH = 150;

function SlideCanvas({
  template,
  slide,
  index,
  width,
  format,
  length,
  brand
}: {
  template: CarouselTemplateSpec;
  slide: PreviewSlide;
  index: number;
  width: number;
  format: CarouselFormatId;
  length: PassageLengthIndex;
  brand: string;
}) {
  const style = slideStyle({
    template,
    width,
    format,
    length,
    brand,
    slide: index,
    characters: slide.title.length
  });
  return (
    <span style={style.canvas}>
      <span style={style.hero} />
      <span style={style.scrim} />
      <span style={style.tint} />
      <span style={style.kicker}>{slide.kicker}</span>
      <span style={style.title}>{slide.title}</span>
      {slide.body ? <span style={style.body}>{slide.body}</span> : null}
      <span style={style.bar} />
    </span>
  );
}

/**
 * A format or length switch.
 *
 * The active chip is brand border, brand tint and white text. Brand text on a 15%-brand ground is
 * the same hue against itself — 1.00:1 — which is unreadable rather than merely low contrast. The
 * border and the tint say which one is on; the label says what it is.
 */
function chipStyle(on: boolean, brand: string) {
  return {
    border: `1px solid ${on ? brand : "#3f3f46"}`,
    borderRadius: "9px",
    background: on ? brandTint(brand) : "#101013",
    padding: "7px 12px",
    fontFamily: "var(--font-ibm-plex-mono), monospace",
    fontSize: "10.5px",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: on ? "#ffffff" : "#a1a1aa",
    cursor: "pointer",
    whiteSpace: "nowrap" as const
  };
}

export function CarouselArticleStudio({
  articles,
  brand
}: {
  articles: StudioArticle[];
  /** The venture hue this workspace is drawn in. */
  brand: string;
}) {
  const [articleId, setArticleId] = useState(articles[0]?.id ?? "");
  const [templateIndex, setTemplateIndex] = useState(0);
  const [format, setFormat] = useState<CarouselFormatId>("instagram-portrait");
  const [stress, setStress] = useState<PassageLengthIndex>(1);

  const article = articles.find((entry) => entry.id === articleId) ?? articles[0] ?? null;
  const template = CAROUSEL_TEMPLATES[templateIndex]!;

  const deck = useMemo(() => (article ? buildPreviewDeck(article.summary) : []), [article]);
  const stressText = useMemo(
    () => (article ? stressPassages(article.summary)[stress] : ""),
    [article, stress]
  );
  // The type size follows the text being rendered, never a slider. The switch above only chooses
  // *which* of the article's own passages the gallery is checked against.
  const length = lengthIndexFor(stressText);

  if (!article) {
    return (
      <div className="rounded-[12px] border border-[#26262b] bg-[#0c0c0f] p-6">
        <p className="text-[13.5px] leading-[1.6] text-[#a1a1aa]">
          No article has been delivered to DNESKAi or MMA Files yet, so there is nothing to lay
          out. The studio does not add fake examples: a template is checked against a real
          article or it is not checked.
        </p>
      </div>
    );
  }

  /** Slide 1 in every template, so the gallery compares like with like. */
  const cover = deck[0]!;
  const strip = deck.slice(0, 3);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="min-w-0 rounded-[12px] border border-[#26262b] bg-[#0c0c0f]">
        <div className="min-w-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#1e1e22] px-[18px] py-3.5">
          <p className="m-0 text-[14px] font-semibold">Article</p>
          <span className="min-w-0 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">
            {articles.length} delivered · summary only, never the whole article
          </span>
        </div>
        <div className="hide-scrollbar flex min-w-0 max-h-[168px] gap-2 overflow-x-auto overflow-y-auto p-2 [overscroll-behavior:contain]" data-horizontal-scroll>
          {articles.map((entry) => {
            const on = entry.id === article.id;
            return (
              <button
                className="flex w-[240px] shrink-0 flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors"
                key={entry.id}
                onClick={() => setArticleId(entry.id)}
                style={{
                  border: `1px solid ${on ? brand : "#1e1e22"}`,
                  background: on ? brandTint(brand, "#0c0c0f", 0.12) : "transparent"
                }}
                type="button"
              >
                <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">
                  <span style={{ color: on ? brand : "#94949c" }}>{entry.ventureLabel}</span>
                  <span>{entry.summary.date}</span>
                  {entry.origin === "derived" ? <span title="Rebuilt from the delivered package">derived</span> : null}
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-[1.4] text-[#f4f4f5]">
                  {entry.summary.headline}
                </span>
                <span className="font-mono text-[9.5px] text-[#94949c]">
                  {entry.summary.passages.length} passages
                </span>
              </button>
            );
          })}
        </div>
        {article.problems.length > 0 ? (
          <p className="border-t border-[#1e1e22] px-[18px] py-2.5 text-[12px] leading-[1.55] text-[#f4e3c4]">
            {article.problems.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#94949c]">Format</span>
        {CAROUSEL_FORMATS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setFormat(entry.id)}
            style={chipStyle(entry.id === format, brand)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
        <span className="ml-3.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#94949c]">
          Check against
        </span>
        {PASSAGE_LENGTHS.map((entry, index) => (
          <button
            key={entry.label}
            onClick={() => setStress(index as PassageLengthIndex)}
            style={chipStyle(index === stress, brand)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
        <span className="ml-auto whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">
          {stressText.length} characters · {PASSAGE_LENGTHS[length]!.note}
        </span>
      </div>

      <div className="flex min-w-0 flex-wrap gap-3" data-adm-gallery data-horizontal-scroll>
        {CAROUSEL_TEMPLATES.map((entry, index) => {
          const on = index === templateIndex;
          return (
            <button
              className="flex w-[196px] min-w-0 flex-col gap-2.5 rounded-[12px] p-2.5 text-left text-[#f4f4f5]"
              key={entry.id}
              onClick={() => setTemplateIndex(index)}
              style={{
                border: `1px solid ${on ? brand : "#26262b"}`,
                background: on ? "#101013" : "#0c0c0f"
              }}
              type="button"
            >
              <SlideCanvas
                brand={brand}
                format={format}
                index={0}
                length={length}
                slide={{ ...cover, title: stressText || cover.title }}
                template={entry}
                width={GALLERY_WIDTH}
              />
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="min-w-0 truncate text-[12.5px] font-semibold">{entry.name}</span>
                <span className="ml-auto font-mono text-[9px] tracking-[0.1em] text-[#94949c]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="grid min-w-0 grid-cols-1 gap-6 rounded-[12px] border border-[#26262b] bg-[#0c0c0f] p-5 xl:grid-cols-[minmax(0,auto)_minmax(0,1fr)]"
        data-adm-cols
      >
        <div className="hide-scrollbar flex min-w-0 flex-col gap-4 overflow-x-auto" data-horizontal-scroll>
          <SlideCanvas
            brand={brand}
            format={format}
            index={0}
            length={length}
            slide={deck[0]!}
            template={template}
            width={DETAIL_WIDTH}
          />
          {/*
            The three-step rhythm, shown as the first three slides of this article. The loud
            templates change background, type colour and hero position from slide to slide, and a
            single frame cannot show that — the whole point of those five is what a swipe does.
          */}
          <div className="hide-scrollbar flex gap-2.5 overflow-x-auto pb-1" data-horizontal-scroll>
            {strip.map((slide, index) => {
              const style = slideStyle({
                template,
                width: STRIP_WIDTH,
                format,
                length,
                brand,
                slide: index,
                characters: slide.title.length
              });
              return (
                <div className="flex flex-col gap-2" key={slide.kicker + index}>
                  <SlideCanvas
                    brand={brand}
                    format={format}
                    index={index}
                    length={length}
                    slide={slide}
                    template={template}
                    width={STRIP_WIDTH}
                  />
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#94949c]">
                    Slide {index + 1} · {style.step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="m-0 text-[18px] font-semibold tracking-[-0.02em]">{template.name}</p>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#94949c]">
              Deterministic · same input renders the same slides
            </span>
          </div>
          <p className="mt-2.5 max-w-[68ch] text-[13.5px] leading-[1.6] text-[#a1a1aa]">{template.note}</p>
          <dl className="mt-[18px] grid grid-cols-[116px_1fr] gap-x-4 gap-y-2.5 border-t border-[#1e1e22] pt-4 text-[12.5px]">
            {([
              ["Hero", template.hero],
              ["Mask", template.mask],
              ["Headline", `${template.headline.join(" / ")} px — picked by character count, never by hand`],
              ["Passage", `${template.body.join(" / ")} px`],
              ["Slide plan", template.plan],
              ["Rhythm", `${rhythmLabel(template)} — repeats for as many slides as the passages need`],
              ["This article", `${deck.length} slides · ${article.summary.passages.length} passages`]
            ] as const).map(([label, value]) => (
              <div className="contents" key={label}>
                <dt className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#94949c]">{label}</dt>
                <dd className="m-0 text-[#d4d4d8]">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-[18px] max-w-[72ch] border-l-2 border-[#2e2e34] pl-3 text-[12.5px] leading-[1.6] text-[#94949c]">
            Agents send selected passages, not the whole article. The template picks its type size
            from the character count of each passage, so a short decision and a long argument both
            fill the frame without anyone touching a slider. No text is ever cropped: when a
            passage will not fit at the smallest size, the renderer opens one more slide.
          </p>
        </div>
      </div>

      <details className="min-w-0 rounded-[12px] border border-[#26262b] bg-[#0c0c0f]">
        <summary className="cursor-pointer px-[18px] py-3.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#d4d4d8]">
          The whole deck · {deck.length} slides
        </summary>
        <div className="flex flex-wrap gap-3 border-t border-[#1e1e22] p-[18px]" data-horizontal-scroll>
          {deck.map((slide, index) => (
            <div className="flex flex-col gap-2" key={`${slide.kicker}-${index}`}>
              <SlideCanvas
                brand={brand}
                format={format}
                index={index}
                length={lengthIndexFor(slide.title)}
                slide={slide}
                template={template}
                width={STRIP_WIDTH}
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#94949c]">
                {String(index + 1).padStart(2, "0")} · {slide.role}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
