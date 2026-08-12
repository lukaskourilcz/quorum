import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { AdminBooksofhistorySnapshot, AdminBhShortlistEntry } from "@/lib/admin-booksofhistory";
import { Panel } from "./panel";

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
    const researched = cycle.candidates.filter((candidate) =>
      snapshot.dossiers.some((dossier) => dossier.bookId === candidate.candidateId)).length;
    return `Day B of cycle ${number}: researching ${researched} of ${total}.`;
  }
  return cycle.chosenStoryId
    ? `Day C of cycle ${number}: preparing story ${cycle.chosenStoryId}.`
    : `Day C of cycle ${number}: choosing one verified story.`;
}

function factorRows(entry: AdminBhShortlistEntry): Array<{ label: string; value: string; note: string }> {
  const factors = entry.factors;
  return [
    {
      label: "Editorial priors",
      value: decimal.format(factors.priors.score),
      note: Object.entries(factors.priors.values)
        .map(([name, value]) => `${words(name)} ${decimal.format(value)} × ${percent.format(factors.priors.weights[name] ?? 0)}`)
        .join(" · ")
    },
    {
      label: "Anniversary",
      value: `×${decimal.format(factors.anniversary.multiplier)}`,
      note: factors.anniversary.events.length
        ? factors.anniversary.events.map((event) => `${words(event.kind)} ${event.milestone} years${event.daysAway === null ? "" : ` in ${event.daysAway} days`}`).join(" · ")
        : "No dated anniversary inside the 60-day radar."
    },
    {
      label: "Trend crossover",
      value: `×${decimal.format(factors.trendCrossover.multiplier)}`,
      note: `${factors.trendCrossover.signalCount} matched signals · strength ${percent.format(factors.trendCrossover.strength)}`
    },
    {
      label: "Diversity pressure",
      value: `×${decimal.format(factors.diversityPressure.multiplier)}`,
      note: Object.entries(factors.diversityPressure.byDimension)
        .map(([name, value]) => `${words(name)} ${percent.format(value)}`)
        .join(" · ")
    },
    {
      label: "Lane performance",
      value: `×${decimal.format(factors.lanePerformance.multiplier)}`,
      note: `Czech ×${decimal.format(factors.lanePerformance.lanes.cs)} · English ×${decimal.format(factors.lanePerformance.lanes.en)}`
    },
    {
      label: "Dossier shelf",
      value: `×${decimal.format(factors.shelfBonus.multiplier)}`,
      note: factors.shelfBonus.eligibleStoryCount
        ? `${factors.shelfBonus.eligibleStoryCount} unused verified ${factors.shelfBonus.eligibleStoryCount === 1 ? "story" : "stories"}; best score ${factors.shelfBonus.highestScore ?? "not recorded"}`
        : "No eligible unused story on the shelf."
    }
  ];
}

function RankedCandidate({ entry }: { entry: AdminBhShortlistEntry }) {
  return (
    <article className="rounded-[10px] border border-[#2d2d33] bg-[#101013] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Rank {entry.rank}</p>
          <h3 className="mt-1 text-xl font-semibold">{entry.title}</h3>
          <p className="mt-1 text-sm text-[#a1a1aa]">{entry.author}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{decimal.format(entry.totalScore)}</p>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">opportunity score</p>
        </div>
      </div>
      {entry.culturalMoment ? <Badge className="mt-3" tone="warning">Cultural moment</Badge> : null}
      <div className="mt-4 grid gap-px overflow-hidden rounded-[8px] border border-[#26262b] bg-[#26262b] md:grid-cols-2">
        {factorRows(entry).map((factor) => (
          <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 bg-[#0c0c0f] p-3" key={factor.label}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#94949c]">{factor.label}</dt>
            <dd className="font-mono text-xs font-semibold tabular-nums text-[#f4ecd8]">{factor.value}</dd>
            <dd className="col-span-2 mt-2 text-xs leading-5 text-[#a1a1aa]">{factor.note}</dd>
          </dl>
        ))}
      </div>
    </article>
  );
}

export function BooksofhistoryShortlistPanel({ snapshot }: { snapshot: AdminBooksofhistorySnapshot }) {
  const radar = (snapshot.shortlist?.entries ?? [])
    .flatMap((entry) => entry.factors.anniversary.events.map((event) => ({ ...event, bookId: entry.bookId, title: entry.title })))
    .filter((event) => event.daysAway !== null && event.daysAway <= 60)
    .sort((left, right) => left.daysAway! - right.daysAway!);
  const cycleLine = booksofhistoryCycleLine(snapshot);

  return (
    <div className="grid gap-4">
      <Panel note={snapshot.cycle?.updatedAt ?? "No cycle record"} title="Cycle">
        {cycleLine ? <p className="text-lg font-semibold">{cycleLine}</p> : <Callout>No cycle has been recorded yet.</Callout>}
        {snapshot.cycle?.stretch.count ? <p className="mt-2 text-sm text-[#a1a1aa]">Stretch {snapshot.cycle.stretch.count}: {snapshot.cycle.stretch.reason ?? "reason not recorded"}{snapshot.cycle.stretch.nextAttemptOn ? ` · next attempt ${snapshot.cycle.stretch.nextAttemptOn}` : ""}</p> : null}
      </Panel>

      <Panel note={snapshot.shortlist ? `${snapshot.shortlist.date} · ${snapshot.shortlist.entries.length} ranked` : undefined} title="Today’s shortlist">
        {snapshot.shortlist ? <div className="grid gap-4">{snapshot.shortlist.entries.map((entry) => <RankedCandidate entry={entry} key={entry.bookId} />)}</div> : <Callout>No valid shortlist is stored yet.</Callout>}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel note={snapshot.brief?.meetingId ?? "No meeting decision"} title="Meeting decisions and briefs">
          {snapshot.brief ? (
            <ol className="grid gap-3">
              {snapshot.brief.selections.map((selection) => {
                const candidate = snapshot.shortlist?.entries.find((entry) => entry.bookId === selection.bookId);
                return <li className="rounded-[8px] border border-[#26262b] bg-[#101013] p-3" key={selection.bookId}>
                  <div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{candidate?.title ?? selection.bookId}</h3><Badge>rank {selection.shortlistRank}</Badge></div>
                  <p className="mt-2 text-sm leading-6 text-[#d4d4d8]">{selection.selectionReason}</p>
                  <p className="mt-2 border-l-2 border-[#684d08] pl-3 text-sm leading-6 text-[#a1a1aa]">{selection.objective}</p>
                </li>;
              })}
            </ol>
          ) : <Callout>No valid meeting brief is stored yet.</Callout>}
        </Panel>

        <Panel note="Next 60 days" title="Anniversary radar">
          {radar.length ? <ol className="grid gap-3">{radar.map((event) => <li className="flex items-start justify-between gap-4 rounded-[8px] border border-[#26262b] bg-[#101013] p-3" key={`${event.bookId}-${event.kind}-${event.milestone}`}><div><p className="font-semibold">{event.title}</p><p className="mt-1 text-sm text-[#a1a1aa]">{words(event.kind)} · {event.milestone} years</p></div><Badge tone="accent">in {event.daysAway} days</Badge></li>)}</ol> : <Callout>No dated book or author anniversaries fall inside the next 60 days.</Callout>}
        </Panel>
      </div>
    </div>
  );
}
