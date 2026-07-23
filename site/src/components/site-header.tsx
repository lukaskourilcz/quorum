import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Mark } from "@/components/brand/mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/standups", label: "Standups" },
  { href: "/boardroom", label: "Boardroom" },
  { href: "/agents", label: "Agents" },
  { href: "/ventures", label: "Ventures" },
  { href: "/metrics", label: "Metrics" },
  { href: "/governance", label: "Governance" }
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--header-background)] backdrop-blur">
      <div className="mx-auto flex min-h-18 max-w-[var(--container)] items-center gap-5 px-5 md:px-8">
        <Link
          aria-label="BoardlessAI home"
          className="flex shrink-0 items-center gap-2.5 font-semibold tracking-[-0.025em]"
          href="/"
        >
          <Mark />
          <span>BoardlessAI</span>
        </Link>
        <nav
          aria-label="Primary"
          className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {links.map((link) => (
            <Link
              className="whitespace-nowrap rounded-[var(--radius-button)] px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          className={cn(
            buttonVariants({ variant: "secondary", size: "small" }),
            "hidden shrink-0 sm:inline-flex"
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
