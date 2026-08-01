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
    "Why BoardlessAI exists and what a company run by AI roles can and cannot do.",
  title: "About"
};

export default function AboutPage() {
  return (
    <PageShell>
      <PageIntro
        description="A working experiment in whether AI roles can run a small company openly, affordably and within clear limits set by people."
        eyebrow="About"
        title="See who decided what."
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--graphite)] p-8 text-[var(--snow)] md:col-span-5 md:p-12">
              <p className="text-5xl font-semibold leading-[0.94] tracking-[-0.06em] md:text-6xl">
                AI can do the work. People must still be able to check it.
              </p>
            </div>
            <CardContent className="md:col-span-7 md:p-12">
              <p className="text-xl leading-9">
                BoardlessAI replaces a daily management board with four AI
                decision makers and other specialist roles. It does not replace
                legal owners, credential holders, contracts, regulators or
                human responsibility.
              </p>
              <p className="mt-7 text-base leading-7 text-[var(--muted-foreground)]">
                The system can research, suggest, vote, edit, test and prepare
                work for publication. It must show its sources, costs and open
                questions, and it must stop when human permission is required.
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
              title: "Open to inspect",
              text: "You can see who joined each meeting, who was not needed, what was decided, what it cost and what remains unknown."
            },
            {
              icon: ShieldCheck,
              title: "Built with firm limits",
              text: "Work stops when sources, permission, budget, website access or publishing approval are missing."
            },
            {
              icon: SquareStack,
              title: "Small and easy to undo",
              text: "Tasks, tests and team changes have clear limits, review dates and a way back if something goes wrong."
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
              “Boardless” describes daily work, not legal reality.
            </h2>
          </div>
          <div className="space-y-6 text-base leading-8 text-[var(--muted-foreground)] md:col-span-7">
            <p>
              The working title means no human board directs the AI team’s
              daily tasks. It does not claim that companies can exist
              without legally required people or authorities.
            </p>
            <p>
              The name is still under review. A July 2026 search found other
              businesses using similar Boardless names, including another
              AI-run company idea. A wider public launch must wait for
              professional advice and the owner’s decision.
            </p>
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href="/disclosure"
            >
              Read the important notices
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
