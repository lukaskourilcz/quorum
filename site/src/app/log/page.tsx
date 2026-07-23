import type { Metadata } from "next";
import { Activity, ArrowDown } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { logEntries } from "@/data/fixtures";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "Chronological public change, decision, routing and cost log for BoardlessAI.",
  title: "Public log"
};

export default function LogPage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="flex items-center gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-5 text-sm">
            <Activity
              aria-hidden="true"
              className="size-5 text-[var(--accent)]"
            />
            Append-only public projection
          </div>
        }
        description="A chronological projection of meaningful system events. Secrets, private reasoning and internal approval material never enter this view."
        eyebrow="Audit trail"
        title="The public log"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <Card>
          <CardContent>
            {logEntries.map((entry, index) => (
              <div
                className="grid gap-4 border-b border-[var(--border)] py-7 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-12 md:items-start"
                key={entry.at}
              >
                <div className="md:col-span-2">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Prague"
                    }).format(new Date(entry.at))}
                  </p>
                </div>
                <div className="md:col-span-1">
                  <span className="grid size-9 place-items-center rounded-[var(--radius-button)] bg-[var(--secondary)]">
                    {index === 0 ? (
                      <Activity aria-hidden="true" className="size-4" />
                    ) : (
                      <ArrowDown aria-hidden="true" className="size-4" />
                    )}
                  </span>
                </div>
                <div className="md:col-span-6">
                  <Badge>{entry.type}</Badge>
                  <h2 className="mt-3 text-xl font-semibold tracking-[-0.035em]">
                    {entry.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    {entry.detail}
                  </p>
                </div>
                <div className="md:col-span-3 md:text-right">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                    Actual cost
                  </p>
                  <p className="mt-2 font-semibold">{formatUsd(entry.cost)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
