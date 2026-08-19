"use client";

import { useState } from "react";
import {
  AdminCallout as Callout,
  AdminCard as Card,
  AdminCardContent as CardContent,
  AdminEntityBadge,
  AdminLabel,
  AdminMetric,
  AdminSelect,
  AdminStateMessage,
  AdminStatusBadge as Badge,
} from "./admin-primitives";
import type { AdminTehdejsiFact, AdminTehdejsiSnapshot } from "@/lib/admin-tehdejsi-svet";
import { formatDateTime, formatUsd } from "@/lib/utils";

const ALL = "all";

function sensitivityTone(tier: number): "success" | "warning" | "destructive" {
  return tier === 2 ? "destructive" : tier === 1 ? "warning" : "success";
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
            <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{fact.id}</p>
            <h4 className="mt-2 text-lg font-semibold">{fact.place ?? (fact.country === "cz" ? "Czechia" : "Ukraine")} · {factPeriod(fact)}</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminEntityBadge>{fact.country.toUpperCase()}</AdminEntityBadge>
            <AdminEntityBadge>{fact.kind}</AdminEntityBadge>
            <Badge tone={sensitivityTone(fact.sensitivityTier)}>Tier {fact.sensitivityTier}</Badge>
          </div>
        </header>
        <p className="mt-4 text-sm leading-6 text-[var(--admin-foreground)]">{fact.text.slice(0, 600)}</p>
        <div className="mt-4 border-t border-[var(--admin-border)] pt-4">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
            {fact.verified ? `Checked ${fact.verified}` : "Verification date not recorded"}
          </p>
          <ul className="mt-3 grid gap-2">
            {fact.sources.map((source, index) => (
              <li className="text-sm leading-6" key={`${fact.id}-${source.title}-${index}`}>
                {source.url ? (
                  <a className="font-semibold text-[var(--admin-foreground)] underline decoration-[var(--admin-border-strong)] underline-offset-4 hover:decoration-[var(--admin-section-accent)]"
                    href={source.url} rel="noreferrer" target="_blank">{source.title}</a>
                ) : <span className="font-semibold">{source.title}</span>}
                {source.note ? <span className="text-[var(--admin-foreground-muted)]"> · {source.note}</span> : null}
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
    return snapshot.stores.facts === "unreadable"
      ? <AdminStateMessage state="malformed" title="The committed facts file failed validation." description="No partial claims are shown." />
      : <AdminStateMessage state="initial-empty" title="No committed facts file is available." />;
  }
  return (
    <section aria-labelledby="tehdejsi-facts-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Read-only marketing facts</p><h3 className="mt-1 text-2xl font-semibold" id="tehdejsi-facts-heading">Facts browser</h3></div>
        <p className="text-sm text-[var(--admin-foreground-muted)]">{shown.length} of {facts.length} shown</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div><AdminLabel htmlFor="tehdejsi-country-filter">Country</AdminLabel><AdminSelect id="tehdejsi-country-filter" onChange={(event) => setCountry(event.target.value)} value={country}><option value={ALL}>All countries</option><option value="cz">Czechia</option><option value="ua">Ukraine</option></AdminSelect></div>
        <div><AdminLabel htmlFor="tehdejsi-place-filter">Place</AdminLabel><AdminSelect id="tehdejsi-place-filter" onChange={(event) => setPlace(event.target.value)} value={place}><option value={ALL}>All places</option>{places.map((value) => <option key={value} value={value}>{value}</option>)}</AdminSelect></div>
        <div><AdminLabel htmlFor="tehdejsi-decade-filter">Decade</AdminLabel><AdminSelect id="tehdejsi-decade-filter" onChange={(event) => setDecade(event.target.value)} value={decade}><option value={ALL}>All decades</option>{decades.map((value) => <option key={value} value={value}>{value}s</option>)}</AdminSelect></div>
        <div><AdminLabel htmlFor="tehdejsi-pillar-filter">Pillar</AdminLabel><AdminSelect id="tehdejsi-pillar-filter" onChange={(event) => setKind(event.target.value)} value={kind}><option value={ALL}>All pillars</option>{kinds.map((value) => <option key={value} value={value}>{value}</option>)}</AdminSelect></div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {shown.map((fact) => <FactCard fact={fact} key={fact.id} />)}
      </div>
      {shown.length === 0 ? <AdminStateMessage className="mt-4" state="filtered-empty" title="No readable fact matches these filters." /> : null}
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
      <Card className="mt-3"><CardContent>
        <div className="grid divide-y divide-[var(--admin-border)] md:grid-cols-3 md:divide-x md:divide-y-0" data-admin-metrics>
          <AdminMetric className="px-3 first:pl-0" label="Copied" value={<span className="text-[length:var(--admin-type-control)]">{formatDateTime(snapshot.facts.copiedAt)} · {ageDays} day{ageDays === 1 ? "" : "s"} old</span>} />
          <AdminMetric className="px-3" label="Envelope hash" value={<span className="block break-all text-[length:var(--admin-type-control)]">{snapshot.facts.contentHash}</span>} />
          <AdminMetric className="px-3 last:pr-0" label="Recorded origin note" value={<span className="text-[length:var(--admin-type-control)]">{snapshot.facts.copiedFrom}</span>} />
        </div>
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
        <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Recorded purchases and uses</p><h3 className="mt-1 text-2xl font-semibold" id="tehdejsi-research-heading">Research shelf</h3></div>
        <div className="flex flex-wrap gap-2"><AdminEntityBadge>{snapshot.research.length} dossier record{snapshot.research.length === 1 ? "" : "s"}</AdminEntityBadge><AdminEntityBadge>{formatUsd(spend)} recorded</AdminEntityBadge></div>
      </div>
      <Card className="mt-3"><CardContent>
        <AdminMetric className="p-0" label="Research efficiency" value={snapshot.researchEfficiency === null ? "Not available" : `${Math.round(snapshot.researchEfficiency * 100)}%`} />
        <p className="m-0 mt-2 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">
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
                <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{entry.cycleId}</p><h4 className="mt-1 text-lg font-semibold">{entry.topicKey.replaceAll("-", " ")}</h4></div>
                <Badge tone={entry.usedBy.length ? "success" : "warning"}>{entry.usedBy.length ? `Used by ${entry.usedBy.length}` : "Unused"}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div><dt className="text-xs text-[var(--admin-foreground-muted)]">Completed</dt><dd className="mt-1 text-sm">{formatDateTime(entry.completedAt)}</dd></div>
                <div><dt className="text-xs text-[var(--admin-foreground-muted)]">Provider</dt><dd className="mt-1 text-sm">{entry.provider} · {entry.model}</dd></div>
                <div><dt className="text-xs text-[var(--admin-foreground-muted)]">Usage</dt><dd className="mt-1 text-sm tabular-nums">{entry.tokensIn} in · {entry.tokensOut} out · {entry.searches} searches</dd></div>
                <div><dt className="text-xs text-[var(--admin-foreground-muted)]">Cost</dt><dd className="mt-1 text-sm tabular-nums">{formatUsd(entry.costUsd)}</dd></div>
              </dl>
              {entry.usedBy.length ? <p className="mt-4 text-xs text-[var(--admin-foreground-muted)]">Recommendation uses: {entry.usedBy.join(", ")}</p> : null}
            </CardContent></Card>
          ))}
        </div>
      ) : <AdminStateMessage className="mt-4" state="initial-empty" title="No research dossier purchase is recorded." />}
      <p className="mt-3 text-xs leading-5 text-[var(--admin-foreground-muted)]">The ledger exposes purchase and use metadata only. It does not publish dossier claim bodies into the admin client.</p>
    </section>
  );
}

export function TehdejsiSvetLibraryPanel({ now, snapshot }: { now: string; snapshot: AdminTehdejsiSnapshot }) {
  return (
    <div className="grid gap-6">
      {snapshot.unreadable.total > 0 ? <Callout tone="warning">{snapshot.unreadable.total} malformed Tehdejší svět record{snapshot.unreadable.total === 1 ? "" : "s"} was omitted.</Callout> : null}
      <SourceStatus now={now} snapshot={snapshot} />
      <FactsBrowser snapshot={snapshot} />
      <ResearchShelf snapshot={snapshot} />
    </div>
  );
}
