import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleSlash } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
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
import { Separator } from "@/components/ui/separator";
import { agentBySlug, agents } from "@/data/agents";

export function generateStaticParams() {
  return agents.map((agent) => ({ agent: agent.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ agent: string }>;
}): Promise<Metadata> {
  const { agent: slug } = await params;
  const agent = agentBySlug.get(slug);
  return {
    description: agent?.mandate ?? "BoardlessAI agent role contract.",
    title: agent ? `${agent.name} · ${agent.title}` : "Agent"
  };
}

export default async function AgentDetailPage({
  params
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent: slug } = await params;
  const agent = agentBySlug.get(slug);
  if (!agent) {
    notFound();
  }
  const index = agents.findIndex((candidate) => candidate.id === agent.id);
  const next = agents[(index + 1) % agents.length]!;
  const isControl = agent.group === "Control" || agent.id === "AUDIT";

  return (
    <PageShell>
      <article>
        <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-20">
          <Link
            className={buttonVariants({ variant: "ghost", size: "small" })}
            href="/agents"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Agent directory
          </Link>
          <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-end">
            <div className="md:col-span-7">
              <div className="flex flex-wrap gap-2">
                <Badge tone={agent.group === "Council" ? "dark" : "neutral"}>
                  {agent.group}
                </Badge>
                <Badge tone={agent.status === "guarded" ? "warning" : "success"}>
                  {agent.status}
                </Badge>
              </div>
              <h1 className="mt-7 text-[clamp(4.5rem,12vw,10rem)] font-semibold leading-[0.78] tracking-[-0.08em]">
                {agent.name}
                <span className="text-[var(--accent)]">.</span>
              </h1>
              <p className="mt-8 text-2xl font-medium tracking-[-0.03em]">
                {agent.title}
              </p>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
                {agent.mandate}
              </p>
            </div>
            <div className="md:col-span-5">
              <AgentPortrait agent={agent} priority />
            </div>
          </div>
        </section>

        <section className="bg-[var(--graphite)] text-[var(--snow)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--iron)] md:grid-cols-3">
            {[
              ["Primary output", agent.output],
              ["Accountability metric", agent.metric],
              ["Default model route", agent.model]
            ].map(([label, value]) => (
              <div className="bg-[var(--graphite)] p-7 md:min-h-48 md:p-9" key={label}>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ash)]">
                  {label}
                </p>
                <p className="mt-10 text-xl font-semibold leading-snug tracking-[-0.035em]">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-[var(--container)] gap-4 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <Card>
            <CardHeader>
              <Badge tone="success">Must do</Badge>
              <CardTitle className="mt-5">Role contract</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-5 text-sm leading-6 text-[var(--muted-foreground)]">
                {[
                  "Use only evidence and state explicitly routed into the task.",
                  "Return a structured, bounded output with sources and uncertainty.",
                  "Respect budget, tool, path and external-action permissions.",
                  "Make n/a, NO_ACTION and HUMAN_APPROVAL available outcomes."
                ].map((item) => (
                  <li className="flex gap-3" key={item}>
                    <Check
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-[var(--success)]"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge tone="danger">Must not do</Badge>
              <CardTitle className="mt-5">Control boundary</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-5 text-sm leading-6 text-[var(--muted-foreground)]">
                {[
                  "Invent evidence, customers, revenue, citations or observed outcomes.",
                  "Expose private reasoning, secrets, credentials or internal approval data.",
                  "Expand scope or authority because a task is difficult or blocked.",
                  isControl
                    ? "Approve a change to its own control contract."
                    : "Bypass AUDIT, KEEPER, LEDGER or human approval."
                ].map((item) => (
                  <li className="flex gap-3" key={item}>
                    <CircleSlash
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-[var(--destructive)]"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-10 px-5 py-20 md:grid-cols-12 md:px-8 md:py-24">
            <div className="md:col-span-5">
              <Badge>Working style</Badge>
              <p className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.05em]">
                “{agent.signature}”
              </p>
            </div>
            <div className="md:col-span-7">
              <Card>
                <CardContent>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                    Portrait art direction
                  </p>
                  <p className="mt-5 text-lg leading-8">{agent.motif}</p>
                  <Separator className="my-7" />
                  <CardDescription>
                    The portrait is an editorial representation of a software
                    responsibility: monochrome paper/photo collage with one
                    restrained Ember signal. It is not a human likeness.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <Link
            className="group flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-7 md:p-10"
            href={`/agents/${next.slug}`}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                Next role
              </p>
              <p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
                {next.name}
              </p>
            </div>
            <span className="grid size-14 place-items-center rounded-[var(--radius-button)] bg-[var(--primary)] text-[var(--primary-foreground)] transition-transform group-hover:translate-x-1">
              <ArrowRight aria-hidden="true" className="size-5" />
            </span>
          </Link>
        </section>
      </article>
    </PageShell>
  );
}
