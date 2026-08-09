import type { ReactNode } from "react";
import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { ventureBrand } from "@/lib/venture-brand";
import { MICRO_CONTROL } from "@/components/ui/micro-control";

/**
 * One protected desk: a sticky rail of workspaces, a compact top bar, and a body.
 *
 * It replaces a page that was a single column of oversized cards — every panel for every venture,
 * stacked, so reaching the agent switches meant scrolling past eleven `<pre>` blocks. Nothing here
 * is new: the same loaders feed the same panels. What changed is that the owner picks a workspace
 * and sees that workspace.
 *
 * The rail is server-rendered links rather than a client router, so the whole shell costs no
 * JavaScript and each workspace is a real URL the owner can bookmark or reload into.
 */

export interface AdminWorkspace {
  id: string;
  name: string;
  /** How many stored items this workspace holds. Never a guess — an empty workspace shows 0. */
  count: number;
  href: string;
  active: boolean;
}

export interface AdminAttention {
  label: string;
  value: number;
}

export function AdminShell({
  workspaces,
  attention,
  title,
  lead,
  breadcrumb,
  action,
  brandId,
  children
}: {
  workspaces: readonly AdminWorkspace[];
  attention: readonly AdminAttention[];
  title: string;
  lead: string;
  breadcrumb: string;
  action?: ReactNode;
  /** Which venture's hue this view is drawn in. */
  brandId: string;
  children: ReactNode;
}) {
  const brand = ventureBrand(brandId);
  return (
    <div
      className="grid min-h-svh grid-cols-1 bg-[#09090b] text-[#f4f4f5] lg:grid-cols-[208px_1fr] xl:grid-cols-[248px_1fr]"
      data-admin
    >
      <aside
        className="flex flex-col gap-[18px] border-b border-[#1e1e22] bg-[#0b0b0d] px-3.5 py-[18px] lg:sticky lg:top-0 lg:h-svh lg:overflow-y-auto lg:border-b-0 lg:border-r"
        data-adm-rail
      >
        <div className="flex items-center gap-2.5 px-1.5">
          <Mark className="size-6.5" />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">BoardlessAI</span>
          <span className="rounded-full border border-[#3f3f46] px-[7px] py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#a1a1aa]">
            Admin
          </span>
        </div>

        <div>
          <p className="mx-1.5 mb-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#94949c]">
            Workspaces
          </p>
          <div className="hide-scrollbar flex gap-1.5 overflow-x-auto lg:block lg:overflow-visible" data-adm-rail-list data-horizontal-scroll>
            {workspaces.map((workspace) => {
              const hue = ventureBrand(workspace.id);
              return (
                <Link
                  aria-current={workspace.active ? "page" : undefined}
                  className="mb-0.5 flex w-auto shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border-l-2 px-2.5 py-2 text-[13px] transition-colors lg:w-full lg:shrink"
                  href={workspace.href}
                  key={workspace.id}
                  scroll={false}
                  style={{
                    borderLeftColor: workspace.active ? hue : "transparent",
                    background: workspace.active ? hue : "transparent",
                    color: workspace.active ? "#09090b" : "#a1a1aa",
                    fontWeight: workspace.active ? 600 : 400
                  }}
                >
                  <span className="min-w-0 truncate">{workspace.name}</span>
                  <span
                    className="ml-auto font-mono text-[10px]"
                    style={{ color: workspace.active ? "#09090b" : "#94949c" }}
                  >
                    {workspace.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-auto hidden flex-col gap-2.5 lg:flex" data-adm-rail-foot>
          <div className="rounded-[10px] border border-[#26262b] bg-[#0e0e11] p-3">
            <p className="m-0 mb-2 font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: brand }}>
              Needs you
            </p>
            {attention.map((entry) => (
              <div className="flex items-baseline gap-2 py-[3px]" key={entry.label}>
                <span className="text-[12px] text-[#a1a1aa]">{entry.label}</span>
                <span className="ml-auto font-mono text-[12px] font-semibold text-[#f4f4f5]">
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
          <Link
            className="px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#a1a1aa] transition-colors hover:text-[#f4f4f5]"
            href="/"
          >
            ← Public site
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <div
          className="sticky top-0 z-20 flex min-h-14 items-center gap-3.5 border-b border-[#1e1e22] bg-[rgba(9,9,11,.82)] px-4 backdrop-blur-[14px] md:px-7"
          data-adm-bar
        >
          <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#94949c]">
            Admin <span className="text-[#3f3f46]">/</span>{" "}
            <span className="text-[#f4f4f5]">{breadcrumb}</span>
          </p>
          <span
            className="hidden rounded-full border border-[#854d0e] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#f4e3c4] sm:inline-block"
            data-adm-bar-meta
          >
            Protected · noindex
          </span>
          <form action="/admin/logout" className="ml-auto" method="post">
            <button
              className={`${MICRO_CONTROL} bg-[#101013] px-3 py-[7px]`}
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>

        <main className="px-4 pb-16 pt-5 md:px-7 md:pt-6.5" data-adm-body>
          <div className="max-w-[1180px]">
            <div className="mb-5.5 flex items-end justify-between gap-5">
              <div className="min-w-0">
                <h1 className="m-0 text-[30px] font-semibold tracking-[-0.04em]">
                  {title}
                  <span style={{ color: brand }}>.</span>
                </h1>
                <p className="mt-2 max-w-[74ch] text-[13.5px] leading-[1.6] text-[#a1a1aa]">{lead}</p>
              </div>
              {action}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
