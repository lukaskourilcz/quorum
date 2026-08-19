import {
  AdminEntityBadge,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import { Panel } from "./panel";
import type { AdminBooksofhistorySnapshot, AdminBhShortlistEntry } from "@/lib/admin-booksofhistory";

const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function words(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, "$1 $2").replaceAll("-", " ").toLowerCase();
}

function cycleNumber(cycleId: string): string {
  const suffix = cycleId.split("-").at(-1) ?? cycleId;
  return /^\d+$/u.test(suffix) ? String(Number(suffix)) : cycleId;
}

export function booksofhistoryCycleLine(snapshot: AdminBooksofhistorySnapshot): string | null {
  const cycle = snapshot.cycle;
  if (!cycle) return null;
  const total = cycle.candidates.length;
  const number = cycleNumber(cycle.cycleId);
  if (cycle.phase === "selection") return `Day A of cycle ${number}: selecting ${total} ${total === 1 ? "candidate" : "candidates"}.`;
  if (cycle.phase === "research") {
    const researched = cycle.candidates.filter((candidate) => snapshot.dossiers.some((dossier) => dossier.bookId === candidate.candidateId)).length;
    return `Day B of cycle ${number}: researching ${researched} of ${total}.`;
  }
  return cycle.chosenStoryId ? `Day C of cycle ${number}: preparing story ${cycle.chosenStoryId}.` : `Day C of cycle ${number}: choosing one verified story.`;
}

function factorRows(entry: AdminBhShortlistEntry): Array<{ label: string; value: string; note: string }> {
  const factors = entry.factors;
  return [
    { label: "Editorial priors", value: decimal.format(factors.priors.score), note: Object.entries(factors.priors.values).map(([name, value]) => `${words(name)} ${decimal.format(value)} × ${percent.format(factors.priors.weights[name] ?? 0)}`).join(" · ") },
    { label: "Anniversary", value: `×${decimal.format(factors.anniversary.multiplier)}`, note: factors.anniversary.events.length ? factors.anniversary.events.map((event) => `${words(event.kind)} ${event.milestone} years${event.daysAway === null ? "" : ` in ${event.daysAway} days`}`).join(" · ") : "No dated anniversary inside the 60-day radar." },
    { label: "Trend crossover", value: `×${decimal.format(factors.trendCrossover.multiplier)}`, note: `${factors.trendCrossover.signalCount} matched signals · strength ${percent.format(factors.trendCrossover.strength)}` },
    { label: "Diversity pressure", value: `×${decimal.format(factors.diversityPressure.multiplier)}`, note: Object.entries(factors.diversityPressure.byDimension).map(([name, value]) => `${words(name)} ${percent.format(value)}`).join(" · ") },
    { label: "Lane performance", value: `×${decimal.format(factors.lanePerformance.multiplier)}`, note: `Czech ×${decimal.format(factors.lanePerformance.lanes.cs)} · English ×${decimal.format(factors.lanePerformance.lanes.en)}` },
    { label: "Dossier shelf", value: `×${decimal.format(factors.shelfBonus.multiplier)}`, note: factors.shelfBonus.eligibleStoryCount ? `${factors.shelfBonus.eligibleStoryCount} unused verified ${factors.shelfBonus.eligibleStoryCount === 1 ? "story" : "stories"}; best score ${factors.shelfBonus.highestScore ?? "not recorded"}` : "No eligible unused story on the shelf." },
  ];
}

