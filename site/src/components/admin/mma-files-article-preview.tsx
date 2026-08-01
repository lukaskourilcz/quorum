"use client";

import Image from "next/image";
import { Fragment, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AdminMmaArticle } from "@/lib/admin-mma-files";

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
  return <div className="grid gap-4 text-base leading-7 text-[var(--mist)]">{body.split(/\r?\n/u).map((line, index) => {
    if (!line.trim()) return null;
    if (line.startsWith("## ")) return <h4 className="mt-4 text-2xl font-semibold text-[var(--foreground)]" key={index}>{line.slice(3)}</h4>;
    if (line.startsWith("### ")) return <h5 className="mt-3 text-xl font-semibold text-[var(--foreground)]" key={index}>{line.slice(4)}</h5>;
    if (line.startsWith("> ")) return <blockquote className="border-l-2 border-[var(--accent)] pl-4 italic" key={index}>{inline(line.slice(2))}</blockquote>;
    return <p key={index}>{inline(line)}</p>;
  })}</div>;
}

export function MmaFilesArticlePreview({ article }: { article: AdminMmaArticle }) {
  const [locale, setLocale] = useState<"en" | "cs">("en");
  const copy = article.localizations[locale];
  return <Fragment>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Article language">
      <Button aria-pressed={locale === "en"} onClick={() => setLocale("en")} type="button" variant={locale === "en" ? "accent" : "secondary"}>English</Button>
      <Button aria-pressed={locale === "cs"} onClick={() => setLocale("cs")} type="button" variant={locale === "cs" ? "accent" : "secondary"}>Česky</Button>
    </div>
    <Image alt={`${copy.title} typographic cover`} className="h-auto w-full rounded-[var(--radius-button)] border border-[var(--border)]" height={900} src={article.heroUrl} unoptimized width={1600} />
    <article className="mt-7">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--fog)]">{article.format.replaceAll("-", " ")} · {article.slot.toUpperCase()}</p>
      <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{copy.title}</h3>
      <p className="mt-3 text-lg leading-7 text-[var(--fog)]">{copy.dek}</p>
      <div className="mt-7 border-t border-[var(--border)] pt-6"><SafeMdx body={copy.bodyMDX} /></div>
    </article>
  </Fragment>;
}
