import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { FooterDialogLinks } from "@/components/footer-dialogs";
import { readFooterFacts } from "@/lib/footer-facts";

/**
 * The content links open where the reader is; the feeds stay files.
 *
 * Every one of these used to navigate to a page built in the previous design, so following
 * "Privacy" from the office walkthrough lost the walkthrough. The pages are still the canonical
 * addresses and still resolve — the dialog is how the footer opens them.
 */
const dialogLinks = [
  { topic: "about" as const, label: "About" },
  { topic: "rules" as const, label: "Rules" },
  { topic: "money" as const, label: "Money" },
  { topic: "privacy" as const, label: "Privacy" },
  { topic: "disclosure" as const, label: "Disclosure" },
  { topic: "updates" as const, label: "Updates" }
];

/** A feed is a file another program reads. Wrapping one in a dialog breaks its only use. */
const feedLinks = [
  { href: "/feed.xml", label: "RSS" },
  { href: "/decisions.xml", label: "Decisions RSS" },
  { href: "/feed.json", label: "JSON" }
];

export async function SiteFooter() {
  const facts = await readFooterFacts();
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
        <div className="grid content-start gap-2.5 text-[0.84375rem] md:col-span-5">
          <FooterDialogLinks
            className="grid grid-cols-2 gap-x-6 gap-y-2.5"
            facts={facts}
            linkClassName="text-left text-[var(--fog)] transition-colors hover:text-[var(--foreground)]"
            links={dialogLinks}
          />
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {feedLinks.map((link) => (
              <li key={link.href}>
                <Link className="text-[var(--fog)] transition-colors hover:text-[var(--foreground)]" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
