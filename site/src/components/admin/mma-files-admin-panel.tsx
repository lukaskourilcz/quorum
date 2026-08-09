import Image from "next/image";
import { CopySocialText } from "./copy-social-text";
import { MmaFilesArticlePreview } from "./mma-files-article-preview";
import { MmaFilesBannersPanel } from "./mma-files-banners-panel";
import { RatingWidget } from "./rating-widget";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminMmaArticle, AdminMmaFilesSnapshot } from "@/lib/admin-mma-files";
import { formatDate } from "@/lib/utils";

type Tab = "articles" | "predictions" | "banners" | "calendar" | "social-lab";
const statusTone = (status: string): "neutral" | "success" | "warning" | "danger" => status === "published" ? "success" : status === "blocked" || status === "killed" ? "danger" : "neutral";
const statusLabel = (status: string) => ({ assigned: "chosen", published: "finished", killed: "rejected", blocked: "blocked" }[status] ?? status.replaceAll("_", " "));

function articleWeeks(articles: AdminMmaArticle[]): Array<[string, AdminMmaArticle[]]> {
  const groups = new Map<string, AdminMmaArticle[]>();
  for (const article of articles) groups.set(article.weekStart, [...(groups.get(article.weekStart) ?? []), article]);
  return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left));
}

export function MmaFilesAdminPanel({ snapshot, tab }: { snapshot: AdminMmaFilesSnapshot; tab: Tab }) {
  if (tab === "articles") return <div className="mt-8 grid gap-7">
    {snapshot.articles.length ? articleWeeks(snapshot.articles).map(([week, articles]) => <section className="grid gap-5" key={week}>
      <h3 className="font-mono text-sm font-bold uppercase tracking-[0.12em]">Week from <time dateTime={week}>{formatDate(week)}</time></h3>
      {articles.map((article) => <Card key={article.id}><CardContent>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]"><time dateTime={article.date}>{formatDate(article.date)}</time> · {article.slot.toUpperCase()}</p><div className="mt-2 flex flex-wrap gap-2">{article.placements.map((placement) => <Badge key={placement}>{placement}</Badge>)}{article.organization ? <Badge tone="success">{article.organization.toUpperCase()}</Badge> : <Badge tone="warning">Missing organization</Badge>}</div></div><Badge tone={statusTone(article.status)}>{statusLabel(article.status)}</Badge></div>
        <MmaFilesArticlePreview article={article} />
        <footer className="mt-8 border-t border-[var(--border)] pt-6"><h4 className="font-mono text-xs font-bold uppercase tracking-[0.12em]">Sources behind this article</h4><ul className="mt-3 grid gap-2 text-sm text-[var(--fog)]">{article.sources.map((source, index) => <li className="break-all" key={`${source.kind}-${index}`}>{source.kind === "internal" ? source.ref : <a className="text-[var(--accent)] underline" href={source.url} rel="noreferrer" target="_blank">{source.url}</a>}</li>)}</ul>{article.modelVersion ? <p className="mt-3 text-sm">Calculation rules: <code>{article.modelVersion}</code></p> : null}</footer>
        <RatingWidget contentHash={article.contentHash} initialHistory={article.ratings} objectId={article.id} objectKind="article" ventureId="mma-files" />
      </CardContent></Card>)}
    </section>) : <Callout>No finished articles are stored yet. Test examples stay outside this view, and a failed live slot is never disguised as a finished article.</Callout>}
  </div>;

  if (tab === "predictions") return <div className="mt-8 grid gap-6">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {(["ufc", "oktagon"] as const).map((org) => { const counts = snapshot.predictions.organizations[org]; return <Card key={org}><CardContent><p className="font-mono text-xs uppercase text-[var(--fog)]">{org}</p><h3 className="mt-2 text-3xl font-semibold">{counts.events} events</h3><p className="mt-2 text-sm text-[var(--fog)]">{counts.bouts} bouts · {counts.confirmed} confirmed · {counts.completed} completed</p></CardContent></Card>; })}
      <Card><CardContent><p className="font-mono text-xs uppercase text-[var(--fog)]">Corroboration</p><h3 className="mt-2 text-3xl font-semibold">{snapshot.predictions.corroboration.multipleProviders}</h3><p className="mt-2 text-sm text-[var(--fog)]">multiple providers · {snapshot.predictions.corroboration.oneProvider} single-provider</p></CardContent></Card>
      <Card><CardContent><p className="font-mono text-xs uppercase text-[var(--fog)]">Latest snapshot</p><h3 className="mt-2 text-3xl font-semibold">{snapshot.predictions.lastSnapshotAgeHours === null ? "—" : `${snapshot.predictions.lastSnapshotAgeHours.toFixed(1)} h`}</h3><p className="mt-2 text-sm text-[var(--fog)]">{snapshot.predictions.lastSnapshotAt ? formatDate(snapshot.predictions.lastSnapshotAt) : "No source snapshot"}</p></CardContent></Card>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">{snapshot.predictions.sources.map((source) => <Card key={source.id}><CardContent><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">{source.id}</p><h3 className="mt-2 text-xl font-semibold">{source.name}</h3></div><Badge tone={source.state === "wired" ? "success" : source.state === "blocked" ? "danger" : "warning"}>{source.state}</Badge></div><p className="mt-4 text-sm">{source.quota}</p><p className="mt-2 text-sm text-[var(--fog)]">{source.lastRetrievedAt ? `${source.lastStatus} · ${source.freshnessHours?.toFixed(1)} h old` : "No recorded run"}</p></CardContent></Card>)}</div>
  </div>;

  if (tab === "banners") return <MmaFilesBannersPanel banners={snapshot.banners} />;

  if (tab === "calendar") return <div className="mt-8 grid gap-5">
    {snapshot.calendar.length ? snapshot.calendar.map((day) => <Card key={day.date}><CardContent><h3 className="text-2xl font-semibold"><time dateTime={day.date}>{formatDate(day.date)}</time></h3><div className="mt-5 grid gap-4 md:grid-cols-2">{day.slots.map((slot) => { const state = slot.articleStatus ?? slot.status; return <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-5" key={slot.slot}><div className="flex items-center justify-between gap-3"><strong className="uppercase">{slot.slot}</strong><Badge tone={statusTone(state)}>{statusLabel(state === "killed" ? "killed" : slot.articleStatus ?? "not run")}</Badge></div><p className="mt-3 font-semibold">{slot.format.replaceAll("-", " ")}</p><p className="mt-2 text-sm leading-6 text-[var(--fog)]">{slot.killedReason ?? slot.rationale}</p></div>; })}</div></CardContent></Card>) : <Callout>No daily article plan is stored yet. A missed slot will appear here as missed, not as an empty article.</Callout>}
  </div>;

  return <div className="mt-8 grid gap-7">
    <Callout>Phase 2 rotates versions A and B but does not collect views, clicks, reactions or other reader data. Measurement stays off until the owner opens Phase 3.</Callout>
    {snapshot.socialPacks.length ? snapshot.socialPacks.map((pack) => <Card key={pack.articleRef}><CardContent><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">Social drafts</p><h3 className="mt-2 break-all text-2xl font-semibold">{pack.articleRef}</h3></div><Badge>{statusLabel(pack.status)}</Badge></div><div className="mt-7 grid gap-8 xl:grid-cols-2">{pack.variants.map((variant) => <section aria-labelledby={`${pack.articleRef}-${variant.id}`} key={variant.id}><h4 className="text-xl font-semibold" id={`${pack.articleRef}-${variant.id}`}>Version {variant.id}</h4><p className="mt-2 text-sm text-[var(--fog)]">{Object.values(variant.designAxes).map((value) => value.replaceAll("-", " ")).join(" · ")}</p><div className="mt-4 grid grid-cols-2 gap-3">{(["en", "cs"] as const).map((locale) => <div key={locale}><Image alt={`Version ${variant.id} ${locale.toUpperCase()} carousel cover`} className="h-auto w-full rounded-[var(--radius-button)] border border-[var(--border)]" height={1350} src={variant.imageUrls[locale]} unoptimized width={1080} /><div className="mt-3 flex items-center justify-between gap-2"><Badge>{locale.toUpperCase()}</Badge></div><div className="mt-3 space-y-3"><div><div className="flex items-center justify-between gap-2"><strong className="text-xs uppercase">Instagram</strong><CopySocialText text={variant.captions[locale].instagram} /></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--fog)]">{variant.captions[locale].instagram}</p></div><div><div className="flex items-center justify-between gap-2"><strong className="text-xs uppercase">Threads</strong><CopySocialText text={variant.captions[locale].threads} /></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--fog)]">{variant.captions[locale].threads}</p></div></div></div>)}</div><RatingWidget contentHash={variant.contentHash} initialHistory={variant.ratings} objectId={`${pack.articleRef}:${variant.id}`} objectKind="social-variant" ventureId="mma-files" /></section>)}</div></CardContent></Card>) : <Callout>No social versions are stored. A set appears only after both article languages pass.</Callout>}
  </div>;
}
