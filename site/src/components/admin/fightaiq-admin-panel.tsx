import { ExternalLink, ShieldAlert } from "lucide-react";
import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminEntityBadge,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import { FightAiQDiscrepancyResolution } from "./fightaiq-discrepancy-resolution";
import { FightAiQOddsCapture } from "./fightaiq-odds-capture";
import { FightAiQRecordBrowser } from "./fightaiq-record-browser";
import { FighterLink } from "@/components/fighter-link";
import type { AdminFightAiQSnapshot } from "@/lib/admin-fightaiq";
import { fighterName } from "@/lib/fightaiq-records";
import { formatDate } from "@/lib/utils";

type FightAiQTab = "fighters" | "bouts" | "events" | "sources";
type Source = AdminFightAiQSnapshot["sources"][number];

function sourceTone(state: string): "success" | "warning" | "destructive" | "neutral" {
  if (state === "wired") return "success";
  if (state === "blocked") return "destructive";
  if (state === "proposed") return "warning";
  return "neutral";
}

function sourceStateLabel(state: string): string {
  if (state === "wired") return "Connected";
  if (state === "proposed") return "Suggested";
  return state;
}

function FightersView({ snapshot }: { snapshot: AdminFightAiQSnapshot }) {
  if (!snapshot.fighters.length) {
    return <AdminStateMessage state="initial-empty" title="No fighter cards are stored yet." description="Run the free roster sync to create evidence-labelled files." />;
  }
  const discrepancies = snapshot.fighters.flatMap((fighter) => fighter.discrepancyDetails
    .filter((item) => item.status === "open")
    .map((item) => ({ fighter, item })));

  return (
    <div className="grid gap-4">
      <FightAiQRecordBrowser bouts={snapshot.bouts} fighters={snapshot.fighters} view="fighters" />
      {discrepancies.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {discrepancies.map(({ fighter, item }) => (
            <AdminCard key={`${fighter.id}-${item.field}`}>
              <AdminCardContent className="grid gap-4">
                <header>
                  <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Needs your review</p>
                  <h3 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold"><FighterLink fighterRef={fighter.id}>{fighterName(fighter)}</FighterLink> · {item.field}</h3>
                  <p className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">Compare the cited values. Choosing one records your reason; it only returns to the model after two sources agree.</p>
                </header>
                <div className="grid overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] sm:grid-cols-2 sm:divide-x sm:divide-[var(--admin-border)]">
                  {item.values.map((value) => (
                    <div className="min-w-0 bg-[var(--admin-surface-secondary)] p-3" key={value.sourceRef}>
                      <p className="m-0 break-words text-[length:var(--admin-type-section)] font-semibold">{typeof value.value === "string" ? value.value : JSON.stringify(value.value)}</p>
                      <p className="m-0 mt-1 break-all text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{value.sourceRef}</p>
                    </div>
                  ))}
                </div>
                <FightAiQDiscrepancyResolution fighterRef={fighter.id} field={item.field} values={item.values.map((value) => ({
                  sourceRef: value.sourceRef,
                  displayValue: typeof value.value === "string" ? value.value : JSON.stringify(value.value),
                }))} />
              </AdminCardContent>
            </AdminCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EventsView({ snapshot }: { snapshot: AdminFightAiQSnapshot }) {
  return (
    <div className="grid gap-4">
      {snapshot.events.length ? snapshot.events.map((event) => (
        <AdminCard key={event.id}>
          <AdminCardContent className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{event.org}</p>
              <h3 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{event.name}</h3>
              <p className="m-0 mt-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{event.venue} · {event.bouts.length} fights</p>
            </div>
            <AdminEntityBadge><time dateTime={event.startsAtUtc}>{formatDate(event.startsAtUtc)}</time></AdminEntityBadge>
          </AdminCardContent>
        </AdminCard>
      )) : <AdminStateMessage state="initial-empty" title="No verified event cards are stored yet." description="Add one through an approved importer before capturing prices." />}
      <AdminCard>
        <AdminCardContent>
          <h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold">Enter market prices by hand</h3>
          {snapshot.sources.find((source) => source.id === "the-odds-api")?.credentialReady === false ? (
            <AdminCallout className="mt-3" tone="warning">Automatic odds are off — THE_ODDS_API_KEY is not installed, so prices come from you.</AdminCallout>
          ) : null}
          <p className="m-0 mb-4 mt-1 max-w-2xl text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">This writes an auditable owner snapshot. It never opens a bookmaker or places a bet.</p>
          <FightAiQOddsCapture events={snapshot.events.map(({ id, name }) => ({ id, name }))} />
        </AdminCardContent>
      </AdminCard>
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  return (
    <AdminCard>
      <AdminCardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Source quality {source.tier}</p>
            <h3 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{source.name}</h3>
          </div>
          <AdminStatusBadge tone={sourceTone(source.state)}>{sourceStateLabel(source.state)}</AdminStatusBadge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{source.coverage.map((item) => <AdminEntityBadge key={item}>{item}</AdminEntityBadge>)}</div>
        <p className="m-0 mt-3 text-[length:var(--admin-type-control)] leading-5">{source.termsNote}</p>
        <p className="m-0 mt-2 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Free use: {source.freeLimit}</p>
        {source.credentialEnv ? <p className="m-0 mt-2 text-[length:var(--admin-type-control)]"><AdminStatusBadge tone={source.credentialReady ? "success" : "warning"}>{source.credentialReady ? "Key ready" : "Key missing"}</AdminStatusBadge> <code className="break-all">{source.credentialEnv}</code></p> : null}
        <a className="admin-focus-ring mt-3 inline-flex min-h-[var(--admin-touch-target)] items-center gap-2 rounded-[var(--admin-radius-sm)] text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] underline underline-offset-2 md:min-h-[var(--admin-control-height)]" href={source.evidenceUrl} rel="noreferrer" target="_blank">Review source rules <ExternalLink aria-hidden className="size-4" /></a>
        {source.state === "blocked" ? <AdminCallout className="mt-3 flex gap-2" tone="destructive"><ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> No connection or workaround is allowed.</AdminCallout> : null}
      </AdminCardContent>
    </AdminCard>
  );
}

export function FightAiQAdminPanel({ snapshot, tab }: { snapshot: AdminFightAiQSnapshot; tab: FightAiQTab }) {
  if (tab === "fighters") return <FightersView snapshot={snapshot} />;
  if (tab === "bouts") return snapshot.bouts.length
    ? <FightAiQRecordBrowser bouts={snapshot.bouts} fighters={snapshot.fighters} view="bouts" />
    : <AdminStateMessage state="initial-empty" title="No bout records are stored yet." description="The next intake checks approved free sources for announced cards." />;
  if (tab === "events") return <EventsView snapshot={snapshot} />;
  return snapshot.sources.length
    ? <div className="grid gap-4 lg:grid-cols-2">{snapshot.sources.map((source) => <SourceCard key={source.id} source={source} />)}</div>
    : <AdminStateMessage state="initial-empty" title="No FightAIQ source records are stored yet." />;
}
