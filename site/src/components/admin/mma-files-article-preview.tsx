"use client";

import Image from "next/image";
import { Fragment, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AdminMmaArticle } from "@/lib/admin-mma-files";

/**
 * Drop any inline source marker before the body is rendered.
 *
 * MMA Files no longer writes them: the writer is not asked for one and the pipeline strips
 * whatever arrives. Packages stored before that change still carry them inside a bodyMDX that
 * the package hash covers, so they cannot be edited out of the file without invalidating the
 * hash — 2026-08-02-am-ufc-valentina-shevchenko.json prints
 * "[source:state/mma/fighters/ufc:valentina-shevchenko.json]" mid-sentence in both languages.
 * Cleaning at render is what keeps a repository path off the page for those. Provenance is not
 * hidden by this: the panel around this component lists the package's sources array in full.
 *
 * Kept in step with stripSourceMarkers in orchestrator/src/mma-files/style.ts: same two marker
 * spellings, same whitespace repair. The site does not depend on the orchestrator package, so
 * sharing one implementation would mean adding that dependency.
 */
export function withoutSourceMarkers(body: string): string {
  return body
    .replaceAll(/\[\^source-\d+\]|\[source:[^\]]+\]/giu, "")
    .replaceAll(/[ \t]+([.,;:!?])/gu, "$1")
    .replaceAll(/[ \t]{2,}/gu, " ")
    .replaceAll(/[ \t]+$/gmu, "")
    .trim();
}

function inline(value: string): ReactNode[] {
  const output: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(/\[([^\]]+)\]\((\/fighters\/(?:ufc|oktagon)\/[a-z0-9-]+)\)/gu)) {
    const index = match.index ?? 0;
    if (index > cursor) output.push(value.slice(cursor, index));
    const href = `https://mma-files.vercel.app/en${match[2]}`;
    output.push(<a className="font-semibold text-[var(--accent)] underline underline-offset-4" href={href} key={`${match[2]}-${index}`} rel="noreferrer" target="_blank">{match[1]}</a>);
    cursor = index + match[0].length;
  }
  if (cursor < value.length) output.push(value.slice(cursor));
  return output;
}

function SafeMdx({ body }: { body: string }) {
  return <div className="grid gap-4 text-base leading-7 text-[var(--mist)]">{withoutSourceMarkers(body).split(/\r?\n/u).map((line, index) => {
    if (!line.trim()) return null;
    if (line.startsWith("## ")) return <h4 className="mt-4 text-2xl font-semibold text-[var(--foreground)]" key={index}>{line.slice(3)}</h4>;
    if (line.startsWith("### ")) return <h5 className="mt-3 text-xl font-semibold text-[var(--foreground)]" key={index}>{line.slice(4)}</h5>;
    if (line.startsWith("> ")) return <blockquote className="border-l-2 border-[var(--accent)] pl-4 italic" key={index}>{inline(line.slice(2))}</blockquote>;
    return <p key={index}>{inline(line)}</p>;
  })}</div>;
}

export function MmaFilesArticlePreview({ article }: { article: AdminMmaArticle }) {
  const [locale, setLocale] = useState<"en" | "cs">("en");
  const stored = article.localizations[locale];
  // Cleaned once, here, so the headline, the standfirst, the body and the hero's alt text all
  // show the same text. Doing it inside SafeMdx alone left a marker in a title free to print.
  const copy = {
    title: withoutSourceMarkers(stored.title),
    dek: withoutSourceMarkers(stored.dek),
    bodyMDX: stored.bodyMDX
  };
  return <Fragment>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Article language">
      <Button aria-pressed={locale === "en"} onClick={() => setLocale("en")} type="button" variant={locale === "en" ? "accent" : "secondary"}>English</Button>
      <Button aria-pressed={locale === "cs"} onClick={() => setLocale("cs")} type="button" variant={locale === "cs" ? "accent" : "secondary"}>Česky</Button>
    </div>
    {article.hero ? (
      <figure className="m-0">
        {/* The package's own alt text, in the language on screen. The old string described a
            typographic plate no matter what the picture was, which for a photograph of two
            people at a range is not a description of anything. */}
        <Image alt={withoutSourceMarkers(article.hero.alt[locale])} className="h-auto w-full rounded-[var(--radius-button)] border border-[var(--border)]" height={900} src={article.hero.url} unoptimized width={1600} />
        <figcaption className="mt-2 text-xs text-[var(--fog)]">
          {article.hero.credit}{" · "}
          <a className="underline underline-offset-4 hover:text-[var(--foreground)]" href={article.hero.sourceUrl} rel="noreferrer" target="_blank">zdroj</a>
        </figcaption>
      </figure>
    ) : (
      <p className="rounded-[var(--radius-button)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fog)]">
        Balíček nenese čitelný obrázek s uvedením autora, takže se tu žádný nezobrazuje.
      </p>
    )}
    <article className="mt-7">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--fog)]">{article.format.replaceAll("-", " ")} · {article.slot.toUpperCase()}</p>
      <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{copy.title}</h3>
      <p className="mt-3 text-lg leading-7 text-[var(--fog)]">{copy.dek}</p>
      <div className="mt-7 border-t border-[var(--border)] pt-6"><SafeMdx body={copy.bodyMDX} /></div>
    </article>
  </Fragment>;
}
