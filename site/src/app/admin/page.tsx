import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Database, LockKeyhole, RefreshCw } from "lucide-react";
import { Mark } from "@/components/brand/mark";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { readAdminSnapshot } from "@/lib/admin-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  description: "Read-only BoardlessAI operating state.",
  robots: {
    follow: false,
    index: false,
    nocache: true
  },
  title: "Admin"
};

function StatePanel({ title, content }: { title: string; content: string }) {
  return (
    <Card>
      <CardContent>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-[-0.035em]">{title}</h2>
          <Badge>Read only</Badge>
        </div>
        <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-[var(--radius-button)] bg-[var(--secondary)] p-5 font-mono text-xs leading-6 text-[var(--steel)]">
          {content}
        </pre>
      </CardContent>
    </Card>
  );
}

export default async function AdminPage() {
  const state = await readAdminSnapshot();
  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex min-h-18 max-w-[var(--container)] items-center justify-between gap-5 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Mark />
            <span className="font-semibold">BoardlessAI Admin</span>
            <Badge tone="warning">Protected</Badge>
          </div>
          <Link
            className={buttonVariants({ variant: "ghost", size: "small" })}
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Public site
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-18">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <div className="flex flex-wrap gap-2">
              <Badge tone="dark">Server-side state</Badge>
              <Badge>noindex</Badge>
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] md:text-7xl">
              Operating console
              <span className="text-[var(--accent)]">.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
              A read-only projection of repository state. Mutations happen
              through reviewed workflows, never through this page.
            </p>
          </div>
          <div className="grid gap-3 md:col-span-4">
            <div className="flex items-center gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
              <LockKeyhole
                aria-hidden="true"
                className="size-4 text-[var(--accent)]"
              />
              HTTP Basic Auth · fail closed
            </div>
            <div className="flex items-center gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
              <RefreshCw
                aria-hidden="true"
                className="size-4 text-[var(--accent)]"
              />
              Snapshot {new Date(state.generatedAt).toISOString()}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Database
            aria-hidden="true"
            className="size-5 text-[var(--accent)]"
          />
          <p className="text-xs font-bold uppercase tracking-[0.12em]">
            Canonical state files
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <StatePanel content={state.inbox} title="Human approval inbox" />
          <StatePanel content={state.business} title="Business" />
          <StatePanel content={state.brand} title="Brand" />
          <StatePanel content={state.opportunities} title="Opportunities" />
          <StatePanel content={state.experiments} title="Experiments" />
          <StatePanel content={state.finance} title="Finance" />
          <StatePanel content={state.social} title="Social strategy" />
          <StatePanel content={state.budgetLedger} title="API budget ledger" />
          <StatePanel content={state.financeLedger} title="Finance ledger" />
          <StatePanel content={state.treasuryLedger} title="Treasury ledger" />
        </div>
      </section>
    </main>
  );
}
