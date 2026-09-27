import type { Metadata } from "next";
import { AdminShell, type AdminWorkspace } from "@/components/admin/admin-shell";
import { AdminWriteProvider } from "@/components/admin/admin-write-mode";
import { MarketingCalendarScreen } from "@/components/admin/marketing-calendar/marketing-calendar-screen";
import { isMarketingCalendarVenture, MARKETING_CALENDAR_VENTURES } from "@/lib/admin-marketing-calendar";
import { adminVentureName, navigableVentures, readAdminPortfolio } from "@/lib/admin-portfolio";
import { readAdminQueueWaitingCount } from "@/lib/admin-queue";
import { adminSections } from "@/lib/admin-sections";
import { adminWritesEnabled } from "@/lib/admin-write-permission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Calendar | BoardlessAI Admin",
  robots: { index: false, follow: false, nocache: true }
};

type Query = Record<string, string | string[] | undefined>;

/** `dneskai` is what the owner calls caught-up; the admin's other routes accept the same alias. */
const ALIASES: Readonly<Record<string, string>> = { dneskai: "caught-up", devshark: "marketingshark" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [raw, portfolio, waiting] = await Promise.all([searchParams, readAdminPortfolio(), readAdminQueueWaitingCount()]);
  const query = new URLSearchParams(Object.entries(raw).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  const requested = ALIASES[query.get("venture") ?? ""] ?? query.get("venture");
  // An unknown venture falls back to the first plan, the way an unknown tab falls back to a venture's first.
  const venture = isMarketingCalendarVenture(requested) ? requested : MARKETING_CALENDAR_VENTURES[0].id;
  const workspaces: AdminWorkspace[] = [
    { id: "global", name: "Company Overview", count: 0, href: "/admin", active: false },
    ...navigableVentures(portfolio).map((candidate) => ({
      id: candidate.id,
      name: adminVentureName(candidate.id, candidate.name),
      count: candidate.cards.length,
      href: `/admin?venture=${candidate.id}`,
      active: false
    }))
  ];
  const writesConfigured = adminWritesEnabled();
  return (
    <AdminShell
      attention={[{ label: "Posts waiting", value: waiting ?? 0 }]}
      brandId="global"
      breadcrumb="Calendar"
      lead="The 30-day marketing plans for devShark and DNESKAi: every post, ad and task, day by day, with its status read back from the Queue. The calendar plans and reads; it publishes nothing and starts no room."
      sections={adminSections("calendar", { queue: waiting })}
      title="Calendar"
      workspaces={workspaces}
    >
      <AdminWriteProvider enabled={writesConfigured}>
        <MarketingCalendarScreen
          query={query}
          switchHref={(target) => `/admin/calendar?venture=${target}`}
          venture={venture}
          writesConfigured={writesConfigured}
        />
      </AdminWriteProvider>
    </AdminShell>
  );
}
