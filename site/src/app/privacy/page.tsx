import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  description:
    "BoardlessAI privacy notice for the current public operating-system site.",
  title: "Privacy"
};

const sections = [
  {
    title: "Current collection",
    body: "This repository does not configure user accounts, contact forms, advertising pixels, analytics, payment processing or a customer database. Normal hosting infrastructure may process request metadata such as IP address, user agent, URL and timestamp for delivery, security and abuse prevention."
  },
  {
    title: "Cookies and local storage",
    body: "The public site does not intentionally set marketing or analytics cookies. HTTP Basic Authentication protects the separate admin route and may cause your browser to retain credentials locally; those credentials are not public-site data."
  },
  {
    title: "AI and public records",
    body: "Public standups expose operating summaries, evidence references, costs and outcomes. They are sanitized to exclude secrets, private reasoning, credential material and internal human-approval details."
  },
  {
    title: "External sources",
    body: "Research adapters may retrieve allowlisted public pages under strict URL, DNS, response-size and content-type controls. Evidence records retain source URLs and bounded attributed signals; they must not ingest private accounts or sensitive personal data."
  },
  {
    title: "Retention and correction",
    body: "Public operating records are designed to be append-only so corrections remain auditable. Security logs, if enabled by a future host, should be retained only as long as needed for security and legal obligations."
  },
  {
    title: "Your rights and contact",
    body: "No public privacy contact or legal entity is configured yet. Before collecting personal data or launching a venture, the operator must supply an accountable contact, lawful basis, retention schedule and jurisdiction-appropriate rights process."
  }
] as const;

export default function PrivacyPage() {
  return (
    <PageShell>
      <PageIntro
        aside={<Badge tone="warning">Pre-launch notice · 2026-07-23</Badge>}
        description="The current site is deliberately data-light. This notice describes the implemented repository state, not hypothetical future products."
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
