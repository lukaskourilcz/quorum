import Image from "next/image";
import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEntityBadge,
  AdminMetric,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import { CopySocialText } from "./copy-social-text";
import { MmaFilesArticlePreview } from "./mma-files-article-preview";
import { MmaFilesBannersPanel } from "./mma-files-banners-panel";
import { RatingWidget } from "./rating-widget";
import type { AdminMmaArticle, AdminMmaFilesSnapshot } from "@/lib/admin-mma-files";
import { formatDate } from "@/lib/utils";

type Tab = "articles" | "predictions" | "banners" | "calendar" | "social-lab";

const statusTone = (status: string): "neutral" | "success" | "warning" | "destructive" => status === "published" ? "success" : status === "blocked" || status === "killed" ? "destructive" : status === "assigned" ? "warning" : "neutral";
const statusLabel = (status: string) => ({ assigned: "chosen", published: "finished", killed: "rejected", blocked: "blocked" }[status] ?? status.replaceAll("_", " "));

function articleWeeks(articles: AdminMmaArticle[]): Array<[string, AdminMmaArticle[]]> {
  const groups = new Map<string, AdminMmaArticle[]>();
  for (const article of articles) groups.set(article.weekStart, [...(groups.get(article.weekStart) ?? []), article]);
  return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left));
}

function ArticlesPanel({ snapshot }: { snapshot: AdminMmaFilesSnapshot }) {
  if (!snapshot.articles.length) {
    return <AdminStateMessage description="Test examples stay outside this view, and a failed live slot is never disguised as a finished article." state="initial-empty" title="No finished articles are stored yet" />;
  }
  return (
    <div className="grid gap-5">
      {articleWeeks(snapshot.articles).map(([week, articles]) => (
        <section className="grid gap-3" key={week}>
          <AdminSectionHeading title={<>Week from <time dateTime={week}>{formatDate(week)}</time></>} />
          {articles.map((article) => (
            <AdminCard key={article.id}>
              <AdminCardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]"><time dateTime={article.date}>{formatDate(article.date)}</time> · {article.slot.toUpperCase()}</p>
                    <div className="mt-2 flex flex-wrap gap-2">{article.placements.map((placement) => <AdminEntityBadge key={placement}>{placement}</AdminEntityBadge>)}{article.organization ? <AdminStatusBadge tone="success">{article.organization.toUpperCase()}</AdminStatusBadge> : <AdminStatusBadge tone="warning">Missing organization</AdminStatusBadge>}</div>
                  </div>
                  <AdminStatusBadge tone={statusTone(article.status)}>{statusLabel(article.status)}</AdminStatusBadge>
                </div>
              </AdminCardHeader>
              <AdminCardContent>
                <MmaFilesArticlePreview article={article} />
                <footer className="mt-5 border-t border-[var(--admin-border)] pt-4">
                  <h4 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)]">Sources behind this article</h4>
                  <ul className="mt-2 grid gap-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{article.sources.map((source, index) => <li className="break-all" key={`${source.kind}-${index}`}>{source.kind === "internal" ? source.ref : <a className="admin-focus-ring underline underline-offset-2" href={source.url} rel="noreferrer" target="_blank">{source.url}</a>}</li>)}</ul>
                  {article.modelVersion ? <p className="m-0 mt-2 text-[length:var(--admin-type-control)]">Calculation rules: <code>{article.modelVersion}</code></p> : null}
                </footer>
                <RatingWidget contentHash={article.contentHash} initialHistory={article.ratings} objectId={article.id} objectKind="article" ventureId="mma-files" />
              </AdminCardContent>
            </AdminCard>
          ))}
        </section>
      ))}
    </div>
  );
}

function PredictionsPanel({ snapshot }: { snapshot: AdminMmaFilesSnapshot }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-px overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-border)] sm:grid-cols-2 xl:grid-cols-4">
        {(["ufc", "oktagon"] as const).map((organization) => {
          const counts = snapshot.predictions.organizations[organization];
          return <AdminMetric key={organization} label={organization} note={`${counts.bouts} bouts · ${counts.confirmed} confirmed · ${counts.completed} completed`} value={`${counts.events} events`} />;
        })}
        <AdminMetric label="Corroboration" note={`${snapshot.predictions.corroboration.oneProvider} single-provider`} value={`${snapshot.predictions.corroboration.multipleProviders} multiple`} />
        <AdminMetric label="Latest snapshot" note={snapshot.predictions.lastSnapshotAt ? formatDate(snapshot.predictions.lastSnapshotAt) : "No source snapshot"} value={snapshot.predictions.lastSnapshotAgeHours === null ? "—" : `${snapshot.predictions.lastSnapshotAgeHours.toFixed(1)} h`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {snapshot.predictions.sources.map((source) => (
          <AdminCard key={source.id}>
            <AdminCardContent className="grid gap-2">
              <div className="flex items-start justify-between gap-3"><div><p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{source.id}</p><h3 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{source.name}</h3></div><AdminStatusBadge tone={source.state === "wired" ? "success" : source.state === "blocked" ? "destructive" : "warning"}>{source.state}</AdminStatusBadge></div>
              <p className="m-0 text-[length:var(--admin-type-control)]">{source.quota}</p>
              <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{source.lastRetrievedAt ? `${source.lastStatus} · ${source.freshnessHours?.toFixed(1)} h old` : "No recorded run"}</p>
            </AdminCardContent>
          </AdminCard>
        ))}
      </div>
    </div>
  );
}

