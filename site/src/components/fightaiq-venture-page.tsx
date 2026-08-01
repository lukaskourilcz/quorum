import { ArrowUpRight, Database, FileCheck2, ShieldCheck } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

const mmaFilesUrl = "https://mma-files.vercel.app/en/data-desk";

export async function FightAiQVenturePage() {
  return (
    <PageShell>
      <PageIntro
        eyebrow="Project 003 / MMA data"
        title="FightAIQ"
        description="FightAIQ collects and checks UFC and Oktagon data for the MMA Files magazine. BoardlessAI runs the meetings and keeps the audit trail; MMA Files is where readers see the finished fighter, event, odds and model files."
        aside={
          <div className="rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--card)] p-8">
            <Badge tone="warning">18+ · research only</Badge>
            <p className="mt-5 text-5xl font-semibold tracking-[-0.06em]">003</p>
            <p className="mt-3 text-sm text-[var(--fog)]">UFC and Oktagon</p>
          </div>
        }
      />

      <section className="bg-[var(--graphite)] text-[var(--paper)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-28">
          <SectionHeading
            eyebrow="One public home"
            title="The fight files now live in MMA Files"
            description="There is no second fighter database on BoardlessAI. One checked delivery package updates the magazine, which prevents the two sites from showing different versions of the same fight."
          />
          <ol className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--iron)] md:grid-cols-3">
            {[
              ["01", "Collect", "FightAIQ stores sourced fighter, event and price files."],
              ["02", "Check", "The system rejects unsupported fields, stale data and records outside UFC or Oktagon."],
              ["03", "Deliver", "MMA Files tests and builds the exact package before its main branch accepts it."],
            ].map(([number, title, text]) => (
              <li className="bg-[var(--graphite)] p-7" key={number}>
                <p className="mono-label text-[var(--accent)]">{number}</p>
                <h2 className="mt-5 text-2xl font-semibold">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--fog)]">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-28">
        <SectionHeading
          eyebrow="Where to look"
          title="Public data in the magazine. Controls in admin."
          description="Readers get one bilingual destination. You still review source gaps, agent switches and meeting output in the protected BoardlessAI admin."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-7">
            <Database className="size-5 text-[var(--accent)]" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold">MMA Files data desk</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--fog)]">Fighters, events, captured odds, model versions and uncertainty are rendered there.</p>
            <a className={`${buttonVariants({ variant: "secondary" })} mt-6`} href={mmaFilesUrl} rel="noreferrer" target="_blank">
              Open MMA Files <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </article>
          <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-7">
            <FileCheck2 className="size-5 text-[var(--accent)]" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold">BoardlessAI admin</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--fog)]">Source disagreements and internal meeting controls remain private.</p>
            <a className={`${buttonVariants({ variant: "secondary" })} mt-6`} href="/admin?venture=fightaiq">Open protected admin</a>
          </article>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-10 px-5 py-20 md:grid-cols-2 md:px-10 md:py-28">
          <div>
            <ShieldCheck className="size-5 text-[var(--accent)]" aria-hidden="true" />
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">Evidence still comes first.</h2>
            <p className="mt-5 max-w-xl leading-7 text-[var(--fog)]">A missing source stays missing. Model files keep their version and capture time, and MMA Files refuses changed same-slot articles or stale FightAIQ snapshots.</p>
          </div>
          <Callout tone="warning"><strong>Responsible play.</strong> Fight estimates are uncertain. Neither app opens bookmaker accounts, places bets, moves money or links to a bookmaker. Do not chase losses or use money needed for bills.</Callout>
        </div>
      </section>
    </PageShell>
  );
}
