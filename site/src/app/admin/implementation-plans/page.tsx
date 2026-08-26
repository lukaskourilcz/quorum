import type { Metadata } from "next";
import { AdminShell, type AdminSection, type AdminWorkspace } from "@/components/admin/admin-shell";
import { ImplementationRefreshButton } from "@/components/admin/implementation-plan-actions";
import { ImplementationPlansView } from "@/components/admin/implementation-plans";
import { readAdminImplementationProgress } from "@/lib/admin-implementation-plans";
import { readAdminPortfolio } from "@/lib/admin-portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Implementation Plans | BoardlessAI Admin",
  robots: { index: false, follow: false }
};

export default async function ImplementationPlansPage({
  searchParams
}: {
  searchParams: Promise<{ program?: string; item?: string }>;
}) {
  const [{ program, item }, snapshot, portfolio] = await Promise.all([
    searchParams,
    readAdminImplementationProgress(),
    readAdminPortfolio()
  ]);
  const workspaces: AdminWorkspace[] = [
    { id: "global", name: "Company Overview", count: 0, href: "/admin", active: false },
    ...portfolio.ventures.map((venture) => ({
      id: venture.id,
      name: venture.name,
      count: venture.cards.length,
      href: `/admin?venture=${venture.id}`,
      active: false
    }))
  ];
  const sections: AdminSection[] = [
    { id: "implementation-plans", name: "Implementation Plans", href: "/admin/implementation-plans", active: true, count: snapshot.state === "missing" ? null : snapshot.programs.length },
    { id: "approvals", name: "Approvals", href: "/admin?view=approvals", active: false },
    { id: "manual-tasks", name: "Only you can do", href: "/admin?view=manual-tasks", active: false },
    { id: "future", name: "Future", href: "/admin?view=future", active: false }
  ];
  const attention = [
    { label: "Owner actions", value: snapshot.items.filter((candidate) => candidate.state === "owner-action").length },
    { label: "Inconsistent items", value: snapshot.items.filter((candidate) => candidate.state === "inconsistent").length },
    { label: "Stale items", value: snapshot.items.filter((candidate) => candidate.state === "stale").length },
    { label: "Unreadable progress records", value: snapshot.unreadableItems }
  ];

  return (
    <AdminShell
      action={<ImplementationRefreshButton />}
      attention={attention}
      brandId="global"
      breadcrumb="Implementation Plans"
      lead="Canonical program, work-item and evidence state from the orchestrator snapshot. GitHub is read only and completion is never inferred from issue labels alone."
      sections={sections}
      title="Implementation Plans"
      workspaces={workspaces}
    >
      <ImplementationPlansView selectedItemId={item} selectedProgramId={program} snapshot={snapshot} />
    </AdminShell>
  );
}
