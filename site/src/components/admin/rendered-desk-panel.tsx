"use client";

import { useState } from "react";
import type { RenderedArticle, RenderedDesk } from "@/lib/rendered-desk";

/**
 * What shipped, and what a share of it would look like.
 *
 * The card is drawn the way a link preview is drawn on a social platform — picture on top, bold
 * title, then the domain — so the owner can see the thing a reader would see without leaving the
 * admin and without this page fetching the published article.
 *
 * Plain `<img>`, not `next/image`: the source is an authenticated admin route that answers with a
 * sandboxed CSP, and the optimiser would fetch it without the session and cache the failure.
 */

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function ShareCard({ article }: { article: RenderedArticle }) {
  return (
    <article className="grid overflow-hidden rounded-[10px] border border-[#26262b] bg-[#0e0e11]">
      <div className="flex aspect-[1.91/1] items-center justify-center overflow-hidden bg-[#141418]">
        {article.imageHref ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={article.imageAlt ?? ""}
            className="h-full w-full object-cover"
            loading="lazy"
            src={article.imageHref}
          />
        ) : (
          <p className="m-0 max-w-[36ch] px-4 text-center font-mono text-[10px] uppercase leading-[1.6] tracking-[0.1em] text-[#71717a]">
            {article.imageNote ?? "No picture recorded"}
          </p>
        )}
      </div>
      <div className="grid gap-1 border-t border-[#1e1e22] p-3.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#71717a]">
          {domainOf(article.url) ?? article.ventureName}
        </span>
        <span className="text-[13.5px] font-semibold leading-[1.4] text-[#f4f4f5]">{article.title}</span>
        {article.description ? (
          <span className="line-clamp-2 text-[12px] leading-[1.5] text-[#94949c]">{article.description}</span>
        ) : null}
        {article.url ? (
          <a
            className="mt-1 truncate font-mono text-[10px] text-[#a1a1aa] underline"
            href={article.url}
            rel="noreferrer"
            target="_blank"
          >
            {article.url}
          </a>
        ) : (
          <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717a]">
            No published address was recorded
          </span>
        )}
      </div>
    </article>
  );
}

export function RenderedDeskPanel({ desk }: { desk: RenderedDesk }) {
  const [index, setIndex] = useState(0);
  const day = desk.days[Math.min(index, desk.days.length - 1)];

  if (!day) {
    return (
      <p className="m-0 text-[13px] leading-[1.6] text-[#94949c]">
        Nothing has been recorded in the last three days.
      </p>
    );
  }

  const label = (offset: number) => offset === 0 ? "Today" : offset === 1 ? "Yesterday" : "Day before";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {desk.days.map((entry, entryIndex) => {
          const on = entryIndex === index;
          return (
            <button
              aria-pressed={on}
              className="rounded-[9px] border px-3 py-[7px] font-mono text-[10.5px] uppercase tracking-[0.12em] transition-colors"
              key={entry.date}
              onClick={() => setIndex(entryIndex)}
              style={{
                borderColor: on ? "#a1a1aa" : "#3f3f46",
                background: on ? "#1a1a1f" : "#101013",
                color: on ? "#ffffff" : "#a1a1aa"
              }}
              type="button"
            >
              {label(entryIndex)} · {entry.date.slice(5)}
            </button>
          );
        })}
      </div>

      {day.empty ? (
        <p className="m-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] leading-[1.55] text-[#d4d4d8]">
          Nothing was published or produced on {day.date}. A quiet day is a real result — the
          checks stop work that cannot be supported, and stopping costs nothing.
        </p>
      ) : null}

      {day.articles.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {day.articles.map((article) => (
            <ShareCard article={article} key={`${article.ventureId}-${article.title}`} />
          ))}
        </div>
      ) : null}

      {day.datasets.length || day.streams.length || day.designs.length ? (
        <ul className="m-0 grid list-none gap-1 p-0 text-[12.5px] text-[#a1a1aa]">
          {day.datasets.map((entry) => (
            <li key={`${entry.ventureId}-${entry.dataset}`}>
              <span className="text-[#d4d4d8]">{entry.dataset}</span> — {entry.added} new{" "}
              {entry.added === 1 ? "entry" : "entries"}
            </li>
          ))}
          {day.streams.map((entry) => (
            <li key={entry.stream}>
              <span className="text-[#d4d4d8]">{entry.stream}</span> — {entry.added} new{" "}
              {entry.added === 1 ? "item" : "items"}
            </li>
          ))}
          {day.designs.map((entry) => (
            <li key={entry.ventureId}>
              <span className="text-[#d4d4d8]">{entry.ventureId}</span> — {entry.note}
            </li>
          ))}
        </ul>
      ) : null}

      {/* No archive and no cleanup: this is a window over records that stay where they are. */}
      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717a]">
        The last three days only · older days stay in the delivery records
        {desk.unreadable > 0 ? ` · ${desk.unreadable} could not be read` : ""}
      </p>
    </div>
  );
}
