import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CircleDollarSign,
  FileCheck2,
  Gauge,
  ShieldCheck
} from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { agents } from "@/data/agents";
import {
  governanceSteps,
  publicState,
  standups
} from "@/data/fixtures";
import { cn, formatDate, formatUsd } from "@/lib/utils";

const latestStandup = standups[0]!;

export default function HomePage() {
  return (
    <PageShell>
      <div className="border-b border-[var(--border)] bg-[var(--accent-soft)]">
        <div className="mx-auto flex max-w-[var(--container)] flex-col gap-2 px-5 py-3 text-xs font-medium sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>
            Working title · brand clearance is provisional with a material
            collision.
          </p>
          <Link className="font-bold underline underline-offset-4" href="/disclosure">
            Read the disclosure
          </Link>
        </div>
      </div>

      <section className="editorial-grid border-b border-[var(--border)]">
        <div className="mx-auto grid min-h-[calc(100svh-7.5rem)] max-w-[var(--container)] content-between gap-16 px-5 py-12 md:grid-cols-12 md:px-8 md:py-18">
          <div className="md:col-span-12">
            <Badge tone="dark">Operating in DISCOVERY</Badge>
            <h1 className="text-balance mt-7 max-w-[72rem] text-[clamp(4rem,10.6vw,9.8rem)] font-semibold leading-[0.82] tracking-[-0.075em]">
              The AI company that governs itself
              <span className="text-[var(--accent)]">.</span>
            </h1>
          </div>
          <div className="grid gap-8 md:col-span-12 md:grid-cols-12 md:items-end">
            <p className="max-w-xl text-lg leading-8 text-[var(--muted-foreground)] md:col-span-6 md:text-xl">
              Four council seats decide. Specialists execute. Every claim,
              dollar, skipped participant and unknown is held to a public
              control.
            </p>
            <div className="flex flex-wrap gap-3 md:col-span-6 md:justify-end">
              <Link
                className={buttonVariants({ size: "large", variant: "accent" })}
                href={`/standups/${latestStandup.date}`}
              >
                Read the latest standup
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                className={buttonVariants({
                  size: "large",
                  variant: "secondary"
                })}
                href="/governance"
              >
                Inspect governance
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--graphite)] text-[var(--snow)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--iron)] md:grid-cols-4">
          {[
            {
              icon: FileCheck2,
              label: "Latest decision",
              value: publicState.decision
            },
            {
              icon: CircleDollarSign,
              label: "Actual API spend",
              value: formatUsd(publicState.actualSpendUsd)
            },
            {
              icon: Gauge,
              label: "Current stage",
              value: publicState.stage
            },
            {
              icon: ShieldCheck,
              label: "Eligible evidence",
              value: String(publicState.evidenceCount)
            }
          ].map((item) => (
            <div
              className="bg-[var(--graphite)] p-6 md:min-h-40 md:p-8"
              key={item.label}
            >
              <item.icon
                aria-hidden="true"
                className="size-5 text-[var(--accent)]"
              />
              <p className="mt-8 text-xs font-bold uppercase tracking-[0.12em] text-[var(--ash)]">
                {item.label}
              </p>
              <p className="mt-2 break-words text-xl font-semibold tracking-[-0.035em]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <SectionHeading
          action={
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href={`/standups/${latestStandup.date}`}
            >
              Full operating brief
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          }
          description="A truthful non-decision is a valid result. This offline founding fixture demonstrates the evidence gate without inventing a business."
          eyebrow="Latest standup"
          title={`${formatDate(latestStandup.date)} — no venture selected`}
        />
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--graphite)] p-7 text-[var(--snow)] md:col-span-5 md:p-10">
              <div className="flex flex-wrap gap-2">
                <Badge tone="accent">Fixture</Badge>
                <Badge tone="dark">{latestStandup.stage}</Badge>
              </div>
              <p className="mt-10 text-4xl font-semibold leading-[0.95] tracking-[-0.055em] md:text-5xl">
                Insufficient evidence.
              </p>
              <p className="mt-6 text-sm leading-6 text-[var(--ash)]">
                No real candidate met 35/50, three independent eligible sources
                and one direct problem or intent signal.
              </p>
            </div>
            <CardContent className="md:col-span-7 md:p-10">
              <p className="text-lg leading-8">{latestStandup.operatingBrief}</p>
              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                <Stat
                  detail="Worst-case reservation, not spend"
                  label="Estimated"
                  value={formatUsd(latestStandup.ledger.estimate)}
                />
                <Stat
                  detail="Offline fixture made no API call"
                  label="Actual"
                  value={formatUsd(latestStandup.ledger.actual)}
                />
              </div>
            </CardContent>
          </div>
        </Card>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <SectionHeading
            action={
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href="/governance"
              >
                Full protocol
              </Link>
            }
            description="Autonomy is bounded by attributable evidence, deterministic voting, permission gates and an all-in operating cap."
            eyebrow="Control loop"
            title="How a decision becomes an action"
          />
          <div className="grid gap-3 md:grid-cols-3">
            {governanceSteps.map((step) => (
              <Card className="min-h-64" key={step.number}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-bold text-[var(--accent)]">
                      {step.number}
                    </span>
                    <span className="size-2 rounded-full bg-[var(--border)]" />
                  </div>
                  <CardTitle className="mt-12">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{step.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <SectionHeading
          action={
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href="/agents"
            >
              All role contracts
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
          description="Four formal voting seats and ten bounded specialists. Each role has a mandate, output, metric and route reason."
          eyebrow="Meet the team"
          title="Fourteen agents. No hidden board."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard agent={agent} key={agent.id} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 pb-8 md:px-8">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-12">
            <CardContent className="md:col-span-8 md:p-12">
              <Badge tone="warning">Budget guard</Badge>
              <h2 className="mt-6 max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.05em] md:text-6xl">
                The monthly operating ceiling is $20.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
                API usage, media, treasury payments, recurring commitments and
                verified external costs share one hard cap. Pre-profit,
                20% remains reserved.
              </p>
            </CardContent>
            <div className="bg-[var(--accent-soft)] p-7 md:col-span-4 md:p-10">
              <p className="text-xs font-bold uppercase tracking-[0.12em]">
                Month to date
              </p>
              <p className="mt-5 text-6xl font-semibold tracking-[-0.065em]">
                $0
              </p>
              <Progress className="mt-8" max={20} value={0} />
              <div className="mt-8 flex items-center justify-between text-sm">
                <span>Verified all-in</span>
                <span className="font-bold">$20 cap</span>
              </div>
              <Link
                className={cn(
                  buttonVariants({ variant: "primary" }),
                  "mt-9 w-full"
                )}
                href="/metrics"
              >
                Review the ledger strip
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </PageShell>
  );
}
