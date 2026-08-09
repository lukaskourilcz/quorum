import type { Metadata } from "next";
import Link from "next/link";
import { AdminFileBrowser } from "@/components/admin/admin-file-browser";
import { AdminShell, type AdminWorkspace } from "@/components/admin/admin-shell";
import { AgentSwitches } from "@/components/admin/agent-switches";
import { DesignLabWorkspace } from "@/components/admin/design-lab-workspace";
import { AutonomyPanel } from "@/components/admin/autonomy-panel";
import { CarouselStudioAdminPanel } from "@/components/admin/carousel-studio-panel";
import { HookBrainAdminPanel } from "@/components/admin/hook-brain-panel";
import { FightAiQAdminPanel } from "@/components/admin/fightaiq-admin-panel";
import { FixedCostsEditor } from "@/components/admin/fixed-costs-editor";
import { MmaFilesAdminPanel } from "@/components/admin/mma-files-admin-panel";
import { AdminMoneyPanel } from "@/components/admin/money-panel";
import { PortfolioCard } from "@/components/admin/portfolio-card";
import { SocialArchive } from "@/components/admin/social-archive-panel";
import { Callout } from "@/components/ui/callout";
import { CURRENT_MONTHLY_API_LIMIT_USD, CURRENT_MONTHLY_OPERATING_LIMIT_USD } from "@/data/operating-policy";
import { readAdminAgentControls } from "@/lib/admin-agent-controls";
import { readAdminAutonomy } from "@/lib/admin-autonomy";
import { readDesignLab, readDesignLabPresets } from "@/lib/design-lab";
import { readAdminFightAiQ } from "@/lib/admin-fightaiq";
import { readAdminFixedCosts } from "@/lib/admin-fixed-costs";
import { readAdminMmaFiles } from "@/lib/admin-mma-files";
import { readAdminPortfolio, type AdminVentureTab } from "@/lib/admin-portfolio";
import { readAdminSnapshot } from "@/lib/admin-state";
import { readCarouselStudio } from "@/lib/carousel-studio";
import { readHookBrain } from "@/lib/hook-brain";
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
  if (tab === "slates") return "fight reports";
  return tab;
}

function ventureName(id: string, name: string): string {
  return id === "caught-up" ? "DNESKAi" : name;
}

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

function Tile({
  label,
  value,
  foot,
  percent,
  brand
}: {
  label: string;
  value: string;
  foot: string;
  percent: number;
  brand: string;
}) {
  return (
    <div className="bg-[#0e0e11] px-[18px] py-4">
      <p className="m-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#94949c]">{label}</p>
      <p className="m-0 mt-2.5 text-[26px] font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
      <span className="mt-2.5 block h-[3px] overflow-hidden rounded-sm bg-[#26262b]">
        <span
          className="block h-full"
          style={{ width: `${Math.max(0, Math.min(100, percent)).toFixed(0)}%`, background: brand }}
        />
      </span>
      <p className="m-0 mt-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#94949c]">{foot}</p>
    </div>
  );
}

