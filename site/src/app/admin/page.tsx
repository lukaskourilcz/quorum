import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, Database, Images, Layers3, LockKeyhole, LogOut, RefreshCw } from "lucide-react";
import { CopySocialText } from "@/components/admin/copy-social-text";
import { AgentSwitches } from "@/components/admin/agent-switches";
import { FightAiQAdminPanel } from "@/components/admin/fightaiq-admin-panel";
import { MmaFilesAdminPanel } from "@/components/admin/mma-files-admin-panel";
import { PortfolioCard } from "@/components/admin/portfolio-card";
import { Mark } from "@/components/brand/mark";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { readAdminPortfolio, type AdminVentureTab } from "@/lib/admin-portfolio";
import { readAdminFightAiQ } from "@/lib/admin-fightaiq";
import { readAdminMmaFiles } from "@/lib/admin-mma-files";
import { readAdminAgentControls } from "@/lib/admin-agent-controls";
import { readAdminSnapshot, type AdminSocialPack } from "@/lib/admin-state";
import { publicMeetingHref } from "@/lib/idea-ledger-model";
import { getPublicStandups } from "@/lib/standup-records";
import { formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  description: "Protected BoardlessAI project files, ratings and social post drafts.",
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

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    needs_reconciliation: "needs checking",
    in_progress: "being worked on",
    owner_rated: "rated by you",
    proposed: "suggested",
    shortlist: "keep looking at this",
    archived: "closed"
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function tabLabel(tab: AdminVentureTab): string {
  if (tab === "niche-proposals") return "magazine ideas";
  if (tab === "visuals") return "images";
  if (tab === "social-lab") return "social drafts and results";
  if (tab === "slates") return "fight reports";
  return tab;
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
            {locale.toUpperCase()} social posts
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {queue.map((item) => (
            <Badge key={item.channel} tone={queueTone(item.status)}>
              {item.channel} · {statusLabel(item.status)}
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
          <p className="mt-1 text-sm text-[var(--fog)]">English and Czech drafts are stored with carousel images that can be recreated from the same text and design settings.</p>
        </div>
      </div>

      {unreadableFiles.length > 0 ? (
        <Callout className="mb-5" tone="warning">
          {unreadableFiles.length} social post {unreadableFiles.length === 1 ? "file cannot" : "files cannot"} be read. Check: {unreadableFiles.join(", ")}.
        </Callout>
      ) : null}

      {packs.length === 0 ? (
        <Callout>
          No social posts are stored. They stay off until you turn THREADS, INSTAGRAM and FRAME on for Caught Up. Article delivery and the hero image continue without them.
        </Callout>
      ) : (
        <div className="grid gap-6">
          {packs.map((pack) => (
            <Card key={pack.date}>
              <CardContent>
                <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Edition</p>
                    <h2 className="mt-1 text-3xl font-semibold tracking-[-0.04em]"><time dateTime={pack.date}>{formatDate(pack.date)}</time></h2>
                  </div>
                  <div className="text-right font-mono text-[0.6875rem] leading-5 text-[var(--fog)]">
                    <p>Edition file {pack.editionRef.slice(0, 12)}…</p>
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

const cardKindByTab: Partial<Record<AdminVentureTab, "idea" | "plan" | "visual" | "niche-proposal">> = {
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
  const [{ venture: requestedVenture, tab: requestedTab }, state, portfolio, standups, fightaiq, mmaFiles, agentControls] = await Promise.all([
    searchParams,
    readAdminSnapshot(),
    readAdminPortfolio(),
    getPublicStandups(),
    readAdminFightAiQ(),
    readAdminMmaFiles(),
    readAdminAgentControls()
  ]);
  const selectedVenture = portfolio.ventures.find((venture) => venture.id === requestedVenture) ?? null;
  const selectedTab = selectedVenture
    ? selectedVenture.tabs.includes(requestedTab as AdminVentureTab)
      ? requestedTab as AdminVentureTab
      : selectedVenture.tabs[0] ?? null
    : null;
  const visibleCards = selectedVenture && selectedTab && cardKindByTab[selectedTab]
    ? selectedVenture.cards.filter((card) => card.kind === cardKindByTab[selectedTab])
    : [];
  const shortlist = selectedVenture?.id === "incubator"
    ? selectedVenture.cards.filter((card) => card.kind === "niche-proposal" && card.status === "shortlist")
    : [];
  const unreadableFiles = selectedVenture?.id === "mma-files"
    ? [...selectedVenture.unreadableFiles, ...mmaFiles.unreadable]
    : selectedVenture?.unreadableFiles ?? [];
  const savedItemCount = selectedVenture?.id === "mma-files"
    ? mmaFiles.articles.length + mmaFiles.socialPacks.length + mmaFiles.calendar.length
    : selectedVenture?.cards.length ?? 0;
  const selectedAgentControls = agentControls.find((control) => control.ventureId === selectedVenture?.id);
  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex min-h-18 max-w-[var(--container)] items-center justify-between gap-5 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Mark />
            <span className="font-semibold">BoardlessAI Admin</span>
            <Badge className="hidden sm:inline-flex" tone="warning">Protected</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Link
              className={buttonVariants({ variant: "ghost" })}
              href="/"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">Public site</span>
            </Link>
            <form action="/admin/logout" method="post">
              <Button size="small" type="submit" variant="ghost">
                <LogOut aria-hidden="true" className="size-4" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-18">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <div className="flex flex-wrap gap-2">
              <Badge tone="dark">Private admin data</Badge>
              <Badge>Hidden from search</Badge>
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] md:text-7xl">
              Project desk
              <span className="text-[var(--accent)]">.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
              Review each project’s saved work, rate what should shape
              tomorrow’s meetings and find every social draft in one protected
              view backed by the repository.
            </p>
          </div>
          <div className="grid gap-3 md:col-span-4">
            <div className="flex items-center gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
              <LockKeyhole
                aria-hidden="true"
                className="size-4 text-[var(--accent)]"
              />
              Protected by username and password
            </div>
            <div className="flex items-center gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
              <RefreshCw
                aria-hidden="true"
                className="size-4 text-[var(--accent)]"
              />
              Updated <time dateTime={state.generatedAt}>{formatDateTime(state.generatedAt)}</time>
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
            Social posts and company files
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
              <p className="text-xs font-bold uppercase tracking-[0.12em]">Saved source files</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <StatePanel content={state.inbox} title="Things only you can approve" />
              <StatePanel content={state.business} title="Business" />
              <StatePanel content={state.brand} title="Brand" />
              <StatePanel content={state.opportunities} title="Business ideas" />
              <StatePanel content={state.experiments} title="Tests" />
              <StatePanel content={state.finance} title="Finance" />
              <StatePanel content={state.social} title="Social media plan" />
              <StatePanel content={state.budgetLedger} title="AI service budget history" />
              <StatePanel content={state.financeLedger} title="Income and cost history" />
              <StatePanel content={state.treasuryLedger} title="Payment history" />
            </div>
          </section>
        </>
      ) : (
        <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="dark">{selectedVenture.status}</Badge>
                <Badge>{savedItemCount} saved items</Badge>
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">{selectedVenture.name}</h2>
            </div>
            {selectedVenture.tabs.includes("plans") ? (
              <Link className={buttonVariants({ variant: "secondary" })} href={`/admin/ventures/${selectedVenture.id}/binder`}>
                <BookOpen aria-hidden="true" className="size-4" />
                Launch checklist
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
                {tabLabel(tab)}
              </Link>
            ))}
          </nav>

          {selectedAgentControls ? (
            <AgentSwitches initialAgents={selectedAgentControls.agents} ventureId={selectedAgentControls.ventureId} />
          ) : null}

          {unreadableFiles.length ? (
            <Callout className="mt-6" tone="warning">
              {unreadableFiles.length} saved {unreadableFiles.length === 1 ? "file cannot" : "files cannot"} be read: {unreadableFiles.join(", ")}.
            </Callout>
          ) : null}

          {shortlist.length ? (
            <aside className="mt-8 rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--surface)] p-6" aria-labelledby="shortlist-heading">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">Ideas you liked</p>
              <h3 className="mt-2 text-2xl font-semibold" id="shortlist-heading">Magazine ideas to keep reviewing</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {shortlist.map((card) => <Badge key={card.id} tone="success">{card.title}</Badge>)}
              </div>
            </aside>
          ) : null}

          {selectedVenture.id === "fightaiq" && selectedTab && ["fighters", "events", "slates", "sources"].includes(selectedTab) ? (
            <FightAiQAdminPanel snapshot={fightaiq} tab={selectedTab as "fighters" | "events" | "slates" | "sources"} />
          ) : selectedVenture.id === "mma-files" && selectedTab && ["articles", "calendar", "social-lab"].includes(selectedTab) ? (
            <MmaFilesAdminPanel snapshot={mmaFiles} tab={selectedTab as "articles" | "calendar" | "social-lab"} />
          ) : visibleCards.length ? (
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
              No {selectedTab ? tabLabel(selectedTab) : "saved"} items are stored for {selectedVenture.name} yet. The admin does not add fake examples.
            </Callout>
          )}
        </section>
      )}
    </main>
  );
}
