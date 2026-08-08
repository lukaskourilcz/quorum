import type { Metadata } from "next";
import { ArrowRight, Building2, CircleDollarSign, FlaskConical } from "lucide-react";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { AboutSection } from "@/components/sections/about-section";
import { DisclosureSection } from "@/components/sections/disclosure-section";
import { RulesSection } from "@/components/sections/governance-section";
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
    "What BoardlessAI is working on now, what is proven and what still needs testing.",
  title: "Company"
};

export default function CompanyPage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <Card className="bg-[var(--graphite)] text-[var(--snow)]">
            <CardContent>
              <Badge tone="accent">TESTING IDEAS</Badge>
              <p className="mt-7 text-3xl font-semibold tracking-[-0.045em]">
                Five current projects
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--ash)]">
                Publishing, apparel, research and MMA work share one set of rules.
              </p>
            </CardContent>
          </Card>
        }
        description="BoardlessAI runs five early projects with clear limits. DNESKAi and MMA Files publish on their own sites, Titty Tuesdays plans, FightAIQ supplies checked fight data and the Design Lab draws the covers. None has confirmed revenue."
        eyebrow="Current business plan"
        title="Where the company stands"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Building2,
              label: "Current projects",
              value: "5",
              note: "Two publications, apparel planning, idea research and fight data"
            },
            {
              icon: FlaskConical,
              label: "Release checks",
              value: "Auto",
              note: "DNESKAi and MMA Files are checked after every delivery"
            },
            {
              icon: CircleDollarSign,
              label: "Confirmed revenue",
              value: "$0",
              note: "No payment has been recorded"
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
            description="The plan becomes more specific when real results support it."
            eyebrow="What we know"
            title="Clear facts and open questions"
          />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Readers and buyers",
                text: "DNESKAi serves people who want one important AI story a day. Titty Tuesdays needs buyer research. FightAIQ and MMA Files need a reviewed MMA audience window."
              },
              {
                title: "Product and price",
                text: "DNESKAi is free. Titty Tuesdays has no shop or price. FightAIQ supplies research data to the public MMA Files magazine."
              },
              {
                title: "How people find the work",
                text: "DNESKAi and MMA Files publish in Czech. Each project's social posting unlocks only after its delivery or campaign checks pass."
              },
              {
                title: "Income and costs",
                text: "Confirmed revenue is $0.00. Recorded AI service, payment and other costs currently total $0.00."
              },
              {
                title: "What exists today",
                text: "DNESKAi and MMA Files have public reader apps. Titty Tuesdays has plans but no shop. FightAIQ has guarded data and model tools."
              },
              {
                title: "When to stop",
                text: "Pause or replace an idea when people show no interest, there is no practical way to reach them or a small first test cannot be run safely."
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
          description="These steps depend on saved proof, not promised dates."
          eyebrow="What comes next"
          title="Prove one step before taking the next"
        />
        <div className="space-y-0">
          {[
            [
              "Now",
              "Make the system reliable",
              "Finish checking safety, sources, costs, the website and scheduled work."
            ],
            [
              "Next",
              "Strengthen the sources",
              "Add reliable named sources where coverage or agreement is weak. Sample test data does not count."
            ],
            [
              "Then",
              "Prove every delivery",
              "Let the automatic checker confirm the published Czech page, the content marker, image and attribution after each release."
            ],
            [
              "Then",
              "Prepare the next safe move",
              "Build FightAIQ readiness files and let the board work only from concrete priority questions."
            ],
            [
              "Later",
              "Earn revenue",
              "Count only confirmed payments and compare them with every real cost."
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
          View current projects
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </section>

      {/* What the company is, the rules it works under, and what it discloses were three
          separate navigation entries answering one question. /about, /governance and
          /disclosure redirect into these sections. */}
      <section aria-label="About" id="about">
        <AboutSection />
      </section>
      <section aria-label="Rules" id="rules">
        <RulesSection />
      </section>
      <section aria-label="Disclosure" id="disclosure">
        <DisclosureSection />
      </section>
    </PageShell>
  );
}
