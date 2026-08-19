"use client";

import { useState } from "react";
import { AdminButton, AdminStateMessage } from "./admin-primitives";
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
    <article className="grid overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)]">
      <div className="flex aspect-[1.91/1] items-center justify-center overflow-hidden bg-[var(--admin-surface-muted)]">
        {article.imageHref ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={article.imageAlt ?? ""}
            className="h-full w-full object-cover"
            loading="lazy"
            src={article.imageHref}
          />
        ) : (
          <p className="m-0 max-w-[36ch] px-4 text-center text-[length:var(--admin-type-micro)] font-semibold uppercase leading-[1.6] tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
            {article.imageNote ?? "No picture recorded"}
          </p>
        )}
      </div>
      <div className="grid gap-1 border-t border-[var(--admin-border)] p-3.5">
        <span className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
          {domainOf(article.url) ?? article.ventureName}
        </span>
        <span className="text-[length:var(--admin-type-section)] font-semibold leading-[1.4] text-[var(--admin-foreground)]">{article.title}</span>
        {article.description ? (
          <span className="line-clamp-2 text-[length:var(--admin-type-control)] leading-[1.5] text-[var(--admin-foreground-muted)]">{article.description}</span>
        ) : null}
        {article.url ? (
          <a
            className="admin-focus-ring mt-1 truncate text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)] underline underline-offset-2"
            href={article.url}
            rel="noreferrer"
            target="_blank"
          >
            {article.url}
          </a>
        ) : (
          <span className="mt-1 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
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
      <AdminStateMessage state="initial-empty" title="Nothing has been recorded in the last three days" />
    );
  }

  const label = (offset: number) => offset === 0 ? "Today" : offset === 1 ? "Yesterday" : "Day before";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {desk.days.map((entry, entryIndex) => {
          const on = entryIndex === index;
          return (
            <AdminButton
              aria-pressed={on}
              className={on ? "border-[var(--admin-section-accent)] bg-[var(--admin-surface-selected)]" : undefined}
              key={entry.date}
              onClick={() => setIndex(entryIndex)}
              type="button"
              variant="secondary"
            >
              {label(entryIndex)} · {entry.date.slice(5)}
            </AdminButton>
          );
        })}
      </div>

      {day.empty ? (
        <AdminStateMessage
          description="A quiet day is a real result: the checks stop unsupported work, and stopping costs nothing."
          state="initial-empty"
          title={`Nothing was published or produced on ${day.date}`}
        />
      ) : null}

      {day.articles.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {day.articles.map((article) => (
            <ShareCard article={article} key={`${article.ventureId}-${article.title}`} />
          ))}
        </div>
      ) : null}

      {day.datasets.length || day.streams.length || day.designs.length ? (
        <ul className="m-0 grid list-none gap-1 p-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
          {day.datasets.map((entry) => (
            <li key={`${entry.ventureId}-${entry.dataset}`}>
              <span className="font-medium text-[var(--admin-foreground)]">{entry.dataset}</span> — {entry.added} new{" "}
              {entry.added === 1 ? "entry" : "entries"}
            </li>
          ))}
          {day.streams.map((entry) => (
            <li key={entry.stream}>
              <span className="font-medium text-[var(--admin-foreground)]">{entry.stream}</span> — {entry.added} new{" "}
              {entry.added === 1 ? "item" : "items"}
            </li>
          ))}
          {day.designs.map((entry) => (
            <li key={entry.ventureId}>
              <span className="font-medium text-[var(--admin-foreground)]">{entry.ventureId}</span> — {entry.note}
            </li>
          ))}
        </ul>
      ) : null}

      {/* No archive and no cleanup: this is a window over records that stay where they are. */}
      <p className="admin-tabular m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
        The last three days only · older days stay in the delivery records
        {desk.unreadable > 0 ? ` · ${desk.unreadable} could not be read` : ""}
      </p>
    </div>
  );
}
