import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ADMIN_THEME_COOKIE, parseAdminTheme } from "@/lib/admin-shell-preferences";

/** Keep standalone protected routes on the same scoped palette as the main Admin shell. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const theme = parseAdminTheme(cookieStore.get(ADMIN_THEME_COOKIE)?.value);

  return (
    <div
      className="min-h-svh bg-[var(--admin-background)] text-[var(--admin-foreground)]"
      data-admin
      data-admin-theme={theme}
    >
      {children}
    </div>
  );
}
