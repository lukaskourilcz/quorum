import Link from "next/link";
import { ArrowRight, LockKeyhole, Shirt, Stamp } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTittyTuesdaysSnapshot } from "@/lib/titty-tuesdays-records";
import { formatDate, formatUsd } from "@/lib/utils";

export async function TittyTuesdaysVenturePage() {
  const snapshot = await getTittyTuesdaysSnapshot();
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--card)] p-8">
            <Badge tone="warning">Pre-commerce</Badge>
            <p className="mt-5 text-5xl font-semibold tracking-[-0.06em]">002</p>
            <p className="mt-3 text-sm text-[var(--fog)]">Owner countersign pending</p>
          </div>
        }
        description="One garment, one line. The venture is building the brand, concepts and launch plans before an eshop exists."
        eyebrow="Venture 002 / Validation"
        title="Titty Tuesdays"
      />

      <section className="border-y border-[var(--border)] bg-[var(--graphite)] text-[var(--paper)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent)]">The proposition</p>
          <blockquote className="mt-6 max-w-5xl text-[clamp(2.4rem,6vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.06em]">
            “We only sell sexy crop tops with the text TITTY TUESDAYS on it.”
          </blockquote>
          <p className="mt-8 max-w-2xl text-base leading-7 text-[var(--fog)]">
            The name carries the joke. Product, typography and construction carry the work. No item below is stocked or purchasable.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-28">
        <SectionHeading
          description={`${formatDate(snapshot.season.startsOn)} to ${formatDate(snapshot.season.endsOn)} · four concept garments`}
          eyebrow={`Season ${String(snapshot.season.number).padStart(3, "0")}`}
          title={snapshot.season.theme}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {snapshot.season.products.map((product, index) => (
            <Card key={product.slug}>
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex size-11 items-center justify-center rounded-[var(--radius-button)] bg-[var(--secondary)] font-mono text-xs text-[var(--accent)]">{String(index + 1).padStart(2, "0")}</div>
                  <Badge>{product.status}</Badge>
                </div>
                <h3 className="mt-8 text-3xl font-semibold tracking-[-0.045em]">{product.name}</h3>
                <p className="mt-4 text-base leading-7 text-[var(--mist)]">{product.concept}</p>
                <p className="mt-5 border-l-2 border-[var(--accent)] pl-4 text-sm leading-6 text-[var(--fog)]">{product.designDirection}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-28">
          <SectionHeading eyebrow="Campaign record" title="Plans before promotion" description={snapshot.season.campaignArc} />
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--border)] md:grid-cols-3">
            <div className="bg-[var(--card)] p-7"><Shirt aria-hidden="true" className="size-5 text-[var(--accent)]" /><p className="mt-8 mono-label text-[var(--fog)]">Product status</p><p className="mt-3 text-xl font-semibold">4 concepts · 0 live</p></div>
            <div className="bg-[var(--card)] p-7"><LockKeyhole aria-hidden="true" className="size-5 text-[var(--accent)]" /><p className="mt-8 mono-label text-[var(--fog)]">Distribution</p><p className="mt-3 text-xl font-semibold">Draft only</p></div>
            <div className="bg-[var(--card)] p-7"><Stamp aria-hidden="true" className="size-5 text-[var(--accent)]" /><p className="mt-8 mono-label text-[var(--fog)]">Recorded API spend</p><p className="mt-3 text-xl font-semibold">{formatUsd(snapshot.apiSpendUsd)}</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-28">
        <SectionHeading eyebrow="Authority record" title="Three gates remain visible" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            ["Founding", snapshot.foundingStatus, "The planning surface may ship; schedules and external action wait for the owner."],
            ["Budget", snapshot.budgetStatus, "The scheduler will use the lower-cost fallback until the August decision is signed."],
            ["Commerce", "future stage", "No eshop, inventory, payment or purchase link exists in this build."]
          ].map(([title, status, description]) => (
            <Card key={title}><CardContent><Badge tone="warning">{status}</Badge><h3 className="mt-6 text-2xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--fog)]">{description}</p></CardContent></Card>
          ))}
        </div>
        {snapshot.bootstrapMeetingId ? (
          <Link className={`${buttonVariants({ variant: "secondary" })} mt-7`} href={`/meetings/${snapshot.bootstrapMeetingId}`}>
            Read the dry season room <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </section>
    </PageShell>
  );
}
