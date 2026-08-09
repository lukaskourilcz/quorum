import { ExternalLink, ShieldAlert } from "lucide-react";
import { FightAiQOddsCapture } from "./fightaiq-odds-capture";
import { FightAiQDiscrepancyResolution } from "./fightaiq-discrepancy-resolution";
import { FightAiQRecordBrowser } from "./fightaiq-record-browser";
import { FighterLink } from "@/components/fighter-link";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { fighterName } from "@/lib/fightaiq-records";
import type { AdminFightAiQSnapshot } from "@/lib/admin-fightaiq";
import { formatDate } from "@/lib/utils";

type FightAiQTab = "fighters" | "bouts" | "events" | "sources";
const stateTone = (state: string): "success" | "warning" | "danger" | "neutral" => state === "wired" ? "success" : state === "blocked" ? "danger" : state === "proposed" ? "warning" : "neutral";
const sourceStateLabel = (state: string) => state === "wired" ? "connected" : state === "proposed" ? "suggested" : state;

export function FightAiQAdminPanel({ snapshot, tab }: { snapshot: AdminFightAiQSnapshot; tab: FightAiQTab }) {
  if (tab === "fighters") return <div className="mt-8">
    {snapshot.fighters.length ? <><FightAiQRecordBrowser bouts={snapshot.bouts} fighters={snapshot.fighters} view="fighters" /><div className="mt-8 grid gap-5 xl:grid-cols-2">{snapshot.fighters.flatMap((fighter) => fighter.discrepancyDetails.filter((item) => item.status === "open").map((item) => <Card key={`${fighter.id}-${item.field}`}><CardContent><p className="font-mono text-xs uppercase text-[var(--fog)]">Needs your review</p><h3 className="mt-2 text-2xl font-semibold"><FighterLink fighterRef={fighter.id}>{fighterName(fighter)}</FighterLink> · {item.field}</h3><p className="mt-3 text-sm leading-6 text-[var(--fog)]">Compare the cited values. Choosing one records your reason; it only returns to the model after two sources agree.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{item.values.map((value) => <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)] p-4" key={value.sourceRef}><p className="break-words text-lg font-semibold">{typeof value.value === "string" ? value.value : JSON.stringify(value.value)}</p><p className="mt-2 break-all font-mono text-[0.6875rem] text-[var(--fog)]">{value.sourceRef}</p></div>)}</div><FightAiQDiscrepancyResolution fighterRef={fighter.id} field={item.field} values={item.values.map((value) => ({ sourceRef: value.sourceRef, displayValue: typeof value.value === "string" ? value.value : JSON.stringify(value.value) }))} /></CardContent></Card>))}</div></> : <Callout>No fighter cards are stored yet. Run the free roster sync to create evidence-labelled files.</Callout>}
  </div>;

  if (tab === "bouts") return snapshot.bouts.length
    ? <FightAiQRecordBrowser bouts={snapshot.bouts} fighters={snapshot.fighters} view="bouts" />
    : <Callout className="mt-8">No bout records are stored yet. The next intake checks approved free sources for announced cards.</Callout>;

  if (tab === "events") return <div className="mt-8 grid gap-6">
    {snapshot.events.length ? snapshot.events.map((event) => <Card key={event.id}><CardContent><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">{event.org}</p><h3 className="mt-2 text-2xl font-semibold">{event.name}</h3><p className="mt-2 text-sm text-[var(--fog)]">{event.venue} · {event.bouts.length} fights</p></div><Badge><time dateTime={event.startsAtUtc}>{formatDate(event.startsAtUtc)}</time></Badge></div></CardContent></Card>) : <Callout>No verified event cards are stored yet. Add one through an approved importer before capturing prices.</Callout>}
    <Card><CardContent><h3 className="text-2xl font-semibold">Enter market prices by hand</h3>{snapshot.sources.find((source) => source.id === "the-odds-api")?.credentialReady === false ? <Callout className="mt-4" tone="warning">Automatic odds are off — THE_ODDS_API_KEY is not installed, so prices come from you.</Callout> : null}<p className="mb-6 mt-2 max-w-2xl text-sm leading-6 text-[var(--fog)]">This writes an auditable owner snapshot. It never opens a bookmaker or places a bet.</p><FightAiQOddsCapture events={snapshot.events.map(({ id, name }) => ({ id, name }))} /></CardContent></Card>
  </div>;

  return <div className="mt-8 grid gap-5 lg:grid-cols-2">{snapshot.sources.map((source) => <Card key={source.id}><CardContent><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase text-[var(--fog)]">Source quality {source.tier}</p><h3 className="mt-2 text-2xl font-semibold">{source.name}</h3></div><Badge tone={stateTone(source.state)}>{sourceStateLabel(source.state)}</Badge></div><div className="mt-4 flex flex-wrap gap-2">{source.coverage.map((item) => <Badge key={item}>{item}</Badge>)}</div><p className="mt-5 text-sm leading-6 text-[var(--mist)]">{source.termsNote}</p><p className="mt-4 text-sm text-[var(--fog)]">Free use: {source.freeLimit}</p>{source.credentialEnv ? <p className="mt-2 text-sm"><Badge tone={source.credentialReady ? "success" : "warning"}>{source.credentialReady ? "key ready" : "key missing"}</Badge> <code>{source.credentialEnv}</code></p> : null}<a className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent)] underline underline-offset-4" href={source.evidenceUrl} rel="noreferrer" target="_blank">Review source rules <ExternalLink className="size-4" aria-hidden="true" /></a>{source.state === "blocked" ? <p className="mt-4 flex gap-2 text-sm text-[var(--destructive-soft)]"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> No connection or workaround is allowed.</p> : null}</CardContent></Card>)}</div>;
}
