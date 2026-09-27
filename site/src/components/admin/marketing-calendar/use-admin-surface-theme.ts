"use client";

import { useSyncExternalStore } from "react";
import type { AdminTheme } from "@/components/admin/admin-overlays";

/**
 * The shell's current light/dark choice, read from the `data-admin-theme` attribute it sets.
 *
 * A panel inside the shell does not receive the theme as a prop, but its portalled dialogs and
 * tooltips must carry it across the portal (docs/ADMIN-DESIGN-SYSTEM.md, Scope and theme
 * activation). Watching the attribute keeps an open dialog in step when the owner flips the theme.
 */
function read(): AdminTheme {
  return document.querySelector("[data-admin-theme]")?.getAttribute("data-admin-theme") === "light" ? "light" : "dark";
}

function subscribe(onChange: () => void): () => void {
  const root = document.querySelector("[data-admin-theme]");
  if (!root) return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ["data-admin-theme"] });
  return () => observer.disconnect();
}

export function useAdminSurfaceTheme(): AdminTheme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}
