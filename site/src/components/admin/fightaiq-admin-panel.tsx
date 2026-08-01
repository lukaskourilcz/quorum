import { ExternalLink, ShieldAlert } from "lucide-react";
import { FightAiQOddsCapture } from "./fightaiq-odds-capture";
import { RatingWidget } from "./rating-widget";
import { FighterLink } from "@/components/fighter-link";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { fighterName } from "@/lib/fightaiq-records";
import type { AdminFightAiQSnapshot } from "@/lib/admin-fightaiq";

type FightAiQTab = "fighters" | "events" | "slates" | "sources";
const stateTone = (state: string): "success" | "warning" | "danger" | "neutral" => state === "wired" ? "success" : state === "blocked" ? "danger" : state === "proposed" ? "warning" : "neutral";

export function FightAiQAdminPanel({ snapshot, tab }: { snapshot: AdminFightAiQSnapshot; tab: FightAiQTab }) {
  if (tab === "fighters") return <div className="mt-8">
    {snapshot.fighters.length ? <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)]"><Table><thead><tr><TableHead>Fighter</TableHead><TableHead>Organization</TableHead><TableHead>Complete</TableHead><TableHead>Checked twice</TableHead><TableHead>Model</TableHead><TableHead>Disagreements</TableHead></tr></thead><tbody>{snapshot.fighters.map((fighter) => <tr key={fighter.id}><TableCell><FighterLink fighterRef={fighter.id}>{fighterName(fighter)}</FighterLink></TableCell><TableCell className="uppercase">{fighter.org}</TableCell><TableCell>{Math.round(fighter.completeness * 100)}%</TableCell><TableCell>{Math.round(fighter.corroboration * 100)}%</TableCell><TableCell><Badge tone={fighter.modelEligible ? "success" : "warning"}>{fighter.modelEligible ? "usable" : "held back"}</Badge></TableCell><TableCell>{fighter.discrepancies.filter((item) => item.status === "open").length}</TableCell></tr>)}</tbody></Table></div> : <Callout>No verified fighter files are stored yet. New imports stay private until the important fields agree across two sources.</Callout>}
  </div>;

  if (tab === "events") return <div className="mt-8 grid gap-6">
    {snapshot.events.length ? snapshot.events.map((event) => <Card key={event.id}><CardContent><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">{event.org}</p><h3 className="mt-2 text-2xl font-semibold">{event.name}</h3><p className="mt-2 text-sm text-[var(--fog)]">{event.venue} · {event.bouts.length} fights</p></div><Badge>{event.startsAtUtc.slice(0, 10)}</Badge></div></CardContent></Card>) : <Callout>No verified event cards are stored yet. Add one through an approved importer before capturing prices.</Callout>}
    <Card><CardContent><h3 className="text-2xl font-semibold">Enter market prices by hand</h3><p className="mb-6 mt-2 max-w-2xl text-sm leading-6 text-[var(--fog)]">This writes an auditable owner snapshot. It never opens a bookmaker or places a bet.</p><FightAiQOddsCapture events={snapshot.events.map(({ id, name }) => ({ id, name }))} /></CardContent></Card>
  </div>;

  if (tab === "slates") return <div className="mt-8 grid gap-5 xl:grid-cols-2">
    {snapshot.slates.length ? snapshot.slates.map((slate) => <Card key={slate.id}><CardContent><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">{slate.generatedAt.slice(0, 10)}</p><h3 className="mt-2 text-2xl font-semibold">{slate.title}</h3></div><Badge tone="warning">18+</Badge></div><p className="mt-5 text-sm leading-6 text-[var(--fog)]">{slate.expectedLossLine}</p><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[var(--fog)]">Fight notes</dt><dd className="font-semibold">{slate.legCount}</dd></div><div><dt className="text-[var(--fog)]">Optional combinations</dt><dd className="font-semibold">{slate.ticketCount}</dd></div></dl><div className="mt-6"><RatingWidget contentHash={slate.contentHash} initialHistory={slate.ratings} objectId={slate.id} objectKind="slate" ventureId="fightaiq" /></div></CardContent></Card>) : <Callout>No ten-fight slate is stored. FightAIQ will not invent one without a verified event, both fighter files and a versioned model run.</Callout>}
  </div>;

  return <div className="mt-8 grid gap-5 lg:grid-cols-2">{snapshot.sources.map((source) => <Card key={source.id}><CardContent><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">Tier {source.tier}</p><h3 className="mt-2 text-2xl font-semibold">{source.name}</h3></div><Badge tone={stateTone(source.state)}>{source.state}</Badge></div><div className="mt-4 flex flex-wrap gap-2">{source.coverage.map((item) => <Badge key={item}>{item}</Badge>)}</div><p className="mt-5 text-sm leading-6 text-[var(--mist)]">{source.termsNote}</p><p className="mt-4 text-sm text-[var(--fog)]">Free allowance: {source.freeLimit}</p>{source.credentialEnv ? <p className="mt-2 text-sm"><Badge tone={source.credentialReady ? "success" : "warning"}>{source.credentialReady ? "key ready" : "key missing"}</Badge> <code>{source.credentialEnv}</code></p> : null}<a className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent)] underline underline-offset-4" href={source.evidenceUrl} rel="noreferrer" target="_blank">Review evidence <ExternalLink className="size-4" aria-hidden="true" /></a>{source.state === "blocked" ? <p className="mt-4 flex gap-2 text-sm text-[var(--destructive)]"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> No adapter or workaround is allowed.</p> : null}</CardContent></Card>)}</div>;
}
