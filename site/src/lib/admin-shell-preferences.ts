export const ADMIN_THEME_COOKIE = "boardlessai_admin_theme";
export const ADMIN_RAIL_COOKIE = "boardlessai_admin_rail";

export type AdminTheme = "light" | "dark";

export interface AdminShellPreferences {
  theme: AdminTheme;
  collapsed: boolean;
}

export const DEFAULT_ADMIN_SHELL_PREFERENCES: AdminShellPreferences = {
  theme: "light",
  collapsed: false
};

export function parseAdminTheme(value: string | undefined): AdminTheme {
  return value === "dark" ? "dark" : "light";
}

export function parseAdminRail(value: string | undefined): boolean {
  return value === "collapsed";
}

export function parseAdminShellPreferencePatch(value: unknown): Partial<AdminShellPreferences> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some((key) => key !== "theme" && key !== "collapsed")) return null;
  if ("theme" in record && record.theme !== "light" && record.theme !== "dark") return null;
  if ("collapsed" in record && typeof record.collapsed !== "boolean") return null;

  return {
    ...(record.theme ? { theme: record.theme as AdminTheme } : {}),
    ...(typeof record.collapsed === "boolean" ? { collapsed: record.collapsed } : {})
  };
}
