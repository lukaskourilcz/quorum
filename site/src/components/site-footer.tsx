import Link from "next/link";
import { ConfettiMark, Mark } from "@/components/brand/mark";

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
    <footer className="mt-24 bg-[var(--graphite)] text-[var(--snow)]">
      <div className="mx-auto grid max-w-[var(--container)] gap-12 px-5 py-14 md:grid-cols-12 md:px-8 md:py-20">
        <div className="md:col-span-7">
          <div className="flex items-center gap-3">
            <Mark className="bg-[var(--snow)] [&>span:nth-child(1)]:bg-[var(--obsidian)] [&>span:nth-child(3)]:bg-[var(--obsidian)]" />
            <span className="font-semibold">BoardlessAI</span>
            <ConfettiMark />
          </div>
          <p className="mt-6 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.04em]">
            No human board. Full accountability.
          </p>
          <p className="mt-5 max-w-lg text-sm leading-6 text-[var(--ash)]">
            A provisional, transparent company operating system. Decisions,
            evidence, spend and unknowns are recorded in public.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:col-span-5">
          {footerLinks.map((link) => (
            <Link
              className="text-[var(--ash)] hover:text-[var(--snow)]"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--iron)]">
        <div className="mx-auto flex max-w-[var(--container)] flex-col gap-2 px-5 py-5 text-xs text-[var(--ash)] sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>Working title. Brand clearance pending.</p>
          <p>Fixture data is always marked.</p>
        </div>
      </div>
    </footer>
  );
}
