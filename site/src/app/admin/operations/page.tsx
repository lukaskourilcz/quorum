import type { Metadata } from "next";
import { adminSections } from "@/lib/admin-sections";
import { AdminShell, type AdminAttention, type AdminSection, type AdminWorkspace } from "@/components/admin/admin-shell";
import { OperationsControlCenter } from "@/components/admin/operations-control-center";
import { OperationsRefreshButton } from "@/components/admin/operations-actions";
import { readAdminOperations } from "@/lib/admin-operations";
import { readAdminPortfolio } from "@/lib/admin-portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Operations | BoardlessAI Admin",
  robots: { index: false, follow: false, nocache: true }
};

export default async function OperationsPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; node?: string }>;
}) {
  const [{ view, node }, snapshot, portfolio] = await Promise.all([
    searchParams,
    readAdminOperations(),
    readAdminPortfolio()
  ]);
  const workspaces: AdminWorkspace[] = [
    { id: "global", name: "Company Overview", count: 0, href: "/admin", active: false },
    ...portfolio.ventures.map((venture) => ({ id: venture.id, name: venture.name, count: venture.cards.length, href: `/admin?venture=${venture.id}`, active: false }))
  ];
  const sections: AdminSection[] = adminSections(null);
  const attention: AdminAttention[] = [
    { label: "Operational attention", value: snapshot.nodes.filter((candidate) => ["degraded", "stale", "failing", "setup-needed", "unavailable"].includes(candidate.health)).length },
    ...(snapshot.incidents.activeCount === null ? [] : [{ label: "Active incidents", value: snapshot.incidents.activeCount }]),
    ...(snapshot.capacity.counts ? [{ label: "Held capacity jobs", value: snapshot.capacity.counts.held }] : []),
    { label: "Unreadable records", value: snapshot.unreadableRecords }
  ];
  return (
    <AdminShell
      action={<OperationsRefreshButton />}
      attention={attention}
      brandId="global"
      breadcrumb="Operations"
      lead="A protected, server-sanitized view of canonical operational evidence. It observes health, capacity, recovery and boundaries without reading venture content or changing authority."
      sections={sections}
      title="Operations control center"
      workspaces={workspaces}
    >
      <OperationsControlCenter selectedNodeId={node} selectedView={view} snapshot={snapshot} />
    </AdminShell>
  );
}
