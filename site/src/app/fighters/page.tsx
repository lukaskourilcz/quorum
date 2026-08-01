import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import { FighterLink } from "@/components/fighter-link";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { displayFieldValue } from "@/lib/fightaiq-glossary";
import { fighterName, getPublicFighters, type MmaOrg, type PublicFighter } from "@/lib/fightaiq-records";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MMA fighter database", description: "Sourced UFC, KSW and Oktagon fighter files, with gaps and disagreements left visible." };

const orgNames: Record<MmaOrg, string> = { ufc: "UFC", ksw: "KSW", oktagon: "Oktagon" };
const field = (fighter: PublicFighter, key: string) => fighter.fields[key] ? displayFieldValue(key, fighter.fields[key].value) : "Still gathering";
const activity = (fighter: PublicFighter) => fighter.fields.daysSinceLastFight ? `${displayFieldValue("daysSinceLastFight", fighter.fields.daysSinceLastFight.value)} days` : "Still gathering";
const percentage = (value: number) => `${Math.round(value * 100)}%`;

function orgHref(org: MmaOrg, query: string) {
  const params = new URLSearchParams();
  params.set("org", org);
  if (query) params.set("q", query);
  return `/fighters?${params}`;
}

export default async function FightersPage({ searchParams }: { searchParams: Promise<{ org?: string; q?: string }> }) {
  const [{ org: rawOrg, q: rawQuery }, snapshot] = await Promise.all([searchParams, getPublicFighters()]);
  const org: MmaOrg = rawOrg === "ksw" || rawOrg === "oktagon" ? rawOrg : "ufc";
  const query = rawQuery?.trim().slice(0, 80) ?? "";
  const fighters = snapshot.fighters.filter((fighter) => fighter.org === org && (!query || fighterName(fighter).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const divisions = fighters.reduce((groups, fighter) => {
    const division = field(fighter, "division");
    groups.set(division, [...(groups.get(division) ?? []), fighter]);
    return groups;
  }, new Map<string, PublicFighter[]>());
  return <PageShell>
    <PageIntro eyebrow="FightAIQ / Sourced fighter files" title="Fighters" description="One open database for UFC, KSW and Oktagon. Every value shows where it came from; important facts need two agreeing sources before the model can use them." aside={<div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-7"><ShieldCheck className="size-5 text-[var(--accent)]" aria-hidden="true" /><p className="mt-4 text-3xl font-semibold">{snapshot.fighters.length}</p><p className="mt-2 text-sm text-[var(--fog)]">verified public fighter files</p></div>} />
    <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-10 md:py-16">
      <nav aria-label="Organization" className="flex flex-wrap gap-2">
        {(Object.keys(orgNames) as MmaOrg[]).map((item) => <Link aria-current={org === item ? "page" : undefined} className={buttonVariants({ variant: org === item ? "accent" : "secondary" })} href={orgHref(item, query)} key={item} scroll={false}>{orgNames[item]}</Link>)}
      </nav>
      <form action="/fighters" className="mt-6 flex max-w-xl gap-2" method="get">
        <input name="org" type="hidden" value={org} />
        <label className="sr-only" htmlFor="fighter-search">Search fighters</label>
        <input className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-4 text-base" defaultValue={query} id="fighter-search" name="q" placeholder={`Search ${orgNames[org]} fighters`} />
        <button className={buttonVariants({ variant: "secondary" })} type="submit"><Search className="size-4" aria-hidden="true" /> Search</button>
      </form>
      {snapshot.unreadable.length ? <Callout className="mt-6" tone="warning">{snapshot.unreadable.length} fighter {snapshot.unreadable.length === 1 ? "file could" : "files could"} not be verified and {snapshot.unreadable.length === 1 ? "is" : "are"} hidden.</Callout> : null}
    </section>
    <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-10 md:pb-28">
      {fighters.length ? [...divisions.entries()].map(([division, rows]) => <section className="mb-12" key={division}>
        <SectionHeading eyebrow={orgNames[org]} title={division} description="Provisional fields are visible but excluded from the model until corroborated." />
        <div className="mt-6 hidden overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] md:block">
          <Table><thead><tr><TableHead>Fighter</TableHead><TableHead>Record</TableHead><TableHead>Finish rate</TableHead><TableHead>Stopped-loss rate</TableHead><TableHead>Activity</TableHead><TableHead>Reach / stance</TableHead><TableHead>Fight rating</TableHead><TableHead>File quality</TableHead></tr></thead><tbody>
            {rows.map((fighter) => <tr key={fighter.id}><TableCell><FighterLink fighterRef={fighter.id}>{fighterName(fighter)}</FighterLink>{fighter.discrepancies.some((item) => item.status === "open") ? <Badge className="ml-2" tone="warning">open disagreement</Badge> : null}</TableCell><TableCell>{field(fighter, "record")}</TableCell><TableCell>{field(fighter, "finishRate")}</TableCell><TableCell>{field(fighter, "beenFinishedRate")}</TableCell><TableCell>{activity(fighter)}</TableCell><TableCell>{field(fighter, "reachCm")} / {field(fighter, "stance")}</TableCell><TableCell>{field(fighter, "glickoRating")} ± {field(fighter, "glickoDeviation")}</TableCell><TableCell>{percentage(fighter.completeness)} complete · {percentage(fighter.corroboration)} checked twice</TableCell></tr>)}
          </tbody></Table>
        </div>
        <div className="mt-6 grid gap-4 md:hidden">{rows.map((fighter) => <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6" key={fighter.id}><div className="flex items-start justify-between gap-3"><h3 className="text-2xl font-semibold"><FighterLink fighterRef={fighter.id}>{fighterName(fighter)}</FighterLink></h3><Badge>{field(fighter, "record")}</Badge></div><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-[var(--fog)]">Finish rate</dt><dd className="mt-1 font-semibold">{field(fighter, "finishRate")}</dd></div><div><dt className="text-[var(--fog)]">Activity</dt><dd className="mt-1 font-semibold">{activity(fighter)}</dd></div><div><dt className="text-[var(--fog)]">File complete</dt><dd className="mt-1 font-semibold">{percentage(fighter.completeness)}</dd></div><div><dt className="text-[var(--fog)]">Checked twice</dt><dd className="mt-1 font-semibold">{percentage(fighter.corroboration)}</dd></div></dl></article>)}</div>
      </section>) : <Callout><strong>No verified {orgNames[org]} fighter files yet.</strong> The adapters are ready, but missing keys and unresolved site terms leave this view empty rather than filling it with sample fighters. <Link className="ml-1 underline underline-offset-4" href="/ventures/fightaiq/upcoming">Check upcoming fights</Link>.</Callout>}
      <p className="mt-10 border-t border-[var(--border)] pt-5 text-sm leading-6 text-[var(--fog)]">“Checked twice” means the important fields agree across two sources. A provisional value stays visible but does not enter a probability.</p>
      <div className="mt-8"><Link className={buttonVariants({ variant: "secondary" })} href="/ventures/fightaiq/upcoming">Upcoming fights <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
    </section>
  </PageShell>;
}
