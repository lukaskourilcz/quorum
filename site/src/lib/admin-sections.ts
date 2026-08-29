import "server-only";

/**
 * The admin's destinations, in one place.
 *
 * Five pages built this list by hand and had drifted into five slightly different navigations.
 * More importantly it is now short, which is the point: the owner opens this admin to read what
 * happened, to work the Design Lab, and to see what is waiting for him. Everything else runs
 * itself, so everything else stopped being a destination on 2026-08-29.
 *
 * Operations, Implementation Plans and Social Profiles keep their routes — a bookmark still
 * works, and the Overview surfaces the one signal each of them genuinely carries — but nothing
 * links them from the chrome any more. A page nobody has to open should not be a place.
 */
export interface AdminNavSection {
  id: string;
  name: string;
  href: string;
  active: boolean;
  count?: number | null;
}

export type AdminDestination = "waiting" | "settings" | null;

export function adminSections(
  active: AdminDestination,
  counts: { waiting?: number | null; paused?: number | null } = {}
): AdminNavSection[] {
  return [
    {
      id: "waiting",
      name: "Waiting for you",
      href: "/admin?view=waiting",
      active: active === "waiting",
      count: counts.waiting ?? null
    },
    {
      id: "settings",
      name: "Settings",
      href: "/admin/settings",
      active: active === "settings",
      count: counts.paused ?? null
    }
  ];
}
