import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Database } from "lucide-react";
import { FighterLink } from "@/components/fighter-link";
import { LocalEventTime } from "@/components/local-event-time";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { displayFieldValue } from "@/lib/fightaiq-glossary";
import { fighterName, getFightAiQMode, getPublicEvents, getPublicFighters, type MmaOrg, type PublicFighter } from "@/lib/fightaiq-records";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upcoming MMA fights", description: "Sourced UFC, KSW and Oktagon pairings with plain tale-of-the-tape fields." };
const orgNames: Record<MmaOrg, string> = { ufc: "UFC", ksw: "KSW", oktagon: "Oktagon" };
const display = (fighter: PublicFighter | undefined, key: string) => fighter?.fields[key] ? displayFieldValue(key, fighter.fields[key].value) : "Still gathering";

function clockLabel(startsAt: string, complete: boolean): string {
  if (complete || new Date(startsAt).getTime() < Date.now()) return "Results are in";
  const days = Math.ceil((new Date(startsAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 1) return "Fight week";
  if (days <= 3) return "3 days out: the team is focused on this card";
  return "Building the fighter files";
}

export default async function UpcomingFightsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const [{ org: rawOrg }, eventSnapshot, fighterSnapshot, mode] = await Promise.all([searchParams, getPublicEvents(), getPublicFighters(), getFightAiQMode()]);
  const org: MmaOrg = rawOrg === "ksw" || rawOrg === "oktagon" ? rawOrg : "ufc";
  const events = eventSnapshot.events.filter((event) => event.org === org);
  const fighters = new Map(fighterSnapshot.fighters.map((fighter) => [fighter.id, fighter]));
  return <PageShell>
    <PageIntro eyebrow="FightAIQ / Announced cards" title="Upcoming fights" description="Pairings shown the way the fight desk works: sourced event details, both fighter files and the gaps still being filled. Predictions stay hidden while FightAIQ is in data-only mode." aside={<div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-7"><Badge tone="warning">{mode === "data-only" ? "Data only" : "Reviewed analysis"}</Badge><p className="mt-5 text-4xl font-semibold">18+</p><p className="mt-2 text-sm leading-6 text-[var(--fog)]">Entertainment only. Never chase a loss or stake money you need.</p></div>} />
    <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-10">
      <nav aria-label="Organization" className="flex flex-wrap gap-2">{(Object.keys(orgNames) as MmaOrg[]).map((item) => <Link aria-current={item === org ? "page" : undefined} className={buttonVariants({ variant: item === org ? "accent" : "secondary" })} href={`/ventures/fightaiq/upcoming?org=${item}`} key={item} scroll={false}>{orgNames[item]}</Link>)}</nav>
      {eventSnapshot.unreadable.length || fighterSnapshot.unreadable.length ? <Callout className="mt-6" tone="warning">Some saved fight data failed the public check and is hidden.</Callout> : null}
    </section>
    <section className="mx-auto grid max-w-[var(--container)] gap-8 px-5 pb-20 md:px-10 md:pb-28">
      {events.length ? events.map((event) => <article className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]" key={event.id}>
        <header className="grid gap-4 border-b border-[var(--border)] bg-[var(--card)] p-6 md:grid-cols-[1fr_auto] md:items-end md:p-8"><div><div className="flex flex-wrap gap-2"><Badge>{orgNames[event.org]}</Badge><Badge tone="warning">{clockLabel(event.startsAtUtc, event.bouts.every((bout) => bout.status === "complete"))}</Badge></div><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">{event.name}</h2><p className="mt-2 text-sm text-[var(--fog)]">{event.venue}</p></div><div className="text-sm leading-6"><p className="font-semibold"><LocalEventTime value={event.startsAtUtc} /></p><p className="text-[var(--fog)]">Prague: {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague" }).format(new Date(event.startsAtUtc))}</p></div></header>
        <div className="divide-y divide-[var(--border)]">{event.bouts.map((bout) => { const red = fighters.get(bout.red); const blue = fighters.get(bout.blue); return <section className="p-6 md:p-8" key={bout.id}><div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-start"><div><p className="mono-label text-[var(--fog)]">Red corner</p><h3 className="mt-2 text-2xl font-semibold"><FighterLink fighterRef={bout.red}>{red ? fighterName(red) : (bout.red.split(":")[1]?.replaceAll("-", " ") ?? bout.red)}</FighterLink></h3></div><div className="self-center text-center text-sm font-semibold text-[var(--fog)]">vs</div><div className="md:text-right"><p className="mono-label text-[var(--fog)]">Blue corner</p><h3 className="mt-2 text-2xl font-semibold"><FighterLink fighterRef={bout.blue}>{blue ? fighterName(blue) : (bout.blue.split(":")[1]?.replaceAll("-", " ") ?? bout.blue)}</FighterLink></h3></div></div><dl className="mt-6 grid gap-px overflow-hidden rounded-[var(--radius-button)] bg-[var(--border)] sm:grid-cols-5">{([ ["Record", "record"], ["Finish rate", "finishRate"], ["Reach", "reachCm"], ["Age", "dob"], ["Activity", "daysSinceLastFight"] ] as const).map(([label,key]) => <div className="bg-[var(--background)] p-4 text-center" key={key}><dt className="text-xs text-[var(--fog)]">{label}</dt><dd className="mt-2 grid grid-cols-[1fr_auto_1fr] gap-2 text-sm font-semibold"><span>{display(red,key)}</span><span className="text-[var(--fog)]">/</span><span>{display(blue,key)}</span></dd></div>)}</dl>{!red || !blue ? <p className="mt-4 text-sm text-[var(--fog)]">We are still gathering data on {(!red && !blue) ? "both fighters" : "one fighter"}.</p> : null}<p className="mt-4 text-xs text-[var(--fog)]">{bout.division} · {bout.scheduledRounds} rounds · {bout.status}</p></section>; })}</div>
      </article>) : <Callout><strong>No verified {orgNames[org]} event card is stored yet.</strong> The event importer stays empty until an approved source or owner entry passes the contract.</Callout>}
      <div className="flex flex-wrap gap-3"><Link className={buttonVariants({ variant: "secondary" })} href="/fighters"><Database className="size-4" aria-hidden="true" /> Fighter database</Link><Link className={buttonVariants({ variant: "ghost" })} href="/ventures/fightaiq"><CalendarDays className="size-4" aria-hidden="true" /> FightAIQ overview</Link></div>
    </section>
  </PageShell>;
}
