import "server-only";
import Link from "next/link";
import { ArrowLeft, ExternalLink, LockKeyhole } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { readAdminBooksofhistory } from "@/lib/admin-booksofhistory";
import { readAdminDoorMoney } from "@/lib/admin-door-money";
import { readAdminKvorum } from "@/lib/admin-kvorum";
import { readAdminTehdejsiSvet } from "@/lib/admin-tehdejsi-svet";

export type ReviewedVentureSlug = "booksofhistory" | "door-money" | "kvorum" | "tehdejsi-svet";

interface PublicMeasure {
  label: string;
  value: number;
  detail: string;
}

export interface ReviewedVentureSummary {
  measures: [PublicMeasure, PublicMeasure, PublicMeasure];
  unreadable: number;
}

interface VentureCopy {
  number: string;
  name: string;
  eyebrow: string;
  introduction: string;
  cadence: string;
  steps: Array<{ title: string; body: string }>;
  gate: string;
  productLink?: true;
}

const COPY: Record<ReviewedVentureSlug, VentureCopy> = {
  booksofhistory: {
    number: "003",
    name: "BOOKSOFHISTORY",
    eyebrow: "Books, authors and the history around them",
    introduction: "A three-day editorial desk finds a promising book story, researches its claims and prepares two locale-specific recommendations for a person to review.",
    cadence: "Selection, research, then production",
    steps: [
      { title: "Choose from a fixed library", body: "A deterministic shortlist weighs anniversaries, cultural relevance, variety and recorded performance. A low-ranked idea does not quietly enter production." },
      { title: "Research before writing", body: "Reusable dossiers come first. Paid research is capped, recorded and tied to the exact story it supports." },
      { title: "Leave two drafts for review", body: "Each locale is written as a distinct editorial version. Passing the gates makes them reviewable; it does not publish either one." }
    ],
    gate: "Claims need eligible sources, quotes need attribution, research stays inside its signed ceilings, and release remains a manual owner decision."
  },
  "door-money": {
    number: "004",
    name: "Door Money",
    eyebrow: "Practical money lessons from a private manuscript",
    introduction: "An editorial desk turns bounded evidence from a private knowledge store into recommendations and a Thursday room turns recorded results into practical tasks for the owner.",
    cadence: "Editorial drafts plus a Thursday action room",
    steps: [
      { title: "Keep the book outside this repository", body: "Only bounded derivatives cross the private-store boundary. The public record never carries the manuscript, full chunks or their embeddings." },
      { title: "Build a cited recommendation", body: "Every hook, copy block and excerpt must resolve to the recorded knowledge index and pass the voice, claim, quote and excerpt gates." },
      { title: "Learn from owner-entered results", body: "The growth room can prepare templates and suggested tasks. It cannot send them, contact anyone or infer performance from an analytics service." }
    ],
    gate: "Excerpts remain capped, real book text is forbidden in fixtures, results are manual, and no approval can turn into automatic posting or outreach."
  },
  kvorum: {
    number: "006",
    name: "Kvórum",
    eyebrow: "Czech politics with the receipts attached",
    introduction: "A daily Czech political desk monitors a bounded source set, extracts checkable claims and records one recommendation only when the evidence is strong enough.",
    cadence: "Monitor, verify, recommend",
    steps: [
      { title: "Monitor without treating discovery as proof", body: "Source collection identifies candidates. Discovery snippets remain discovery evidence and cannot substantiate a published factual claim." },
      { title: "Resolve every factual claim", body: "Multi-source facts need independent support; single-source facts are labelled; commentary cannot masquerade as fact." },
      { title: "Record a recommendation, not a post", body: "The desk can leave an approved draft for its owner. A posted status exists only after the owner records the real URL." }
    ],
    gate: "Truth checks, correction readiness, source quotas and manual release are structural. The venture cannot create an account, post or contact a political channel."
  },
  "tehdejsi-svet": {
    number: "005",
    name: "Tehdejší svět",
    eyebrow: "Czech and Ukrainian family conversations about the past",
    introduction: "This is the marketing-side editorial desk for an existing historical-world product. It turns a hand-copied, hash-verified facts file into Czech and Ukrainian feature drafts without importing or duplicating the product here.",
    cadence: "Plan one day, produce the next",
    steps: [
      { title: "Rank only share-safe facts", body: "The desk reads one committed facts envelope. Sensitive topics raise the review level, and excluded material never enters the candidate set." },
      { title: "Write two native versions", body: "Czech leads the feature and Ukrainian is independently adapted from the same canonical brief. Literal mirror translations fail the production gate." },
      { title: "Return product ideas to the owner", body: "Marketing research can queue a bounded product insight. Nothing in this repository reads from or writes to the product codebase." }
    ],
    gate: "Tier-two history needs explicit human review, licensed imagery needs attribution, and every social package stays a draft until the owner acts.",
    productLink: true
  }
};

function productSiteUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_TEHDEJSI_PRODUCT_URL;
  if (!configured || configured.length > 2_048) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" && !url.hostname.endsWith(".vercel.app") ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function loadReviewedVentureSummary(slug: ReviewedVentureSlug): Promise<ReviewedVentureSummary> {
  if (slug === "booksofhistory") {
    const snapshot = await readAdminBooksofhistory();
    const posted = snapshot.features.filter((feature) => Object.values(feature.postedUrls).some(Boolean)).length;
    return {
      measures: [
        { label: "Research dossiers", value: snapshot.dossiers.length, detail: "canonical dossiers currently recorded" },
        { label: "Recommendation drafts", value: snapshot.features.length, detail: `${posted} carry an owner-recorded posted URL` },
        { label: "Seed books", value: snapshot.seedBooks ?? 0, detail: snapshot.seedBooks === null ? "seed library is unavailable" : "eligible books in the committed library" }
      ],
      unreadable: snapshot.unreadable.total
    };
  }
  if (slug === "door-money") {
    const snapshot = await readAdminDoorMoney();
    const posted = snapshot.recommendations.items.filter(({ status }) => status === "posted").length;
    return {
      measures: [
        { label: "Recommendations", value: snapshot.recommendations.items.length, detail: `${posted} marked posted by the owner` },
        { label: "Action packets", value: snapshot.actions.packets.length, detail: "prepared tasks; none are sent automatically" },
        { label: "Channel playbooks", value: snapshot.actions.playbooks.length, detail: "read-only owner guidance" }
      ],
      unreadable: snapshot.unreadable
    };
  }
  if (slug === "kvorum") {
    const snapshot = await readAdminKvorum();
    const posted = snapshot.recommendations.filter(({ status }) => status === "posted").length;
    return {
      measures: [
        { label: "Monitor days", value: snapshot.monitor.length, detail: "canonical source-monitor records" },
        { label: "Checked claims", value: snapshot.claims.length, detail: "claims in the receipts ledger" },
        { label: "Recommendations", value: snapshot.recommendations.length, detail: `${posted} marked posted by the owner` }
      ],
      unreadable: snapshot.unreadable
    };
  }
  const snapshot = await readAdminTehdejsiSvet();
  const posted = snapshot.features.filter(({ status }) => status === "posted").length;
  return {
    measures: [
      { label: "Verified facts", value: snapshot.facts?.facts.length ?? 0, detail: snapshot.facts ? "share-safe facts in the committed envelope" : "facts envelope is unavailable" },
      { label: "Feature drafts", value: snapshot.features.length, detail: `${posted} marked posted by the owner` },
      { label: "Product insights", value: snapshot.productInsights.length, detail: "owner queues; no product write connection" }
    ],
    unreadable: snapshot.unreadable.total
  };
}

export function ReviewedVenturePresentation({ slug, summary }: { slug: ReviewedVentureSlug; summary: ReviewedVentureSummary }) {
  const copy = COPY[slug];
  const productUrl = copy.productLink ? productSiteUrl() : null;
  return (
    <PageShell>
      <article data-reviewed-venture={slug}>
        <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-20">
          <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/ventures">
            <ArrowLeft aria-hidden="true" className="size-4" />
            All projects
          </Link>
          <div className="mt-10 grid gap-10 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8">
              <div className="flex flex-wrap gap-2">
                <Badge>Project {copy.number}</Badge>
                <Badge>Manual release</Badge>
              </div>
              <p className="mt-7 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{copy.eyebrow}</p>
              <h1 className="mt-4 break-words text-[clamp(2.25rem,9vw,8rem)] font-semibold leading-[0.84] tracking-[-0.075em]">
                {copy.name}<span className="text-[var(--accent)]">.</span>
              </h1>
            </div>
            <div className="md:col-span-4">
              <p className="text-lg leading-8 text-[var(--muted-foreground)]">{copy.introduction}</p>
              {productUrl ? (
                <a className={`${buttonVariants({ variant: "secondary" })} mt-6`} href={productUrl} rel="noreferrer" target="_blank">
                  Visit the product site <ExternalLink aria-hidden="true" className="size-4" />
                </a>
              ) : copy.productLink ? (
                <p className="mt-6 text-sm leading-6 text-[var(--fog)]">The product link will appear here when its production domain is recorded. A preview deployment is deliberately not promoted.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]" aria-label="Recorded output">
          <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] md:grid-cols-3">
            {summary.measures.map((measure) => (
              <div className="bg-[var(--card)] p-7 md:p-9" key={measure.label}>
                <p className="font-mono text-[0.65625rem] font-bold uppercase tracking-[0.12em] text-[var(--fog)]">{measure.label}</p>
                <p className="mt-5 text-5xl font-semibold tracking-[-0.06em] tabular-nums">{measure.value}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--fog)]">{measure.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-4">
              <Badge>How it works</Badge>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">{copy.cadence}.</h2>
              <p className="mt-5 text-sm leading-6 text-[var(--muted-foreground)]">Counts above come from strict canonical readers. Drafts stay labelled as drafts; only an owner-recorded URL is described as posted.</p>
            </div>
            <div className="grid gap-5 md:col-span-8">
              {copy.steps.map((step, index) => (
                <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6" key={step.title}>
                  <p className="font-mono text-[0.65625rem] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Step {index + 1}</p>
                  <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--fog)]">{step.body}</p>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--graphite)] text-[var(--snow)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-8 px-5 py-16 md:grid-cols-12 md:px-8 md:py-20">
            <div className="md:col-span-4">
              <LockKeyhole aria-hidden="true" className="size-7 text-[var(--accent)]" />
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">Why the gate stays closed.</h2>
            </div>
            <div className="md:col-span-8">
              <p className="text-xl leading-8">{copy.gate}</p>
              {summary.unreadable > 0 ? (
                <Callout className="mt-7" tone="warning">{summary.unreadable} malformed or unreadable record{summary.unreadable === 1 ? " was" : "s were"} dropped before these totals were rendered.</Callout>
              ) : (
                <p className="mt-6 font-mono text-xs uppercase tracking-[0.12em] text-[var(--mist)]">No unreadable records entered the totals.</p>
              )}
            </div>
          </div>
        </section>
      </article>
    </PageShell>
  );
}

export async function ReviewedVenturePage({ slug }: { slug: ReviewedVentureSlug }) {
  return <ReviewedVenturePresentation slug={slug} summary={await loadReviewedVentureSummary(slug)} />;
}