function RankedCandidate({ entry }: { entry: AdminBhShortlistEntry }) {
  return (
    <article className="min-w-0 border-l-2 border-[var(--admin-section-accent)] pl-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Rank {entry.rank}</p><h3 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{entry.title}</h3><p className="m-0 mt-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{entry.author}</p></div>
        <div className="text-right"><p className="admin-tabular m-0 text-[length:var(--admin-type-metric)] font-semibold">{decimal.format(entry.totalScore)}</p><p className="m-0 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">opportunity score</p></div>
      </div>
      {entry.culturalMoment ? <AdminStatusBadge className="mt-2" tone="warning">Cultural moment</AdminStatusBadge> : null}
      <dl className="mt-3 grid gap-px overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-border)] md:grid-cols-2">
        {factorRows(entry).map((factor) => (
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 bg-[var(--admin-surface-secondary)] p-3" key={factor.label}>
            <dt className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{factor.label}</dt>
            <dd className="admin-tabular m-0 text-[length:var(--admin-type-control)] font-semibold">{factor.value}</dd>
            <dd className="col-span-2 m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{factor.note}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function BooksofhistoryShortlistPanel({ snapshot }: { snapshot: AdminBooksofhistorySnapshot }) {
  const radar = (snapshot.shortlist?.entries ?? []).flatMap((entry) => entry.factors.anniversary.events.map((event) => ({ ...event, bookId: entry.bookId, title: entry.title }))).filter((event) => event.daysAway !== null && event.daysAway <= 60).sort((left, right) => left.daysAway! - right.daysAway!);
  const cycleLine = booksofhistoryCycleLine(snapshot);

  return (
    <div className="grid gap-4">
      <Panel note={snapshot.cycle?.updatedAt ?? "No cycle record"} title="Cycle">
        {cycleLine ? <p className="m-0 text-[length:var(--admin-type-section)] font-semibold">{cycleLine}</p> : <AdminStateMessage state="initial-empty" title="No cycle has been recorded yet." />}
        {snapshot.cycle?.stretch.count ? <p className="m-0 mt-2 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Stretch {snapshot.cycle.stretch.count}: {snapshot.cycle.stretch.reason ?? "reason not recorded"}{snapshot.cycle.stretch.nextAttemptOn ? ` · next attempt ${snapshot.cycle.stretch.nextAttemptOn}` : ""}</p> : null}
      </Panel>
      <Panel note={snapshot.shortlist ? `${snapshot.shortlist.date} · ${snapshot.shortlist.entries.length} ranked` : undefined} title="Today’s shortlist">
        {snapshot.shortlist ? <div className="grid gap-4">{snapshot.shortlist.entries.map((entry) => <RankedCandidate entry={entry} key={entry.bookId} />)}</div> : <AdminStateMessage state="initial-empty" title="No valid shortlist is stored yet." />}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel note={snapshot.brief?.meetingId ?? "No meeting decision"} title="Meeting decisions and briefs">
          {snapshot.brief ? <ol className="m-0 grid list-none divide-y divide-[var(--admin-border)] p-0">{snapshot.brief.selections.map((selection) => { const candidate = snapshot.shortlist?.entries.find((entry) => entry.bookId === selection.bookId); return <li className="grid gap-2 py-3 first:pt-0 last:pb-0" key={selection.bookId}><div className="flex items-center justify-between gap-3"><h3 className="m-0 font-semibold">{candidate?.title ?? selection.bookId}</h3><AdminEntityBadge>Rank {selection.shortlistRank}</AdminEntityBadge></div><p className="m-0 text-[length:var(--admin-type-control)] leading-5">{selection.selectionReason}</p><p className="m-0 border-l-2 border-[var(--admin-section-accent)] pl-3 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{selection.objective}</p></li>; })}</ol> : <AdminStateMessage state="initial-empty" title="No valid meeting brief is stored yet." />}
        </Panel>
        <Panel note="Next 60 days" title="Anniversary radar">
          {radar.length ? <ol className="m-0 grid list-none divide-y divide-[var(--admin-border)] p-0">{radar.map((event) => <li className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0" key={`${event.bookId}-${event.kind}-${event.milestone}`}><div><p className="m-0 font-semibold">{event.title}</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{words(event.kind)} · {event.milestone} years</p></div><AdminStatusBadge tone="information">In {event.daysAway} days</AdminStatusBadge></li>)}</ol> : <AdminStateMessage state="initial-empty" title="No dated book or author anniversaries fall inside the next 60 days." />}
        </Panel>
      </div>
    </div>
  );
}
