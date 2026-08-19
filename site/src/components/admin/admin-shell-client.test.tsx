import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminShellClient } from "./admin-shell-client";
import type { AdminNavigationGroup } from "./admin-shell-types";

const groups: AdminNavigationGroup[] = [
  {
    id: "company",
    label: "Company",
    destinations: [
      {
        accent: "var(--admin-brand)",
        active: true,
        count: 11,
        href: "/admin",
        icon: "overview",
        id: "company-overview",
        label: "Company Overview"
      },
      {
        accent: "var(--admin-brand)",
        active: false,
        count: 2,
        href: "/admin?view=approvals",
        icon: "approvals",
        id: "company-approvals",
        label: "Approvals"
      }
    ]
  },
  {
    id: "workspaces",
    label: "Workspaces",
    destinations: [
      {
        accent: "var(--admin-information)",
        active: false,
        count: 4,
        href: "/admin?venture=kvorum",
        icon: "workspace",
        id: "workspace-kvorum",
        label: "Kvórum"
      }
    ]
  }
];

describe("Admin shell", () => {
  it("server-renders bookmarkable grouped navigation and the desktop window contract", () => {
    const html = renderToStaticMarkup(
      <AdminShellClient
        attention={[{ label: "Approvals waiting", value: 2 }]}
        brand="var(--admin-brand)"
        breadcrumb="Company Overview"
        groups={groups}
        initialPreferences={{ collapsed: false, theme: "light" }}
        lead="Protected operating context."
        ownerName="Owner"
        title="Project desk"
      >
        <p>Real server content</p>
      </AdminShellClient>
    );

    expect(html).toContain('data-admin-theme="light"');
    expect(html).toContain("--admin-current-sidebar-width:var(--admin-sidebar-width)");
    expect(html).toContain('data-admin-window="true"');
    expect(html).toContain('data-admin-window-controls="true"');
    expect(html).toContain('aria-label="Admin navigation"');
    expect(html).toContain('href="/admin?view=approvals"');
    expect(html).toContain('href="/admin?venture=kvorum"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('action="/admin/logout"');
    expect(html).toContain("Protected · noindex");
    expect(html).toContain("Search Admin");
    expect(html).toContain('aria-keyshortcuts="Meta+K Control+K"');
    expect(html).toContain('aria-label="Primary Admin navigation"');
    expect(html).toContain('data-personal-growth-slot="held-until-issue-370-passes"');
    expect(html).toContain("Workspaces");
    expect(html).toContain("More");
    expect(html).not.toContain('href="/admin?venture=personal-growth"');
    expect(html).toContain("Real server content");
  });

  it("renders the persisted rail without removing accessible destination names", () => {
    const html = renderToStaticMarkup(
      <AdminShellClient
        attention={[]}
        brand="var(--admin-brand)"
        breadcrumb="Kvórum"
        groups={groups}
        initialPreferences={{ collapsed: true, theme: "dark" }}
        lead="Workspace context."
        ownerName="Owner"
        title="Kvórum"
      >
        Body
      </AdminShellClient>
    );

    expect(html).toContain('data-admin-theme="dark"');
    expect(html).toContain("--admin-current-sidebar-width:var(--admin-rail-width)");
    expect(html).toContain('aria-label="Company Overview"');
    expect(html).toContain('aria-label="Expand Admin sidebar"');
    expect(html).not.toContain('data-admin-window-controls="true"><div');
  });
});
