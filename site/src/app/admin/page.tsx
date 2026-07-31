import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, Database, Images, Layers3, LockKeyhole, RefreshCw } from "lucide-react";
import { CopySocialText } from "@/components/admin/copy-social-text";
import { PortfolioCard } from "@/components/admin/portfolio-card";
import { Mark } from "@/components/brand/mark";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { readAdminPortfolio, type AdminVentureTab } from "@/lib/admin-portfolio";
import { readAdminSnapshot, type AdminSocialPack } from "@/lib/admin-state";
import { publicMeetingHref } from "@/lib/idea-ledger-model";
import { getPublicStandups } from "@/lib/standup-records";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  description: "Protected BoardlessAI social archive and operating state.",
  robots: {
    follow: false,
    index: false,
    nocache: true
  },
  title: "Admin"
};

function queueTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "published") return "success";
  if (["failed", "needs_reconciliation"].includes(status)) return "danger";
  if (["approved", "queued", "publishing"].includes(status)) return "warning";
  return "neutral";
}

function SocialCopy({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h4 className="font-mono text-xs font-bold uppercase tracking-[0.12em]">{label}</h4>
        <CopySocialText text={text} />
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-[var(--mist)]">
        {text}
      </pre>
    </div>
  );
}

function SocialLocalePanel({ pack, locale }: { pack: AdminSocialPack; locale: "en" | "cs" }) {
  const localized = pack.byLocale[locale];
  const queue = pack.queue.filter((item) => item.locale === locale);
  return (
    <section aria-labelledby={`${pack.date}-${locale}`} className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--fog)]">
            {locale === "cs" ? "České vydání" : "English edition"}
          </p>
          <h3 className="mt-1 text-2xl font-semibold" id={`${pack.date}-${locale}`}>
            {locale.toUpperCase()} social pack
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {queue.map((item) => (
            <Badge key={item.channel} tone={queueTone(item.status)}>
              {item.channel} · {item.status.replaceAll("_", " ")}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {localized.instagram.frames.map((frame, index) => (
          <a
            className="overflow-hidden rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            href={frame}
            key={frame}
            rel="noreferrer"
            target="_blank"
          >
            <Image
              alt={`Open ${locale.toUpperCase()} carousel frame ${index + 1}`}
              className="h-auto w-full"
              height={1350}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 240px"
              src={frame}
              width={1080}
            />
          </a>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SocialCopy label="Instagram caption" text={localized.instagram.text} />
        <SocialCopy label="Threads post" text={localized.threads.text} />
      </div>
      <p className="mt-4 break-all font-mono text-[0.6875rem] leading-5 text-[var(--fog)]">
        Destination: <a className="text-[var(--accent)] underline" href={localized.destination} rel="noreferrer" target="_blank">{localized.destination}</a>
      </p>
    </section>
  );
}

function SocialArchive({ packs, unreadableFiles }: { packs: AdminSocialPack[]; unreadableFiles: string[] }) {
  return (
    <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8" id="social-archive">
      <div className="mb-6 flex items-center gap-3">
        <Images aria-hidden="true" className="size-5 text-[var(--accent)]" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em]">Caught Up social archive</p>
          <p className="mt-1 text-sm text-[var(--fog)]">Bilingual, copy-ready drafts stored in Git with their deterministic carousel images.</p>
        </div>
      </div>

      {unreadableFiles.length > 0 ? (
        <Callout className="mb-5" tone="warning">
          {unreadableFiles.length} social pack {unreadableFiles.length === 1 ? "file is" : "files are"} malformed or unreadable. Review: {unreadableFiles.join(", ")}.
        </Callout>
      ) : null}

      {packs.length === 0 ? (
        <Callout>
          No live social pack has been stored yet. A successful Caught Up edition writes one bilingual pack to <code>state/social/packs/</code>, four draft queue records to <code>state/social/queue/</code>, and the carousel frames to <code>site/public/social/</code>. Nothing is posted automatically while the social kill switch remains on.
        </Callout>
      ) : (
        <div className="grid gap-6">
          {packs.map((pack) => (
            <Card key={pack.date}>
              <CardContent>
                <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Edition</p>
                    <h2 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{pack.date}</h2>
                  </div>
                  <div className="text-right font-mono text-[0.6875rem] leading-5 text-[var(--fog)]">
                    <p>Package {pack.editionRef.slice(0, 12)}…</p>
                    <a className="text-[var(--accent)] underline" href={pack.quoteCard.frame} rel="noreferrer" target="_blank">Open quote card</a>
                  </div>
                </div>
                <div className="grid gap-10 2xl:grid-cols-2">
                  <SocialLocalePanel locale="en" pack={pack} />
                  <SocialLocalePanel locale="cs" pack={pack} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function StatePanel({ title, content }: { title: string; content: string }) {
  return (
    <Card className="min-w-0">
      <CardContent>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-[-0.035em]">{title}</h2>
          <Badge>Read only</Badge>
        </div>
        <pre className="max-h-[34rem] min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-button)] bg-[var(--secondary)] p-5 font-mono text-xs leading-6 text-[var(--steel)]">
          {content}
        </pre>
      </CardContent>
    </Card>
  );
}

const cardKindByTab = {
  ideas: "idea",
  plans: "plan",
  visuals: "visual",
  "niche-proposals": "niche-proposal"
} as const;

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ venture?: string; tab?: string }>;
}) {
  const [{ venture: requestedVenture, tab: requestedTab }, state, portfolio, standups] = await Promise.all([
    searchParams,
    readAdminSnapshot(),
    readAdminPortfolio(),
    getPublicStandups()
  ]);
  const selectedVenture = portfolio.ventures.find((venture) => venture.id === requestedVenture) ?? null;
  const selectedTab = selectedVenture
    ? selectedVenture.tabs.includes(requestedTab as AdminVentureTab)
      ? requestedTab as AdminVentureTab
      : selectedVenture.tabs[0] ?? null
    : null;
  const visibleCards = selectedVenture && selectedTab
    ? selectedVenture.cards.filter((card) => card.kind === cardKindByTab[selectedTab])
    : [];
  const shortlist = selectedVenture?.id === "incubator"
    ? selectedVenture.cards.filter((card) => card.kind === "niche-proposal" && card.status === "shortlist")
    : [];
  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex min-h-18 max-w-[var(--container)] items-center justify-between gap-5 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Mark />
            <span className="font-semibold">BoardlessAI Admin</span>
            <Badge className="hidden sm:inline-flex" tone="warning">Protected</Badge>
          </div>
          <Link
            className={buttonVariants({ variant: "ghost" })}
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Public site
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-18">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <div className="flex flex-wrap gap-2">
              <Badge tone="dark">Server-side state</Badge>
              <Badge>noindex</Badge>
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] md:text-7xl">
              Portfolio desk
              <span className="text-[var(--accent)]">.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
              Review canonical venture artifacts, rate the work that should shape
              tomorrow’s meetings, and keep the existing global social queue in
              one protected, Git-backed operating view.
            </p>
          </div>
          <div className="grid gap-3 md:col-span-4">
            <div className="flex items-center gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
              <LockKeyhole
                aria-hidden="true"
                className="size-4 text-[var(--accent)]"
              />
              HTTP Basic Auth · fail closed
            </div>
            <div className="flex items-center gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
              <RefreshCw
                aria-hidden="true"
                className="size-4 text-[var(--accent)]"
              />
              Snapshot {new Date(state.generatedAt).toISOString()}
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Admin workspaces" className="mx-auto max-w-[var(--container)] px-5 pb-8 md:px-8">
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-5">
          <Link
            aria-current={!selectedVenture ? "page" : undefined}
            className={buttonVariants({ variant: !selectedVenture ? "accent" : "secondary" })}
            href="/admin?venture=global"
            scroll={false}
          >
            <Database aria-hidden="true" className="size-4" />
            Global queue
          </Link>
          {portfolio.ventures.map((venture) => (
            <Link
              aria-current={selectedVenture?.id === venture.id ? "page" : undefined}
              className={buttonVariants({ variant: selectedVenture?.id === venture.id ? "accent" : "secondary" })}
              href={`/admin?venture=${venture.id}`}
              key={venture.id}
              scroll={false}
            >
              <Layers3 aria-hidden="true" className="size-4" />
              {venture.name}
            </Link>
          ))}
        </div>
      </nav>

      {!selectedVenture ? (
        <>
          <SocialArchive {...state.socialArchive} />
          <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8">
            <div className="mb-6 flex items-center gap-3">
              <Database aria-hidden="true" className="size-5 text-[var(--accent)]" />
              <p className="text-xs font-bold uppercase tracking-[0.12em]">Canonical state files</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <StatePanel content={state.inbox} title="Human approval inbox" />
              <StatePanel content={state.business} title="Business" />
              <StatePanel content={state.brand} title="Brand" />
              <StatePanel content={state.opportunities} title="Opportunities" />
              <StatePanel content={state.experiments} title="Experiments" />
              <StatePanel content={state.finance} title="Finance" />
              <StatePanel content={state.social} title="Social strategy" />
              <StatePanel content={state.budgetLedger} title="API budget ledger" />
              <StatePanel content={state.financeLedger} title="Finance ledger" />
              <StatePanel content={state.treasuryLedger} title="Treasury ledger" />
            </div>
          </section>
        </>
      ) : (
        <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="dark">{selectedVenture.status}</Badge>
                <Badge>{selectedVenture.cards.length} review cards</Badge>
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">{selectedVenture.name}</h2>
            </div>
            {selectedVenture.tabs.includes("plans") ? (
              <Link className={buttonVariants({ variant: "secondary" })} href={`/admin/ventures/${selectedVenture.id}/binder`}>
                <BookOpen aria-hidden="true" className="size-4" />
                Launch binder
              </Link>
            ) : null}
          </div>

          <nav aria-label={`${selectedVenture.name} admin sections`} className="mt-7 flex flex-wrap gap-2">
            {selectedVenture.tabs.map((tab) => (
              <Link
                aria-current={selectedTab === tab ? "page" : undefined}
                className={buttonVariants({ variant: selectedTab === tab ? "accent" : "secondary" })}
                href={`/admin?venture=${selectedVenture.id}&tab=${tab}`}
                key={tab}
                scroll={false}
              >
                {tab.replaceAll("-", " ")}
              </Link>
            ))}
          </nav>

          {selectedVenture.unreadableFiles.length ? (
            <Callout className="mt-6" tone="warning">
              {selectedVenture.unreadableFiles.length} canonical file {selectedVenture.unreadableFiles.length === 1 ? "is" : "are"} malformed or unreadable: {selectedVenture.unreadableFiles.join(", ")}.
            </Callout>
          ) : null}

          {shortlist.length ? (
            <aside className="mt-8 rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--surface)] p-6" aria-labelledby="shortlist-heading">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">Owner pick-list</p>
              <h3 className="mt-2 text-2xl font-semibold" id="shortlist-heading">Incubator shortlist</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {shortlist.map((card) => <Badge key={card.id} tone="success">{card.title}</Badge>)}
              </div>
            </aside>
          ) : null}

          {visibleCards.length ? (
            <div className="mt-8 grid gap-5 xl:grid-cols-2">
              {visibleCards.map((card) => (
                <PortfolioCard
                  card={card}
                  key={`${card.kind}-${card.id}`}
                  originHref={card.originMeetingRef ? publicMeetingHref(card.originMeetingRef, standups) : null}
                />
              ))}
            </div>
          ) : (
            <Callout className="mt-8">
              No {selectedTab?.replaceAll("-", " ")} cards are stored for {selectedVenture.name} yet. The admin does not invent demonstration records.
            </Callout>
          )}
        </section>
      )}
    </main>
  );
}
