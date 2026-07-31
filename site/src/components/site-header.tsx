"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/brand/mark";
import { cn } from "@/lib/utils";

const links = [
  { href: "/standups", label: "Watch" },
  { href: "/boardroom", label: "Boardroom" },
  { href: "/agents", label: "Agents" },
  { href: "/ventures", label: "Ventures" },
  { href: "/incubator", label: "Incubator" },
  { href: "/ideas", label: "Ideas" },
  { href: "/metrics", label: "Metrics" },
  { href: "/governance", label: "Governance" }
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--header-background)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-17 max-w-[var(--container)] items-center gap-4 px-5 md:gap-6 md:px-10">
        <Link
          aria-label="BoardlessAI home"
          className="flex shrink-0 items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-0.02em]"
          href="/"
        >
          <Mark />
          <span>BoardlessAI</span>
        </Link>
        <nav
          aria-label="Primary"
          className="hide-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        >
          {links.map((link) => (
            <Link
              aria-current={
                pathname === link.href || pathname.startsWith(`${link.href}/`)
                  ? "page"
                  : undefined
              }
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-[0.8125rem] font-medium text-[var(--fog)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]",
                (pathname === link.href ||
                  pathname.startsWith(`${link.href}/`)) &&
                  "bg-[var(--secondary)] text-[var(--foreground)]"
              )}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          aria-current={pathname.startsWith("/log") ? "page" : undefined}
          className={cn(
            "hidden min-h-8.5 shrink-0 items-center gap-2 rounded-lg border border-[var(--steel)] bg-[var(--surface)] px-3.5 py-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--foreground)] transition-colors hover:border-[var(--ash)] hover:bg-[var(--surface-raised)] sm:inline-flex",
            pathname.startsWith("/log") &&
              "border-[var(--accent)] text-[var(--accent)]"
          )}
          href="/log"
        >
          Public log
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </header>
  );
}
