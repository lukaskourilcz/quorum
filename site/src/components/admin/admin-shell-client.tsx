"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { AdminShellPreferences, AdminTheme } from "@/lib/admin-shell-preferences";
import type { AdminNavigationGroup } from "./admin-shell-types";
import { useAdminHydrated } from "./admin-write-mode";
import { AdminSidebar } from "./admin-sidebar";
import { AdminCommandPalette } from "./admin-command-palette";
import { AdminMobileNav } from "./admin-mobile-nav";

async function persistPreference(patch: Partial<AdminShellPreferences>): Promise<void> {
  const response = await fetch("/admin/api/preferences", {
    body: JSON.stringify(patch),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) throw new Error("The Admin preference was not saved.");
}

export function AdminShellClient({
  action,
  attention,
  brand,
  breadcrumb,
  children,
  groups,
  initialPreferences,
  lead,
  ownerName,
  title
}: {
  action?: ReactNode;
  attention: readonly { label: string; value: number }[];
  brand: string;
  breadcrumb: string;
  children: ReactNode;
  groups: readonly AdminNavigationGroup[];
  initialPreferences: AdminShellPreferences;
  lead: string;
  ownerName: string;
  title: string;
}) {
  const [theme, setTheme] = useState<AdminTheme>(initialPreferences.theme);
  const [collapsed, setCollapsed] = useState(initialPreferences.collapsed);
  const [preferenceStatus, setPreferenceStatus] = useState("");
  const [preferencePending, setPreferencePending] = useState(false);
  const hydrated = useAdminHydrated();
  const shellStyle = {
    "--admin-current-sidebar-width": collapsed ? "var(--admin-rail-width)" : "var(--admin-sidebar-width)",
    "--admin-section-accent": brand
  } as CSSProperties;

  const changeTheme = async (next: AdminTheme) => {
    const previous = theme;
    setTheme(next);
    setPreferenceStatus("");
    setPreferencePending(true);
    try {
      await persistPreference({ theme: next });
    } catch {
      setTheme(previous);
      setPreferenceStatus("Theme was not saved. Try again.");
    } finally {
      setPreferencePending(false);
    }
  };
  const changeCollapsed = async (next: boolean) => {
    const previous = collapsed;
    setCollapsed(next);
    setPreferenceStatus("");
    setPreferencePending(true);
    try {
      await persistPreference({ collapsed: next });
    } catch {
      setCollapsed(previous);
      setPreferenceStatus("Sidebar preference was not saved. Try again.");
    } finally {
      setPreferencePending(false);
    }
  };

  return (
    <div
      className="min-h-svh bg-[var(--admin-desktop)] text-[var(--admin-foreground)] md:h-svh md:overflow-hidden md:px-[var(--admin-desktop-padding-inline)] md:py-[var(--admin-desktop-padding-block)]"
      data-admin
      data-admin-hydrated={hydrated}
      data-admin-theme={theme}
      data-preference-pending={preferencePending}
      style={shellStyle}
    >
      <a className="admin-focus-ring fixed left-3 top-3 z-[200] -translate-y-24 rounded-[var(--admin-radius)] bg-[var(--admin-surface-elevated)] px-3 py-2 text-[length:var(--admin-type-control)] shadow-[var(--admin-shadow-elevated)] focus:translate-y-0" href="#admin-content">
        Skip to Admin content
      </a>
      <div className="relative min-h-svh overflow-hidden bg-[var(--admin-background)] md:grid md:h-full md:min-h-0 md:grid-cols-[var(--admin-current-sidebar-width)_minmax(0,1fr)] md:rounded-[var(--admin-radius-lg)] md:shadow-[var(--admin-shadow-window)] motion-safe:transition-[grid-template-columns] motion-safe:duration-[var(--admin-motion-standard)] motion-safe:ease-[var(--admin-ease-out)]" data-admin-window>
        <AdminSidebar
          attention={attention}
          collapsed={collapsed}
          groups={groups}
          interactive={hydrated}
          onCollapseChange={changeCollapsed}
          onThemeChange={changeTheme}
          ownerName={ownerName}
          theme={theme}
        />

        <div className="flex min-h-svh min-w-0 flex-col md:min-h-0" data-admin-workspace>
          <header className="sticky top-0 z-30 flex h-[var(--admin-toolbar-height)] shrink-0 items-center gap-3 border-b border-[var(--admin-border)] bg-[var(--admin-toolbar)] px-4 backdrop-blur-xl md:static md:px-5" data-admin-toolbar>
            <div className="min-w-0">
              <p className="truncate text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">{breadcrumb}</p>
              <p className="hidden truncate font-mono text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)] sm:block">BoardlessAI Admin</p>
            </div>
            <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-[var(--admin-border-strong)] px-2.5 py-1 font-mono text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)] sm:flex">
              <LockKeyhole aria-hidden="true" className="size-3" /> Protected · noindex
            </span>
            <AdminCommandPalette groups={groups} theme={theme} />
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 md:px-6 md:pb-12 md:pt-6" data-admin-content id="admin-content" tabIndex={-1}>
            <div className="mx-auto w-full max-w-[1180px]">
              <div className="mb-5 flex items-end justify-between gap-5" data-admin-page-heading>
                <div className="min-w-0">
                  <h1 className="m-0 text-[length:var(--admin-type-page)] font-semibold tracking-[var(--admin-tracking-tight)] text-[var(--admin-foreground)]">
                    {title}<span className="text-[var(--admin-section-accent)]">.</span>
                  </h1>
                  <p className="mt-1.5 max-w-[74ch] text-[length:var(--admin-type-body)] leading-relaxed text-[var(--admin-foreground-muted)]">{lead}</p>
                </div>
                {action}
              </div>
              {preferenceStatus ? <p aria-live="polite" className="mb-3 text-[length:var(--admin-type-control)] text-[var(--admin-risk)]" role="status">{preferenceStatus}</p> : null}
              {children}
            </div>
          </main>
        </div>
        <AdminMobileNav groups={groups} interactive={hydrated} onThemeChange={changeTheme} theme={theme} />
      </div>
    </div>
  );
}
