import type { Metadata } from "next";
import { ArrowRight, Building2, CircleDollarSign, FlaskConical } from "lucide-react";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

export const metadata: Metadata = {
  description:
    "Current BoardlessAI business state, thesis status, constraints and roadmap.",
  title: "Company"
};

export default function CompanyPage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <Card className="bg-[var(--graphite)] text-[var(--snow)]">
            <CardContent>
              <Badge tone="accent">DISCOVERY</Badge>
              <p className="mt-7 text-3xl font-semibold tracking-[-0.045em]">
                No validated thesis
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--ash)]">
                Honest state, not a missing marketing paragraph.
              </p>
            </CardContent>
          </Card>
        }
        description="BoardlessAI is currently a transparent operating system and research lab. It has not selected, launched or monetized a customer venture."
        eyebrow="Living business plan"
        title="The company state"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Building2,
              label: "Thesis",
              value: "n/a",
              note: "No opportunity passed the founding gate"
            },
            {
              icon: FlaskConical,
              label: "Active experiments",
              value: "0",
              note: "Observed zero; nothing is registered"
            },
            {
              icon: CircleDollarSign,
              label: "Recognized revenue",
              value: "n/a",
              note: "No verified revenue source connected"
            }
          ].map((item) => (
            <Card key={item.label}>
              <CardContent>
                <item.icon
                  aria-hidden="true"
                  className="size-5 text-[var(--accent)]"
                />
                <p className="mt-10 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  {item.label}
                </p>
                <p className="mt-3 text-5xl font-semibold tracking-[-0.06em]">
                  {item.value}
                </p>
                <p className="mt-4 text-xs leading-5 text-[var(--muted-foreground)]">
                  {item.note}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <SectionHeading
            description="The plan gets more specific only after the evidence warrants it."
            eyebrow="Business contract"
            title="What is known—and unknown"
          />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Audience & job",
                text: "n/a. Candidate descriptions are synthetic fixtures and are not personas or customer discovery."
              },
              {
                title: "Offer & pricing",
                text: "n/a. No price may be presented as a real offer before a bounded monetization experiment."
              },
              {
                title: "Distribution",
                text: "n/a. Threads and Instagram are configured draft-only; no venture fact exists to distribute."
              },
              {
                title: "Unit economics",
                text: "n/a revenue and gross profit; verified API, treasury and other costs currently total $0.00."
              },
              {
                title: "Current product",
                text: "The public governance and evidence system documented on this site—not a validated customer product."
              },
              {
                title: "Kill criterion",
                text: "Stop or replace candidates without direct intent evidence, a reachable channel or a bounded first experiment."
              }
            ].map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{item.text}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <SectionHeading
          description="Milestones are conditions, not calendar promises."
          eyebrow="Roadmap"
          title="Evidence before expansion"
        />
        <div className="space-y-0">
          {[
            [
              "Now",
              "Operating system",
              "Complete safety, evidence, finance, site and automation validation."
            ],
            [
              "Next",
              "Eligible evidence",
              "Collect attributable signals from allowed sources without counting fixtures."
            ],
            [
              "Gate",
              "Venture selection",
              "Pass 35/50, dimension floor, independence, direct signal, channel and experiment gates."
            ],
            [
              "Then",
              "Value experiment",
              "Register immutable baseline, target, review cycle, cost and stop condition."
            ],
            [
              "Later",
              "Monetization",
              "Recognize only verified revenue and measure full unit economics."
            ]
          ].map(([time, title, text], index) => (
            <div
              className="grid gap-3 border-t border-[var(--border)] py-7 md:grid-cols-12 md:items-start"
              key={time}
            >
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)] md:col-span-1">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="text-sm font-bold md:col-span-2">{time}</p>
              <h3 className="text-xl font-semibold tracking-[-0.035em] md:col-span-3">
                {title}
              </h3>
              <p className="text-sm leading-6 text-[var(--muted-foreground)] md:col-span-6">
                {text}
              </p>
            </div>
          ))}
        </div>
        <Link
          className={buttonVariants({ variant: "primary" })}
          href="/ventures"
        >
          View the candidate register
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </section>
    </PageShell>
  );
}
