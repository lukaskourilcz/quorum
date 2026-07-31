import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleHelp, CircleX } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { getCaughtUpPublicSnapshot } from "@/lib/caught-up-records";
import { formatDate, formatUsd } from "@/lib/utils";

function CheckState({ status }: { status: "passed" | "failed" | "not-recorded" }) {
  if (status === "passed") return <span className="flex items-center gap-2 text-[var(--success-soft)]"><CheckCircle2 aria-hidden="true" className="size-4" /> Passed</span>;
  if (status === "failed") return <span className="flex items-center gap-2 text-[var(--destructive-soft)]"><CircleX aria-hidden="true" className="size-4" /> Failed</span>;
  return <span className="flex items-center gap-2 text-[var(--fog)]"><CircleHelp aria-hidden="true" className="size-4" /> Not recorded</span>;
}

export async function CaughtUpVenturePage() {
  const snapshot = await getCaughtUpPublicSnapshot();
  const latestDelivery = snapshot.deliveries[0];
  return (
    <PageShell>
      <PageIntro
        eyebrow="Venture 001 / Validation"
        title="Caught Up"
        description="One consequential AI story a day—or an honest no-edition record. BoardlessAI owns the sources, edition room, delivery handoff and product ledger."
        aside={<div className="rounded-[var(--radius-card)] border border-[var(--magenta-spark)] bg-[var(--card)] p-8"><Badge tone="accent">Active venture</Badge><p className="mt-5 text-5xl font-semibold tracking-[-0.06em]">001</p><p className="mt-3 text-sm text-[var(--fog)]">Stage · VALIDATION</p></div>}
      />

      <section className="bg-[var(--graphite)] text-[var(--paper)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
          <SectionHeading eyebrow="RELAY release record" title="Delivered → built → live" description="Only a committed check can turn a release step green. Missing checks render as not recorded, never as success." />
          {latestDelivery ? (
            <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--iron)] md:grid-cols-3">
              <div className="bg-[var(--graphite)] p-7"><p className="mono-label text-[var(--fog)]">01 / Delivered</p><p className="mt-5 flex items-center gap-2 text-lg font-semibold text-[var(--success-soft)]"><CheckCircle2 aria-hidden="true" className="size-5" /> Passed</p><p className="mt-3 text-sm text-[var(--fog)]">{formatDate(latestDelivery.date)}{latestDelivery.targetCommit ? ` · ${latestDelivery.targetCommit.slice(0, 8)}` : ""}</p></div>
              <div className="bg-[var(--graphite)] p-7"><p className="mono-label text-[var(--fog)]">02 / Built</p><p className="mt-5 text-lg font-semibold"><CheckState status={latestDelivery.built.status} /></p><p className="mt-3 text-sm text-[var(--fog)]">Consumer build check</p></div>
              <div className="bg-[var(--graphite)] p-7"><p className="mono-label text-[var(--fog)]">03 / Live</p><p className="mt-5 text-lg font-semibold"><CheckState status={latestDelivery.live.status} /></p><p className="mt-3 text-sm text-[var(--fog)]">Public sentinel check</p></div>
            </div>
          ) : <div className="rounded-[var(--radius-card)] border border-[var(--iron)] p-8"><Badge>No receipt</Badge><p className="mt-5 text-2xl font-semibold">No live delivery is recorded.</p><p className="mt-3 text-[var(--fog)]">The pipeline remains visible without manufacturing a release state.</p></div>}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-28">
        <SectionHeading eyebrow="Edition board" title="The last seven decisions" description="The selected story or no-edition reason and the actual production cost, when recorded." />
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 md:p-8">
          <Table><thead><tr><TableHead>Date</TableHead><TableHead>Story / reason</TableHead><TableHead>Cost</TableHead><TableHead>Room</TableHead></tr></thead><tbody>
            {snapshot.editions.map((edition) => <tr key={edition.id}><TableCell><time dateTime={edition.date}>{formatDate(edition.date)}</time>{edition.fixture ? <Badge className="mt-2">Fixture</Badge> : null}</TableCell><TableCell><p className="max-w-xl leading-6">{edition.decision.summary}</p></TableCell><TableCell>{edition.ledger.actual === null ? "Not recorded" : formatUsd(edition.ledger.actual)}</TableCell><TableCell><Link className={buttonVariants({ size: "small", variant: "secondary" })} href={`/meetings/${edition.id}`}>Read <ArrowRight aria-hidden="true" className="size-4" /></Link></TableCell></tr>)}
            {snapshot.editions.length === 0 ? <tr><TableCell colSpan={4}>No edition-room record is committed yet.</TableCell></tr> : null}
          </tbody></Table>
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-28">
          <SectionHeading eyebrow="Two-board accountability" title="Every idea, both verdicts" description="The venture morning board originates the handoff; the Caught Up product board records the binding product verdict." action={<Link className={buttonVariants({ variant: "secondary" })} href="/ideas">Full idea ledger</Link>} />
          {snapshot.ideas.length ? <div className="grid gap-4">{snapshot.ideas.map((idea) => <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-7" key={idea.id}><div className="flex flex-wrap items-center gap-2"><Badge>{idea.status}</Badge><span className="font-mono text-[0.625rem] text-[var(--fog)]">{idea.id}</span></div><h3 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">{idea.title}</h3><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fog)]">{idea.summary}</p><div className="mt-7 grid gap-3 md:grid-cols-2"><div className="border-l-2 border-[var(--accent)] pl-4"><p className="mono-label text-[0.625rem] text-[var(--accent)]">Venture morning board</p><p className="mt-2 text-sm leading-6">{idea.ventureVerdict?.decision.summary ?? "No committed morning-board verdict."}</p>{idea.ventureVerdict ? <Link className="mt-2 inline-block text-sm text-[var(--accent)] underline underline-offset-4" href={`/standups/${idea.ventureVerdict.id}/room`}>Open room</Link> : null}</div><div className="border-l-2 border-[var(--magenta-spark)] pl-4"><p className="mono-label text-[0.625rem] text-[var(--magenta-spark)]">Caught Up product board</p><p className="mt-2 text-sm leading-6">{idea.productVerdict?.verdict.reason ?? "No committed product-board verdict."}</p>{idea.productVerdict ? <Link className="mt-2 inline-block text-sm text-[var(--magenta-spark)] underline underline-offset-4" href={`/meetings/${idea.productVerdict.meeting.id}`}>Open room</Link> : null}</div></div></article>)}</div> : <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-8"><Badge>No ideas</Badge><p className="mt-4 text-xl font-semibold">No live idea has reached both boards yet.</p></div>}
        </div>
      </section>
    </PageShell>
  );
}
