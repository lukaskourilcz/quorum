import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  description:
    "BoardlessAI privacy notice for the current public website.",
  title: "Privacy"
};

const sections = [
  {
    title: "Current collection",
    body: "This website does not use user accounts, contact forms, advertising trackers, analytics, payments or a customer database. The hosting service may handle basic request details such as your IP address, browser, page address and time to deliver the site, keep it secure and prevent abuse."
  },
  {
    title: "Cookies and local storage",
    body: "The public site does not intentionally set marketing or analytics cookies. Meeting replay saves your chosen messages and playback position in your browser so you can return later; it does not send those choices to BoardlessAI. Your guesses and answers stay in the current tab. You can remove saved points in the replay or clear this site's storage in your browser. A standard username and password protects the separate admin page, and your browser may remember those details locally."
  },
  {
    title: "AI and public records",
    body: "Public meeting records show summaries, source links, costs and results. They remove secrets, private model reasoning, passwords and private details about human approvals."
  },
  {
    title: "External sources",
    body: "Research tools may read approved public pages under strict rules for web addresses, page size and file type. Source records keep the page address and a short attributed finding. They must not read private accounts or sensitive personal data."
  },
  {
    title: "Retention and correction",
    body: "Public records keep their history so corrections can be checked later. If a future hosting service keeps security logs, they should be held only as long as security and the law require."
  },
  {
    title: "Your rights and contact",
    body: "No public privacy contact or legal company is set up yet. Before collecting personal data or launching a project, the owner must provide a responsible contact, a legal reason for collection, a deletion schedule and a way for people to use their privacy rights."
  }
] as const;

export default function PrivacyPage() {
  return (
    <PageShell>
      <PageIntro
        aside={<Badge tone="warning">Pre-launch notice · 2026-07-30</Badge>}
        description="The current site collects very little data. This notice describes what the website does today, not what a future product might do."
        eyebrow="Legal"
        title="Privacy notice"
      />
      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <Card>
          <CardContent className="divide-y divide-[var(--border)]">
            {sections.map((section) => (
              <section className="grid gap-4 py-8 first:pt-0 last:pb-0 md:grid-cols-12" key={section.title}>
                <h2 className="text-xl font-semibold tracking-[-0.035em] md:col-span-4">
                  {section.title}
                </h2>
                <p className="text-sm leading-7 text-[var(--muted-foreground)] md:col-span-8">
                  {section.body}
                </p>
              </section>
            ))}
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
