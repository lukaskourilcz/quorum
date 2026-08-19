"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Moon,
  Palette,
  ShieldAlert,
  Sparkles,
  Sun
} from "lucide-react";
import { Mark } from "@/components/brand/mark";
import { AdminTooltip } from "@/components/admin/admin-overlays";
import type { AdminTheme } from "@/lib/admin-shell-preferences";
import type {
  AdminDestination,
  AdminDestinationIcon,
  AdminNavigationGroup
} from "./admin-shell-types";

const ICONS = {
  approvals: CheckCheck,
  future: Sparkles,
  manual: KeyRound,
  overview: LayoutDashboard,
  production: Palette,
  workspace: FolderKanban
} satisfies Record<AdminDestinationIcon, typeof LayoutDashboard>;

function DestinationLink({
  destination,
  collapsed,
  theme
}: {
  destination: AdminDestination;
  collapsed: boolean;
  theme: AdminTheme;
}) {
  const Icon = ICONS[destination.icon];
  const style = { "--admin-section-accent": destination.accent } as CSSProperties;
  const link = (
    <Link
      aria-current={destination.active ? "page" : undefined}
      aria-label={collapsed ? destination.label : undefined}
      className="admin-focus-ring group relative flex min-h-[var(--admin-row-dense)] min-w-0 items-center gap-2.5 overflow-hidden rounded-[var(--admin-radius)] px-2.5 text-[length:var(--admin-type-control)] font-medium text-[var(--admin-sidebar-muted)] transition-colors duration-[var(--admin-motion-fast)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-sidebar-foreground)] data-[active=true]:bg-[var(--admin-sidebar-selected)] data-[active=true]:text-[var(--admin-sidebar-foreground)]"
      data-active={destination.active}
      href={destination.href}
      scroll={false}
      style={style}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-[var(--admin-section-accent)] opacity-0 data-[active=true]:opacity-100"
        data-active={destination.active}
      />
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
      {!collapsed ? <span className="min-w-0 truncate">{destination.label}</span> : null}
      {!collapsed && typeof destination.count === "number" ? (
        <span className={`admin-tabular ml-auto shrink-0 font-mono text-[length:var(--admin-type-micro)] ${destination.active ? "text-[var(--admin-sidebar-foreground)]" : "text-[var(--admin-sidebar-muted)]"}`}>
          {destination.count}
        </span>
      ) : null}
      {collapsed && typeof destination.count === "number" && destination.count > 0 ? (
        <span
          aria-label={`${destination.count} items`}
          className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--admin-section-accent)]"
        />
      ) : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <AdminTooltip
      className="w-full"
      content={typeof destination.count === "number" ? `${destination.count} recorded items` : "Open destination"}
      label={destination.label}
      side="bottom"
      theme={theme}
    >
      {link}
    </AdminTooltip>
  );
}

