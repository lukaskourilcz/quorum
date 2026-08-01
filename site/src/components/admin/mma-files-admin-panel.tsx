import Image from "next/image";
import { CopySocialText } from "./copy-social-text";
import { MmaFilesArticlePreview } from "./mma-files-article-preview";
import { MmaFilesMetricsForm } from "./mma-files-metrics-form";
import { RatingWidget } from "./rating-widget";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import type { AdminMmaFilesSnapshot } from "@/lib/admin-mma-files";

type Tab = "articles" | "calendar" | "social-lab";
const statusTone = (status: string): "neutral" | "success" | "warning" | "danger" => status === "published" || status === "confirmed" ? "success" : status === "blocked" || status === "killed" ? "danger" : status === "directional" ? "warning" : "neutral";

export function MmaFilesAdminPanel({ snapshot, tab }: { snapshot: AdminMmaFilesSnapshot; tab: Tab }) {
  if (tab === "articles") return <div className="mt-8 grid gap-7">
    {snapshot.articles.length ? snapshot.articles.map((article) => <Card key={article.id}><CardContent>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">{article.date} · {article.slot.toUpperCase()}</p><p className="mt-1 text-sm text-[var(--fog)]">Both languages are read from one hash-stamped package.</p></div><Badge tone={statusTone(article.status)}>{article.status}</Badge></div>
      <MmaFilesArticlePreview article={article} />
      <footer className="mt-8 border-t border-[var(--border)] pt-6"><h4 className="font-mono text-xs font-bold uppercase tracking-[0.12em]">Sources behind this article</h4><ul className="mt-3 grid gap-2 text-sm text-[var(--fog)]">{article.sources.map((source, index) => <li className="break-all" key={`${source.kind}-${index}`}>{source.kind === "internal" ? source.ref : <a className="text-[var(--accent)] underline" href={source.url} rel="noreferrer" target="_blank">{source.url}</a>}</li>)}</ul>{article.modelVersion ? <p className="mt-3 text-sm">Model version: <code>{article.modelVersion}</code></p> : null}</footer>
      <RatingWidget contentHash={article.contentHash} initialHistory={article.ratings} objectId={article.id} objectKind="article" ventureId="mma-files" />
    </CardContent></Card>) : <Callout>No article packages are stored yet. Dry-run fixtures stay outside this view, and a failed live slot is never disguised as a finished article.</Callout>}
  </div>;

  if (tab === "calendar") return <div className="mt-8 grid gap-5">
    {snapshot.calendar.length ? snapshot.calendar.map((day) => <Card key={day.date}><CardContent><h3 className="text-2xl font-semibold">{day.date}</h3><div className="mt-5 grid gap-4 md:grid-cols-2">{day.slots.map((slot) => <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-5" key={slot.slot}><div className="flex items-center justify-between gap-3"><strong className="uppercase">{slot.slot}</strong><Badge tone={statusTone(slot.articleStatus ?? slot.status)}>{slot.articleStatus ?? (slot.status === "killed" ? "killed" : "not run")}</Badge></div><p className="mt-3 font-semibold">{slot.format.replaceAll("-", " ")}</p><p className="mt-2 text-sm leading-6 text-[var(--fog)]">{slot.killedReason ?? slot.rationale}</p></div>)}</div></CardContent></Card>) : <Callout>No editorial slate is stored yet. A missed slot will appear here as missed, not as an empty article.</Callout>}
  </div>;

  const posts = snapshot.socialPacks.flatMap((pack) =>
    pack.variants.flatMap((variant) =>
      (["instagram", "threads"] as const).flatMap((platform) =>
        (["en", "cs"] as const).map((locale) => ({
          value: `${pack.articleRef}:${variant.id}:${platform}:${locale}`,
          label: `${pack.articleRef} · ${variant.id} · ${platform} · ${locale.toUpperCase()}`
        }))
      )
    )
  );
  return <div className="mt-8 grid gap-7">
    <Card><CardContent><h3 className="text-2xl font-semibold">What the variants have taught us</h3><p className="mt-2 text-sm leading-6 text-[var(--fog)]">A result stays directional until each design family has at least eight posts. Your ratings still outrank engagement.</p><div className="mt-5 overflow-x-auto"><Table><thead><tr><TableHead>Variant</TableHead><TableHead>Window</TableHead><TableHead>Posts</TableHead><TableHead>Views</TableHead><TableHead>Interactions</TableHead><TableHead>Result</TableHead></tr></thead><tbody>{snapshot.scores.map((score) => <tr key={`${score.variant}-${score.window}`}><TableCell>{score.variant}</TableCell><TableCell>{score.window}</TableCell><TableCell>{score.sampleSize}</TableCell><TableCell>{score.views}</TableCell><TableCell>{score.interactions}</TableCell><TableCell><Badge tone={statusTone(score.findingStatus)}>{score.findingStatus}</Badge></TableCell></tr>)}</tbody></Table></div></CardContent></Card>
    <Card><CardContent><h3 className="text-2xl font-semibold">Add post results</h3><p className="mb-6 mt-2 text-sm leading-6 text-[var(--fog)]">This takes about a minute after 48 hours and again after seven days. The form never connects to a social account.</p><MmaFilesMetricsForm posts={posts} /></CardContent></Card>
    {snapshot.socialPacks.length ? snapshot.socialPacks.map((pack) => <Card key={pack.articleRef}><CardContent><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">Social drafts</p><h3 className="mt-2 break-all text-2xl font-semibold">{pack.articleRef}</h3></div><Badge>{pack.status}</Badge></div><div className="mt-7 grid gap-8 xl:grid-cols-2">{pack.variants.map((variant) => <section aria-labelledby={`${pack.articleRef}-${variant.id}`} key={variant.id}><h4 className="text-xl font-semibold" id={`${pack.articleRef}-${variant.id}`}>Variant {variant.id}</h4><p className="mt-2 text-sm text-[var(--fog)]">{Object.values(variant.designAxes).join(" · ")}</p><div className="mt-4 grid grid-cols-2 gap-3">{(["en", "cs"] as const).map((locale) => <div key={locale}><Image alt={`Variant ${variant.id} ${locale.toUpperCase()} carousel cover`} className="h-auto w-full rounded-[var(--radius-button)] border border-[var(--border)]" height={1350} src={variant.imageUrls[locale]} unoptimized width={1080} /><div className="mt-3 flex items-center justify-between gap-2"><Badge>{locale.toUpperCase()}</Badge><CopySocialText text={variant.captions[locale]} /></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--fog)]">{variant.captions[locale]}</p></div>)}</div><RatingWidget contentHash={variant.contentHash} initialHistory={variant.ratings} objectId={`${pack.articleRef}:${variant.id}`} objectKind="social-variant" ventureId="mma-files" /></section>)}</div></CardContent></Card>) : <Callout>No social variants are stored. A pack appears only after both article languages pass.</Callout>}
  </div>;
}
