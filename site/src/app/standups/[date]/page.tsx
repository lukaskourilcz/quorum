import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleSlash2,
  MessageSquareText,
  ShieldAlert
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableCell,
  TableHead
} from "@/components/ui/table";
import { agentById } from "@/data/agents";
import { standups } from "@/data/fixtures";
import { formatDate, formatUsd } from "@/lib/utils";

export function generateStaticParams() {
  return standups.map((standup) => ({ date: standup.date }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const standup = standups.find((item) => item.date === date);
  return {
    description: standup
      ? standup.decision.summary
      : "BoardlessAI standup record.",
    robots: standup?.fixture ? { follow: true, index: false } : undefined,
    title: standup ? `Standup · ${formatDate(date)}` : "Standup"
  };
}

export default async function StandupDetailPage({
  params
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const standup = standups.find((item) => item.date === date);
  if (!standup) {
    notFound();
  }
  const selected = standup.participants.filter(
    (participant) => participant.participated
  );
  const skipped = standup.participants.filter(
    (participant) => !participant.participated
  );

  return (
    <PageShell>
      <article>
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-18">
            <Link
              className={buttonVariants({ variant: "ghost", size: "small" })}
              href="/standups"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              All standups
            </Link>
            <div className="mt-10 flex flex-wrap gap-2">
              <Badge tone="warning">{standup.status}</Badge>
              <Badge>{standup.fixture ? "Offline fixture" : "Live"}</Badge>
              <Badge tone="dark">{standup.stage}</Badge>
            </div>
            <h1 className="mt-7 max-w-5xl text-[clamp(3rem,7.5vw,7.2rem)] font-semibold leading-[0.88] tracking-[-0.07em]">
              Founding standup
              <span className="text-[var(--accent)]">.</span>
            </h1>
            <div className="mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm text-[var(--muted-foreground)]">
              <span>{formatDate(standup.date)}</span>
              <span>Phase: {standup.phase}</span>
              <span>Public fixture record</span>
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                className={buttonVariants({ variant: "primary" })}
                href={`/standups/${standup.date}/room`}
              >
                <MessageSquareText aria-hidden="true" className="size-4" />
                Read the room transcript
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[var(--container)] px-5 py-16 md:px-8 md:py-24">
          <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-8">
              <Badge>Operating brief</Badge>
              <p className="mt-6 text-balance text-3xl font-medium leading-tight tracking-[-0.035em] md:text-5xl">
                {standup.operatingBrief}
              </p>
            </div>
            <Callout className="self-end md:col-span-4" tone="warning">
              This is synthetic, schema-valid fixture data. It demonstrates the
              controls and does not claim market validation, customers or
              revenue.
            </Callout>
          </div>
        </section>

        <section className="bg-[var(--graphite)] text-[var(--snow)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--iron)] sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Worst-case estimate", formatUsd(standup.ledger.estimate)],
              ["Actual API cost", formatUsd(standup.ledger.actual)],
              ["Month all-in", formatUsd(standup.ledger.monthAllIn)],
              ["Hard cap", formatUsd(standup.ledger.cap)]
            ].map(([label, value]) => (
              <div className="bg-[var(--graphite)] p-7" key={label}>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ash)]">
                  LEDGER · {label}
                </p>
                <p className="mt-7 text-3xl font-semibold tracking-[-0.04em]">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <SectionHeading
            description="Every formal seat supplied a bounded position. These are decision summaries, not private reasoning transcripts."
            eyebrow="Council"
            title="Four seats. One non-decision."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {standup.proposals.map((proposal) => {
              const agent = agentById.get(proposal.agent)!;
              return (
                <Card key={proposal.agent}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Badge tone="dark">{proposal.agent}</Badge>
                        <CardTitle className="mt-5">{agent.title}</CardTitle>
                      </div>
                      {proposal.agent === "AUDIT" ? (
                        <ShieldAlert
                          aria-label="Control seat"
                          className="size-5 text-[var(--accent)]"
                        />
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{proposal.summary}</CardDescription>
                    <Separator className="my-6" />
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                      Evidence references
                    </p>
                    <p className="mt-2 text-sm">
                      {proposal.evidenceRefs.length
                        ? proposal.evidenceRefs.join(", ")
                        : "None eligible"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-12 px-5 py-20 md:grid-cols-12 md:px-8 md:py-24">
            <div className="md:col-span-5">
              <Badge>Routing record</Badge>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">
                Participation is explained.
              </h2>
              <p className="mt-5 text-base leading-7 text-[var(--muted-foreground)]">
                A specialist is not invited by default. Relevance, mandatory
                controls and route caps determine the room.
              </p>
            </div>
            <div className="space-y-8 md:col-span-7">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em]">
                  Selected · {selected.length}
                </p>
                <div className="grid gap-3">
                  {selected.map((participant) => (
                    <div
                      className="flex gap-4 rounded-[var(--radius-button)] border border-[var(--border)] p-4"
                      key={participant.agent}
                    >
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-[var(--success)]"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold">{participant.agent}</p>
                        <p className="mt-1 break-words text-sm leading-6 text-[var(--muted-foreground)]">
                          {participant.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em]">
                  Explicitly skipped · {skipped.length}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {skipped.map((participant) => (
                    <div
                      className="flex gap-3 border-t border-[var(--border)] py-4"
                      key={participant.agent}
                    >
                      <CircleSlash2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold">{participant.agent}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-[var(--muted-foreground)]">
                          {participant.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-5">
              <Badge>Vote matrix</Badge>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">
                The audit veto held.
              </h2>
              <p className="mt-5 text-base leading-7 text-[var(--muted-foreground)]">
                Candidate identities are anonymized before ranked voting in a
                live cycle. Here, every seat independently prefers NO_ACTION.
              </p>
            </div>
            <Card className="md:col-span-7">
              <CardContent>
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Voter</TableHead>
                      <TableHead>First choice</TableHead>
                      <TableHead>Veto</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {standup.voteMatrix.map((vote) => (
                      <tr key={vote.voter}>
                        <TableCell className="font-bold">{vote.voter}</TableCell>
                        <TableCell className="break-words">
                          {vote.firstChoice}
                        </TableCell>
                        <TableCell>{vote.veto ? "Yes" : "No"}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
          <Card className="overflow-hidden border-[var(--accent)]">
            <div className="grid md:grid-cols-12">
              <div className="bg-[var(--accent)] p-7 md:col-span-3 md:p-10">
                <p className="text-xs font-bold uppercase tracking-[0.12em]">
                  Decision
                </p>
                <p className="mt-8 text-3xl font-semibold leading-tight tracking-[-0.045em]">
                  {standup.decision.outcome}
                </p>
              </div>
              <CardContent className="md:col-span-9 md:p-10">
                <p className="text-xl leading-8">{standup.decision.summary}</p>
                <Separator className="my-7" />
                <p className="text-sm text-[var(--muted-foreground)]">
                  Eligible evidence refs: none. Fixture records were excluded by
                  rule.
                </p>
              </CardContent>
            </div>
          </Card>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-24">
            <SectionHeading
              description="Downstream tasks remain blocked until their explicit prerequisites exist."
              eyebrow="Task timeline"
              title="What happens next"
            />
            <div className="grid gap-0">
              {standup.tasks.map((task, index) => (
                <div
                  className="grid gap-3 border-t border-[var(--border)] py-6 sm:grid-cols-12 sm:items-start"
                  key={task.summary}
                >
                  <span className="text-xs font-bold text-[var(--muted-foreground)] sm:col-span-1">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 break-words text-sm sm:col-span-2">
                    {task.time}
                  </span>
                  <span className="min-w-0 break-words font-bold sm:col-span-2">
                    {task.agent}
                  </span>
                  <span className="min-w-0 break-words text-sm leading-6 sm:col-span-5">
                    {task.summary}
                  </span>
                  <Badge
                    className="w-fit sm:col-span-2"
                    tone={task.status === "planned" ? "accent" : "warning"}
                  >
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[var(--container)] gap-4 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <Card>
            <CardHeader>
              <Badge>PULSE plan</Badge>
              <CardTitle className="mt-5">Distribution held</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{standup.growthPlan}</CardDescription>
            </CardContent>
          </Card>
          <Card className="bg-[var(--graphite)] text-[var(--snow)]">
            <CardHeader>
              <Badge tone="dark">Evening outcome</Badge>
              <CardTitle className="mt-5">No material change</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-7 text-[var(--ash)]">
                {standup.eveningOutcome}
              </p>
            </CardContent>
          </Card>
        </section>
      </article>
    </PageShell>
  );
}
