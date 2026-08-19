import { describe, expect, it } from "vitest";
import { filterAdminDestinations } from "./admin-command-palette";
import type { AdminNavigationGroup } from "./admin-shell-types";

const groups: AdminNavigationGroup[] = [
  {
    id: "company",
    label: "Company",
    destinations: [{ accent: "orange", active: true, href: "/admin", icon: "overview", id: "overview", label: "Company Overview" }]
  },
  {
    id: "workspaces",
    label: "Workspaces",
    destinations: [{ accent: "yellow", active: false, href: "/admin?venture=kvorum", icon: "workspace", id: "kvorum", label: "Kvórum" }]
  }
];

describe("Admin command navigation", () => {
  it("returns every real destination when the query is empty", () => {
    expect(filterAdminDestinations(groups, "").map(({ destination }) => destination.href)).toEqual([
      "/admin",
      "/admin?venture=kvorum"
    ]);
  });

  it("matches labels, groups and bookmarkable URLs without fabricating results", () => {
    expect(filterAdminDestinations(groups, "kvórum")[0]?.destination.id).toBe("kvorum");
    expect(filterAdminDestinations(groups, "workspaces")[0]?.destination.id).toBe("kvorum");
    expect(filterAdminDestinations(groups, "venture=kvorum")[0]?.destination.id).toBe("kvorum");
    expect(filterAdminDestinations(groups, "personal growth")).toEqual([]);
  });
});
