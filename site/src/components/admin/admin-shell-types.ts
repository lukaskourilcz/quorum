export type AdminDestinationIcon =
  | "approvals"
  | "settings"
  | "future"
  | "manual"
  | "operations"
  | "overview"
  | "production"
  | "profiles"
  | "workspace";

export interface AdminDestination {
  id: string;
  label: string;
  href: string;
  active: boolean;
  icon: AdminDestinationIcon;
  count?: number | null;
  accent: string;
}

export type AdminNavigationGroupId = "company" | "production" | "workspaces" | "system";

export interface AdminNavigationGroup {
  id: AdminNavigationGroupId;
  label: string;
  destinations: readonly AdminDestination[];
}
