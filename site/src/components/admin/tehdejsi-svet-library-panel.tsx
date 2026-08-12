"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminTehdejsiFact, AdminTehdejsiSnapshot } from "@/lib/admin-tehdejsi-svet";
import { formatDateTime, formatUsd } from "@/lib/utils";

const ALL = "all";
const selectClass =
  "mt-2 min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]";

function sensitivityTone(tier: number): "success" | "warning" | "danger" {
  return tier === 2 ? "danger" : tier === 1 ? "warning" : "success";
}

function factPeriod(fact: AdminTehdejsiFact): string {
  return fact.yearFrom === fact.yearTo ? String(fact.yearFrom) : `${fact.yearFrom}–${fact.yearTo}`;
}

function decadesFor(facts: readonly AdminTehdejsiFact[]): number[] {
  const decades = new Set<number>();
  for (const fact of facts) {
    for (let decade = Math.floor(fact.yearFrom / 10) * 10; decade <= fact.yearTo; decade += 10) decades.add(decade);
  }
  return [...decades].sort((left, right) => left - right);
}

function FactCard({ fact }: { fact: AdminTehdejsiFact }) {
  return (
    <Card>
      <CardContent>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{fact.id}</p>
            <h4 className="mt-2 text-lg font-semibold">{fact.place ?? (fact.country === "cz" ? "Czechia" : "Ukraine")} · {factPeriod(fact)}</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{fact.country.toUpperCase()}</Badge>
            <Badge tone="dark">{fact.kind}</Badge>
            <Badge tone={sensitivityTone(fact.sensitivityTier)}>Tier {fact.sensitivityTier}</Badge>
          </div>
        </header>
        <p className="mt-4 text-sm leading-6 text-[var(--foreground)]">{fact.text.slice(0, 600)}</p>
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
            {fact.verified ? `Checked ${fact.verified}` : "Verification date not recorded"}
          </p>
          <ul className="mt-3 grid gap-2">
            {fact.sources.map((source, index) => (
              <li className="text-sm leading-6" key={`${fact.id}-${source.title}-${index}`}>
                {source.url ? (
                  <a className="font-semibold text-[var(--foreground)] underline decoration-[var(--steel)] underline-offset-4 hover:decoration-[var(--accent)]"
                    href={source.url} rel="noreferrer" target="_blank">{source.title}</a>
                ) : <span className="font-semibold">{source.title}</span>}
                {source.note ? <span className="text-[var(--fog)]"> · {source.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function FactsBrowser({ snapshot }: { snapshot: AdminTehdejsiSnapshot }) {
  const facts = snapshot.facts?.facts ?? [];
  const places = [...new Set(facts.map(({ place }) => place).filter((place): place is string => place !== null))].sort();
  const decades = decadesFor(facts);
  const kinds = [...new Set(facts.map(({ kind }) => kind))].sort();
  const [country, setCountry] = useState(ALL);
  const [place, setPlace] = useState(ALL);
  const [decade, setDecade] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const shown = facts.filter((fact) => {
    const decadeValue = decade === ALL ? null : Number(decade);
    return (country === ALL || fact.country === country) &&
      (place === ALL || fact.place === place) &&
      (kind === ALL || fact.kind === kind) &&
      (decadeValue === null || (fact.yearFrom <= decadeValue + 9 && fact.yearTo >= decadeValue));
  });

  if (!snapshot.facts) {
    return <Callout tone={snapshot.stores.facts === "unreadable" ? "danger" : "neutral"}>
      {snapshot.stores.facts === "unreadable"
        ? "The committed facts file failed validation. No partial claims are shown."
        : "No committed facts file is available."}
    </Callout>;
  }
  return (
    <section aria-labelledby="tehdejsi-facts-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Read-only marketing facts</p><h3 className="mt-1 text-2xl font-semibold" id="tehdejsi-facts-heading">Facts browser</h3></div>
        <p className="text-sm text-[var(--fog)]">{shown.length} of {facts.length} shown</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs text-[var(--fog)]">Country<select className={selectClass} onChange={(event) => setCountry(event.target.value)} value={country}><option value={ALL}>All countries</option><option value="cz">Czechia</option><option value="ua">Ukraine</option></select></label>
        <label className="text-xs text-[var(--fog)]">Place<select className={selectClass} onChange={(event) => setPlace(event.target.value)} value={place}><option value={ALL}>All places</option>{places.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs text-[var(--fog)]">Decade<select className={selectClass} onChange={(event) => setDecade(event.target.value)} value={decade}><option value={ALL}>All decades</option>{decades.map((value) => <option key={value} value={value}>{value}s</option>)}</select></label>
        <label className="text-xs text-[var(--fog)]">Pillar<select className={selectClass} onChange={(event) => setKind(event.target.value)} value={kind}><option value={ALL}>All pillars</option>{kinds.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {shown.map((fact) => <FactCard fact={fact} key={fact.id} />)}
      </div>
      {shown.length === 0 ? <Callout className="mt-4">No readable fact matches these filters.</Callout> : null}
    </section>
  );
}

function SourceStatus({ now, snapshot }: { now: string; snapshot: AdminTehdejsiSnapshot }) {
  if (!snapshot.facts) return null;
  const ageMilliseconds = Math.max(0, Date.parse(now) - Date.parse(snapshot.facts.copiedAt));
  const ageDays = Math.floor(ageMilliseconds / 86_400_000);
  return (
    <section aria-labelledby="tehdejsi-source-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold" id="tehdejsi-source-heading">Facts-file status</h3>
        <Badge>Owner-copied · read only</Badge>
      </div>
      <Card className="mt-4"><CardContent>
        <dl className="grid gap-4 md:grid-cols-3">
          <div><dt className="text-xs text-[var(--fog)]">Copied</dt><dd className="mt-1 text-sm">{formatDateTime(snapshot.facts.copiedAt)} · {ageDays} day{ageDays === 1 ? "" : "s"} old</dd></div>
          <div><dt className="text-xs text-[var(--fog)]">Envelope hash</dt><dd className="mt-1 break-all font-mono text-xs leading-5">{snapshot.facts.contentHash}</dd></div>
          <div><dt className="text-xs text-[var(--fog)]">Recorded origin note</dt><dd className="mt-1 text-sm leading-6">{snapshot.facts.copiedFrom}</dd></div>
        </dl>
      </CardContent></Card>
      <Callout className="mt-4" tone="warning">
        Product drift is not measured automatically: this venture has no product-repository connection. The owner must compare sources before replacing the committed facts file.
      </Callout>
    </section>
  );
}

function ResearchShelf({ snapshot }: { snapshot: AdminTehdejsiSnapshot }) {
  const spend = snapshot.research.reduce((sum, entry) => sum + entry.costUsd, 0);
  return (
    <section aria-labelledby="tehdejsi-research-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Recorded purchases and uses</p><h3 className="mt-1 text-2xl font-semibold" id="tehdejsi-research-heading">Research shelf</h3></div>
        <div className="flex flex-wrap gap-2"><Badge>{snapshot.research.length} dossier record{snapshot.research.length === 1 ? "" : "s"}</Badge><Badge tone="dark">{formatUsd(spend)} recorded</Badge></div>
      </div>
      <Card className="mt-4"><CardContent>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h4 className="font-semibold">Research efficiency</h4>
          <p className="font-mono text-lg tabular-nums">{snapshot.researchEfficiency === null ? "Not available" : `${Math.round(snapshot.researchEfficiency * 100)}%`}</p>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--fog)]">
          {snapshot.researchEfficiency === null
            ? "No paid research denominator exists, so the loader does not invent an efficiency rate."
            : "Paid dossier records count as used only after a recommendation cites the matching ledger purchase."}
        </p>
      </CardContent></Card>
      {snapshot.research.length ? (
        <div className="mt-4 grid gap-3">
          {snapshot.research.map((entry) => (
            <Card key={`${entry.topicKey}-${entry.completedAt}`}><CardContent>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{entry.cycleId}</p><h4 className="mt-1 text-lg font-semibold">{entry.topicKey.replaceAll("-", " ")}</h4></div>
                <Badge tone={entry.usedBy.length ? "success" : "warning"}>{entry.usedBy.length ? `Used by ${entry.usedBy.length}` : "Unused"}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div><dt className="text-xs text-[var(--fog)]">Completed</dt><dd className="mt-1 text-sm">{formatDateTime(entry.completedAt)}</dd></div>
                <div><dt className="text-xs text-[var(--fog)]">Provider</dt><dd className="mt-1 text-sm">{entry.provider} · {entry.model}</dd></div>
                <div><dt className="text-xs text-[var(--fog)]">Usage</dt><dd className="mt-1 text-sm tabular-nums">{entry.tokensIn} in · {entry.tokensOut} out · {entry.searches} searches</dd></div>
                <div><dt className="text-xs text-[var(--fog)]">Cost</dt><dd className="mt-1 text-sm tabular-nums">{formatUsd(entry.costUsd)}</dd></div>
              </dl>
              {entry.usedBy.length ? <p className="mt-4 text-xs text-[var(--fog)]">Recommendation uses: {entry.usedBy.join(", ")}</p> : null}
            </CardContent></Card>
          ))}
        </div>
      ) : <Callout className="mt-4">No research dossier purchase is recorded.</Callout>}
      <p className="mt-3 text-xs leading-5 text-[var(--fog)]">The ledger exposes purchase and use metadata only. It does not publish dossier claim bodies into the admin client.</p>
    </section>
  );
}

export function TehdejsiSvetLibraryPanel({ now, snapshot }: { now: string; snapshot: AdminTehdejsiSnapshot }) {
  return (
    <div className="grid gap-10">
      {snapshot.unreadable.total > 0 ? <Callout tone="warning">{snapshot.unreadable.total} malformed Tehdejší svět record{snapshot.unreadable.total === 1 ? "" : "s"} was omitted.</Callout> : null}
      <SourceStatus now={now} snapshot={snapshot} />
      <FactsBrowser snapshot={snapshot} />
      <ResearchShelf snapshot={snapshot} />
    </div>
  );
}
