"use client";

import { useMemo, useState } from "react";
import {
  AdminButton,
  AdminCard as Card,
  AdminCardContent as CardContent,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminStateMessage,
  AdminStatusBadge as Badge,
} from "./admin-primitives";
import { formatDate } from "@/lib/utils";

interface BrowserFighter {
  id: string;
  slug: string;
  org: "ufc" | "oktagon";
  fields: Record<string, { value: string | number | boolean | null | Array<string | number | boolean> }>;
  completeness: number;
  modelEligible: boolean;
  updatedAt: string;
  historyCount: number;
  sourceCount: number;
  gaps: string[];
  evidenceTier: "primary" | "secondary" | "tertiary";
}

interface BrowserBout {
  id: string;
  org: "ufc" | "oktagon";
  eventName: string;
  startsAtUtc: string;
  red: string;
  blue: string;
  division: string | null;
  status: "proposed" | "announced" | "confirmed" | "weigh-in" | "completed" | "cancelled" | "postponed";
  sourceRefs: string[];
  updatedAt: string;
}

const pageSize = 40;

function fieldText(fighter: BrowserFighter, key: string): string {
  const value = fighter.fields[key]?.value;
  return typeof value === "string" ? value : "";
}

function fighterName(fighter: BrowserFighter): string {
  return fieldText(fighter, "name") || fighter.slug.replaceAll("-", " ");
}

