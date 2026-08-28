import type { Metadata } from "next";
import { AdminShell, type AdminSection, type AdminWorkspace } from "@/components/admin/admin-shell";
import { SocialProfilesWorkspace } from "@/components/admin/social-profiles-workspace";
import { AdminWriteProvider } from "@/components/admin/admin-write-mode";
import { adminWritesEnabled } from "@/lib/admin-write-permission";
import { readAdminPortfolio } from "@/lib/admin-portfolio";
import { resolveSocialProfileSection } from "@/lib/social-profiles/model";
import { readAdminSocialProfiles } from "@/lib/social-profiles/snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Social Profiles | BoardlessAI Admin",
  robots: { index: false, follow: false, nocache: true }
};

export default async function SocialProfilesPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string; profile?: string; campaign?: string; fixtures?: string }>;
}) {
  const query = await searchParams;
  const fixtureRequest = query.fixtures === "profile-matrix";
  const [snapshot, portfolio] = await Promise.all([
    readAdminSocialProfiles(undefined, { includeSimulations: fixtureRequest }),
    readAdminPortfolio()
  ]);
  const section = resolveSocialProfileSection(query.section);
  const workspaces: AdminWorkspace[] = [
    { id: "global", name: "Company Overview", count: 0, href: "/admin", active: false },
    ...portfolio.ventures.map((venture) => ({ id: venture.id, name: venture.name, count: venture.cards.length, href: `/admin?venture=${venture.id}`, active: false }))
  ];
  const sections: AdminSection[] = [
    { id: "operations", name: "Operations", href: "/admin/operations", active: false },
    { id: "implementation-plans", name: "Implementation Plans", href: "/admin/implementation-plans", active: false },
    { id: "social-profiles", name: "Social Profiles", href: "/admin/social-profiles", active: true, count: snapshot.ventureProfiles.length + snapshot.amplificationProfiles.length },
    { id: "approvals", name: "Approvals", href: "/admin?view=approvals", active: false },
    { id: "manual-tasks", name: "Only you can do", href: "/admin?view=manual-tasks", active: false },
    { id: "future", name: "Future", href: "/admin?view=future", active: false }
  ];
  const dropped = Object.values(snapshot.dropped).reduce((total, value) => total + value, 0);

  return (
    <AdminShell
      attention={[
        { label: "Profiles held", value: snapshot.ventureProfiles.filter(({ lifecycle }) => lifecycle !== "active").length + snapshot.amplificationProfiles.filter(({ proposal }) => proposal.lifecycle !== "active").length },
        { label: "Campaign review", value: snapshot.campaigns.filter(({ campaign }) => ["needs-owner-review", "partially-approved", "held"].includes(campaign.status)).length },
        { label: "Setup or reauthorisation", value: snapshot.ventureProfiles.flatMap(({ connections }) => connections).filter(({ currentState }) => ["held", "reauthorisation-required"].includes(currentState)).length },
        { label: "Unreadable records", value: dropped }
      ]}
      brandId="global"
      breadcrumb="Social Profiles"
      lead="Protected profile, connection, campaign-selection, approval, lifecycle and amplifier-policy evidence. Account creation, OAuth, live activation, engagement and purchases stay outside this workspace."
      sections={sections}
      title="Social Profiles"
      workspaces={workspaces}
    >
      <AdminWriteProvider enabled={adminWritesEnabled()}>
        <SocialProfilesWorkspace campaignId={query.campaign} profileId={query.profile} section={section} snapshot={snapshot} />
      </AdminWriteProvider>
    </AdminShell>
  );
}
