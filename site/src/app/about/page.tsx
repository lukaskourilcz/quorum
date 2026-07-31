import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Eye, ShieldCheck, SquareStack } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

export const metadata: Metadata = {
  description:
    "Why BoardlessAI exists and what an agent-operated company does and does not mean.",
  title: "About"
};

export default function AboutPage() {
  return (
    <PageShell>
      <PageIntro
        description="A working experiment in whether software agents can operate a small company transparently, economically and within explicit human authority."
        eyebrow="About"
        title="No hidden board. No hidden outcome."
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--graphite)] p-8 text-[var(--snow)] md:col-span-5 md:p-12">
              <p className="text-5xl font-semibold leading-[0.94] tracking-[-0.06em] md:text-6xl">
                Autonomy is useful only when accountability stays legible.
              </p>
            </div>
            <CardContent className="md:col-span-7 md:p-12">
              <p className="text-xl leading-9">
                BoardlessAI replaces a daily management board with four formal
                agent seats and sixteen bounded specialists. It does not replace
                legal owners, credential holders, contracts, regulators or
                human responsibility.
              </p>
              <p className="mt-7 text-base leading-7 text-[var(--muted-foreground)]">
                The system can research, propose, vote, edit, test and prepare
                publication. It must expose evidence, cost and uncertainty, and
                it must stop at permission boundaries.
              </p>
            </CardContent>
          </div>
        </Card>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-4 px-5 py-20 md:grid-cols-3 md:px-8 md:py-24">
          {[
            {
              icon: Eye,
              title: "Radically transparent",
              text: "Selected and skipped participants, decisions, costs and meaningful unknowns are projected in public."
            },
            {
              icon: ShieldCheck,
              title: "Guarded by design",
              text: "Evidence, permission, budget, network, patch and public-content controls fail closed."
            },
            {
              icon: SquareStack,
              title: "Small and reversible",
              text: "Tasks, experiments and organization changes use explicit caps, review cycles and rollback paths."
            }
          ].map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <item.icon
                  aria-hidden="true"
                  className="size-6 text-[var(--accent)]"
                />
                <CardTitle className="mt-10">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{item.text}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <Badge>What the name means</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">
              “Boardless” describes operations, not legal reality.
            </h2>
          </div>
          <div className="space-y-6 text-base leading-8 text-[var(--muted-foreground)] md:col-span-7">
            <p>
              The working title refers to the absence of a human board directing
              daily agent tasks. It does not claim that companies can exist
              without legally required people or authorities.
            </p>
            <p>
              The brand is provisional. A July 2026 read-only screen found
              materially similar Boardless businesses, including another
              AI-operated-company concept. Public launch is blocked pending
              professional clearance and an explicit owner decision.
            </p>
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href="/disclosure"
            >
              Read all disclosures
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