export function FightAiQRecordBrowser({ fighters, bouts, view }: { fighters: BrowserFighter[]; bouts: BrowserBout[]; view: "fighters" | "bouts" }) {
  const [query, setQuery] = useState("");
  const [organization, setOrganization] = useState("all");
  const [division, setDivision] = useState("all");
  const [status, setStatus] = useState("all");
  const [minimumCompleteness, setMinimumCompleteness] = useState("0");
  const [page, setPage] = useState(0);
  const names = useMemo(() => new Map(fighters.map((fighter) => [fighter.id, fighterName(fighter)])), [fighters]);
  const divisions = useMemo(() => [...new Set([
    ...fighters.map((fighter) => fieldText(fighter, "division")),
    ...bouts.map((bout) => bout.division ?? "")
  ].filter(Boolean))].sort(), [fighters, bouts]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const shownFighters = fighters.filter((fighter) => {
    if (organization !== "all" && fighter.org !== organization) return false;
    if (division !== "all" && fieldText(fighter, "division") !== division) return false;
    if (status === "usable" && !fighter.modelEligible) return false;
    if (status === "held" && fighter.modelEligible) return false;
    if (fighter.completeness < Number(minimumCompleteness)) return false;
    return !normalizedQuery || `${fighterName(fighter)} ${fighter.id}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  const shownBouts = bouts.filter((bout) => {
    if (organization !== "all" && bout.org !== organization) return false;
    if (division !== "all" && bout.division !== division) return false;
    if (status !== "all" && bout.status !== status) return false;
    const haystack = `${bout.eventName} ${names.get(bout.red) ?? bout.red} ${names.get(bout.blue) ?? bout.blue} ${bout.id}`.toLocaleLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const resultCount = view === "fighters" ? shownFighters.length : shownBouts.length;
  const pageCount = Math.max(1, Math.ceil(resultCount / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleFighters = shownFighters.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const visibleBouts = shownBouts.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return <div>
    <div className="grid gap-3 rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-4 md:grid-cols-2 xl:grid-cols-5">
      <div className="xl:col-span-2"><AdminLabel htmlFor={`fightaiq-${view}-search`}>Search</AdminLabel>
        <AdminInput id={`fightaiq-${view}-search`} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={view === "fighters" ? "Name or fighter ID" : "Event, fighter or bout ID"} type="search" value={query} />
      </div>
      <div><AdminLabel htmlFor={`fightaiq-${view}-organization`}>Organization</AdminLabel>
        <AdminSelect id={`fightaiq-${view}-organization`} onChange={(event) => { setOrganization(event.target.value); setPage(0); }} value={organization}><option value="all">All</option><option value="ufc">UFC</option><option value="oktagon">Oktagon</option></AdminSelect>
      </div>
      <div><AdminLabel htmlFor={`fightaiq-${view}-division`}>Division</AdminLabel>
        <AdminSelect id={`fightaiq-${view}-division`} onChange={(event) => { setDivision(event.target.value); setPage(0); }} value={division}><option value="all">All</option>{divisions.map((item) => <option key={item} value={item}>{item}</option>)}</AdminSelect>
      </div>
      <div><AdminLabel htmlFor={`fightaiq-${view}-status`}>Status</AdminLabel>
        <AdminSelect id={`fightaiq-${view}-status`} onChange={(event) => { setStatus(event.target.value); setPage(0); }} value={status}>
          <option value="all">All</option>
          {view === "fighters" ? <><option value="usable">Ready for analysis</option><option value="held">Needs evidence</option></> : ["proposed", "announced", "confirmed", "weigh-in", "completed", "cancelled", "postponed"].map((item) => <option key={item} value={item}>{item}</option>)}
        </AdminSelect>
      </div>
      {view === "fighters" ? <div><AdminLabel htmlFor="fightaiq-fighters-completeness">Minimum complete</AdminLabel>
        <AdminSelect id="fightaiq-fighters-completeness" onChange={(event) => { setMinimumCompleteness(event.target.value); setPage(0); }} value={minimumCompleteness}><option value="0">Any</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></AdminSelect>
      </div> : null}
    </div>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="text-sm text-[var(--admin-foreground-muted)]">{resultCount} matching {view} · page {currentPage + 1} of {pageCount}</p>
      <div className="flex gap-2">
        <AdminButton disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</AdminButton>
        <AdminButton disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</AdminButton>
      </div>
    </div>
    {resultCount === 0 ? <AdminStateMessage className="mt-4" state="filtered-empty" title={`No ${view} match these filters.`} /> : <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {view === "fighters" ? visibleFighters.map((fighter) => <details className="group rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)]" key={fighter.id}>
        <summary className="min-h-14 cursor-pointer list-none p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-section-accent)]">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--admin-foreground-muted)]">{fighter.org} · {fieldText(fighter, "division") || "Division missing"}</p><h3 className="mt-1 text-xl font-semibold">{fighterName(fighter)}</h3></div><Badge tone={fighter.modelEligible ? "success" : "warning"}>{fighter.modelEligible ? "ready" : "needs evidence"}</Badge></div>
          <p className="mt-3 text-sm text-[var(--admin-foreground-muted)]">{Math.round(fighter.completeness * 100)}% complete · {fighter.historyCount} recorded fights · {fighter.sourceCount} sources</p>
        </summary>
        <CardContent className="border-t border-[var(--admin-border)]"><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-[var(--admin-foreground-muted)]">Evidence level</dt><dd className="font-semibold">{fighter.evidenceTier}</dd></div><div><dt className="text-[var(--admin-foreground-muted)]">Last updated</dt><dd><time dateTime={fighter.updatedAt}>{formatDate(fighter.updatedAt)}</time></dd></div></dl><p className="mt-5 text-sm font-semibold">Open gaps</p><div className="mt-2 flex flex-wrap gap-2">{fighter.gaps.length ? fighter.gaps.map((gap) => <Badge key={gap} tone="warning">{gap}</Badge>) : <Badge tone="success">none</Badge>}</div></CardContent>
      </details>) : visibleBouts.map((bout) => <Card key={bout.id}><CardContent><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--admin-foreground-muted)]">{bout.org} · {bout.division ?? "Division missing"}</p><h3 className="mt-2 text-xl font-semibold">{names.get(bout.red) ?? bout.red} vs {names.get(bout.blue) ?? bout.blue}</h3><p className="mt-2 text-sm text-[var(--admin-foreground-muted)]">{bout.eventName} · <time dateTime={bout.startsAtUtc}>{formatDate(bout.startsAtUtc)}</time></p></div><Badge tone={bout.status === "cancelled" ? "destructive" : bout.status === "completed" ? "success" : bout.status === "confirmed" || bout.status === "weigh-in" ? "warning" : "neutral"}>{bout.status}</Badge></div><details className="mt-5"><summary className="min-h-11 cursor-pointer text-sm font-semibold underline underline-offset-4">Show record details</summary><p className="break-all font-mono text-xs text-[var(--admin-foreground-muted)]">{bout.id}</p><p className="mt-3 text-sm text-[var(--admin-foreground-muted)]">{bout.sourceRefs.length} source reference{bout.sourceRefs.length === 1 ? "" : "s"} · updated <time dateTime={bout.updatedAt}>{formatDate(bout.updatedAt)}</time></p></details></CardContent></Card>)}
    </div>}
  </div>;
}
