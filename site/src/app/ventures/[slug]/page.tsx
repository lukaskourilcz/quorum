import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleX, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { publicAgentText, publicDecisionLabel, publicOpportunityTitle } from "@/components/agent-language";
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
import { FightAiQVenturePage } from "@/components/fightaiq-venture-page";
import { CarouselStudioVenturePage } from "@/components/carousel-studio-venture-page";
import {
  opportunities,
  opportunityDimensions
} from "@/data/fixtures";

export function generateStaticParams() {
  return [{ slug: "caught-up" }, { slug: "titty-tuesdays" }, { slug: "fightaiq" }, { slug: "carousel-studio" }, ...opportunities.map((opportunity) => ({ slug: opportunity.slug }))];
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "caught-up") {
    return {
      description: "Caught Up is BoardlessAI project 001: one important AI story a day, made in public.",
      title: "Caught Up"
    };
  }
  if (slug === "titty-tuesdays") {
    return {
      description: "Titty Tuesdays is BoardlessAI project 002: one crop-top idea, developed in public before anything is sold.",
      robots: { follow: true, index: false },
      title: "Titty Tuesdays"
    };
  }
  if (slug === "fightaiq") return { title: "FightAIQ", description: "The UFC and Oktagon data layer that delivers checked fight files to MMA Files." };
  if (slug === "carousel-studio") return { title: "Carousel Studio", description: "BoardlessAI's deterministic carousel template engine and live layout gallery." };
  const opportunity = opportunities.find((item) => item.slug === slug);
  return {
    description: opportunity?.reason ?? "BoardlessAI test idea.",
    robots: opportunity?.fixture ? { follow: true, index: false } : undefined,
    title: opportunity ? publicOpportunityTitle(opportunity.title) : "Project"
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
  if (slug === "fightaiq") return <FightAiQVenturePage />;
  if (slug === "carousel-studio") return <CarouselStudioVenturePage />;
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
            All projects
          </Link>
          <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8">
              <div className="flex flex-wrap gap-2">
                <Badge>Test example</Badge>
                <Badge tone="danger">{publicDecisionLabel(opportunity.status)}</Badge>
              </div>
              <h1 className="mt-7 max-w-5xl text-[clamp(3.5rem,8vw,7.5rem)] font-semibold leading-[0.86] tracking-[-0.07em]">
                {publicOpportunityTitle(opportunity.title)}
                <span className="text-[var(--accent)]">.</span>
              </h1>
            </div>
            <div className="md:col-span-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                Idea score
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
              <Badge>Why it stopped</Badge>
              <p className="mt-6 text-3xl font-semibold leading-tight tracking-[-0.04em]">
                {publicAgentText(opportunity.reason)}
              </p>
            </div>
            <Callout className="md:col-span-4" tone="warning">
              This sample idea was created to test the software. It is not a
              real product and search engines are asked not to list it.
            </Callout>
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-4">
              <Badge>Ten checks</Badge>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">
                Every weak point stays visible.
              </h2>
              <p className="mt-5 text-sm leading-6 text-[var(--muted-foreground)]">
                An idea needs at least 35/50, and every check must score 2 or
                more. One serious weakness can still stop a high-scoring idea.
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
                          <p className="text-sm font-medium">{publicAgentText(dimension)}</p>
                          {score < 2 ? (
                            <span className="text-xs font-bold text-[var(--destructive-soft)]">
                              Too low
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
              ["Real sources from different places", opportunity.evidence, "≥ 3"],
              ["People describing the problem or intent", opportunity.direct, "≥ 1"],
              ["Lowest check score", opportunity.minDimension, "≥ 2"]
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
                <p className="mt-2 text-xs text-[var(--ash)]">Minimum: {target}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-[var(--container)] gap-4 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <Card>
            <CardHeader>
              <Badge>Sources</Badge>
              <CardTitle className="mt-5">No real sources</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Three sample records test how the software handles and removes
                duplicate sources. They carry no confidence and do not count as
                proof that people want this idea.
              </CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge>First test</Badge>
              <CardTitle className="mt-5">Cannot start yet</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Before a test can start, the team must choose who it is for,
                record the starting point and target, set a review date and
                support the offer with real sources.
              </CardDescription>
              <Separator className="my-6" />
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ExternalLink aria-hidden="true" className="size-4" />
                Nothing has been published or sent
              </p>
            </CardContent>
          </Card>
        </section>
      </article>
    </PageShell>
  );
}
