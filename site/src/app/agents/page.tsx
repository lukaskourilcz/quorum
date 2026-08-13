import type { Metadata } from "next";
import { publicAgentMandate, publicAgentStatus, publicAgentTitle } from "@/components/agent-language";
import { AgentCard, AgentRow } from "@/components/agent-card";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { agents, publicAgents } from "@/data/agents";
import { publicAgentAssignment } from "@/lib/agent-assignments";

export const metadata: Metadata = {
  description: `The ${agents.length} AI roles that research, decide, build, write and check BoardlessAI's work.`,
  title: "AI team"
};

export default function AgentsPage() {
  // Ten roles were stood down when the roster was cut. Counting them among the working team
  // told a reader the company runs forty roles when thirty of them do the work.
  const working = agents.filter((agent) => agent.status === "active");
  const publicWorking = publicAgents.filter((agent) => agent.status === "active");
  const publicIds = new Set(publicAgents.map(({ id }) => id));
  const internalOnly = working.filter(({ id }) => !publicIds.has(id));
  const standDown = agents.filter((agent) => agent.status !== "active");
  const council = publicWorking.filter((agent) => agent.group === "Council");
  const specialists = publicWorking.filter((agent) => agent.group !== "Council");

  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[1rem] border border-[var(--slate)] bg-[var(--slate)]">
            <div className="bg-[var(--card)] p-6">
              <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                Working roles
              </p>
              <p className="mt-3.5 text-[2.5rem] font-semibold tracking-[-0.06em]">
                {working.length}
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

        {internalOnly.length ? (
          <div className="mt-10 rounded-[1.125rem] border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
            <p className="mono-label text-[0.65625rem] text-[var(--fog)]">Internal-only profiles</p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fog)]">
              These active roles are part of the recorded team, but their founding permission keeps
              their detailed profiles inside the owner workspace.
            </p>
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {internalOnly.map((agent) => (
                <li className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5" key={agent.id}>
                  <p className="text-lg font-semibold tracking-[-0.03em]">{agent.name} · {publicAgentTitle(agent)}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--fog)]">{publicAgentMandate(agent)}</p>
                  <p className="mt-4 font-mono text-[0.6875rem] text-[var(--fog)]">Assigned work · {publicAgentAssignment(agent)}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {standDown.length ? (
          <div className="mt-10 rounded-[1.125rem] border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
            <p className="mono-label text-[0.65625rem] text-[var(--fog)]">Stood down</p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fog)]">
              These roles are on the record and off the work. A retired role is closed; a paused
              one is waiting for something that does not exist yet, and nothing calls either.
            </p>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {standDown.map((agent) => (
                <li className="text-[var(--fog)]" key={agent.id}>
                  {publicAgentTitle(agent)} · {publicAgentStatus(agent.status)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}
