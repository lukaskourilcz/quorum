import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { getPublicIdeas } from "@/lib/idea-ledger";
import { ideaStatuses, publicMeetingHref, type PublicIdeaStatus } from "@/lib/idea-ledger-model";
import { formatDate } from "@/lib/utils";
import { getPublicStandups } from "@/lib/standup-records";

export const metadata: Metadata = {
  description: "The append-only public ledger for every Caught Up product idea and board verdict.",
  title: "Idea ledger"
};

function tone(status: PublicIdeaStatus): "neutral" | "accent" | "success" | "warning" | "danger" {
  if (status === "accepted" || status === "shipped" || status === "revived") return "success";
  if (status === "vetoed" || status === "killed") return "danger";
  if (status === "deferred" || status === "superseded") return "warning";
  if (status === "in_progress") return "accent";
  return "neutral";
}

export default async function IdeasPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const selected = ideaStatuses.includes(status as PublicIdeaStatus) ? status as PublicIdeaStatus : null;
  const [ideas, standups] = await Promise.all([getPublicIdeas(), getPublicStandups()]);
  const visible = selected ? ideas.filter((idea) => idea.status === selected) : ideas;
  return (
    <PageShell>
      <PageIntro
        eyebrow="VAULT / append-only memory"
        title="The idea ledger"
        description="Every Caught Up product proposal keeps its origin, status history, duplicate links and revival evidence. A prior failure remains evidence."
        aside={<div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-8"><p className="mono-label text-[0.65625rem] text-[var(--fog)]">Current ideas</p><p className="mt-4 text-7xl font-semibold tracking-[-0.07em]">{ideas.length}</p><p className="mt-3 text-sm text-[var(--fog)]">Collapsed from append-only snapshots</p></div>}
      />
      <section className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
        <div aria-label="Filter ideas by status" className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ size: "small", variant: selected ? "secondary" : "accent" })} href="/ideas" scroll={false}>All</Link>
          {ideaStatuses.map((ideaStatus) => (
            <Link className={buttonVariants({ size: "small", variant: selected === ideaStatus ? "accent" : "secondary" })} href={`/ideas?status=${ideaStatus}`} key={ideaStatus} scroll={false}>{ideaStatus.replaceAll("_", " ")}</Link>
          ))}
        </div>

        {visible.length ? (
          <div className="mt-10 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 md:p-8">
            <Table>
              <thead><tr><TableHead>Idea</TableHead><TableHead>Status</TableHead><TableHead>Origin</TableHead><TableHead>Verdict history</TableHead><TableHead>Links</TableHead></tr></thead>
              <tbody>
                {visible.map((idea) => {
                  const originHref = publicMeetingHref(idea.origin.meetingRef, standups);
                  return (
                    <tr id={idea.id} key={idea.id}>
                      <TableCell><p className="font-semibold">{idea.title}</p><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--fog)]">{idea.summary}</p><p className="mt-2 font-mono text-[0.625rem] text-[var(--fog)]">{idea.id}</p></TableCell>
                      <TableCell><Badge tone={tone(idea.status)}>{idea.status.replaceAll("_", " ")}</Badge></TableCell>
                      <TableCell>{originHref ? <Link className="text-[var(--accent)] underline underline-offset-4" href={originHref}>{idea.origin.agent} · room</Link> : <span>{idea.origin.agent}</span>}</TableCell>
                      <TableCell><ol className="grid min-w-60 gap-3">{idea.statusHistory.map((event, index) => { const href = publicMeetingHref(event.meetingRef, standups); return <li className="border-l-2 border-[var(--border)] pl-3" key={`${event.at}-${index}`}><div className="flex flex-wrap items-center gap-2"><Badge tone={tone(event.status)}>{event.status}</Badge><time className="font-mono text-[0.625rem] text-[var(--fog)]" dateTime={event.at}>{formatDate(event.at.slice(0, 10))}</time></div><p className="mt-2 text-xs leading-5 text-[var(--fog)]">{event.reason}</p>{href ? <Link className="mt-1 inline-block text-xs text-[var(--accent)] underline underline-offset-4" href={href}>Verdict room</Link> : null}</li>; })}</ol></TableCell>
                      <TableCell><div className="grid gap-2">{idea.revival ? <Link className="text-sm text-[var(--accent)] underline underline-offset-4" href={`/ideas#${idea.revival.from}`}>Revives {idea.revival.from}</Link> : null}{idea.supersededBy ? <Link className="text-sm text-[var(--accent)] underline underline-offset-4" href={`/ideas#${idea.supersededBy}`}>Superseded by {idea.supersededBy}</Link> : null}{idea.similarTo.map((link) => <Link className="text-sm text-[var(--fog)] underline underline-offset-4" href={`/ideas#${link.id}`} key={`${link.id}-${link.verdict}`}>{link.verdict.replace("_", " ")} · {Math.round(link.score * 100)}%</Link>)}{!idea.revival && !idea.supersededBy && idea.similarTo.length === 0 ? <span className="text-sm text-[var(--fog)]">No linked predecessor</span> : null}</div></TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="mt-10 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-10"><Badge>No entries</Badge><h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">The public ledger is empty.</h2><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--fog)]">No live SPARK proposal has been committed yet{selected ? ` with status ${selected}` : ""}. The page does not invent a demonstration row.</p></div>
        )}
      </section>
    </PageShell>
  );
}
