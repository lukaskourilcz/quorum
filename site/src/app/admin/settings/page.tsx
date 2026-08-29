import type { Metadata } from "next";
import { AdminShell, type AdminSection, type AdminWorkspace } from "@/components/admin/admin-shell";
import { AdminStateMessage } from "@/components/admin/admin-primitives";
import { AdminWriteProvider } from "@/components/admin/admin-write-mode";
import { VenturePauseSwitches } from "@/components/admin/venture-pause-switches";
import { readAdminPortfolio } from "@/lib/admin-portfolio";
import { readAdminVentureSettings } from "@/lib/admin-venture-settings";
import { adminWritesEnabled } from "@/lib/admin-write-permission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Settings | BoardlessAI Admin",
  robots: { index: false, follow: false, nocache: true }
};

export default async function SettingsPage() {
  const [settings, portfolio] = await Promise.all([
    readAdminVentureSettings(),
    readAdminPortfolio()
  ]);
  const writesEnabled = adminWritesEnabled();
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
    { id: "operations", name: "Operations", href: "/admin/operations", active: false },
    { id: "implementation-plans", name: "Implementation Plans", href: "/admin/implementation-plans", active: false },
    { id: "social-profiles", name: "Social Profiles", href: "/admin/social-profiles", active: false },
    { id: "approvals", name: "Approvals", href: "/admin?view=approvals", active: false },
    { id: "manual-tasks", name: "Only you can do", href: "/admin?view=manual-tasks", active: false }
  ];
  return (
    <AdminShell
      attention={[{ label: "Paused projects", value: settings.ventures.filter((venture) => venture.paused).length }]}
      brandId="global"
      breadcrumb="Settings"
      lead="The one page that changes how the company runs: which projects are on. Everything else runs itself."
      sections={sections}
      title="Settings"
      workspaces={workspaces}
    >
      <AdminWriteProvider enabled={writesEnabled}>
        <div className="grid min-w-0 gap-4">
          {!writesEnabled ? (
            <AdminStateMessage
              description="Saving needs the production GitHub token listed in NEEDED.md. The switches below show the current state."
              state="write-disabled"
              title="This deployment cannot save changes"
            />
          ) : null}
          <VenturePauseSwitches initialVentures={settings.ventures} />
        </div>
      </AdminWriteProvider>
    </AdminShell>
  );
}
