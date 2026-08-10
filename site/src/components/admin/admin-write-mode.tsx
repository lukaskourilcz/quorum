"use client";

import { createContext, useContext, type ReactNode } from "react";

const AdminWriteMode = createContext(true);

export function AdminWriteProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  return <AdminWriteMode.Provider value={enabled}>{children}</AdminWriteMode.Provider>;
}

export function useAdminWritesEnabled(): boolean {
  return useContext(AdminWriteMode);
}
