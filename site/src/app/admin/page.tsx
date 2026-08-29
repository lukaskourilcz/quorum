import type { Metadata } from "next";
import path from "node:path";
import Link from "next/link";
import { AdminFileBrowser } from "@/components/admin/admin-file-browser";
import { AdminShell, type AdminSection, type AdminWorkspace } from "@/components/admin/admin-shell";
import { AdminWriteProvider } from "@/components/admin/admin-write-mode";
import { AgentSwitches } from "@/components/admin/agent-switches";
import { DesignLabSectionNav, DesignLabVentureSection } from "@/components/admin/design-lab-section";
import { AutonomyPanel } from "@/components/admin/autonomy-panel";
import { CarouselStudioAdminPanel } from "@/components/admin/carousel-studio-panel";
import { HookBrainAdminPanel } from "@/components/admin/hook-brain-panel";
import { KvorumClaimsPanel } from "@/components/admin/kvorum-claims-panel";
import { KvorumMonitorPanel } from "@/components/admin/kvorum-monitor-panel";
import { KvorumRecommendationsPanel } from "@/components/admin/kvorum-recommendations-panel";
import { ImplementationProgramCompactSummary } from "@/components/admin/implementation-plans";
import { FightAiQAdminPanel } from "@/components/admin/fightaiq-admin-panel";
import { GoViralProfilePanel } from "@/components/admin/goviral-profile-panel";
import { OwnerAttentionPanel } from "@/components/admin/owner-attention-panel";
import { PersonalGrowthOverview, PersonalGrowthPanel } from "@/components/admin/personal-growth-panel";
import { CaughtUpEventsPanel } from "@/components/admin/caught-up-events-panel";
import { BooksofhistoryDossiersPanel } from "@/components/admin/booksofhistory-dossiers-panel";
import { BooksofhistoryFeaturesPanel } from "@/components/admin/booksofhistory-features-panel";
import { BooksofhistoryShortlistPanel } from "@/components/admin/booksofhistory-shortlist-panel";
import { DoorMoneyActionsPanel } from "@/components/admin/door-money-actions-panel";
import { DoorMoneyKnowledgePanel } from "@/components/admin/door-money-knowledge-panel";
import { DoorMoneyRecommendationsPanel } from "@/components/admin/door-money-recommendations-panel";
import { TehdejsiSvetFeaturesPanel } from "@/components/admin/tehdejsi-svet-features-panel";
import { TehdejsiSvetLibraryPanel } from "@/components/admin/tehdejsi-svet-library-panel";
import {
  TehdejsiSvetSignalsPanel,
  type AdminTehdejsiAudienceRequest,
  type AdminTehdejsiSignalTheme
} from "@/components/admin/tehdejsi-svet-signals-panel";
import { FixedCostsEditor } from "@/components/admin/fixed-costs-editor";
import { MmaFilesAdminPanel } from "@/components/admin/mma-files-admin-panel";
import { AdminMoneyPanel } from "@/components/admin/money-panel";
import { IdeasPanel, MonetizationPanel, type FutureIdeaRow } from "@/components/admin/future-panels";
import { Panel, Tile } from "@/components/admin/panel";
import { AdminCallout, AdminStateMessage } from "@/components/admin/admin-primitives";
import { PortfolioCard } from "@/components/admin/portfolio-card";
import { RenderedDeskPanel } from "@/components/admin/rendered-desk-panel";
import { TittyTuesdaysProposalsPanel } from "@/components/admin/titty-tuesdays-proposals-panel";
import { SocialArchive } from "@/components/admin/social-archive-panel";
import {
  CURRENT_DAILY_OPERATING_PACE_USD,
  CURRENT_MONTHLY_API_LIMIT_USD,
  CURRENT_MONTHLY_OPERATING_LIMIT_USD
} from "@/data/operating-policy";
import { readAdminAgentControls } from "@/lib/admin-agent-controls";
import { buildAdminRecentActivity } from "@/lib/admin-recent-activity";
import { readApprovedUndeliveredPayloads } from "@/lib/admin-owner-attention";
import { adminWritesEnabled } from "@/lib/admin-write-permission";
import { readAdminAutonomy } from "@/lib/admin-autonomy";
import { readAdminBooksofhistory } from "@/lib/admin-booksofhistory";
import {
  isDesignLabVenture,
  readDesignLabSections,
  readDesignLabVenture,
  type DesignLabVentureId
} from "@/lib/design-lab-ventures";
import { readAdminFightAiQ } from "@/lib/admin-fightaiq";
import { readAdminCaughtUp } from "@/lib/admin-caught-up";
import { readAdminDoorMoney } from "@/lib/admin-door-money";
import { readAdminTehdejsiSvet } from "@/lib/admin-tehdejsi-svet";
import { readAdminFixedCosts } from "@/lib/admin-fixed-costs";
import { readAdminKvorum } from "@/lib/admin-kvorum";
import { readAdminImplementationProgress } from "@/lib/admin-implementation-plans";
import { readAdminMmaFiles } from "@/lib/admin-mma-files";
import { readAdminPersonalGrowth, type PersonalGrowthCoreTab } from "@/lib/admin-personal-growth";
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
import { ventureBrand } from "@/lib/venture-brand";
import { readAdminImageRungs } from "@/lib/admin-image-rungs";
import { buildLaunchBoard, HELD_VENTURES, LAUNCH_SET, shortTitle, ventureForApproval } from "@/lib/admin-launch-board";
import { getVentureMeetingHours } from "@/lib/venture-registry";
import { LaunchBoardPanel } from "@/components/admin/launch-board-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  description: "Protected BoardlessAI project files, ratings and social post drafts.",
  robots: { follow: false, index: false, nocache: true },
  title: "Admin"
};

