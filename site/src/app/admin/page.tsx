import type { Metadata } from "next";
import path from "node:path";
import Link from "next/link";
import { AdminFileBrowser } from "@/components/admin/admin-file-browser";
import { AdminShell, type AdminSection, type AdminWorkspace } from "@/components/admin/admin-shell";
import { AdminWriteProvider } from "@/components/admin/admin-write-mode";
import { AgentSwitches } from "@/components/admin/agent-switches";
import { DesignLabWorkspace } from "@/components/admin/design-lab-workspace";
import { AutonomyPanel } from "@/components/admin/autonomy-panel";
import { CarouselStudioAdminPanel } from "@/components/admin/carousel-studio-panel";
import { HookBrainAdminPanel } from "@/components/admin/hook-brain-panel";
import { FightAiQAdminPanel } from "@/components/admin/fightaiq-admin-panel";
import { GoViralProfilePanel } from "@/components/admin/goviral-profile-panel";
import { OwnerAttentionPanel } from "@/components/admin/owner-attention-panel";
import { CaughtUpEventsPanel } from "@/components/admin/caught-up-events-panel";
import { FixedCostsEditor } from "@/components/admin/fixed-costs-editor";
import { MmaFilesAdminPanel } from "@/components/admin/mma-files-admin-panel";
import { AdminMoneyPanel } from "@/components/admin/money-panel";
import { IdeasPanel, MonetizationPanel, type FutureIdeaRow } from "@/components/admin/future-panels";
import { Panel, Tile } from "@/components/admin/panel";
import { PortfolioCard } from "@/components/admin/portfolio-card";
import { RenderedDeskPanel } from "@/components/admin/rendered-desk-panel";
import { TittyTuesdaysProposalsPanel } from "@/components/admin/titty-tuesdays-proposals-panel";
import { SocialArchive } from "@/components/admin/social-archive-panel";
import { Callout } from "@/components/ui/callout";
import {
  CURRENT_DAILY_OPERATING_PACE_USD,
  CURRENT_MONTHLY_API_LIMIT_USD,
  CURRENT_MONTHLY_OPERATING_LIMIT_USD
} from "@/data/operating-policy";
import { readAdminAgentControls } from "@/lib/admin-agent-controls";
import { readApprovedUndeliveredPayloads } from "@/lib/admin-owner-attention";
import { adminWritesEnabled } from "@/lib/admin-write-permission";
import { readAdminAutonomy } from "@/lib/admin-autonomy";
import { readDesignLab, readDesignLabPresets } from "@/lib/design-lab";
import { readAdminFightAiQ } from "@/lib/admin-fightaiq";
import { readAdminCaughtUp } from "@/lib/admin-caught-up";
import { readAdminFixedCosts } from "@/lib/admin-fixed-costs";
import { readAdminMmaFiles } from "@/lib/admin-mma-files";
import { readAdminPortfolio, type AdminVentureTab } from "@/lib/admin-portfolio";
import { readAdminSnapshot } from "@/lib/admin-state";
import { readCarouselStudio } from "@/lib/carousel-studio";
import { readGoViralProfile } from "@/lib/goviral-profile";
import { readHookBrain } from "@/lib/hook-brain";
import { readMonetizationOptions } from "@/lib/monetization-options";
import { readOwnerAttention } from "@/lib/owner-attention";
import { readRenderedDesk } from "@/lib/rendered-desk";
import { readTittyTuesdaysProposals } from "@/lib/titty-tuesdays-proposals";
import { readStudioArticles } from "@/lib/carousel-summaries";
import { getDailyResults } from "@/lib/daily-results";
import { publicMeetingHref } from "@/lib/idea-ledger-model";
import { getPublicMoneySnapshot } from "@/lib/money-records";
import { getPublicStandups } from "@/lib/standup-records";
import { formatUsd } from "@/lib/utils";
import { brandTint, ventureBrand } from "@/lib/venture-brand";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  description: "Protected BoardlessAI project files, ratings and social post drafts.",
  robots: { follow: false, index: false, nocache: true },
  title: "Admin"
};

/**
 * The panels below predate this shell and bring their own page gutters — `mx-auto`,
 * `max-w-[var(--container)]`, `px-5`, `pb-20`. Inside a 1,180px body those are a second set of
 * margins on top of the body's own. Neutralising them here keeps one layout owner without
 * rewriting six working panels that are correct about everything except where they sit.
 */
