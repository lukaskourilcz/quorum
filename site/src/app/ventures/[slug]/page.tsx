import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleX, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CaughtUpVenturePage } from "@/components/caught-up-venture-page";
import { TittyTuesdaysVenturePage } from "@/components/titty-tuesdays-venture-page";
import {
  opportunities,
  opportunityDimensions
} from "@/data/fixtures";

export function generateStaticParams() {
  return [{ slug: "caught-up" }, { slug: "titty-tuesdays" }, ...opportunities.map((opportunity) => ({ slug: opportunity.slug }))];
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "caught-up") {
    return {
      description: "Caught Up is BoardlessAI venture 001: one consequential AI story a day, governed in public.",
      title: "Caught Up"
    };
  }
  if (slug === "titty-tuesdays") {
    return {
      description: "Titty Tuesdays is BoardlessAI venture 002: one crop-top proposition, developed in public before commerce.",
      robots: { follow: true, index: false },
      title: "Titty Tuesdays"
    };
  }
  const opportunity = opportunities.find((item) => item.slug === slug);
  return {
    description: opportunity?.reason ?? "BoardlessAI opportunity card.",
    robots: opportunity?.fixture ? { follow: true, index: false } : undefined,
    title: opportunity?.title ?? "Venture"
  };
}

export default async function VentureDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "caught-up") return <CaughtUpVenturePage />;
  if (slug === "titty-tuesdays") return <TittyTuesdaysVenturePage />;
  const opportunity = opportunities.find((item) => item.slug === slug);
  if (!opportunity) {
    notFound();
  }

  return (
    <PageShell>
      <article>
        <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-20">
          <Link
            className={buttonVariants({ variant: "ghost", size: "small" })}
            href="/ventures"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Venture register
          </Link>
          <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8">
              <div className="flex flex-wrap gap-2">
                <Badge>Demo fixture</Badge>
                <Badge tone="danger">{opportunity.status}</Badge>
              </div>
              <h1 className="mt-7 max-w-5xl text-[clamp(3.5rem,8vw,7.5rem)] font-semibold leading-[0.86] tracking-[-0.07em]">
                {opportunity.title}
                <span className="text-[var(--accent)]">.</span>
              </h1>
            </div>
            <div className="md:col-span-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                Opportunity score
              </p>
              <p className="mt-3 text-7xl font-semibold tracking-[-0.07em]">
                {opportunity.score}
                <span className="text-xl text-[var(--muted-foreground)]">/50</span>
              </p>
              <Progress className="mt-5" max={50} value={opportunity.score} />
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-10 px-5 py-16 md:grid-cols-12 md:px-8 md:py-20">
            <div className="md:col-span-8">
              <Badge>Gate verdict</Badge>
              <p className="mt-6 text-3xl font-semibold leading-tight tracking-[-0.04em]">
                {opportunity.reason}
              </p>
            </div>
            <Callout className="md:col-span-4" tone="warning">
              This page is noindex because it documents a synthetic rejected
              candidate, not a customer product.
            </Callout>
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-4">
              <Badge>Ten dimensions</Badge>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">
                Every weak dimension stays visible.
              </h2>
              <p className="mt-5 text-sm leading-6 text-[var(--muted-foreground)]">
                Selection needs at least 35/50 and no dimension below 2. Total
                score cannot hide a fatal weakness.
              </p>
            </div>
            <Card className="md:col-span-8">
              <CardContent className="space-y-6">
                {opportunityDimensions.map((dimension, index) => {
                  const score = opportunity.dimensions[index]!;
                  return (
                    <div
                      className="grid gap-3 sm:grid-cols-[1fr_3rem] sm:items-center"
                      key={dimension}
                    >
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-4">
                          <p className="text-sm font-medium">{dimension}</p>
                          {score < 2 ? (
                            <span className="text-xs font-bold text-[var(--destructive-soft)]">
                              Fails floor
                            </span>
                          ) : null}
                        </div>
                        <Progress max={5} value={score} />
                      </div>
                      <p className="text-right text-lg font-bold">{score}/5</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="bg-[var(--graphite)] text-[var(--snow)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--iron)] sm:grid-cols-3">
            {[
              ["Independent eligible evidence", opportunity.evidence, "≥ 3"],
              ["Direct problem / intent signals", opportunity.direct, "≥ 1"],
              ["Minimum dimension", opportunity.minDimension, "≥ 2"]
            ].map(([label, value, target]) => (
              <div className="bg-[var(--graphite)] p-7 md:p-9" key={label}>
                <CircleX
                  aria-hidden="true"
                  className="size-5 text-[var(--accent)]"
                />
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.1em] text-[var(--ash)]">
                  {label}
                </p>
                <p className="mt-3 text-4xl font-semibold">{value}</p>
                <p className="mt-2 text-xs text-[var(--ash)]">Gate: {target}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-[var(--container)] gap-4 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <Card>
            <CardHeader>
              <Badge>Evidence</Badge>
              <CardTitle className="mt-5">No eligible references</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Three `FIX-E-*` records exercise source normalization and
                deduplication. Their confidence is zero and `fixture: true`, so
                the founding gate excludes them.
              </CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge>Experiment</Badge>
              <CardTitle className="mt-5">Not activatable</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                No immutable segment, baseline, target, review cycle and
                evidence-backed offer can be registered before opportunity
                selection.
              </CardDescription>
              <Separator className="my-6" />
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ExternalLink aria-hidden="true" className="size-4" />
                External action: none
              </p>
            </CardContent>
          </Card>
        </section>
      </article>
    </PageShell>
  );
}
