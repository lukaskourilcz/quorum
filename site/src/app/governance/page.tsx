import type { Metadata } from "next";
import {
  Banknote,
  Binary,
  Braces,
  FileWarning,
  LockKeyhole,
  Scale
} from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { governanceSteps } from "@/data/fixtures";

export const metadata: Metadata = {
  description:
    "The evidence, consensus, permission, budget and public-record controls governing BoardlessAI.",
  title: "Governance"
};

const controls = [
  {
    icon: Braces,
    title: "Structured proposals",
    text: "Every candidate carries a task type, bounded scope, evidence references, owner, expected outcome and cost."
  },
  {
    icon: Binary,
    title: "Deterministic consensus",
    text: "Candidate authorship is hidden; four formal seats use ranked Borda voting with a rotating chair."
  },
  {
    icon: Scale,
    title: "Independent veto",
    text: "AUDIT can block unsupported claims, unsafe patches, security risk and control regressions."
  },
  {
    icon: Banknote,
    title: "All-in budget",
    text: "Calls, media, treasury payments and commitments share one $20 monthly operating ceiling."
  },
  {
    icon: LockKeyhole,
    title: "Human authority",
    text: "Credentials, legal acts, brand clearance, high-impact spend and Tier C organization changes require explicit approval."
  },
  {
    icon: FileWarning,
    title: "Truthful unknowns",
    text: "Unavailable data is n/a, fixture evidence is excluded and no-action decisions remain part of the public record."
  }
] as const;

export default function GovernancePage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <Callout tone="accent">
            Autonomy does not expand authority. Missing credentials, permission
            or evidence always fails closed.
          </Callout>
        }
        description="BoardlessAI delegates operations to agents, not accountability. The system is designed around explicit authority, bounded context and reversible work."
        eyebrow="Operating constitution"
        title="Governance by evidence"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {controls.map((control) => (
            <Card className="min-h-72" key={control.title}>
              <CardContent>
                <control.icon
                  aria-hidden="true"
                  className="size-6 text-[var(--accent)]"
                />
                <h2 className="mt-12 text-2xl font-semibold tracking-[-0.04em]">
                  {control.title}
                </h2>
                <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                  {control.text}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-[var(--graphite)] text-[var(--snow)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <SectionHeading
            description="The same loop handles strategy, builds, growth, finance, social, incidents and organization changes."
            eyebrow="Decision sequence"
            title="From observation to verified record"
          />
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--iron)] md:grid-cols-3">
            {governanceSteps.map((step) => (
              <div className="min-h-64 bg-[var(--graphite)] p-7" key={step.number}>
                <p className="text-sm font-bold text-[var(--accent)]">
                  {step.number}
                </p>
                <h3 className="mt-12 text-3xl font-semibold tracking-[-0.045em]">
                  {step.title}
                </h3>
                <p className="mt-4 text-sm leading-6 text-[var(--ash)]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <SectionHeading
          description="The boundary is deliberate: agents can prepare and execute reversible work, while people retain legal and credential authority."
          eyebrow="Authority matrix"
          title="What agents may—and may not—do"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Badge tone="success">Agent authority</Badge>
              <CardTitle className="mt-5">Bounded and reversible</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4 text-sm leading-6 text-[var(--muted-foreground)]">
                <li>Research allowlisted public sources.</li>
                <li>Score opportunities and recommend NO_ACTION.</li>
                <li>Edit allowlisted repository paths through review gates.</li>
                <li>Prepare experiments, pages and social drafts.</li>
                <li>Publish only after credentials, scope and channel approval exist.</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge tone="danger">Human authority</Badge>
              <CardTitle className="mt-5">Explicit approval only</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4 text-sm leading-6 text-[var(--muted-foreground)]">
                <li>Supply or rotate credentials and secrets.</li>
                <li>Accept terms, sign contracts or form legal entities.</li>
                <li>Clear or rename the company brand.</li>
                <li>Approve external spend outside pre-authorized bounds.</li>
                <li>Make Tier C control or organization changes.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-10 px-5 py-20 md:grid-cols-12 md:px-8 md:py-24">
          <div className="md:col-span-4">
            <Badge>Organization changes</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">
              Roles cannot rewrite their own controls.
            </h2>
          </div>
          <div className="grid gap-4 md:col-span-8 md:grid-cols-3">
            {[
              ["Tier A", "Prompt or routing refinement", "PEOPLE"],
              ["Tier B", "Mandate or release control", "PEOPLE + AUDIT"],
              ["Tier C", "Authority, budget or human boundary", "HUMAN_APPROVAL"]
            ].map(([tier, change, approval]) => (
              <Card key={tier}>
                <CardContent>
                  <Badge tone={tier === "Tier C" ? "danger" : "neutral"}>
                    {tier}
                  </Badge>
                  <p className="mt-6 font-semibold">{change}</p>
                  <p className="mt-5 text-xs leading-5 text-[var(--muted-foreground)]">
                    Required: {approval}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--accent)] p-8 md:col-span-4 md:p-12">
              <p className="text-xs font-bold uppercase tracking-[0.12em]">
                Consensus fallback
              </p>
              <p className="mt-12 text-5xl font-semibold tracking-[-0.06em]">
                NO_ACTION
              </p>
            </div>
            <CardContent className="md:col-span-8 md:p-12">
              <CardTitle>Abstention is an engineered outcome.</CardTitle>
              <CardDescription className="max-w-2xl">
                If proposals are invalid, evidence is missing, costs are unsafe,
                AUDIT vetoes or the KEEPER recheck fails, the system does
                nothing externally and records why. It never improvises around
                a failed control.
              </CardDescription>
            </CardContent>
          </div>
        </Card>
      </section>
    </PageShell>
  );
}
