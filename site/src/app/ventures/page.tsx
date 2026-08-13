import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { publicAgentText, publicDecisionLabel, publicOpportunityTitle } from "@/components/agent-language";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { opportunities } from "@/data/fixtures";
import { readVentureIndex, VENTURE_INDEX_GROUPS, type VentureIndexCard } from "@/lib/venture-index";

export const metadata: Metadata = {
  description: "The eleven operating BoardlessAI projects, their recorded output and their limits.",
  title: "Projects"
};

const stages = [
  ["01", "FIND A REAL PROBLEM", "Talk to people and check sources"],
  ["02", "TEST THE IDEA", "Look for a clear sign that it helps"],
  ["03", "REACH PEOPLE", "Find a reliable way to reach readers or buyers"],
  ["04", "EARN FIRST REVENUE", "Confirm that someone paid"],
  ["05", "IMPROVE THE NUMBERS", "Keep what works and fix what does not"]
] as const;

function Metric({ card }: { card: VentureIndexCard }) {
  if (card.metric.count === null) {
    return (
      <div>
        <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Recorded output</p>
        <p className="mt-2 text-lg font-semibold text-[var(--mist)]">Not recorded</p>
        <p className="mt-1 text-xs leading-5 text-[var(--fog)]">The {card.metric.label} store is not present.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Recorded output</p>
      <p className="mt-2 text-[2.25rem] font-semibold leading-none tracking-[-0.05em] tabular-nums">{card.metric.count}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--fog)]">
        {card.metric.count === 0 ? `No ${card.metric.label} yet.` : card.metric.label}
      </p>
    </div>
  );
}

function VentureCard({ card, number }: { card: VentureIndexCard; number: number }) {
  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border bg-[var(--card)]"
      data-venture-card={card.id}
      style={{ borderColor: `color-mix(in srgb, ${card.color} 56%, var(--border))` }}
    >
      <div className="h-1.5" style={{ backgroundColor: card.color }} />
      <div className="flex flex-1 flex-col p-7 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone="success">{card.status}</Badge>
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
            Project {String(number).padStart(3, "0")}
          </span>
        </div>
        <h2 className="mt-7 text-[1.8rem] font-semibold tracking-[-0.045em]">{card.name}</h2>
        <p className="mt-3 text-[1.0625rem] font-semibold leading-7">{card.promise}</p>
        <p className="mt-3 flex-1 text-sm leading-6 text-[var(--fog)]">{card.boundary}</p>
        <div className="mt-7 border-t border-[var(--border)] pt-5">
          <Metric card={card} />
        </div>
        {card.href ? (
          card.external ? (
            <a className={`${buttonVariants({ variant: "secondary" })} mt-6 self-start`} href={card.href} rel="noreferrer" target="_blank">
              Open project <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          ) : (
            <Link className={`${buttonVariants({ variant: "secondary" })} mt-6 self-start`} href={card.href}>
              Open project <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )
        ) : (
          <p className="mt-6 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
            Public project page not recorded yet
          </p>
        )}
      </div>
    </article>
  );
}

export default async function VenturesPage() {
  const cards = await readVentureIndex();
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[1rem] border border-[var(--slate)] bg-[var(--card)] p-8">
            <p className="mono-label text-[0.65625rem] text-[var(--fog)]">Current projects</p>
            <p className="mt-4 text-7xl font-semibold leading-none tracking-[-0.07em]">{cards.length}</p>
            <p className="mt-3 text-[0.84375rem] leading-6 text-[var(--fog)]">
              Editorial desks · research and growth · shared production
            </p>
          </div>
        }
        description="Every project below is operating under its own evidence, spending and approval gates. Counts come from the records currently present; a missing store is named rather than shown as zero."
        eyebrow="Current work"
        title="Eleven projects, each with a clear limit"
      />

      <div className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
        {VENTURE_INDEX_GROUPS.map((group, groupIndex) => {
          const grouped = cards.filter((card) => card.group === group);
          return (
            <section className={groupIndex === 0 ? "" : "mt-16"} key={group}>
              <div className="flex items-end justify-between gap-5 border-b border-[var(--border)] pb-4">
                <h2 className="text-2xl font-semibold tracking-[-0.035em]">{group}</h2>
                <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
                  {grouped.length} {grouped.length === 1 ? "project" : "projects"}
                </p>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {grouped.map((card) => (
                  <VentureCard card={card} key={card.id} number={cards.indexOf(card) + 1} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-16 md:px-10">
          <p className="mono-label text-[var(--accent)]">Earlier software test · not current projects</p>
          <h2 className="mt-5 max-w-3xl text-[2rem] font-semibold tracking-[-0.045em]">The first sample-idea test rejected every entry.</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">
            Sample data can test the scoring software, but it cannot prove that people want a product. These examples stay below the operating portfolio so they cannot be mistaken for venture cards.
          </p>
          <p className="mt-6 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
            {opportunities.length} sample ideas checked / 0 passed
          </p>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {opportunities.map((opportunity) => (
              <article className="rounded-[1.125rem] border border-[var(--border)] bg-[var(--card)] p-7" data-sample-idea key={opportunity.id}>
                <div className="flex items-center justify-between gap-3">
                  <Badge>Test example</Badge>
                  <span className="font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--accent)]">
                    {publicDecisionLabel(opportunity.status)}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.035em]">{publicOpportunityTitle(opportunity.title)}</h3>
                <p className="mt-4 text-sm leading-6 text-[var(--fog)]">{publicAgentText(opportunity.reason)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-24">
        <p className="mono-label text-[var(--accent)]">How projects move forward</p>
        <h2 className="mt-5 max-w-4xl text-[clamp(2.4rem,5vw,4.2rem)] font-semibold leading-none tracking-[-0.055em]">Each step needs proof.</h2>
        <div className="panel-grid mt-13 md:grid-cols-5">
          {stages.map(([number, title, description], index) => (
            <div className={index === 1 ? "flex min-h-45 flex-col justify-between bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] p-7" : "flex min-h-45 flex-col justify-between bg-[var(--surface)] p-7"} key={title}>
              <p className={`font-mono text-[0.6875rem] tracking-[0.1em] ${index === 1 ? "text-[var(--accent)]" : "text-[var(--fog)]"}`}>{number}</p>
              <div>
                <p className={`text-[0.9375rem] font-bold tracking-[0.02em] ${index === 1 ? "text-[var(--accent)]" : ""}`}>{title}</p>
                <p className="mt-2.5 text-xs leading-5 text-[var(--fog)]">{description}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
          Current operating portfolio / eleven projects / every gate remains in force
        </p>
      </section>
    </PageShell>
  );
}
