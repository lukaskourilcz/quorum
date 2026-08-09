import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { readAdminLaunchBinder } from "@/lib/admin-portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Launch checklist · Admin",
  robots: { index: false, follow: false, nocache: true }
};

export default async function LaunchBinderPage({
  params
}: {
  params: Promise<{ venture: string }>;
}) {
  const { venture: requested } = await params;
  // The same alias the admin page keeps: `design-lab` is the name and `carousel-studio` is the id,
  // and a deep link typed from the name should not land on a missing binder.
  const ventureId = requested === "design-lab" ? "carousel-studio" : requested === "dneskai" ? "caught-up" : requested;
  const binder = await readAdminLaunchBinder(ventureId);
  if (!binder) notFound();
  const groups = binder.plans.reduce((grouped, plan) => {
    const season = plan.seasonId ?? "Unassigned season";
    grouped.set(season, [...(grouped.get(season) ?? []), plan]);
    return grouped;
  }, new Map<string, typeof binder.plans>());
  return (
    <main className="print-binder min-h-screen">
      <header className="no-print border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex min-h-18 max-w-[var(--container)] items-center justify-between gap-4 px-5 md:px-8">
          <Link className={buttonVariants({ variant: "ghost" })} href={`/admin?venture=${binder.venture.id}&tab=plans`}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to plans
          </Link>
          <div className="hidden min-h-11 items-center gap-2 text-sm text-[var(--fog)] sm:inline-flex">
            <Printer aria-hidden="true" className="size-4" />
            Use the browser print command
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-18">
        <div className="border-b border-[var(--border)] pb-8">
          <div className="flex flex-wrap gap-2">
            <Badge tone="dark">Launch checklist</Badge>
            <Badge>{binder.plans.length} ready plans</Badge>
          </div>
          <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] md:text-7xl">{binder.venture.name}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--fog)]">
            Approved plans and plans you rated Perfect, grouped for launch day. Costs remain estimates until you approve a way to take payments.
          </p>
        </div>

        {binder.plans.length ? (
          <div className="mt-10 grid gap-12">
            {[...groups.entries()].map(([season, plans], groupIndex) => (
              <section className={groupIndex ? "print-break" : undefined} key={season}>
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">Season</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{season}</h2>
                <div className="mt-5 grid gap-5">
                  {plans.map((plan) => (
                    <Card key={plan.id}>
                      <CardContent>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <h3 className="text-2xl font-semibold tracking-[-0.035em]">{plan.title}</h3>
                            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--fog)]">{plan.objective}</p>
                          </div>
                          <Badge tone={plan.status === "approved" ? "success" : "warning"}>{plan.status.replaceAll("_", " ")}</Badge>
                        </div>

                        <div className="mt-7 grid gap-7 lg:grid-cols-2">
                          <section>
                            <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">Actions</h4>
                            <ol className="mt-3 grid gap-4">
                              {plan.tactics.map((tactic, index) => (
                                <li className="border-l-2 border-[var(--border)] pl-4" key={`${tactic.type}-${index}`}>
                                  <p className="font-semibold capitalize">{tactic.type}</p>
                                  <p className="mt-1 text-sm leading-6 text-[var(--fog)]">{tactic.description}</p>
                                  {tactic.estCostUsd !== null ? <p className="mt-2 font-mono text-xs">Estimated cost: ${tactic.estCostUsd.toFixed(2)}</p> : null}
                                  <p className="mt-2 text-xs leading-5 text-[var(--fog)]">Platform: {tactic.platformPolicyNote}</p>
                                  {tactic.legalityNote ? <p className="mt-1 text-xs leading-5 text-[var(--fog)]">Legality: {tactic.legalityNote}</p> : null}
                                </li>
                              ))}
                            </ol>
                          </section>
                          <section>
                            <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">Calendar</h4>
                            <ol className="mt-3 grid gap-3">
                              {plan.calendar.map((item) => (
                                <li className="rounded-[var(--radius-button)] border border-[var(--border)] p-4" key={item.week}>
                                  <p className="font-mono text-xs">{item.week}</p>
                                  <p className="mt-1 text-sm leading-6 text-[var(--fog)]">{item.focus}</p>
                                </li>
                              ))}
                            </ol>
                          </section>
                        </div>

                        {plan.audienceSpecs.length ? (
                          <section className="mt-7 border-t border-[var(--border)] pt-5">
                            <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">Who this is for</h4>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              {plan.audienceSpecs.map((spec) => (
                                <div className="rounded-[var(--radius-button)] border border-[var(--border)] p-4" key={spec.ref}>
                                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{spec.subjectRef}</p><Badge>{spec.status}</Badge></div>
                                  <p className="mt-2 text-sm leading-6 text-[var(--fog)]">Ages {spec.ageRange.min}–{spec.ageRange.max} · {spec.regions.join(", ")} · {spec.platforms.join(", ")}</p>
                                  <p className="mt-1 text-xs leading-5 text-[var(--fog)]">Public interests: {spec.interests.join(", ")}. {spec.adTargetingNotes}</p>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        <dl className="mt-7 grid gap-4 border-t border-[var(--border)] pt-5 text-sm sm:grid-cols-3">
                          <div><dt className="text-[var(--fog)]">Audience details</dt><dd className="mt-1 font-semibold">{plan.audienceRefs.length ? `${plan.audienceSpecs.length}/${plan.audienceRefs.length} found` : "None attached"}</dd></div>
                          <div><dt className="text-[var(--fog)]">Success measures</dt><dd className="mt-1 font-semibold">{plan.kpis.length ? plan.kpis.join(", ") : "None attached"}</dd></div>
                          <div><dt className="text-[var(--fog)]">Finished files</dt><dd className="mt-1 font-semibold">{plan.assets.length ? plan.assets.join(", ") : "None attached"}</dd></div>
                        </dl>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Callout className="mt-10">
            No approved plans or plans rated Perfect are stored yet. Drafts stay out of the launch checklist.
          </Callout>
        )}
      </section>
    </main>
  );
}
