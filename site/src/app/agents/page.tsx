import type { Metadata } from "next";
import { AgentCard, AgentRow } from "@/components/agent-card";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { agents } from "@/data/agents";

export const metadata: Metadata = {
  description:
    "The twenty-seven AI roles that research, decide, build, write and check BoardlessAI's work.",
  title: "AI team"
};

export default function AgentsPage() {
  const council = agents.filter((agent) => agent.group === "Council");
  const specialists = agents.filter((agent) => agent.group !== "Council");

  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[1rem] border border-[var(--slate)] bg-[var(--slate)]">
            <div className="bg-[var(--card)] p-6">
              <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                Total roles
              </p>
              <p className="mt-3.5 text-[2.5rem] font-semibold tracking-[-0.06em]">
                {agents.length}
              </p>
            </div>
            <div className="bg-[var(--card)] p-6">
              <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                Decision makers
              </p>
              <p className="mt-3.5 text-[2.5rem] font-semibold tracking-[-0.06em] text-[var(--accent)]">
                {council.length}
              </p>
            </div>
          </div>
        }
        description="Each AI role has one clear job, a result it must produce and a way to check its work. These are software roles, not human employees."
        eyebrow="The AI team"
        title="Meet the roles doing the work"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pt-24 md:px-10">
        <SectionHeading
          description="These four roles are responsible for strategy, building, growth and quality. They suggest options independently, then vote without seeing who wrote each option."
          eyebrow="Decision team"
          title="Four roles make the final call"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {council.map((agent) => (
            <AgentCard agent={agent} key={agent.id} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10 md:py-30">
        <SectionHeading
          description="Other roles join only when the meeting needs their skills or a required safety check. Roles that are not needed stay out."
          eyebrow="Specialists and checking roles"
          title="The right skills for each meeting"
        />
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
          {specialists.map((agent) => (
            <AgentRow agent={agent} key={agent.id} />
          ))}
          <div className="flex flex-col gap-2 px-7 py-5 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)] sm:flex-row sm:items-center sm:justify-between">
            <span>{specialists.length} roles / do not vote</span>
            <span>Current work shown on each profile</span>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
