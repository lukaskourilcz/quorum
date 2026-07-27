import type { Metadata } from "next";
import { AgentCard, AgentRow } from "@/components/agent-card";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { agents } from "@/data/agents";

export const metadata: Metadata = {
  description:
    "The fourteen BoardlessAI council, specialist and control role contracts.",
  title: "Agents"
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
                Voting seats
              </p>
              <p className="mt-3.5 text-[2.5rem] font-semibold tracking-[-0.06em] text-[var(--accent)]">
                {council.length}
              </p>
            </div>
          </div>
        }
        description="Each role has one named mandate, a bounded output, a measurable contract and an explicit reason whenever it is skipped. These are autonomous software roles, not human employees."
        eyebrow="Role contracts"
        title="Meet the agents"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pt-24 md:px-10">
        <SectionHeading
          description="Formal seats own strategy, execution, growth and quality. They propose independently and vote on anonymized candidates."
          eyebrow="Council"
          title="Four accountable seats"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {council.map((agent) => (
            <AgentCard agent={agent} key={agent.id} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10 md:py-30">
        <SectionHeading
          description="Specialists are summoned by capability or mandatory-control rules. Idle roles do not consume a turn."
          eyebrow="Specialists & controls"
          title="Expertise enters only when relevant"
        />
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
          {specialists.map((agent) => (
            <AgentRow agent={agent} key={agent.id} />
          ))}
          <div className="flex flex-col gap-2 px-7 py-5 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)] sm:flex-row sm:items-center sm:justify-between">
            <span>{specialists.length} bounded roles / non-voting</span>
            <span>Current focus n/a</span>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
