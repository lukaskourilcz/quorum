import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { publicAgentText, publicDecisionLabel, publicOpportunityTitle } from "@/components/agent-language";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { opportunities } from "@/data/fixtures";

export const metadata: Metadata = {
  description:
    "Current BoardlessAI projects, earlier test ideas, sources and progress.",
  title: "Projects"
};

const stages = [
  ["01", "FIND A REAL PROBLEM", "Talk to people and check sources"],
  ["02", "TEST THE IDEA", "Look for a clear sign that it helps"],
  ["03", "REACH PEOPLE", "Find a reliable way to reach readers or buyers"],
  ["04", "EARN FIRST REVENUE", "Confirm that someone paid"],
  ["05", "IMPROVE THE NUMBERS", "Keep what works and fix what does not"]
] as const;

export default function VenturesPage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[1rem] border border-[var(--slate)] bg-[var(--card)] p-8">
            <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
              Current projects
            </p>
            <p className="mt-4 text-7xl font-semibold leading-none tracking-[-0.07em]">
              6
            </p>
            <p className="mt-3 text-[0.84375rem] text-[var(--fog)]">
              Two publications · apparel planning · idea research · fight data · design engine
            </p>
          </div>
        }
        description="Six projects share the same checks for sources, cost and human approval. Carousel Studio supplies checked social layouts without adding an image-model bill."
        eyebrow="Current work"
        title="Six projects, with clear limits"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pt-22 md:px-10">
        <article className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--magenta-spark)] bg-[var(--card)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[color-mix(in_srgb,var(--magenta-spark)_12%,var(--surface))] p-8 md:col-span-4 md:p-10">
              <Badge tone="accent">Project 001</Badge>
              <p className="mt-12 font-mono text-sm uppercase tracking-[0.12em] text-[var(--magenta-spark)]">TESTING THE IDEA</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">Caught Up</h2>
            </div>
            <div className="p-8 md:col-span-8 md:p-10">
              <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">One important AI story a day, or an honest note when none is strong enough.</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">BoardlessAI finds the sources, chooses the story, checks each release and keeps the product ideas. The existing Caught Up reader still publishes the finished edition.</p>
              <Link className={`${buttonVariants({ variant: "secondary" })} mt-7`} href="/ventures/caught-up">Open project <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </div>
        </article>
        <article className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--card)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] p-8 md:col-span-4 md:p-10">
              <Badge tone="warning">Project 002</Badge>
              <p className="mt-12 font-mono text-sm uppercase tracking-[0.12em] text-[var(--accent)]">TESTING · PLANNING ONLY</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">Titty Tuesdays</h2>
            </div>
            <div className="p-8 md:col-span-8 md:p-10">
              <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">One crop-top idea, developed in public before there is a shop.</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">The team can work on product designs, a consistent visual style and launch plans. It cannot publish campaigns, buy stock or sell anything yet.</p>
              <Link className={`${buttonVariants({ variant: "secondary" })} mt-7`} href="/ventures/titty-tuesdays">Open project <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </div>
        </article>
        <article className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--surface)] p-8 md:col-span-4 md:p-10">
              <Badge>Idea research</Badge>
              <p className="mt-12 font-mono text-sm uppercase tracking-[0.12em] text-[var(--fog)]">IDEAS ONLY</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">Magazine Incubator</h2>
            </div>
            <div className="p-8 md:col-span-8 md:p-10">
              <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">Research publication ideas without pretending they are businesses.</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">The team can collect sources and let the owner rate a complete proposal. It cannot launch a publication by itself.</p>
              <Link className={`${buttonVariants({ variant: "secondary" })} mt-7`} href="/incubator">Open idea research <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </div>
        </article>
        <article className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--card)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-8 md:col-span-4 md:p-10">
              <Badge tone="warning">Project 003</Badge>
              <p className="mt-12 font-mono text-sm uppercase tracking-[0.12em] text-[var(--accent)]">DATA ONLY · 18+</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">FightAIQ</h2>
            </div>
            <div className="p-8 md:col-span-8 md:p-10">
              <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">Sourced UFC and Oktagon files, with estimates made by code rather than guesswork.</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">BoardlessAI keeps the meetings and source checks. MMA Files is the one public home for fighters, events, captured odds and model output.</p>
              <Link className={`${buttonVariants({ variant: "secondary" })} mt-7`} href="/ventures/fightaiq">Open FightAIQ <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </div>
        </article>
        <article className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-[var(--magenta-spark)] bg-[var(--card)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[color-mix(in_srgb,var(--magenta-spark)_8%,var(--surface))] p-8 md:col-span-4 md:p-10">
              <Badge tone="accent">Project 004</Badge>
              <p className="mt-12 font-mono text-sm uppercase tracking-[0.12em] text-[var(--magenta-spark)]">BILINGUAL MAGAZINE</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">MMA Files</h2>
            </div>
            <div className="p-8 md:col-span-8 md:p-10">
              <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">Two daily English and Czech article slots, backed by FightAIQ files.</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">Finished bilingual articles and FightAIQ data are delivered to the public magazine. Social posting stays off until you turn it on separately.</p>
              <a className={`${buttonVariants({ variant: "secondary" })} mt-7`} href="https://mma-files.vercel.app/en" rel="noreferrer" target="_blank">Open MMA Files <ArrowRight aria-hidden="true" className="size-4" /></a>
            </div>
          </div>
        </article>
        <article className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--card)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-8 md:col-span-4 md:p-10">
              <Badge tone="accent">Project 006</Badge>
              <p className="mt-12 font-mono text-sm uppercase tracking-[0.12em] text-[var(--accent)]">INTERNAL DESIGN ENGINE</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">Carousel Studio</h2>
            </div>
            <div className="p-8 md:col-span-8 md:p-10">
              <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">Reusable social layouts that stay distinct across all three brands.</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">Ten original templates render as deterministic PNGs for Instagram and Threads. The engine costs no API tokens; its paid review room runs only from a bounded agenda.</p>
              <Link className={`${buttonVariants({ variant: "secondary" })} mt-7`} href="/ventures/carousel-studio">Open Carousel Studio <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </div>
        </article>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 pt-22 md:px-10">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--accent)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--accent)] p-8 text-[var(--obsidian)] md:col-span-4 md:p-10">
              <p className="mono-label text-[0.65625rem] font-semibold">
                Earlier test result
              </p>
              <p className="mt-11 text-[2rem] font-semibold leading-[1.05] tracking-[-0.05em] break-words">
                NOT ENOUGH REAL SOURCES
              </p>
            </div>
            <div className="bg-[var(--card)] p-8 md:col-span-8 md:p-10">
              <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">
                The first test rejected every sample idea.
              </h2>
              <p className="mt-4 max-w-4xl text-base leading-7 text-[var(--fog)]">
                Sample data can test the software, but it cannot prove that
                people want a product. The next step is to find real sources
                before making a product, launch page or social campaign.
              </p>
              <p className="mt-7 flex items-center gap-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                <span className="status-pulse size-1.5 rounded-full bg-[var(--accent)]" />
                {opportunities.length} sample ideas checked / 0 passed
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-16 md:px-10 md:pb-24">
        <div className="grid gap-4 lg:grid-cols-3">
          {opportunities.map((opportunity) => (
            <article
              className="rounded-[1.125rem] border border-[var(--border)] bg-[var(--card)] p-8 transition-colors hover:border-[var(--iron)]"
              key={opportunity.id}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge>Test example</Badge>
                <span className="font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--accent)]">
                  {publicDecisionLabel(opportunity.status)}
                </span>
              </div>
              <h2 className="mt-7 text-[1.4375rem] font-semibold leading-tight tracking-[-0.04em]">
                {publicOpportunityTitle(opportunity.title)}
              </h2>
              <div className="mt-8 flex items-end justify-between">
                <div>
                  <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                    Score
                  </p>
                  <p className="mt-2 text-[2.5rem] font-semibold tracking-[-0.055em] tabular-nums">
                    {opportunity.score}
                    <span className="text-base text-[var(--fog)]">/50</span>
                  </p>
                </div>
                <span className="font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                  Needs 35
                </span>
              </div>
              <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${(opportunity.score / 50) * 100}%` }}
                />
              </div>
              <div className="relative mt-2 h-3">
                <span className="absolute left-[70%] top-0 h-1.5 w-px bg-[var(--iron)]" />
                <span className="absolute left-[calc(70%+0.375rem)] top-0 font-mono text-[0.59375rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                  Minimum
                </span>
              </div>
              <p className="mt-6 min-h-18 text-sm leading-6 text-[var(--fog)]">
                {publicAgentText(opportunity.reason)}
              </p>
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href={`/ventures/${opportunity.slug}`}
              >
                View test idea
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
          <p className="mono-label text-[var(--accent)]">How projects move forward</p>
          <h2 className="mt-5 max-w-4xl text-[clamp(2.4rem,5vw,4.2rem)] font-semibold leading-none tracking-[-0.055em]">
            Each step needs proof.
          </h2>
          <div className="panel-grid mt-13 md:grid-cols-5">
            {stages.map(([number, title, description], index) => (
              <div
                className={
                  index === 1
                    ? "flex min-h-45 flex-col justify-between bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] p-7"
                    : "flex min-h-45 flex-col justify-between bg-[var(--surface)] p-7"
                }
                key={title}
              >
                <p
                  className={`font-mono text-[0.6875rem] tracking-[0.1em] ${
                    index === 1
                      ? "text-[var(--accent)]"
                      : "text-[var(--fog)]"
                  }`}
                >
                  {number}
                </p>
                <div>
                  <p
                    className={`text-[0.9375rem] font-bold tracking-[0.02em] ${
                      index === 1 ? "text-[var(--accent)]" : ""
                    }`}
                  >
                    {title}
                  </p>
                  <p className="mt-2.5 text-xs leading-5 text-[var(--fog)]">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
            Current step / 02 test the idea · six projects share the same checks
          </p>
        </div>
      </section>
    </PageShell>
  );
}