/** URLs an owner would guess from a display name, pointed at the id that name belongs to. */
const VENTURE_ALIASES: Readonly<Record<string, string>> = {
  "design-lab": "carousel-studio",
  dneskai: "caught-up"
};

function tabLabel(tab: AdminVentureTab): string {
  if (tab === "visuals") return "images";
  if (tab === "studio") return "studio";
  if (tab === "social-lab") return "social drafts";
  if (tab === "trend-radar") return "trend radar";
  if (tab === "voice-strategy") return "voice & strategy";
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
 * detail tables need that precision. At 26px beside "of the $50.00 limit" the same function
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

function recordedDay(day: string): string {
  return `${day}T12:00:00.000Z`;
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ venture?: string; tab?: string; view?: string; brand?: string }>;
}) {
  const [
    { venture: requestedVenture, tab: requestedTab, view: requestedView, brand: requestedBrand },
    state,
    portfolio,
    standups,
    fightaiq,
    caughtUp,
    mmaFiles,
    booksofhistory,
    carouselStudio,
    hookBrain,
    goviralProfile,
    studioArticles,
    labSections,
    agentControls,
    autonomy,
    fixedCosts,
    money,
    dailyResults,
    ownerAttention,
    monetization,
    renderedDesk,
    ttProposals,
    approvedUndelivered,
    doorMoney,
    tehdejsiSvet,
    kvorum,
    implementationProgress,
    personalGrowth,
    imageRungs,
    meetingHours
  ] = await Promise.all([
    searchParams,
    readAdminSnapshot(),
    readAdminPortfolio(),
    getPublicStandups(),
    readAdminFightAiQ(),
    readAdminCaughtUp(),
    readAdminMmaFiles(),
    readAdminBooksofhistory(),
    readCarouselStudio(),
    readHookBrain(),
    readGoViralProfile(),
    readStudioArticles(),
    readDesignLabSections(),
    readAdminAgentControls(),
    readAdminAutonomy(),
    readAdminFixedCosts(),
    getPublicMoneySnapshot(),
    getDailyResults(),
    readOwnerAttention(),
    readMonetizationOptions(),
    readRenderedDesk(),
    readTittyTuesdaysProposals(),
    readApprovedUndeliveredPayloads(process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")),
    readAdminDoorMoney(),
    readAdminTehdejsiSvet(),
    readAdminKvorum(),
    readAdminImplementationProgress(),
    readAdminPersonalGrowth(),
    readAdminImageRungs(LAUNCH_SET),
    getVentureMeetingHours()
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
  /*
   * Which Design Lab section is open.
   *
   * The section list is the renderer's brand registry, so an unknown or missing `brand` falls
   * through to the first venture the registry declares — the same way an unknown tab falls through
   * to a venture's first. Only the selected section is resolved in full: reading every venture's
   * articles and presets to render one of them is work the page would throw away.
   */
  const labVentureId: DesignLabVentureId = isDesignLabVenture(requestedBrand)
    ? requestedBrand
    : labSections[0]!.id;
  const labVenture = await readDesignLabVenture(labVentureId);
  const brandId = selectedVenture?.id ?? "global";
  const brand = ventureBrand(brandId);
  const doorMoneyActionCount = doorMoney.actions.packets.reduce((sum, packet) => sum + packet.tasks.length, 0) +
    doorMoney.actions.playbooks.length;
  const doorMoneyKnowledgeCount = doorMoney.knowledge.index
    ? doorMoney.knowledge.index.chapters.length + doorMoney.knowledge.index.chunks.length +
      Number(doorMoney.knowledge.styleProfile !== null)
    : 0;
  const tehdejsiFeaturesCount = tehdejsiSvet.features.length + (tehdejsiSvet.shortlist?.entries.length ?? 0);
  const tehdejsiLibraryCount = (tehdejsiSvet.facts?.facts.length ?? 0) + tehdejsiSvet.research.length;
  const consumedHarvests = new Set(tehdejsiSvet.signalDigests.flatMap(({ sourceHarvestIds }) => sourceHarvestIds));
  const combinedThemes = new Map<string, AdminTehdejsiSignalTheme>();
  const combinedRequests = new Map<string, AdminTehdejsiAudienceRequest>();
  for (const digest of tehdejsiSvet.signalDigests) {
    for (const theme of digest.themes) {
      const key = theme.label.toLocaleLowerCase("und");
      const current = combinedThemes.get(key);
      combinedThemes.set(key, current ? {
        label: current.label,
        recurrence: current.recurrence + theme.recurrence,
        lastSeenAt: current.lastSeenAt > theme.lastSeenAt ? current.lastSeenAt : theme.lastSeenAt
      } : theme);
    }
    for (const request of digest.requests) {
      const key = `${request.kind}:${request.value.toLocaleLowerCase("und")}`;
      const current = combinedRequests.get(key);
      combinedRequests.set(key, current ? {
        kind: current.kind,
        value: current.value,
        recurrence: current.recurrence + request.recurrence,
        lastSeenAt: current.lastSeenAt > request.lastSeenAt ? current.lastSeenAt : request.lastSeenAt
      } : request);
    }
  }
  const tehdejsiSignals = {
    digests: tehdejsiSvet.signalDigests.map((digest) => ({
      id: digest.id,
      recordedAt: digest.extractedAt,
      sourceLabel: `Sunday overlay · ${digest.sourceHarvestIds.length} harvest${digest.sourceHarvestIds.length === 1 ? "" : "s"}`,
      recollections: digest.recollections.map(({ text }) => text),
      correctionClaims: digest.correctionClaims.map(({ text }) => text)
    })),
    themes: [...combinedThemes.values()].sort((left, right) => right.recurrence - left.recurrence || left.label.localeCompare(right.label)),
    requests: [...combinedRequests.values()].sort((left, right) => right.recurrence - left.recurrence || left.value.localeCompare(right.value)),
    insights: tehdejsiSvet.productInsights.map((insight) => ({
      id: insight.id,
      title: insight.title,
      finding: insight.finding,
      status: insight.status,
      proposedAction: insight.proposedAction,
      evidence: insight.evidence,
      ownerNote: insight.ownerNote,
      updatedAt: insight.updatedAt
    })),
    unreadable: tehdejsiSvet.unreadable.signals + tehdejsiSvet.unreadable.insights,
    pendingHarvests: tehdejsiSvet.signalHarvests.filter(({ id }) => !consumedHarvests.has(id)).length
  };
  const tehdejsiSignalsItemCount = tehdejsiSignals.digests.length + tehdejsiSignals.themes.length +
    tehdejsiSignals.requests.length + tehdejsiSignals.insights.length + tehdejsiSignals.pendingHarvests;
  const personalGrowthItemCount = personalGrowth.timeline.occurrences.length +
    Number(personalGrowth.threads.primary !== null) + personalGrowth.threads.alternatives.length +
    Number(personalGrowth.instagram.state === "present") + personalGrowth.reels.length +
    personalGrowth.trends.opportunities.length + personalGrowth.manualReferences.length + personalGrowth.threads.decisions.length +
    personalGrowth.results.items.length + personalGrowth.experiments.items.length +
    personalGrowth.voice.journals.filter(({ state }) => state === "present").length;

  /**
   * How many stored items a workspace holds.
   *
   * Some ventures keep their work outside the portfolio card store, so counting cards reported 0
   * for them — FightAIQ showed nothing on a rail beside a workspace holding twelve hundred fighter
   * records. Each such venture is counted from the loader that actually reads it.
   */
  const savedItemCount = (ventureId: string, fallback: number) =>
    ventureId === "personal-growth"
      ? personalGrowthItemCount
      : ventureId === "mma-files"
      ? mmaFiles.articles.length + mmaFiles.socialPacks.length + mmaFiles.calendar.length
      : ventureId === "door-money"
        ? doorMoney.recommendations.items.length + doorMoneyActionCount + doorMoneyKnowledgeCount
        : ventureId === "tehdejsi-svet"
          ? tehdejsiFeaturesCount + tehdejsiLibraryCount + tehdejsiSignalsItemCount
        : ventureId === "kvorum"
          ? kvorum.recommendations.length + kvorum.monitor.length + kvorum.claims.length + kvorum.results.length
        : ventureId === "carousel-studio"
          ? carouselStudio.templates.length + carouselStudio.inspirationLinks.length + studioArticles.length
          : ventureId === "booksofhistory"
            ? (booksofhistory.shortlist ? 1 : 0)
              + (booksofhistory.brief ? 1 : 0)
              + (booksofhistory.cycle ? 1 : 0)
              + booksofhistory.dossiers.length
              + booksofhistory.ledger.length
              + booksofhistory.features.length
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
      name: "Company Overview",
      count: files.length,
      href: "/admin",
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

  const recentActivity = buildAdminRecentActivity([
    {
      ventureId: "booksofhistory",
      ventureName: "BOOKSOFHISTORY",
      href: "/admin?venture=booksofhistory",
      events: [
        ...(booksofhistory.shortlist ? [{ at: booksofhistory.shortlist.asOf, singular: "shortlist", plural: "shortlists" }] : []),
        ...(booksofhistory.brief ? [{ at: recordedDay(booksofhistory.brief.date), singular: "research brief", plural: "research briefs" }] : []),
        ...(booksofhistory.cycle ? [{ at: booksofhistory.cycle.updatedAt, singular: "cycle update", plural: "cycle updates" }] : []),
        ...booksofhistory.dossiers.map(({ updatedAt }) => ({ at: updatedAt, singular: "dossier update", plural: "dossier updates" })),
        ...booksofhistory.ledger.map(({ completedAt }) => ({ at: completedAt, singular: "research entry", plural: "research entries" })),
        ...booksofhistory.features.flatMap((feature) => [
          { at: feature.updatedAt, singular: "feature update", plural: "feature updates" },
          ...feature.ratings.map(({ ratedAt }) => ({ at: ratedAt, singular: "owner rating", plural: "owner ratings" })),
          ...Object.values(feature.results).flat().map(({ capturedAt }) => ({ at: capturedAt, singular: "owner result", plural: "owner results" }))
        ])
      ]
    },
    {
      ventureId: "door-money",
      ventureName: "Door Money",
      href: "/admin?venture=door-money",
      events: [
        ...doorMoney.recommendations.items.flatMap((recommendation) => [
          { at: recommendation.updatedAt, singular: "recommendation update", plural: "recommendation updates" },
          ...recommendation.ratings.map(({ ratedAt }) => ({ at: ratedAt, singular: "owner rating", plural: "owner ratings" })),
          ...recommendation.results.map(({ capturedAt }) => ({ at: capturedAt, singular: "owner result", plural: "owner results" }))
        ]),
        ...doorMoney.actions.packets.flatMap((packet) => [
          { at: recordedDay(packet.date), singular: "action packet", plural: "action packets" },
          ...packet.tasks.flatMap(({ completedAt }) => completedAt
            ? [{ at: completedAt, singular: "completed action", plural: "completed actions" }]
            : [])
        ]),
        ...doorMoney.actions.playbooks.map(({ updatedAt }) => ({ at: updatedAt, singular: "playbook update", plural: "playbook updates" }))
      ]
    },
    {
      ventureId: "tehdejsi-svet",
      ventureName: "Tehdejší svět",
      href: "/admin?venture=tehdejsi-svet",
      events: [
        ...(tehdejsiSvet.facts ? [{ at: tehdejsiSvet.facts.copiedAt, singular: "facts snapshot", plural: "facts snapshots" }] : []),
        ...(tehdejsiSvet.shortlist ? [{ at: recordedDay(tehdejsiSvet.shortlist.date), singular: "shortlist", plural: "shortlists" }] : []),
        ...(tehdejsiSvet.cycle ? [{ at: tehdejsiSvet.cycle.updatedAt, singular: "cycle update", plural: "cycle updates" }] : []),
        ...tehdejsiSvet.research.map(({ completedAt }) => ({ at: completedAt, singular: "research entry", plural: "research entries" })),
        ...tehdejsiSvet.features.flatMap((feature) => [
          { at: feature.updatedAt, singular: "feature update", plural: "feature updates" },
          ...feature.ratings.map(({ ratedAt }) => ({ at: ratedAt, singular: "owner rating", plural: "owner ratings" })),
          ...feature.results.map(({ capturedAt }) => ({ at: capturedAt, singular: "owner result", plural: "owner results" }))
        ]),
        ...tehdejsiSvet.signalHarvests.map(({ pastedAt }) => ({ at: pastedAt, singular: "owner recollection", plural: "owner recollections" })),
        ...tehdejsiSvet.signalDigests.map(({ extractedAt }) => ({ at: extractedAt, singular: "signal digest", plural: "signal digests" })),
        ...tehdejsiSvet.productInsights.map(({ updatedAt }) => ({ at: updatedAt, singular: "product insight", plural: "product insights" }))
      ]
    },
    {
      ventureId: "kvorum",
      ventureName: "Kvórum",
      href: "/admin?venture=kvorum",
      events: [
        ...kvorum.recommendations.flatMap((recommendation) => [
          { at: recommendation.updatedAt, singular: "recommendation update", plural: "recommendation updates" },
          ...recommendation.ratings.map(({ ratedAt }) => ({ at: ratedAt, singular: "owner rating", plural: "owner ratings" }))
        ]),
        ...kvorum.monitor.map(({ generatedAt }) => ({ at: generatedAt, singular: "monitor run", plural: "monitor runs" })),
        ...kvorum.claims.map(({ updatedAt }) => ({ at: updatedAt, singular: "claim update", plural: "claim updates" })),
        ...kvorum.results.map(({ capturedAt }) => ({ at: capturedAt, singular: "owner result", plural: "owner results" })),
        ...(kvorum.quota ? [{ at: kvorum.quota.updatedAt, singular: "quota receipt", plural: "quota receipts" }] : [])
      ]
    }
  ], new Date());

  const sections: AdminSection[] = [
    {
      id: "operations",
      name: "Operations",
      href: "/admin/operations",
      active: false
    },
    {
      id: "implementation-plans",
      name: "Implementation Plans",
      href: "/admin/implementation-plans",
      active: false,
      count: implementationProgress.state === "missing" ? null : implementationProgress.programs.length
    },
    {
      id: "social-profiles",
      name: "Social Profiles",
      href: "/admin/social-profiles",
      active: false
    },
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
        booksofhistory.unreadable.total +
        ownerAttention.unreadable +
        doorMoney.unreadable +
        tehdejsiSvet.unreadable.total +
        kvorum.unreadable +
        personalGrowth.unreadable.total +
        implementationProgress.unreadableItems
    }
  ];

  /*
   * The launch board, folded from the snapshots that already own each field.
   *
   * Nothing here reads a file: every value arrives from a loader above, so the board cannot
   * disagree with the panel it sits on top of. In particular the blocking column comes off
   * `state/owner-attention.json` exactly like the rail counters and the two attention panels do:
   * one source carrying its own age, rather than a second reading of the inbox that would drift
   * away from them.
   *
   * Approvals only, not manual tasks. The two overlap, because the same countersignature is both an
   * inbox line and a NEEDED entry, and a manual task's slugified id carries no venture to match on.
   */
  const blockingByVenture: Record<string, { title: string; href: string }> = {};
  for (const item of ownerAttention.approvals) {
    if (item.urgency !== "blocking") continue;
    const ventureId = ventureForApproval(item.id);
    if (!ventureId || blockingByVenture[ventureId]) continue;
    blockingByVenture[ventureId] = { title: shortTitle(item.title), href: "/admin?view=approvals" };
  }
  // The newest delivery each venture has on file. The rendered desk keeps three days, which is the
  // window it is built for; a venture that last shipped before it reads as no recent delivery
  // rather than as never having shipped, and the column header says "Last delivery" for that
  // reason.
  const deliveriesByVenture: Record<string, { date: string; url: string | null }> = {};
  for (const day of renderedDesk.days) {
    for (const article of day.articles) {
      deliveriesByVenture[article.ventureId] ??= { date: day.date, url: article.url };
    }
  }
  const launchBoard = buildLaunchBoard({
    // `ventureName` because the owner calls Caught Up "DNESKAi" everywhere else in this admin, and
    // a board that renames a venture on its own first screen is a board he has to translate.
    ventures: LAUNCH_SET.map((id) => ({
      id,
      name: ventureName(id, portfolio.ventures.find((venture) => venture.id === id)?.name ?? id)
    })),
    deliveries: deliveriesByVenture,
    slots: Object.fromEntries(
      LAUNCH_SET.map((id) => [id, meetingHours[id]?.[0]])
    ),
    images: imageRungs,
    social: Object.fromEntries(
      autonomy.social.map((entry) => [entry.venture, {
        counter: entry.counter,
        required: entry.required,
        status: entry.status
      }])
    ),
    blocking: blockingByVenture,
    heldIds: HELD_VENTURES,
    attentionAsOf: ownerAttention.generatedAt?.slice(0, 10) ?? null,
    today: new Date().toISOString().slice(0, 10)
  });

  const monthAllIn = money?.costs.totalMonthlyBurnUsd ?? 0;
  const monthApi = money?.costs.api.monthlyUsd ?? 0;
  const latestDay = dailyResults.at(-1) ?? null;

  const ventureUnreadable = selectedVenture?.id === "mma-files"
    ? [...selectedVenture.unreadableFiles, ...mmaFiles.unreadable]
    : selectedVenture?.id === "fightaiq"
      ? [...selectedVenture.unreadableFiles, ...fightaiq.unreadable]
    : selectedVenture?.id === "booksofhistory"
      ? [...selectedVenture.unreadableFiles, ...Object.entries(booksofhistory.unreadable).flatMap(([store, count]) => store !== "total" && count ? [`${store} (${count})`] : [])]
      : selectedVenture?.id === "door-money" && doorMoney.unreadable > 0
        ? [...selectedVenture.unreadableFiles, `Door Money stores (${doorMoney.unreadable})`]
        : selectedVenture?.id === "tehdejsi-svet"
          ? [...selectedVenture.unreadableFiles, ...Object.entries(tehdejsiSvet.unreadable).flatMap(([store, count]) => store !== "total" && count ? [`${store} (${count})`] : [])]
        : selectedVenture?.id === "kvorum" && kvorum.unreadable > 0
          ? [...selectedVenture.unreadableFiles, `Kvórum stores (${kvorum.unreadable})`]
          : selectedVenture?.id === "personal-growth" && personalGrowth.unreadable.total > 0
            ? [...selectedVenture.unreadableFiles, `Personal Growth stores (${personalGrowth.unreadable.total})`]
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
        node: (
          <div className="grid min-w-0 gap-4">
            <DesignLabSectionNav sections={labSections} selected={labVenture.id} />
            <DesignLabVentureSection venture={labVenture} />
          </div>
        ),
        count: labVenture.publishesArticles ? labVenture.articleCount : labVenture.presetCount
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
    if (id === "door-money" && selectedTab === "recommendations") {
      return {
        node: <DoorMoneyRecommendationsPanel recommendations={doorMoney.recommendations} />,
        count: doorMoney.recommendations.items.length
      };
    }
    if (id === "door-money" && selectedTab === "actions") {
      return { node: <DoorMoneyActionsPanel snapshot={doorMoney.actions} />, count: doorMoneyActionCount };
    }
    if (id === "door-money" && selectedTab === "knowledge") {
      return { node: <DoorMoneyKnowledgePanel knowledge={doorMoney.knowledge} />, count: doorMoneyKnowledgeCount };
    }
    if (id === "kvorum" && selectedTab === "recommendations") {
      return { node: <KvorumRecommendationsPanel snapshot={kvorum} />, count: kvorum.recommendations.length };
    }
    if (id === "kvorum" && selectedTab === "monitor") {
      return { node: <KvorumMonitorPanel snapshot={kvorum} />, count: kvorum.monitor.length };
    }
    if (id === "kvorum" && selectedTab === "claims") {
      return {
        node: <KvorumClaimsPanel claims={kvorum.claims} state={kvorum.claimsState} unreadable={kvorum.claimsUnreadable} />,
        count: kvorum.claims.length
      };
    }
    if (id === "tehdejsi-svet" && selectedTab === "features") {
      return { node: <TehdejsiSvetFeaturesPanel snapshot={tehdejsiSvet} />, count: tehdejsiFeaturesCount };
    }
    if (id === "tehdejsi-svet" && selectedTab === "library") {
      return {
        node: <TehdejsiSvetLibraryPanel now={new Date().toISOString()} snapshot={tehdejsiSvet} />,
        count: tehdejsiLibraryCount
      };
    }
    if (id === "tehdejsi-svet" && selectedTab === "signals") {
      return { node: <TehdejsiSvetSignalsPanel view={tehdejsiSignals} />, count: tehdejsiSignalsItemCount };
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
    if (id === "booksofhistory" && selectedTab === "shortlist") {
      return {
        node: <BooksofhistoryShortlistPanel snapshot={booksofhistory} />,
        count: booksofhistory.shortlist?.entries.length ?? 0
      };
    }
    if (id === "booksofhistory" && selectedTab === "dossiers") {
      return { node: <BooksofhistoryDossiersPanel snapshot={booksofhistory} />, count: booksofhistory.dossiers.length };
    }
    if (id === "booksofhistory" && selectedTab === "features") {
      return { node: <BooksofhistoryFeaturesPanel snapshot={booksofhistory} />, count: booksofhistory.features.length };
    }
    if (id === "personal-growth" && selectedTab) {
      const tab = selectedTab as PersonalGrowthCoreTab;
      const count = tab === "today" ? personalGrowth.today.due.length + Number(personalGrowth.threads.primary !== null) + Number(personalGrowth.instagram.state === "present")
        : tab === "timeline" ? personalGrowth.timeline.occurrences.length + personalGrowth.timeline.rhythmOpportunities.length
          : tab === "threads" ? Number(personalGrowth.threads.primary !== null) + personalGrowth.threads.alternatives.length + personalGrowth.threads.conversationOpportunities.length
            : tab === "instagram" ? Number(personalGrowth.instagram.state === "present") + personalGrowth.manualReferences.length
              : tab === "reels" ? personalGrowth.reels.length
                : tab === "trend-radar" ? personalGrowth.trends.opportunities.length
                  : tab === "results" ? personalGrowth.results.items.length
                    : tab === "experiments" ? personalGrowth.experiments.items.length
                      : tab === "voice-strategy" ? personalGrowth.voice.journals.filter(({ state }) => state === "present").length + (personalGrowth.strategy?.pillars.length ?? 0)
                        : personalGrowth.budget.featureFlags.length;
      return { node: <PersonalGrowthPanel snapshot={personalGrowth} tab={tab} />, count };
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
        <AdminCallout>
          Nothing is stored under {selectedTab ? tabLabel(selectedTab) : "this tab"} for{" "}
          {ventureName(id, selectedVenture.name)} yet. The admin does not add fake examples.
        </AdminCallout>
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
            className="admin-focus-ring shrink-0 rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface-secondary)] px-3 py-2 font-mono text-[length:var(--admin-type-control)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground)] transition-colors hover:bg-[var(--admin-surface-hover)]"
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
            : "Company Overview"
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
            : "Company Overview"
      }
      workspaces={workspaces}
    >
      <AdminWriteProvider enabled={writesEnabled}>
      {!writesEnabled ? (
        <AdminStateMessage
          description="Saving needs the production GitHub token listed in NEEDED.md. Existing records remain available to review."
          state="write-disabled"
          title="This deployment cannot save changes"
        />
      ) : null}
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
          <LaunchBoardPanel board={launchBoard} />
          <PersonalGrowthOverview snapshot={personalGrowth} />
          <div
            className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-border)] lg:grid-cols-4"
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

          <Panel note="The four newest ventures" title="What happened since yesterday">
            <div className="grid gap-3 md:grid-cols-2" data-admin-recent-activity>
              {recentActivity.map((row) => (
                <Link
                  className="admin-focus-ring grid min-w-0 gap-2 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-4 transition-colors duration-[var(--admin-motion-fast)] hover:border-[var(--admin-border-strong)] hover:bg-[var(--admin-surface-hover)]"
                  data-recent-venture={row.ventureId}
                  href={row.href}
                  key={row.ventureId}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)]">{row.ventureName}</h3>
                    <span className="admin-tabular text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{row.count} recent</span>
                  </div>
                  <p className="m-0 text-[length:var(--admin-type-body)] leading-[1.55] text-[var(--admin-foreground)]">{row.summary}</p>
                  <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
                    {row.latestAt && row.latestLabel
                      ? `Latest: ${row.latestLabel} · ${row.latestAt.slice(0, 10)}`
                      : "No readable record exists yet"}
                  </p>
                </Link>
              ))}
            </div>
          </Panel>

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
            <p className="mt-4 text-[length:var(--admin-type-control)] leading-[1.55] text-[var(--admin-foreground-muted)]">
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
                  className="admin-focus-ring min-h-[var(--admin-touch-target)] rounded-[var(--admin-radius)] border px-3 py-2 text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] transition-colors duration-[var(--admin-motion-fast)] md:min-h-[var(--admin-control-height)]"
                  href={`/admin?venture=${selectedVenture.id}&tab=${tab}`}
                  key={tab}
                  scroll={false}
                  // Resolve the tint against the current Admin surface instead of the old
                  // near-black canvas. This keeps the same brand signal in both themes while the
                  // shared foreground token keeps the label readable.
                  style={{
                    borderColor: on ? brand : "var(--admin-border-strong)",
                    background: on
                      ? `color-mix(in srgb, ${brand} 15%, var(--admin-surface-secondary))`
                      : "var(--admin-surface-secondary)",
                    color: "var(--admin-foreground)"
                  }}
                >
                  {label}
                </Link>
              );
            })}
            <span className="admin-tabular ml-auto text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
              {tabView.count} on this tab
            </span>
          </div>

          {ventureUnreadable.length ? (
            <AdminStateMessage
              description={`${ventureUnreadable.length} saved ${ventureUnreadable.length === 1 ? "file cannot" : "files cannot"} be read: ${ventureUnreadable.join(", ")}.`}
              state="malformed"
              title="Some saved workspace records are unavailable"
            />
          ) : null}

          {selectedVenture?.id === "personal-growth" ? (
            <ImplementationProgramCompactSummary
              programId={selectedVenture.id}
              snapshot={implementationProgress}
            />
          ) : null}

          {/* GoVIRAL owns exactly one artefact and it is not a card, so the workspace leads with
              it. Both tabs below say "nothing is stored", which is true and was the only thing
              the venture had to say for itself. */}
          {selectedVenture.id === "goviral" ? <GoViralProfilePanel profile={goviralProfile} /> : null}

          <div className="min-w-0">{tabView.node}</div>

          {selectedAgentControls ? (
            <div className="min-w-0">
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