function CalendarPanel({ snapshot }: { snapshot: AdminMmaFilesSnapshot }) {
  if (!snapshot.calendar.length) return <AdminStateMessage description="A missed slot appears here as missed, not as an empty article." state="initial-empty" title="No daily article plan is stored yet" />;
  return (
    <div className="grid gap-4">
      {snapshot.calendar.map((day) => (
        <AdminCard key={day.date}>
          <AdminCardHeader><AdminSectionHeading title={<time dateTime={day.date}>{formatDate(day.date)}</time>} /></AdminCardHeader>
          <AdminCardContent className="divide-y divide-[var(--admin-border)] py-0">
            {day.slots.map((slot) => {
              const state = slot.articleStatus ?? slot.status;
              return (
                <div className="grid gap-2 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-start" key={slot.slot}>
                  <strong className="text-[length:var(--admin-type-control)] uppercase">{slot.slot}</strong>
                  <div><p className="m-0 font-medium">{slot.format.replaceAll("-", " ")}</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{slot.killedReason ?? slot.rationale}</p></div>
                  <AdminStatusBadge tone={statusTone(state)}>{statusLabel(state === "killed" ? "killed" : slot.articleStatus ?? "not run")}</AdminStatusBadge>
                </div>
              );
            })}
          </AdminCardContent>
        </AdminCard>
      ))}
    </div>
  );
}

function SocialPanel({ snapshot }: { snapshot: AdminMmaFilesSnapshot }) {
  return (
    <div className="grid gap-5">
      <AdminCallout>Phase 2 rotates versions A and B but does not collect views, clicks, reactions or other reader data. Measurement stays off until the owner opens Phase 3.</AdminCallout>
      {snapshot.socialPacks.length ? snapshot.socialPacks.map((pack) => (
        <AdminCard key={pack.articleRef}>
          <AdminCardHeader><AdminSectionHeading actions={<AdminStatusBadge>{statusLabel(pack.status)}</AdminStatusBadge>} title={<span className="break-all">{pack.articleRef}</span>} /></AdminCardHeader>
          <AdminCardContent className="grid gap-6 xl:grid-cols-2">
            {pack.variants.map((variant) => (
              <section aria-labelledby={`${pack.articleRef}-${variant.id}`} className="min-w-0" key={variant.id}>
                <h4 className="m-0 text-[length:var(--admin-type-section)] font-semibold" id={`${pack.articleRef}-${variant.id}`}>Version {variant.id}</h4>
                <p className="m-0 mt-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{Object.values(variant.designAxes).map((value) => value.replaceAll("-", " ")).join(" · ")}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["en", "cs"] as const).map((locale) => (
                    <div className="min-w-0" key={locale}>
                      <Image alt={`Version ${variant.id} ${locale.toUpperCase()} carousel cover`} className="h-auto w-full rounded-[var(--admin-radius)] border border-[var(--admin-border)]" height={1350} src={variant.imageUrls[locale]} unoptimized width={1080} />
                      <div className="mt-2"><AdminEntityBadge>{locale.toUpperCase()}</AdminEntityBadge></div>
                      <div className="mt-3 grid gap-3">
                        <div><div className="flex items-center justify-between gap-2"><strong className="text-[length:var(--admin-type-micro)] uppercase">Instagram</strong><CopySocialText text={variant.captions[locale].instagram} /></div><p className="m-0 mt-1 whitespace-pre-wrap text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{variant.captions[locale].instagram}</p></div>
                        <div><div className="flex items-center justify-between gap-2"><strong className="text-[length:var(--admin-type-micro)] uppercase">Threads</strong><CopySocialText text={variant.captions[locale].threads} /></div><p className="m-0 mt-1 whitespace-pre-wrap text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{variant.captions[locale].threads}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
                <RatingWidget contentHash={variant.contentHash} initialHistory={variant.ratings} objectId={`${pack.articleRef}:${variant.id}`} objectKind="social-variant" ventureId="mma-files" />
              </section>
            ))}
          </AdminCardContent>
        </AdminCard>
      )) : <AdminStateMessage description="A set appears only after both article languages pass." state="initial-empty" title="No social versions are stored" />}
    </div>
  );
}

export function MmaFilesAdminPanel({ snapshot, tab }: { snapshot: AdminMmaFilesSnapshot; tab: Tab }) {
  if (tab === "articles") return <ArticlesPanel snapshot={snapshot} />;
  if (tab === "predictions") return <PredictionsPanel snapshot={snapshot} />;
  if (tab === "banners") return <MmaFilesBannersPanel banners={snapshot.banners} />;
  if (tab === "calendar") return <CalendarPanel snapshot={snapshot} />;
  return <SocialPanel snapshot={snapshot} />;
}
