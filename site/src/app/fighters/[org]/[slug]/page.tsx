import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { displayFieldValue, glossaryEntry } from "@/lib/fightaiq-glossary";
import { fighterName, getPublicFighters } from "@/lib/fightaiq-records";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string; slug: string }> }): Promise<Metadata> {
  const { org, slug } = await params;
  const fighter = (await getPublicFighters()).fighters.find((item) => item.org === org && item.slug === slug);
  return { title: fighter ? fighterName(fighter) : "Fighter", description: fighter ? `Sourced ${org.toUpperCase()} fighter file for ${fighterName(fighter)}.` : "Sourced FightAIQ fighter file." };
}

export default async function FighterDetailPage({ params }: { params: Promise<{ org: string; slug: string }> }) {
  const { org, slug } = await params;
  const fighter = (await getPublicFighters()).fighters.find((item) => item.org === org && item.slug === slug);
  if (!fighter) notFound();
  const open = fighter.discrepancies.filter((item) => item.status === "open");
  return <PageShell>
    <PageIntro eyebrow={`${fighter.org.toUpperCase()} / Sourced fighter file`} title={fighterName(fighter)} description="The complete public file. Every field includes its source, update time and verification state." aside={<div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-7"><Badge tone={fighter.modelEligible ? "success" : "warning"}>{fighter.modelEligible ? "Ready for model use" : "Still being checked"}</Badge><p className="mt-5 text-4xl font-semibold">{Math.round(fighter.completeness * 100)}%</p><p className="mt-2 text-sm text-[var(--fog)]">file complete</p></div>} />
    <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-10 md:py-20">
      <Link className={buttonVariants({ size: "small", variant: "ghost" })} href={`/fighters?org=${fighter.org}`}><ArrowLeft className="size-4" aria-hidden="true" /> Back to {fighter.org.toUpperCase()}</Link>
      {open.length ? <Callout className="mt-6" tone="warning">Open source disagreement: {open.map((item) => glossaryEntry(item.field).label).join(", ")}. These fields are excluded from the model.</Callout> : null}
      <dl className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--border)] md:grid-cols-2">
        {Object.entries(fighter.fields).map(([key, field]) => { const entry = glossaryEntry(key); return <div className="bg-[var(--surface)] p-6" key={key}><div className="flex flex-wrap items-center justify-between gap-2"><dt className="font-semibold">{entry.label}</dt><Badge tone={field.status === "verified" ? "success" : field.status === "disputed" ? "danger" : "warning"}>{field.status === "verified" ? "checked" : field.status}</Badge></div><dd className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{displayFieldValue(key, field.value)}</dd><p className="mt-2 text-sm leading-6 text-[var(--fog)]">{entry.explanation}</p><div className="mt-4 grid gap-1 text-xs text-[var(--fog)]">{field.sourceRefs.map((source) => source.startsWith("https://") ? <a className="inline-flex min-h-8 items-center gap-1 break-all underline underline-offset-4" href={source} key={source} rel="noreferrer" target="_blank">Source <ExternalLink className="size-3" aria-hidden="true" /></a> : <span key={source}>{source}</span>)}<time dateTime={field.retrievedAt}>Checked {new Date(field.retrievedAt).toLocaleDateString("en-GB")}</time></div></div>; })}
      </dl>
      <p className="mt-8 text-sm text-[var(--fog)]">Updated <time dateTime={fighter.updatedAt}>{new Date(fighter.updatedAt).toLocaleString("en-GB")}</time> · Model field version {fighter.modelVersion}</p>
    </section>
  </PageShell>;
}
