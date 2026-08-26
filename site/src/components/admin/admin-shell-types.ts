export type AdminDestinationIcon =
  | "approvals"
  | "future"
  | "manual"
  | "operations"
  | "overview"
  | "production"
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
