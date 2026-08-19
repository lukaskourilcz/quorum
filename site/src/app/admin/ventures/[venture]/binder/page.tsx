import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import {
  AdminCard,
  AdminCardContent,
  AdminEntityBadge,
  AdminPageHeader,
  AdminStateMessage,
  AdminStatusBadge,
  adminButtonVariants,
} from "@/components/admin/admin-primitives";
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
    <main className="print-binder min-h-screen bg-[var(--admin-background)] text-[var(--admin-foreground)]">
      <header className="no-print border-b border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <div className="mx-auto flex min-h-18 max-w-[var(--container)] items-center justify-between gap-4 px-5 md:px-8">
          <Link className={adminButtonVariants({ variant: "ghost" })} href={`/admin?venture=${binder.venture.id}&tab=plans`}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to plans
          </Link>
          <div className="hidden min-h-11 items-center gap-2 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)] sm:inline-flex">
            <Printer aria-hidden="true" className="size-4" />
            Use the browser print command
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-18">
        <div className="border-b border-[var(--admin-border)] pb-8">
          <AdminPageHeader
            description="Approved plans and plans you rated Perfect, grouped for launch day. Costs remain estimates until you approve a way to take payments."
            eyebrow={(
              <span className="flex flex-wrap gap-2">
                <AdminEntityBadge>Launch checklist</AdminEntityBadge>
                <AdminEntityBadge>{binder.plans.length} ready plans</AdminEntityBadge>
              </span>
            )}
            title={binder.venture.name}
          />
        </div>

        {binder.plans.length ? (
          <div className="mt-10 grid gap-12">
            {[...groups.entries()].map(([season, plans], groupIndex) => (
              <section className={groupIndex ? "print-break" : undefined} key={season}>
                <p className="font-mono text-[length:var(--admin-type-label)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Season</p>
                <h2 className="mt-2 text-[length:var(--admin-type-dialog)] font-semibold tracking-[var(--admin-tracking-tight)]">{season}</h2>
                <div className="mt-5 grid gap-5">
                  {plans.map((plan) => (
                    <AdminCard key={plan.id}>
                      <AdminCardContent>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <h3 className="text-[length:var(--admin-type-section)] font-semibold">{plan.title}</h3>
                            <p className="mt-2 max-w-3xl text-[length:var(--admin-type-body)] leading-6 text-[var(--admin-foreground-muted)]">{plan.objective}</p>
                          </div>
                          <AdminStatusBadge tone={plan.status === "approved" ? "success" : "warning"}>{plan.status.replaceAll("_", " ")}</AdminStatusBadge>
                        </div>

                        <div className="mt-7 grid gap-7 lg:grid-cols-2">
                          <section>
                            <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">Actions</h4>
                            <ol className="mt-3 grid gap-4">
                              {plan.tactics.map((tactic, index) => (
                                <li className="border-l-2 border-[var(--admin-border-strong)] pl-4" key={`${tactic.type}-${index}`}>
                                  <p className="font-semibold capitalize">{tactic.type}</p>
                                  <p className="mt-1 text-[length:var(--admin-type-body)] leading-6 text-[var(--admin-foreground-muted)]">{tactic.description}</p>
                                  {tactic.estCostUsd !== null ? <p className="admin-tabular mt-2 font-mono text-[length:var(--admin-type-control)]">Estimated cost: ${tactic.estCostUsd.toFixed(2)}</p> : null}
                                  <p className="mt-2 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">Platform: {tactic.platformPolicyNote}</p>
                                  {tactic.legalityNote ? <p className="mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">Legality: {tactic.legalityNote}</p> : null}
                                </li>
                              ))}
                            </ol>
                          </section>
                          <section>
                            <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">Calendar</h4>
                            <ol className="mt-3 divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
                              {plan.calendar.map((item) => (
                                <li className="py-3" key={item.week}>
                                  <p className="font-mono text-[length:var(--admin-type-control)]">{item.week}</p>
                                  <p className="mt-1 text-[length:var(--admin-type-body)] leading-6 text-[var(--admin-foreground-muted)]">{item.focus}</p>
                                </li>
                              ))}
                            </ol>
                          </section>
                        </div>

                        {plan.audienceSpecs.length ? (
                          <section className="mt-7 border-t border-[var(--admin-border)] pt-5">
                            <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">Who this is for</h4>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              {plan.audienceSpecs.map((spec) => (
                                <div className="border-l-2 border-[var(--admin-border-strong)] pl-4" key={spec.ref}>
                                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{spec.subjectRef}</p><AdminStatusBadge tone="neutral">{spec.status}</AdminStatusBadge></div>
                                  <p className="mt-2 text-[length:var(--admin-type-body)] leading-6 text-[var(--admin-foreground-muted)]">Ages {spec.ageRange.min}–{spec.ageRange.max} · {spec.regions.join(", ")} · {spec.platforms.join(", ")}</p>
                                  <p className="mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">Public interests: {spec.interests.join(", ")}. {spec.adTargetingNotes}</p>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        <dl className="mt-7 grid gap-4 border-t border-[var(--admin-border)] pt-5 text-[length:var(--admin-type-body)] sm:grid-cols-3">
                          <div><dt className="text-[var(--admin-foreground-muted)]">Audience details</dt><dd className="mt-1 font-semibold">{plan.audienceRefs.length ? `${plan.audienceSpecs.length}/${plan.audienceRefs.length} found` : "None attached"}</dd></div>
                          <div><dt className="text-[var(--admin-foreground-muted)]">Success measures</dt><dd className="mt-1 font-semibold">{plan.kpis.length ? plan.kpis.join(", ") : "None attached"}</dd></div>
                          <div><dt className="text-[var(--admin-foreground-muted)]">Finished files</dt><dd className="mt-1 break-words font-semibold">{plan.assets.length ? plan.assets.join(", ") : "None attached"}</dd></div>
                        </dl>
                      </AdminCardContent>
                    </AdminCard>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <AdminStateMessage
            className="mt-10"
            description="Drafts stay out of the launch checklist."
            state="initial-empty"
            title="No approved plans or plans rated Perfect are stored yet."
          />
        )}
      </section>
    </main>
  );
}
