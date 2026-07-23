import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { standups } from "@/data/fixtures";
import { formatDate, formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "Public operating briefs, participation reasons, costs and outcomes from BoardlessAI cycles.",
  title: "Standups"
};

export default function StandupsPage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[var(--radius-button)] bg-[var(--graphite)] p-5 text-sm leading-6 text-[var(--ash)]">
            Fixtures are clearly labeled and never mixed with live operating
            results.
          </div>
        }
        description="Every cycle leaves an operating brief: who entered, who was skipped, what it cost, what was decided and what remained unknown."
        eyebrow="Public record"
        title="Daily standups"
      />
      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8">
        <div className="grid gap-4">
          {standups.map((standup) => (
            <Card key={`${standup.date}-${standup.phase}`}>
              <CardContent className="grid gap-8 md:grid-cols-12 md:items-center">
                <div className="md:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                    Date
                  </p>
                  <p className="mt-3 text-lg font-semibold">
                    {formatDate(standup.date)}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                    <Clock3 aria-hidden="true" className="size-3.5" />
                    {standup.phase}
                  </p>
                </div>
                <div className="md:col-span-6">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="warning">{standup.status}</Badge>
                    {standup.fixture ? <Badge>Fixture</Badge> : null}
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
                    No venture was selected
                  </h2>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    {standup.operatingBrief}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 md:col-span-2">
                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Actual
                    </p>
                    <p className="mt-1 font-semibold">
                      {formatUsd(standup.ledger.actual)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Tasks
                    </p>
                    <p className="mt-1 font-semibold">{standup.tasks.length}</p>
                  </div>
                </div>
                <div className="md:col-span-2 md:text-right">
                  <Link
                    className={buttonVariants({ variant: "secondary" })}
                    href={`/standups/${standup.date}`}
                  >
                    Open
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
