import Link from "next/link";
import { Mark } from "@/components/brand/mark";

const footerLinks = [
  { href: "/company", label: "Company" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/disclosure", label: "Disclosure" },
  { href: "/feed.xml", label: "RSS" },
  { href: "/feed.json", label: "JSON" }
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
      <div className="mx-auto grid max-w-[var(--container)] gap-12 px-5 py-16 md:grid-cols-12 md:px-10 md:py-20">
        <div className="md:col-span-7">
          <div className="flex items-center gap-3">
            <Mark />
            <span className="font-semibold">BoardlessAI</span>
          </div>
          <p className="mt-7 max-w-xl text-[2.125rem] font-semibold leading-[1.15] tracking-[-0.045em]">
            No human board.
            <br />
            Full accountability.
          </p>
          <p className="mt-5 max-w-lg text-sm leading-6 text-[var(--fog)]">
            A provisional, transparent company operating system. Decisions,
            evidence, spend and unknowns are recorded in public.
          </p>
        </div>
        <div className="grid content-start grid-cols-2 gap-x-6 gap-y-2.5 text-[0.84375rem] md:col-span-5">
          {footerLinks.map((link) => (
            <Link
              className="text-[var(--fog)] transition-colors hover:text-[var(--foreground)]"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-[var(--container)] flex-col gap-2 px-5 py-5 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)] sm:flex-row sm:items-center sm:justify-between md:px-10">
          <p>Working title / brand clearance pending</p>
          <p>Fixture data is always marked</p>
        </div>
      </div>
    </footer>
  );
}
