import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ventureBrand } from "@/lib/venture-brand";
import {
  ADMIN_RAIL_COOKIE,
  ADMIN_THEME_COOKIE,
  parseAdminRail,
  parseAdminTheme
} from "@/lib/admin-shell-preferences";
import { AdminShellClient } from "./admin-shell-client";
import type { AdminDestination, AdminNavigationGroup } from "./admin-shell-types";

export interface AdminWorkspace {
  id: string;
  name: string;
  /** How many stored items this workspace holds. Never a guess — an empty workspace shows 0. */
  count: number;
  href: string;
  active: boolean;
}

export interface AdminAttention {
  label: string;
  value: number;
}

export interface AdminSection {
  id: string;
  name: string;
  href: string;
  active: boolean;
  count?: number | null;
}

function sectionIcon(id: string): AdminDestination["icon"] {
  if (id === "operations") return "operations";
  if (id === "social-profiles") return "profiles";
  if (id === "approvals") return "approvals";
  if (id === "manual-tasks") return "manual";
  return "future";
}

/**
 * Compose real, server-resolved destinations before the interactive shell boundary. The panels
 * and their loaders stay server components; only shell preferences and overlays ship JavaScript.
 */
export async function AdminShell({
  workspaces,
  sections = [],
  attention,
  title,
  lead,
  breadcrumb,
  action,
  brandId,
  children
}: {
  workspaces: readonly AdminWorkspace[];
  sections?: readonly AdminSection[];
  attention: readonly AdminAttention[];
  title: string;
  lead: string;
  breadcrumb: string;
  action?: ReactNode;
  brandId: string;
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const companyAccent = ventureBrand(brandId);
  const overview = workspaces.find((workspace) => workspace.id === "global");
  const workspaceDestinations: AdminDestination[] = workspaces
    .filter((workspace) => workspace.id !== "global" && workspace.id !== "carousel-studio")
    .map((workspace) => ({
      accent: ventureBrand(workspace.id),
      active: workspace.active,
      count: workspace.count,
      href: workspace.href,
      icon: "workspace",
      id: `workspace-${workspace.id}`,
      label: workspace.name
    }));
  const productionDestinations: AdminDestination[] = workspaces
    .filter((workspace) => workspace.id === "carousel-studio")
    .map((workspace) => ({
      accent: ventureBrand(workspace.id),
      active: workspace.active,
      count: workspace.count,
      href: workspace.href,
      icon: "production",
      id: `production-${workspace.id}`,
      label: workspace.name
    }));
  const companyDestinations: AdminDestination[] = [
    {
      accent: ventureBrand("company"),
      active: overview?.active ?? false,
      count: overview?.count,
      href: "/admin",
      icon: "overview",
      id: "company-overview",
      label: "Company Overview"
    },
    ...sections.map((section) => ({
      accent: companyAccent,
      active: section.active,
      count: section.count,
      href: section.href,
      icon: sectionIcon(section.id),
      id: `company-${section.id}`,
      label: section.name
    }))
  ];
  const groups: AdminNavigationGroup[] = [
    { id: "company", label: "Company", destinations: companyDestinations },
    ...(productionDestinations.length
      ? [{ id: "production" as const, label: "Production", destinations: productionDestinations }]
      : []),
    ...(workspaceDestinations.length
      ? [{ id: "workspaces" as const, label: "Workspaces", destinations: workspaceDestinations }]
      : [])
  ];

  return (
    <AdminShellClient
      action={action}
      attention={attention}
      brand={companyAccent}
      breadcrumb={breadcrumb}
      groups={groups}
      initialPreferences={{
        collapsed: parseAdminRail(cookieStore.get(ADMIN_RAIL_COOKIE)?.value),
        theme: parseAdminTheme(cookieStore.get(ADMIN_THEME_COOKIE)?.value)
      }}
      lead={lead}
      ownerName={process.env.ADMIN_USER?.trim() || "Owner"}
      title={title}
    >
      {children}
    </AdminShellClient>
  );
}