export function AdminSidebar({
  attention,
  collapsed,
  groups,
  onCollapseChange,
  onThemeChange,
  ownerName,
  theme
}: {
  attention: readonly { label: string; value: number }[];
  collapsed: boolean;
  groups: readonly AdminNavigationGroup[];
  onCollapseChange: (collapsed: boolean) => void;
  onThemeChange: (theme: AdminTheme) => void;
  ownerName: string;
  theme: AdminTheme;
}) {
  const attentionTotal = attention.reduce((total, entry) => total + entry.value, 0);
  const ownerInitial = ownerName.trim().charAt(0).toUpperCase() || "O";

  return (
    <aside
      aria-label="Admin navigation"
      className="hidden h-full min-h-0 flex-col overflow-hidden border-r border-[var(--admin-sidebar-border)] bg-[var(--admin-sidebar)] text-[var(--admin-sidebar-foreground)] backdrop-blur-xl md:flex"
      data-admin-sidebar
      data-collapsed={collapsed}
    >
      <div className="flex h-8 shrink-0 items-center px-3" data-admin-window-controls>
        {!collapsed ? (
          <div aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[var(--admin-window-close)]" />
            <span className="size-2.5 rounded-full bg-[var(--admin-window-minimize)]" />
            <span className="size-2.5 rounded-full bg-[var(--admin-window-maximize)]" />
          </div>
        ) : null}
        <button
          aria-label={collapsed ? "Expand Admin sidebar" : "Collapse Admin sidebar"}
          className="admin-focus-ring ml-auto grid size-8 place-items-center rounded-[var(--admin-radius)] text-[var(--admin-sidebar-muted)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-sidebar-foreground)]"
          onClick={() => onCollapseChange(!collapsed)}
          type="button"
        >
          {collapsed ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}
        </button>
      </div>

      <div className={`flex min-h-11 shrink-0 items-center gap-2.5 px-3 ${collapsed ? "justify-center" : ""}`}>
        <Mark className="size-7 shrink-0 bg-[var(--admin-primary)] text-[var(--admin-primary-foreground)]" />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-[length:var(--admin-type-section)] font-semibold tracking-[var(--admin-tracking-tight)]">BoardlessAI</p>
            <p className="font-mono text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-sidebar-muted)]">Owner Admin</p>
          </div>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3" aria-label="Admin destinations">
        {groups.map((group) => (
          <div className="mb-3" data-admin-nav-group={group.id} key={group.id}>
            {!collapsed ? (
              <p className="mb-1.5 px-2 font-mono text-[length:var(--admin-type-micro)] font-medium uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-sidebar-muted)]">
                {group.label}
              </p>
            ) : (
              <span aria-hidden="true" className="mx-auto mb-1.5 block h-px w-5 bg-[var(--admin-sidebar-border)] first:hidden" />
            )}
            <div className="grid gap-0.5">
              {group.destinations.map((destination) => (
                <DestinationLink
                  collapsed={collapsed}
                  destination={destination}
                  key={destination.id}
                  theme={theme}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[var(--admin-sidebar-border)] p-2.5">
        {!collapsed ? (
          <div className="mb-2 rounded-[var(--admin-radius)] border border-[var(--admin-sidebar-border)] bg-[var(--admin-sidebar-hover)] p-2.5" data-admin-attention-summary>
            <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-sidebar-muted)]">
              <ShieldAlert aria-hidden="true" className="size-3.5" /> Needs you
              <span className="admin-tabular ml-auto text-[var(--admin-sidebar-foreground)]" data-admin-attention-total>{attentionTotal}</span>
            </p>
            {attention.map((entry) => (
              <p className="flex gap-2 py-0.5 text-[length:var(--admin-type-micro)] text-[var(--admin-sidebar-muted)]" data-admin-attention-item={entry.label} key={entry.label}>
                <span className="truncate">{entry.label}</span>
                <span className="admin-tabular ml-auto text-[var(--admin-sidebar-foreground)]">{entry.value}</span>
              </p>
            ))}
          </div>
        ) : (
          <AdminTooltip content={`${attentionTotal} owner-attention items`} label="Needs you" theme={theme}>
            <span className="relative grid size-9 place-items-center rounded-[var(--admin-radius)] text-[var(--admin-sidebar-muted)]">
              <ShieldAlert aria-hidden="true" className="size-4" />
              {attentionTotal > 0 ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--admin-warning)]" /> : null}
            </span>
          </AdminTooltip>
        )}

        <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`} data-admin-owner-footer>
          {!collapsed ? (
            <div className="mr-auto flex min-w-0 items-center gap-2 px-1">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--admin-sidebar-selected)] text-[length:var(--admin-type-control)] font-semibold">{ownerInitial}</span>
              <span className="min-w-0 truncate text-[length:var(--admin-type-control)]">{ownerName}</span>
            </div>
          ) : (
            <AdminTooltip content={ownerName} label="Signed in" theme={theme}>
              <span className="grid size-9 place-items-center text-[var(--admin-sidebar-muted)]"><CircleUserRound aria-hidden="true" className="size-4" /></span>
            </AdminTooltip>
          )}
          <AdminTooltip content={`Use ${theme === "dark" ? "light" : "dark"} appearance`} label="Theme" theme={theme}>
            <button
              aria-label={`Use ${theme === "dark" ? "light" : "dark"} Admin theme`}
              className="admin-focus-ring grid size-9 place-items-center rounded-[var(--admin-radius)] text-[var(--admin-sidebar-muted)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-sidebar-foreground)]"
              onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
              type="button"
            >
              {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
            </button>
          </AdminTooltip>
          <AdminTooltip content="Open the public site" label="Public" theme={theme}>
            <Link aria-label="Open public site" className="admin-focus-ring grid size-9 place-items-center rounded-[var(--admin-radius)] text-[var(--admin-sidebar-muted)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-sidebar-foreground)]" href="/">
              <LayoutDashboard aria-hidden="true" className="size-4" />
            </Link>
          </AdminTooltip>
          <form action="/admin/logout" method="post">
            <AdminTooltip content="End this protected session" label="Sign out" theme={theme}>
              <button aria-label="Sign out of Admin" className="admin-focus-ring grid size-9 place-items-center rounded-[var(--admin-radius)] text-[var(--admin-sidebar-muted)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-sidebar-foreground)]" type="submit">
                <LogOut aria-hidden="true" className="size-4" />
              </button>
            </AdminTooltip>
          </form>
        </div>
      </div>
    </aside>
  );
}
