import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleMinus, Timer } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
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
import { standups } from "@/data/fixtures";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "Bounded BoardlessAI decision rooms with participant reasons, caps, positions and public outcomes.",
  title: "Boardroom"
};

const standup = standups[0]!;

export default function BoardroomPage() {
  const selected = standup.participants.filter((item) => item.participated);
  const skipped = standup.participants.filter((item) => !item.participated);
  return (
    <PageShell>
      <PageIntro
        aside={
          <Card className="bg-[var(--graphite)] text-[var(--snow)]">
            <CardContent>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ash)]">
                Hard room caps
              </p>
              <p className="mt-5 text-3xl font-semibold">2 rounds</p>
              <p className="mt-2 text-sm text-[var(--ash)]">
                6 turns · 12k tokens · 30 min TTL
              </p>
            </CardContent>
          </Card>
        }
        description="A room is a minimal context packet, not an open-ended group chat. Every participant has a reason; every skipped role is visible."
        eyebrow="Decision rooms"
        title="The boardroom"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--graphite)] p-7 text-[var(--snow)] md:col-span-4 md:p-10">
              <div className="flex flex-wrap gap-2">
                <Badge tone="accent">Closed fixture</Badge>
                <Badge tone="dark">Council</Badge>
              </div>
              <p className="mt-10 text-xs font-bold uppercase tracking-[0.12em] text-[var(--ash)]">
                ROOM-20260723-FOUNDING
              </p>
              <h2 className="mt-4 text-4xl font-semibold leading-[0.95] tracking-[-0.055em]">
                Select a venture or return NO_ACTION
              </h2>
              <div className="mt-10 flex items-center gap-2 text-sm text-[var(--ash)]">
                <Timer aria-hidden="true" className="size-4" />
                Deterministic offline cycle
              </div>
            </div>
            <CardContent className="md:col-span-8 md:p-10">
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                    Owner
                  </p>
                  <p className="mt-3 text-xl font-semibold">VIZE</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                    Budget impact
                  </p>
                  <p className="mt-3 text-xl font-semibold">
                    {formatUsd(standup.ledger.estimate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                    Outcome
                  </p>
                  <p className="mt-3 text-xl font-semibold">NO_ACTION</p>
                </div>
              </div>
              <Separator className="my-8" />
              <CardTitle>Objective</CardTitle>
              <CardDescription>
                Choose at most one opportunity that passes all evidence, score,
                feasibility and first-experiment gates. Otherwise explicitly
                choose NO_ACTION.
              </CardDescription>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  className={buttonVariants({ variant: "primary" })}
                  href={`/standups/${standup.date}`}
                >
                  Open full record
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <Link
                  className={buttonVariants({ variant: "secondary" })}
                  href="/governance"
                >
                  Read the protocol
                </Link>
              </div>
            </CardContent>
          </div>
        </Card>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-12 px-5 py-20 md:grid-cols-12 md:px-8 md:py-24">
          <div className="md:col-span-4">
            <Badge>Roster</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">
              Routed with reasons
            </h2>
            <p className="mt-5 leading-7 text-[var(--muted-foreground)]">
              Council seats and LEDGER are required by the daily-standup preset.
              Specialists enter only when a topic or control rule needs them.
            </p>
          </div>
          <div className="grid gap-4 md:col-span-8 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Selected · {selected.length}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {selected.map((participant) => (
                  <div className="flex gap-3" key={participant.agent}>
                    <CircleCheck
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-[var(--success)]"
                    />
                    <div>
                      <p className="text-sm font-bold">{participant.agent}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                        {participant.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Skipped · {skipped.length}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {skipped.map((participant) => (
                  <div className="flex gap-3" key={participant.agent}>
                    <CircleMinus
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-[var(--muted-foreground)]"
                    />
                    <div>
                      <p className="text-sm font-bold">{participant.agent}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                        {participant.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Minimal packet",
              text: "Objective, evidence references, risk tags, cost, owner and required decision."
            },
            {
              step: "02",
              title: "Bounded positions",
              text: "Brief summaries and evidence references; no private chain-of-thought is published."
            },
            {
              step: "03",
              title: "Closed memo",
              text: "Outcome, owner, evidence, actual cost and latency become the public projection."
            }
          ].map((item) => (
            <Card key={item.step}>
              <CardContent>
                <p className="text-sm font-bold text-[var(--accent)]">
                  {item.step}
                </p>
                <h3 className="mt-10 text-2xl font-semibold tracking-[-0.04em]">
                  {item.title}
                </h3>
                <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                  {item.text}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
