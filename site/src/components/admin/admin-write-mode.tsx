"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

const AdminWriteMode = createContext(true);

function subscribeToHydration(): () => void {
  return () => undefined;
}

export function AdminWriteProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  return <AdminWriteMode.Provider value={enabled}>{children}</AdminWriteMode.Provider>;
}

export function useAdminWritesEnabled(): boolean {
  const configured = useContext(AdminWriteMode);
  // A server-rendered enabled button has no handler yet. Keeping the whole admin write surface
  // inert until hydration prevents an early click from looking accepted while doing nothing.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  return configured && hydrated;
}
