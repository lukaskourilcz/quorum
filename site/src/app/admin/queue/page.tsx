import type { Metadata } from "next";
import { AdminShell, type AdminWorkspace } from "@/components/admin/admin-shell";
import { AdminWriteProvider } from "@/components/admin/admin-write-mode";
import { QueuePanel, type QueueFilters } from "@/components/admin/queue-panel";
import { readAdminQueue } from "@/lib/admin-queue";
import { QUEUE_GROUPS, QUEUE_PLATFORMS, type QueueGroup, type QueuePlatform } from "@/lib/admin-queue/types";
import { navigableVentures, readAdminPortfolio } from "@/lib/admin-portfolio";
import { adminSections } from "@/lib/admin-sections";
import { adminWritesEnabled } from "@/lib/admin-write-permission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Queue | BoardlessAI Admin",
  robots: { index: false, follow: false, nocache: true }
};

export default async function QueuePage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; venture?: string; platform?: string }>;
}) {
  const [query, snapshot, portfolio] = await Promise.all([searchParams, readAdminQueue(), readAdminPortfolio()]);
  const writesConfigured = adminWritesEnabled();
  // An unknown filter value falls back to the whole list, the way an unknown tab falls back to a venture's first.
  const filters: QueueFilters = {
    group: (QUEUE_GROUPS as readonly string[]).includes(query.status ?? "") ? query.status as QueueGroup : "waiting",
    venture: snapshot.ventures.some(({ id }) => id === query.venture) ? query.venture! : null,
    platform: (QUEUE_PLATFORMS as readonly string[]).includes(query.platform ?? "") ? query.platform as QueuePlatform : null
  };
  const workspaces: AdminWorkspace[] = [
    { id: "global", name: "Company Overview", count: 0, href: "/admin", active: false },
    ...navigableVentures(portfolio).map((venture) => ({
      id: venture.id,
      name: venture.name,
      count: venture.cards.length,
      href: `/admin?venture=${venture.id}`,
      active: false
    }))
  ];
  const unreadable = snapshot.unreadable + snapshot.dropped.items;
  return (
    <AdminShell
      attention={[
        { label: "Posts waiting", value: snapshot.counts.waiting },
        { label: "Failed or unconfirmed", value: snapshot.counts.failed },
        { label: "Unreadable queue files", value: unreadable }
      ]}
      brandId="global"
      breadcrumb="Queue"
      lead="Every social post that waits for your approval. Edit the text here, open the graphic in the Design Lab, and approve it for its window or for the next hour. An approval queues the post; the publisher sends it only while every lock is open."
      sections={adminSections("queue", { queue: snapshot.counts.waiting })}
      title="Queue"
      workspaces={workspaces}
    >
      <AdminWriteProvider enabled={writesConfigured}>
        <QueuePanel filters={filters} snapshot={snapshot} writesConfigured={writesConfigured} />
      </AdminWriteProvider>
    </AdminShell>
  );
}
