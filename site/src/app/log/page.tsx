import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { publicAgentText } from "@/components/agent-language";
import { PageShell } from "@/components/page-shell";
import { getPublicLogEntries } from "@/lib/public-log";
import { formatClock, formatDate, formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "A dated public list of BoardlessAI changes, decisions and costs.",
  title: "Updates"
};

export default async function LogPage() {
  const entries = await getPublicLogEntries();
  const totalActual = entries.reduce((total, entry) => total + (entry.cost ?? 0), 0);
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="flex items-center gap-2.5 rounded-[0.875rem] border border-[var(--slate)] bg-[var(--card)] p-5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--ash)]">
            <span className="status-pulse size-1.5 rounded-full bg-[var(--success)]" />
            Permanent public history
          </div>
        }
        description="A dated list of important events. Secrets, private model reasoning and private approval details never appear here."
        eyebrow="Change history"
        title="Public updates"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-24">
        <div className="mb-6 flex items-baseline justify-between gap-6">
          <h2 className="text-[1.375rem] font-semibold tracking-[-0.035em]">
            Latest events
          </h2>
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--fog)]">
            {entries.length} events / Prague time
          </span>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
          {entries.map((entry, index) => {
            const occurredAt = new Date(entry.at);
            return (
              <article
                className="grid gap-5 border-b border-[var(--border)] px-6 py-6 transition-colors hover:bg-[var(--surface-raised)] md:grid-cols-12 md:gap-6 md:px-8"
                key={entry.id}
              >
                <div className="md:col-span-2">
                  <p className="font-mono text-[0.71875rem] tracking-[0.06em]">
                    {formatClock(occurredAt)}
                  </p>
                  <p className="mt-1.5 font-mono text-[0.65625rem] uppercase tracking-[0.08em] text-[var(--fog)]">
                    {formatDate(occurredAt)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <span
                    className={`inline-block rounded-full border border-[var(--slate)] px-3 py-1 font-mono text-[0.625rem] uppercase tracking-[0.14em] ${
                      index === 0
                        ? "text-[var(--accent)]"
                        : "text-[var(--ash)]"
                    }`}
                  >
                    {publicAgentText(entry.type)}
                  </span>
                </div>
                <div className="min-w-0 md:col-span-6">
                  {entry.href ? (
                    <h3 className="break-words text-[1.1875rem] font-semibold tracking-[-0.03em]">
                      <Link className="underline-offset-4 hover:underline" href={entry.href}>{publicAgentText(entry.title)}</Link>
                    </h3>
                  ) : (
                    <h3 className="break-words text-[1.1875rem] font-semibold tracking-[-0.03em]">{publicAgentText(entry.title)}</h3>
                  )}
                  <p className="mt-2 break-words text-sm leading-6 text-[var(--fog)]">
                    {publicAgentText(entry.detail)}
                  </p>
                </div>
                <div className="md:col-span-2 md:text-right">
                  <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                    Actual cost
                  </p>
                  <p className="mt-2 text-lg font-semibold tabular-nums">
                    {entry.cost === null ? "Not recorded" : formatUsd(entry.cost)}
                  </p>
                </div>
              </article>
            );
          })}
          <div className="flex flex-col gap-2 px-8 py-5 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)] sm:flex-row sm:items-center sm:justify-between">
            <span>End of updates</span>
            <span>Total real cost {formatUsd(totalActual)}</span>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
