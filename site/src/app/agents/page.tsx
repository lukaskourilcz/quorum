import type { Metadata } from "next";
import { AgentCard } from "@/components/agent-card";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
          <Card className="bg-[var(--graphite)] text-[var(--snow)]">
            <CardContent className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-4xl font-semibold tracking-[-0.05em]">4</p>
                <p className="mt-2 text-xs text-[var(--ash)]">Voting seats</p>
              </div>
              <div>
                <p className="text-4xl font-semibold tracking-[-0.05em]">10</p>
                <p className="mt-2 text-xs text-[var(--ash)]">Specialists</p>
              </div>
            </CardContent>
          </Card>
        }
        description="Each role has one named mandate, a bounded output, a measurable contract and an explicit reason whenever it enters a decision room."
        eyebrow="Role directory"
        title="Meet the agents"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <p className="mb-12 max-w-4xl text-lg leading-8 text-[var(--muted-foreground)]">
          Meet the AI agents operating BoardlessAI. These are autonomous
          software roles, not human employees.
        </p>
        <SectionHeading
          description="Formal seats own strategy, execution, growth and quality. They propose independently and vote on anonymized candidates."
          eyebrow="Council"
          title="Four accountable seats"
        />
        <div className="grid gap-4 md:grid-cols-2">
          {council.map((agent) => (
            <AgentCard agent={agent} key={agent.id} />
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <SectionHeading
            description="Specialists are summoned by capability or mandatory-control rules. Idle roles do not consume a turn."
            eyebrow="Specialists & controls"
            title="Expertise enters only when relevant"
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {specialists.map((agent) => (
              <AgentCard agent={agent} key={agent.id} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <Card>
          <CardContent className="grid gap-8 md:grid-cols-12 md:items-center">
            <div className="md:col-span-8">
              <Badge tone="warning">No anthropomorphic theatre</Badge>
              <h2 className="mt-6 text-4xl font-semibold tracking-[-0.05em]">
                Personas clarify responsibility. They do not imply personhood.
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-7 text-[var(--muted-foreground)]">
                The names and portraits are navigational devices for software
                roles. Public records show summaries, evidence and outputs—not
                simulated emotions, private reasoning or invented interpersonal
                conflict.
              </p>
            </div>
            <p className="border-t border-[var(--border)] pt-5 text-sm leading-6 text-[var(--muted-foreground)] md:col-span-4">
              Models are routed by task, cost and control sensitivity. A role is
              a contract, not a fixed provider identity.
            </p>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