function Panel({
  title,
  note,
  children
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[12px] border border-[#26262b] bg-[#0c0c0f]">
      <div className="flex items-center justify-between gap-3 border-b border-[#1e1e22] px-[18px] py-3.5">
        <p className="m-0 text-[14px] font-semibold">{title}</p>
        {note ? (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">{note}</span>
        ) : null}
      </div>
      <div className={`p-[18px] ${UNWRAP}`}>{children}</div>
    </div>
  );
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ venture?: string; tab?: string }>;
}) {
  const [
    { venture: requestedVenture, tab: requestedTab },
    state,
    portfolio,
    standups,
    fightaiq,
    mmaFiles,
    carouselStudio,
    hookBrain,
    studioArticles,
    labArticles,
    labPresets,
    agentControls,
    autonomy,
    fixedCosts,
    money,
    dailyResults
  ] = await Promise.all([
    searchParams,
    readAdminSnapshot(),
    readAdminPortfolio(),
    getPublicStandups(),
    readAdminFightAiQ(),
    readAdminMmaFiles(),
    readCarouselStudio(),
    readHookBrain(),
    readStudioArticles(),
    readDesignLab(),
    readDesignLabPresets(),
    readAdminAgentControls(),
    readAdminAutonomy(),
    readAdminFixedCosts(),
    getPublicMoneySnapshot(),
    getDailyResults()
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
          ? fightaiq.fighters.length + fightaiq.events.length + fightaiq.bouts.length + fightaiq.slates.length + fightaiq.sources.length
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
      active: !selectedVenture
    },
    ...portfolio.ventures.map((venture) => ({
      id: venture.id,
      name: ventureName(venture.id, venture.name),
      count: savedItemCount(venture.id, venture.cards.length),
      href: `/admin?venture=${venture.id}`,
      active: selectedVenture?.id === venture.id
    }))
  ];

  // Every count here is read, not estimated. An approval is a HUMAN_APPROVAL line the runtime
  // wrote into the inbox; an open priority is one the autonomy snapshot still lists as open; an
  // unreadable file is one a loader could not parse. There is no "items to rate" row, because
  // nothing in the state files answers that question, and a number invented for a dashboard is
  // exactly the kind of claim this admin exists to avoid.
  const attention = [
    { label: "Approvals waiting", value: (state.inbox.match(/HUMAN_APPROVAL/gu) ?? []).length },
    { label: "Open priorities", value: autonomy.priorities.filter((item) => item.status === "open").length },
    {
      label: "Unreadable files",
      value:
        portfolio.ventures.reduce((sum, venture) => sum + venture.unreadableFiles.length, 0) +
        mmaFiles.unreadable.length
    }
  ];

  const monthAllIn = money?.costs.totalMonthlyBurnUsd ?? 0;
  const monthApi = money?.costs.api.monthlyUsd ?? 0;
  const latestDay = dailyResults.at(-1) ?? null;

  const ventureUnreadable = selectedVenture?.id === "mma-files"
    ? [...selectedVenture.unreadableFiles, ...mmaFiles.unreadable]
    : selectedVenture?.unreadableFiles ?? [];

  const cardKindByTab: Partial<Record<AdminVentureTab, "idea" | "plan" | "visual">> = {
    ideas: "idea",
    plans: "plan",
    visuals: "visual"
  };
  const visibleCards = selectedVenture && selectedTab && cardKindByTab[selectedTab]
    ? selectedVenture.cards.filter((card) => card.kind === cardKindByTab[selectedTab])
    : [];
  const selectedAgentControls = agentControls.find((control) => control.ventureId === selectedVenture?.id);

  return (
    <AdminShell
      action={
        selectedVenture?.tabs.includes("plans") ? (
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
      breadcrumb={selectedVenture ? ventureName(selectedVenture.id, selectedVenture.name) : "Company files"}
      lead={
        selectedVenture
          ? `Everything ${ventureName(selectedVenture.id, selectedVenture.name)} has saved, and the switches that decide what it may do next.`
          : "Everything the owner alone can decide, in one protected view: what the company spends, which switches are open, the files the runtime writes, and every social draft waiting for a signature."
      }
      title={selectedVenture ? ventureName(selectedVenture.id, selectedVenture.name) : "Project desk"}
      workspaces={workspaces}
    >
      {!selectedVenture ? (
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
              foot={latestDay ? `recorded ${latestDay.date}` : "no day on record yet"}
              label="Latest recorded day"
              percent={latestDay ? Math.min(100, latestDay.totalCostUsd * 100) : 0}
              value={latestDay ? tileUsd(latestDay.totalCostUsd) : "—"}
            />
            <Tile
              brand={brand}
              foot={`of ${formatUsd(CURRENT_MONTHLY_API_LIMIT_USD)}`}
              label="Model share"
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
            <Panel note="Owner writes · signed" title="Fixed costs">
              <FixedCostsEditor initialCosts={fixedCosts.costs} />
            </Panel>
            <Panel note="This quarter" title="Money">
              <AdminMoneyPanel snapshot={money} />
            </Panel>
          </div>

          <Panel note="Fail closed" title="Switches and priorities">
            <AutonomyPanel
              initial={autonomy}
              ventures={portfolio.ventures.map(({ id, name }) => ({ id, name }))}
            />
            <p className="mt-4 text-[12px] leading-[1.55] text-[#94949c]">
              A switch that is off blocks the work. Nothing here approves spend, credentials or a
              new scope — that stays with the owner&rsquo;s signature.
            </p>
          </Panel>

          <AdminFileBrowser files={files} />

          <Panel note="Nothing posts until the switch and health gate pass" title="Social drafts · DNESKAi">
            <SocialArchive {...state.socialArchive} />
          </Panel>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {selectedVenture.tabs.map((tab) => {
              const on = selectedTab === tab;
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
                  {tabLabel(tab)}
                </Link>
              );
            })}
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">
              {savedItemCount(selectedVenture.id, selectedVenture.cards.length)} saved items
            </span>
          </div>

          {ventureUnreadable.length ? (
            <Callout tone="warning">
              {ventureUnreadable.length} saved{" "}
              {ventureUnreadable.length === 1 ? "file cannot" : "files cannot"} be read:{" "}
              {ventureUnreadable.join(", ")}.
            </Callout>
          ) : null}

          <div className={`min-w-0 ${UNWRAP}`}>
            {selectedVenture.id === "carousel-studio" && selectedTab === "hooks" ? (
              <HookBrainAdminPanel snapshot={hookBrain} />
            ) : selectedVenture.id === "carousel-studio" && selectedTab === "studio" ? (
              <DesignLabWorkspace articles={labArticles} presets={labPresets} />
            ) : selectedVenture.id === "carousel-studio" && selectedTab ? (
              <CarouselStudioAdminPanel
                snapshot={carouselStudio}
                tab={selectedTab as "templates" | "inspiration" | "social-lab"}
              />
            ) : selectedVenture.id === "fightaiq" && selectedTab && ["fighters", "bouts", "events", "slates", "sources"].includes(selectedTab) ? (
              <FightAiQAdminPanel
                snapshot={fightaiq}
                tab={selectedTab as "fighters" | "bouts" | "events" | "slates" | "sources"}
              />
            ) : selectedVenture.id === "mma-files" && selectedTab && ["articles", "predictions", "banners", "calendar", "social-lab"].includes(selectedTab) ? (
              <MmaFilesAdminPanel
                snapshot={mmaFiles}
                tab={selectedTab as "articles" | "predictions" | "banners" | "calendar" | "social-lab"}
              />
            ) : visibleCards.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {visibleCards.map((card) => (
                  <PortfolioCard
                    card={card}
                    key={`${card.kind}-${card.id}`}
                    originHref={card.originMeetingRef ? publicMeetingHref(card.originMeetingRef, standups) : null}
                  />
                ))}
              </div>
            ) : (
              <Callout>
                No {selectedTab ? tabLabel(selectedTab) : "saved"} items are stored for{" "}
                {selectedVenture.name} yet. The admin does not add fake examples.
              </Callout>
            )}
          </div>

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
    </AdminShell>
  );
}
