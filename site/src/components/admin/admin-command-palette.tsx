"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CornerDownLeft, Search } from "lucide-react";
import { AdminDialog } from "./admin-overlays";
import type { AdminTheme } from "@/lib/admin-shell-preferences";
import type { AdminDestination, AdminNavigationGroup } from "./admin-shell-types";

export interface AdminCommandResult {
  destination: AdminDestination;
  groupId: AdminNavigationGroup["id"];
  groupLabel: string;
}

export function filterAdminDestinations(
  groups: readonly AdminNavigationGroup[],
  query: string
): AdminCommandResult[] {
  const needle = query.trim().toLocaleLowerCase();
  return groups.flatMap((group) => group.destinations
    .filter((destination) => !needle || `${destination.label} ${group.label} ${destination.href}`.toLocaleLowerCase().includes(needle))
    .map((destination) => ({ destination, groupId: group.id, groupLabel: group.label })));
}

export function AdminCommandPalette({
  groups,
  theme
}: {
  groups: readonly AdminNavigationGroup[];
  theme: AdminTheme;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => filterAdminDestinations(groups, query), [groups, query]);

  const show = () => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };
  const close = () => setOpen(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const choose = (destination: AdminDestination) => {
    close();
    window.location.assign(destination.href);
  };

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className="admin-focus-ring flex min-h-[var(--admin-touch-target)] min-w-[var(--admin-touch-target)] items-center gap-2 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] px-2.5 text-left text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)] transition-colors hover:border-[var(--admin-border-strong)] hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-foreground)] md:min-h-8 md:min-w-52"
        onClick={show}
        type="button"
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="hidden flex-1 sm:inline">Search Admin</span>
        <kbd className="hidden rounded-[var(--admin-radius-sm)] border border-[var(--admin-border)] bg-[var(--admin-surface)] px-1.5 py-0.5 font-mono text-[length:var(--admin-type-micro)] md:inline">⌘K</kbd>
      </button>

      <AdminDialog
        classNames={{
          body: "p-0",
          footer: "flex items-center gap-3",
          surface: "max-w-xl"
        }}
        footer={
          <>
            <span>↑↓ Select</span>
            <span className="flex items-center gap-1"><CornerDownLeft aria-hidden="true" className="size-3" /> Open</span>
            <span className="ml-auto">Esc Close</span>
          </>
        }
        onClose={close}
        open={open}
        theme={theme}
        title="Admin navigation"
      >
        <div className="flex items-center gap-2 border-b border-[var(--admin-border)] px-4">
          <Search aria-hidden="true" className="size-4 text-[var(--admin-foreground-muted)]" />
          <label className="sr-only" htmlFor="admin-command-search">Search Admin destinations</label>
          <input
            autoComplete="off"
            className="admin-focus-ring h-12 min-w-0 flex-1 bg-transparent text-[length:var(--admin-type-section)] text-[var(--admin-foreground)] placeholder:text-[var(--admin-foreground-subtle)]"
            id="admin-command-search"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => results.length ? (index + 1) % results.length : 0);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => results.length ? (index - 1 + results.length) % results.length : 0);
              } else if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                choose(results[activeIndex].destination);
              }
            }}
            placeholder="Type a destination or workspace…"
            ref={inputRef}
            type="search"
            value={query}
          />
        </div>
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2" role="listbox" aria-label="Admin destinations">
          {results.length ? groups.map((group) => {
            const groupResults = results.filter((result) => result.groupId === group.id);
            if (!groupResults.length) return null;
            return (
              <div className="mb-2 last:mb-0" key={group.id}>
                <p className="px-2 py-1 font-mono text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">{group.label}</p>
                {groupResults.map((result) => {
                  const index = results.indexOf(result);
                  return (
                    <Link
                      aria-selected={index === activeIndex}
                      className="admin-focus-ring flex min-h-[var(--admin-touch-target)] items-center gap-3 rounded-[var(--admin-radius)] px-2.5 text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)] hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-foreground)] aria-selected:bg-[var(--admin-surface-selected)] aria-selected:text-[var(--admin-foreground)]"
                      href={result.destination.href}
                      key={result.destination.id}
                      onClick={close}
                      onPointerEnter={() => setActiveIndex(index)}
                      role="option"
                    >
                      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: result.destination.accent }} />
                      <span className="min-w-0 flex-1 truncate">{result.destination.label}</span>
                      {typeof result.destination.count === "number" ? <span className="admin-tabular font-mono text-[length:var(--admin-type-micro)]">{result.destination.count}</span> : null}
                      {result.destination.active ? <span className="font-mono text-[length:var(--admin-type-micro)] uppercase">Current</span> : null}
                    </Link>
                  );
                })}
              </div>
            );
          }) : (
            <p className="px-3 py-8 text-center text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">No Admin destination matches “{query}”.</p>
          )}
        </div>
      </AdminDialog>
    </>
  );
}
