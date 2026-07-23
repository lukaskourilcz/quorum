import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Beaker, CircleSlash2 } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { opportunities } from "@/data/fixtures";

export const metadata: Metadata = {
  description:
    "Candidate and active BoardlessAI ventures, stage gates, evidence and experiment state.",
  title: "Ventures"
};

export default function VenturesPage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <Card className="bg-[var(--graphite)] text-[var(--snow)]">
            <CardContent>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ash)]">
                Selected ventures
              </p>
              <p className="mt-5 text-6xl font-semibold tracking-[-0.065em]">
                0
              </p>
              <p className="mt-2 text-sm text-[var(--ash)]">
                Correct while evidence is insufficient
              </p>
            </CardContent>
          </Card>
        }
        description="The company operating system exists; a customer venture does not. Candidate cards stay in DISCOVERY until every deterministic gate passes."
        eyebrow="Business portfolio"
        title="No venture by default"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <Card className="mb-12 overflow-hidden border-[var(--accent)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--accent)] p-7 md:col-span-3 md:p-10">
              <CircleSlash2 aria-hidden="true" className="size-7" />
              <p className="mt-12 text-3xl font-semibold tracking-[-0.045em]">
                INSUFFICIENT_
                <wbr />
                EVIDENCE
              </p>
            </div>
            <CardContent className="md:col-span-9 md:p-10">
              <CardTitle>The founding fixture declined all candidates.</CardTitle>
              <CardDescription className="max-w-3xl">
                Fixture signals are useful for testing schemas, not for proving
                demand. The next valid action is evidence collection—not a
                manufactured product, launch page or social campaign.
              </CardDescription>
            </CardContent>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {opportunities.map((opportunity) => (
            <Card key={opportunity.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <Badge>Fixture</Badge>
                  <span className="text-sm font-bold text-[var(--destructive)]">
                    {opportunity.status}
                  </span>
                </div>
                <CardTitle className="mt-7">{opportunity.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                      Score
                    </p>
                    <p className="mt-2 text-4xl font-semibold tracking-[-0.05em]">
                      {opportunity.score}
                      <span className="text-base text-[var(--muted-foreground)]">
                        /50
                      </span>
                    </p>
                  </div>
                  <Beaker
                    aria-hidden="true"
                    className="size-5 text-[var(--muted-foreground)]"
                  />
                </div>
                <Progress className="mt-5" max={50} value={opportunity.score} />
                <p className="mt-6 min-h-18 text-sm leading-6 text-[var(--muted-foreground)]">
                  {opportunity.reason}
                </p>
                <Link
                  className={buttonVariants({ variant: "secondary" })}
                  href={`/ventures/${opportunity.slug}`}
                >
                  Inspect card
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-24">
          <Badge>Stage model</Badge>
          <h2 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-0.05em] md:text-6xl">
            Progress is earned through gates.
          </h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--border)] md:grid-cols-5">
            {[
              ["01", "DISCOVERY", "Evidence + opportunity"],
              ["02", "VALIDATION", "Qualified value signal"],
              ["03", "AUDIENCE", "Repeatable acquisition"],
              ["04", "MONETIZATION", "Verified revenue"],
              ["05", "OPTIMIZATION", "Measured economics"]
            ].map(([number, stage, gate], index) => (
              <div
                className={
                  index === 0
                    ? "bg-[var(--accent-soft)] p-6"
                    : "bg-[var(--card)] p-6"
                }
                key={stage}
              >
                <p className="text-xs font-bold text-[var(--accent)]">{number}</p>
                <p className="mt-10 text-sm font-bold">{stage}</p>
                <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
                  {gate}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
