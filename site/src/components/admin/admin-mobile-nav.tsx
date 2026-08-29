"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, FolderKanban, LayoutDashboard, LogOut, Menu, Moon, Sun } from "lucide-react";
import { AdminDialog } from "./admin-overlays";
import type { AdminTheme } from "@/lib/admin-shell-preferences";
import type { AdminDestination, AdminNavigationGroup } from "./admin-shell-types";

function findDestination(groups: readonly AdminNavigationGroup[], id: string): AdminDestination | undefined {
  return groups.flatMap((group) => group.destinations).find((destination) => destination.id === id);
}

function MobileDestinationLink({
  destination,
  icon: Icon
}: {
  destination: AdminDestination;
  icon: typeof LayoutDashboard;
}) {
  return (
    <Link
      aria-current={destination.active ? "page" : undefined}
      className="admin-focus-ring flex min-h-[var(--admin-touch-target)] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--admin-radius)] px-1 text-[length:var(--admin-type-micro)] font-semibold text-[var(--admin-foreground-muted)] data-[active=true]:text-[var(--admin-foreground)]"
      data-active={destination.active}
      href={destination.href}
      scroll={false}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={destination.active ? 2.2 : 1.7} />
      <span className="truncate">{destination.label === "Company Overview" ? "Overview" : destination.label}</span>
      <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[var(--admin-section-accent)] opacity-0 data-[active=true]:opacity-100" data-active={destination.active} />
    </Link>
  );
}

export function AdminMobileNav({
  groups,
  interactive,
  onThemeChange,
  theme
}: {
  groups: readonly AdminNavigationGroup[];
  interactive: boolean;
  onThemeChange: (theme: AdminTheme) => void;
  theme: AdminTheme;
}) {
  const [sheet, setSheet] = useState<"all" | "workspaces" | null>(null);
  const overview = findDestination(groups, "company-overview");
  const approvals = findDestination(groups, "company-approvals");
  const workspaceGroups = groups.filter((group) => group.id === "workspaces");
  const hasActiveWorkspace = groups
    .filter((group) => group.id === "workspaces" || group.id === "production")
    .some((group) => group.destinations.some((destination) => destination.active));
  const visibleGroups = sheet === "workspaces" ? workspaceGroups : groups;

  return (
    <>
      <nav
        aria-label="Primary Admin navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-[var(--admin-border)] bg-[var(--admin-toolbar)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
        data-admin-mobile-nav
        data-personal-growth-workspace="available"
      >
        {overview ? <MobileDestinationLink destination={overview} icon={LayoutDashboard} /> : null}
        {approvals ? <MobileDestinationLink destination={approvals} icon={CheckCheck} /> : null}
        <button
          aria-haspopup="dialog"
          className="admin-focus-ring flex min-h-[var(--admin-touch-target)] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--admin-radius)] px-1 text-[length:var(--admin-type-micro)] font-semibold text-[var(--admin-foreground-muted)] data-[active=true]:text-[var(--admin-foreground)]"
          data-active={hasActiveWorkspace}
          disabled={!interactive}
          onClick={() => setSheet("workspaces")}
          type="button"
        >
          <FolderKanban aria-hidden="true" className="size-4" strokeWidth={hasActiveWorkspace ? 2.2 : 1.7} />
          <span>Workspaces</span>
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[var(--admin-section-accent)] opacity-0 data-[active=true]:opacity-100" data-active={hasActiveWorkspace} />
        </button>
        <button
          aria-haspopup="dialog"
          className="admin-focus-ring flex min-h-[var(--admin-touch-target)] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--admin-radius)] px-1 text-[length:var(--admin-type-micro)] font-semibold text-[var(--admin-foreground-muted)]"
          disabled={!interactive}
          onClick={() => setSheet("all")}
          type="button"
        >
          <Menu aria-hidden="true" className="size-4" />
          <span>More</span>
          <span aria-hidden="true" className="h-0.5 w-4" />
        </button>
      </nav>

      <AdminDialog
        classNames={{
          body: "p-2",
          header: "px-4 py-3",
          root: "items-end p-0",
          surface: "max-h-[85svh] max-w-none rounded-b-none border-x-0 border-b-0",
          footer: "flex items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        }}
        eyebrow={sheet === "workspaces" ? "Choose a project" : "Every Admin destination"}
        footer={
          <>
            <button
              className="admin-focus-ring flex min-h-[var(--admin-touch-target)] items-center gap-2 rounded-[var(--admin-radius)] px-2.5 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)] hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-foreground)]"
              disabled={!interactive}
              onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
              type="button"
            >
              {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
              {theme === "dark" ? "Light" : "Dark"} theme
            </button>
            <Link className="admin-focus-ring ml-auto flex min-h-[var(--admin-touch-target)] items-center rounded-[var(--admin-radius)] px-2.5 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)] hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-foreground)]" href="/admin/settings">Settings</Link>
            <form action="/admin/logout" method="post">
              <button aria-label="Sign out of Admin" className="admin-focus-ring grid min-h-[var(--admin-touch-target)] min-w-[var(--admin-touch-target)] place-items-center rounded-[var(--admin-radius)] text-[var(--admin-foreground-muted)] hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-foreground)]" type="submit">
                <LogOut aria-hidden="true" className="size-4" />
              </button>
            </form>
          </>
        }
        onClose={() => setSheet(null)}
        open={sheet !== null}
        theme={theme}
        title={sheet === "workspaces" ? "Workspaces" : "More"}
      >
        {visibleGroups.length ? visibleGroups.map((group) => (
          <div className="mb-2 last:mb-0" key={group.id}>
            <p className="px-2 py-1.5 font-mono text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">{group.label}</p>
            <div className="grid gap-0.5">
              {group.destinations.map((destination) => (
                <Link
                  aria-current={destination.active ? "page" : undefined}
                  className="admin-focus-ring flex min-h-[var(--admin-touch-target)] items-center gap-3 rounded-[var(--admin-radius)] px-2.5 text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)] hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-foreground)] data-[active=true]:bg-[var(--admin-surface-selected)] data-[active=true]:text-[var(--admin-foreground)]"
                  data-active={destination.active}
                  href={destination.href}
                  key={destination.id}
                  onClick={() => setSheet(null)}
                >
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: destination.accent }} />
                  <span className="min-w-0 flex-1 truncate">{destination.label}</span>
                  {typeof destination.count === "number" ? <span className="admin-tabular font-mono text-[length:var(--admin-type-micro)]">{destination.count}</span> : null}
                </Link>
              ))}
            </div>
          </div>
        )) : (
          <p className="px-3 py-8 text-center text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">No workspaces are recorded yet.</p>
        )}
      </AdminDialog>
    </>
  );
}
