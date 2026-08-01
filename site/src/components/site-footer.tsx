import Link from "next/link";
import { Mark } from "@/components/brand/mark";

const footerLinks = [
  { href: "/company", label: "Company" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/disclosure", label: "Disclosure" },
  { href: "/feed.xml", label: "RSS" },
  { href: "/decisions.xml", label: "Decisions RSS" },
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
            See how the AI team
            <br />
            makes decisions.
          </p>
          <p className="mt-5 max-w-lg text-sm leading-6 text-[var(--fog)]">
            BoardlessAI is an experiment in running a small company with AI
            roles. We publish the meetings, sources, costs and open questions.
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
    </footer>
  );
}