const UNWRAP =
  "[&>section]:mx-0 [&>section]:mt-0 [&>section]:max-w-none [&>section]:px-0 [&>section]:pb-0";

/** URLs an owner would guess from a display name, pointed at the id that name belongs to. */
const VENTURE_ALIASES: Readonly<Record<string, string>> = {
  "design-lab": "carousel-studio",
  dneskai: "caught-up"
};

function tabLabel(tab: AdminVentureTab): string {
  if (tab === "visuals") return "images";
  if (tab === "studio") return "studio";
  if (tab === "social-lab") return "social drafts";
  return tab;
}

function ventureName(id: string, name: string): string {
  return id === "caught-up" ? "DNESKAi" : name;
}

/** Company-level views: their heading and the one sentence that says what the page is for. */
const COMPANY_VIEWS = ["approvals", "manual-tasks", "future"] as const;
type CompanyView = (typeof COMPANY_VIEWS)[number];

const SECTION_TITLES: Readonly<Record<CompanyView, string>> = {
  approvals: "Approvals",
  "manual-tasks": "Only you can do",
  future: "Future"
};

const SECTION_LEADS: Readonly<Record<CompanyView, string>> = {
  approvals: "Everything waiting for your signature, with what each one approves and what it costs.",
  "manual-tasks": "Keys, accounts and switches. These are the jobs the system cannot do for you.",
  future: "Ways this company could earn, and every idea the meetings have produced so far."
};

/**
 * Money at headline size, always to the cent.
 *
 * `formatUsd` allows four decimals because a single model call costs a fraction of a cent and the
 * detail tables need that precision. At 26px beside "of the $30.00 limit" the same function
 * printed "$2.901", which reads as a typo rather than as a sum. The tiles round; the tables that
 * account for the pennies still do not.
 */
function tileUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ venture?: string; tab?: string; view?: string }>;
}) {
  const [
    { venture: requestedVenture, tab: requestedTab, view: requestedView },
    state,
    portfolio,
    standups,
    fightaiq,
    caughtUp,
    mmaFiles,
    carouselStudio,
    hookBrain,
    goviralProfile,
    studioArticles,
    labArticles,
    labPresets,
    agentControls,
    autonomy,
    fixedCosts,
    money,
    dailyResults,
    ownerAttention,
    monetization,
    renderedDesk,
    ttProposals,
    approvedUndelivered
  ] = await Promise.all([
    searchParams,
    readAdminSnapshot(),
    readAdminPortfolio(),
    getPublicStandups(),
    readAdminFightAiQ(),
    readAdminCaughtUp(),
    readAdminMmaFiles(),
    readCarouselStudio(),
    readHookBrain(),
    readGoViralProfile(),
    readStudioArticles(),
    readDesignLab(),
    readDesignLabPresets(),
    readAdminAgentControls(),
    readAdminAutonomy(),
    readAdminFixedCosts(),
    getPublicMoneySnapshot(),
    getDailyResults(),
    readOwnerAttention(),
    readMonetizationOptions(),
    readRenderedDesk(),
    readTittyTuesdaysProposals(),
    readApprovedUndeliveredPayloads(process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), ".."))
  ]);

  /*
   * `design-lab` is the name; `carousel-studio` is the id.
   *
   * The id is load-bearing — it addresses state directories, config entries, API paths and a room
   * on the floorplan — so it does not change (decision D13: identifiers stay, surfaces speak). The
   * display name already reads Design Lab everywhere a human looks, and the URL an owner would
   * guess from that name now resolves to the same record instead of to an empty page.
   */
  const requestedVentureId = (requestedVenture ? VENTURE_ALIASES[requestedVenture] : undefined) ?? requestedVenture;
  /*
   * Company-level views, addressed by `?view=` rather than `?venture=`.
   *
   * A venture always wins: `?venture=fightaiq&view=approvals` is a workspace request with a stale
   * parameter on it, not an ambiguous one. An unknown view falls through to Company files, the
   * same way an unknown tab falls through to a venture's first.
   */
  const selectedView: CompanyView | null =
    !requestedVentureId && COMPANY_VIEWS.includes(requestedView as CompanyView)
      ? requestedView as CompanyView
      : null;
  const selectedVenture = portfolio.ventures.find((venture) => venture.id === requestedVentureId) ?? null;
  const selectedTab = selectedVenture
    ? selectedVenture.tabs.includes(requestedTab as AdminVentureTab)
      ? (requestedTab as AdminVentureTab)
      : selectedVenture.tabs[0] ?? null
    : null;
  const brandId = selectedVenture?.id ?? "global";
  const brand = ventureBrand(brandId);

  /**
   * How many stored items a workspace holds.
   *
   * Three ventures keep their work outside the portfolio card store, so counting cards reported 0
   * for them — FightAIQ showed nothing on a rail beside a workspace holding twelve hundred fighter
   * records. Each of those three is counted from the loader that actually reads it.
   */
  const savedItemCount = (ventureId: string, fallback: number) =>
    ventureId === "mma-files"
      ? mmaFiles.articles.length + mmaFiles.socialPacks.length + mmaFiles.calendar.length
      : ventureId === "carousel-studio"
        ? carouselStudio.templates.length + carouselStudio.inspirationLinks.length + studioArticles.length
        : ventureId === "fightaiq"
          ? fightaiq.fighters.length + fightaiq.events.length + fightaiq.bouts.length + fightaiq.sources.length
          : fallback;

  const files = [
    { name: "Things only you can approve", content: state.inbox },
    { name: "Specialist meeting agendas", content: state.meetingAgendas },
    { name: "Business", content: state.business },
    { name: "Brand", content: state.brand },
    { name: "Business ideas", content: state.opportunities },
    { name: "Tests", content: state.experiments },
    { name: "Finance", content: state.finance },
    { name: "Social media plan", content: state.social },
    { name: "AI service budget history", content: state.budgetLedger },
    { name: "Income and cost history", content: state.financeLedger },
    { name: "Payment history", content: state.treasuryLedger }
  ].map((file) => ({
    ...file,
    size: `${Math.max(1, Math.round(new TextEncoder().encode(file.content).length / 1024))} KB`
  }));

  const workspaces: AdminWorkspace[] = [
    {
      id: "global",
      name: "Company files",
      count: files.length,
      href: "/admin?venture=global",
      active: !selectedVenture && !selectedView
    },
    ...portfolio.ventures.map((venture) => ({
      id: venture.id,
      name: ventureName(venture.id, venture.name),
      count: savedItemCount(venture.id, venture.cards.length),
      href: `/admin?venture=${venture.id}`,
      active: selectedVenture?.id === venture.id
    }))
  ];

  const sections: AdminSection[] = [
    {
      id: "approvals",
      name: "Approvals",
      href: "/admin?view=approvals",
      active: selectedView === "approvals",
      count: ownerAttention.state === "present" ? ownerAttention.approvals.length : null
    },
    {
      id: "manual-tasks",
      name: "Only you can do",
      href: "/admin?view=manual-tasks",
      active: selectedView === "manual-tasks",
      count: ownerAttention.state === "present" ? ownerAttention.manualTasks.length : null
    },
    {
      id: "future",
      name: "Future",
      href: "/admin?view=future",
      active: selectedView === "future",
      count: monetization.state === "present" ? monetization.total : null
    }
  ];

  /*
   * Every idea from every project, newest first.
   *
   * The venture workspaces each show their own; nothing showed them together, so an idea raised
   * for FightAIQ on a Tuesday was invisible to anyone thinking about the portfolio. Built from the
   * same `ideaCards` machinery the workspaces use, so a card cannot read one way here and another
   * way there.
   */
  const futureIdeas: FutureIdeaRow[] = portfolio.ventures
    .flatMap((venture) => venture.cards
      .filter((card) => card.kind === "idea")
      .map((card): FutureIdeaRow => ({
        ventureId: venture.id,
        ventureName: ventureName(venture.id, venture.name),
        card,
        originHref: card.originMeetingRef ? publicMeetingHref(card.originMeetingRef, standups) : null
      })))
    .sort((left, right) => (right.card.updatedAt ?? "").localeCompare(left.card.updatedAt ?? ""));

  /*
   * Every count here is read, not estimated.
   *
   * The first two used to be counted two different ways from two different files — an inbox regex
   * that matched countersigned entries as well as pending ones, and the priority queue. Both now
   * come off `state/owner-attention.json`, which is the file the two panels render, so the rail
   * and the panel cannot disagree about how much is waiting. Before the collector has ever run
   * there is nothing to count, and the row says so rather than reporting a confident zero.
   */
  const attention = [
    {
      label: "Approvals waiting",
      value: ownerAttention.approvals.length
    },
    // Approval is not delivery. A countersigned payload that has not shipped is its own signal,
    // and folding it into the approvals count made a granted approval look outstanding forever.
    {
      label: "Approved deliveries waiting",
      value: approvedUndelivered.length
    },
    {
      label: "Only you can do",
      value: ownerAttention.manualTasks.length
    },
    // Open and selected both: an item the board has picked up is still awaiting its slot.
    {
      label: "Priorities awaiting a board slot",
      value: autonomy.priorities.filter((item) => item.status === "open" || item.status === "selected").length
    },
    {
      label: "Unreadable files",
      value:
        portfolio.ventures.reduce((sum, venture) => sum + venture.unreadableFiles.length, 0) +
        mmaFiles.unreadable.length +
        fightaiq.unreadable.length +
        ownerAttention.unreadable
    }
  ];

  const monthAllIn = money?.costs.totalMonthlyBurnUsd ?? 0;
  const monthApi = money?.costs.api.monthlyUsd ?? 0;
  const latestDay = dailyResults.at(-1) ?? null;

  const ventureUnreadable = selectedVenture?.id === "mma-files"
    ? [...selectedVenture.unreadableFiles, ...mmaFiles.unreadable]
    : selectedVenture?.id === "fightaiq"
      ? [...selectedVenture.unreadableFiles, ...fightaiq.unreadable]
    : selectedVenture?.unreadableFiles ?? [];

  const cardKindByTab: Partial<Record<AdminVentureTab, "idea" | "plan" | "visual" | "social-variant">> = {
    ideas: "idea",
    plans: "plan",
    visuals: "visual",
    packages: "social-variant"
  };
  const visibleCards = selectedVenture && selectedTab && cardKindByTab[selectedTab]
    ? selectedVenture.cards.filter((card) => card.kind === cardKindByTab[selectedTab])
    : [];
  const selectedAgentControls = agentControls.find((control) => control.ventureId === selectedVenture?.id);
  const writesEnabled = adminWritesEnabled();

  /**
   * The tab body and the number printed above it, resolved together.
   *
   * They used to be two independent expressions: the chip printed a whole-workspace total from
   * `savedItemCount` while the body below it was tab-filtered, so "5 saved items" sat above an
   * empty plans tab and "11 saved items" above five articles. Returning one `{ node, count }` from
   * one branch is what keeps them honest — a new tab cannot add a body without also declaring what
   * it counts. The workspace-wide total still exists, in the rail, where it is true.
   */
  const tabView = ((): { node: React.ReactNode; count: number } => {
    if (!selectedVenture) return { node: null, count: 0 };
    const id = selectedVenture.id;
    if (id === "carousel-studio" && selectedTab === "hooks") {
      return {
        node: <HookBrainAdminPanel snapshot={hookBrain} />,
        count: hookBrain.surfaces.length + hookBrain.channels.length + hookBrain.recent.length
      };
    }
    if (id === "carousel-studio" && selectedTab === "studio") {
      return {
        node: <DesignLabWorkspace articles={labArticles} presets={labPresets} />,
        count: labArticles.length
      };
    }
    if (id === "carousel-studio" && selectedTab === "templates") {
      return {
        node: <CarouselStudioAdminPanel snapshot={carouselStudio} tab="templates" />,
        count: carouselStudio.templates.length
      };
    }
    if (id === "carousel-studio" && selectedTab === "inspiration") {
      return {
        node: <CarouselStudioAdminPanel snapshot={carouselStudio} tab="inspiration" />,
        count: carouselStudio.inspirationLinks.length
      };
    }
    if (id === "titty-tuesdays" && selectedTab === "visuals") {
      return {
        node: <TittyTuesdaysProposalsPanel snapshot={ttProposals} />,
        count: ttProposals.days.reduce((sum, day) => sum + day.variants.length, 0)
      };
    }
    if (id === "caught-up" && selectedTab === "events") {
      return {
        node: (
          <CaughtUpEventsPanel
            engine={caughtUp.engine}
            events={caughtUp.events}
            eventStore={caughtUp.eventStore}
            today={caughtUp.today}
          />
        ),
        count: caughtUp.events.length
      };
    }
    // `slates` is gone: the directory behind it was never written, so the tab could only ever be
    // empty and the venture no longer declares it.
    if (id === "fightaiq" && selectedTab && ["fighters", "bouts", "events", "sources"].includes(selectedTab)) {
      const tab = selectedTab as "fighters" | "bouts" | "events" | "sources";
      return { node: <FightAiQAdminPanel snapshot={fightaiq} tab={tab} />, count: fightaiq[tab].length };
    }
    if (id === "mma-files" && selectedTab && ["articles", "predictions", "banners", "calendar", "social-lab"].includes(selectedTab)) {
      const tab = selectedTab as "articles" | "predictions" | "banners" | "calendar" | "social-lab";
      return {
        node: <MmaFilesAdminPanel snapshot={mmaFiles} tab={tab} />,
        count: tab === "articles"
          ? mmaFiles.articles.length
          : tab === "calendar"
            ? mmaFiles.calendar.length
            : tab === "social-lab"
              ? mmaFiles.socialPacks.length
              // Predictions and banners are one health record each, not a list of items.
              : 1
      };
    }
    if (visibleCards.length) {
      return {
        node: (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleCards.map((card) => (
              <PortfolioCard
                card={card}
                key={`${card.kind}-${card.id}`}
                originHref={card.originMeetingRef ? publicMeetingHref(card.originMeetingRef, standups) : null}
              />
            ))}
          </div>
        ),
        count: visibleCards.length
      };
    }
    return {
      node: (
        <Callout>
          Nothing is stored under {selectedTab ? tabLabel(selectedTab) : "this tab"} for{" "}
          {ventureName(id, selectedVenture.name)} yet. The admin does not add fake examples.
        </Callout>
      ),
      count: 0
    };
  })();

  return (
    <AdminShell
      action={
        // Declaring a plans tab is not the same as having a plan. Caught Up and GoVIRAL both
        // declare one and store none, and the button opened an empty binder.
        selectedVenture?.cards.some((card) => card.kind === "plan") ? (
          <Link
            className="shrink-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] px-[13px] py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5]"
            href={`/admin/ventures/${selectedVenture.id}/binder`}
          >
            Launch checklist →
          </Link>
        ) : undefined
      }
      attention={attention}
      brandId={brandId}
      breadcrumb={
        selectedVenture
          ? ventureName(selectedVenture.id, selectedVenture.name)
          : selectedView
            ? SECTION_TITLES[selectedView]
            : "Company files"
      }
      lead={
        selectedVenture
          ? `Everything ${ventureName(selectedVenture.id, selectedVenture.name)} has saved, and the switches that decide what it may do next.`
          : selectedView
            ? SECTION_LEADS[selectedView]
            : "Everything the owner alone can decide, in one protected view: what the company spends, which switches are open, the files the runtime writes, and every social draft waiting for a signature."
      }
      sections={sections}
      title={
        selectedVenture
          ? ventureName(selectedVenture.id, selectedVenture.name)
          : selectedView
            ? SECTION_TITLES[selectedView]
            : "Project desk"
      }
      workspaces={workspaces}
    >
      <AdminWriteProvider enabled={writesEnabled}>
      {!writesEnabled ? <Callout tone="warning">Read-only deployment — saving needs the GitHub token, see NEEDED.md. Existing records remain available to review.</Callout> : null}
      {selectedView === "future" ? (
        <div className="grid min-w-0 gap-4">
          <Panel note="Read-only" title="Ways this could earn">
            <MonetizationPanel catalog={monetization} />
          </Panel>
          <Panel note="Every project" title="Ideas from the meetings">
            <IdeasPanel
              rows={futureIdeas}
              unreadable={portfolio.ventures.flatMap((venture) =>
                venture.unreadableFiles.filter((file) => file.startsWith("ideas/")))}
            />
          </Panel>
        </div>
      ) : selectedView ? (
        <div className="grid min-w-0 gap-4">
          <Panel title={SECTION_TITLES[selectedView]}>
            {selectedView === "approvals" || selectedView === "manual-tasks" ? (
              <OwnerAttentionPanel kind={selectedView} snapshot={ownerAttention} />
            ) : null}
          </Panel>
        </div>
      ) : !selectedVenture ? (
        <div className="grid min-w-0 gap-4">
          <div
            className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-[#26262b] bg-[#26262b] lg:grid-cols-4"
            data-adm-tiles
          >
            <Tile
              brand={brand}
              foot={`of the ${formatUsd(CURRENT_MONTHLY_OPERATING_LIMIT_USD)} limit`}
              label="Month to date"
              percent={(monthAllIn / CURRENT_MONTHLY_OPERATING_LIMIT_USD) * 100}
              value={tileUsd(monthAllIn)}
            />
            <Tile
              brand={brand}
              foot={latestDay ? `${latestDay.date} · of ${formatUsd(CURRENT_DAILY_OPERATING_PACE_USD)}` : "no day on record yet"}
              label="Latest recorded day"
              percent={latestDay ? (latestDay.totalCostUsd / CURRENT_DAILY_OPERATING_PACE_USD) * 100 : 0}
              value={latestDay ? tileUsd(latestDay.totalCostUsd) : "—"}
            />
            <Tile
              brand={brand}
              foot={`of ${formatUsd(CURRENT_MONTHLY_API_LIMIT_USD)}`}
              label="AI usage"
              percent={(monthApi / CURRENT_MONTHLY_API_LIMIT_USD) * 100}
              value={tileUsd(monthApi)}
            />
            <Tile
              brand={brand}
              foot="days with a recorded result"
              label="Days on record"
              percent={100}
              value={String(dailyResults.length)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[7fr_5fr]" data-adm-cols>
            <Panel note="You are the only one who can change these" title="Fixed costs">
              <FixedCostsEditor initialCosts={fixedCosts.costs} />
            </Panel>
            <Panel note="This quarter" title="What could bring money in">
              <AdminMoneyPanel snapshot={money} />
            </Panel>
          </div>

          {/* The panel used to be titled "Switches and priorities" and hold no switch: quality
              tiles, the social-readiness grid and the priority form. The actual per-project
              switches live inside each venture's workspace, so the title says what is here and
              the note says where the other thing is. */}
          <Panel note="Nothing here spends money" title="Company health and priorities">
            <AutonomyPanel
              initial={autonomy}
              ventures={portfolio.ventures.map(({ id, name }) => ({ id, name }))}
            />
            <p className="mt-4 text-[12px] leading-[1.55] text-[#94949c]">
              The switches that decide what a project may do next are on that project&rsquo;s own
              page — open a project in the list on the left. Nothing on this page approves spending,
              logins or a new permission; those still need your signature.
            </p>
          </Panel>

          <Panel note="The last three days" title="What shipped">
            <RenderedDeskPanel desk={renderedDesk} />
          </Panel>

          <AdminFileBrowser files={files} />

          <Panel note="Nothing here posts by itself" title="Social drafts · DNESKAi">
            <SocialArchive {...state.socialArchive} />
          </Panel>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {selectedVenture.tabs.map((tab) => {
              const on = selectedTab === tab;
              const label = selectedVenture.id === "fightaiq" && tab === "fighters"
                ? `${tabLabel(tab)} · ${fightaiq.fighters.reduce((count, fighter) => count + fighter.discrepancyDetails.filter((item) => item.status === "open").length, 0)} unresolved`
                : tabLabel(tab);
              return (
                <Link
                  aria-current={on ? "page" : undefined}
                  className="rounded-[9px] px-3 py-[7px] font-mono text-[10.5px] uppercase tracking-[0.12em] transition-colors"
                  href={`/admin?venture=${selectedVenture.id}&tab=${tab}`}
                  key={tab}
                  scroll={false}
                  // The active chip is brand border, brand tint and *white* text, not brand text.
                  // Brand on a 15%-brand ground measures 1.00:1 — the two are the same hue — and
                  // "fighters" on FightAIQ's pale red was unreadable rather than merely low
                  // contrast. The border and the tint carry the identity; the label carries the
                  // word, so it gets the colour that lets it be read.
                  style={{
                    border: `1px solid ${on ? brand : "#3f3f46"}`,
                    background: on ? brandTint(brand) : "#101013",
                    color: on ? "#ffffff" : "#a1a1aa"
                  }}
                >
                  {label}
                </Link>
              );
            })}
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">
              {tabView.count} on this tab
            </span>
          </div>

          {ventureUnreadable.length ? (
            <Callout tone="warning">
              {ventureUnreadable.length} saved{" "}
              {ventureUnreadable.length === 1 ? "file cannot" : "files cannot"} be read:{" "}
              {ventureUnreadable.join(", ")}.
            </Callout>
          ) : null}

          {/* GoVIRAL owns exactly one artefact and it is not a card, so the workspace leads with
              it. Both tabs below say "nothing is stored", which is true and was the only thing
              the venture had to say for itself. */}
          {selectedVenture.id === "goviral" ? <GoViralProfilePanel profile={goviralProfile} /> : null}

          <div className={`min-w-0 ${UNWRAP}`}>{tabView.node}</div>

          {selectedAgentControls ? (
            <div className={`min-w-0 ${UNWRAP}`}>
              <AgentSwitches
                initialAgents={selectedAgentControls.agents}
                ventureId={selectedAgentControls.ventureId}
              />
            </div>
          ) : null}
        </div>
      )}
      </AdminWriteProvider>
    </AdminShell>
  );
}
