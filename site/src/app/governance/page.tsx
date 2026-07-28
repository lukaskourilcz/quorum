import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { governanceSteps } from "@/data/fixtures";

export const metadata: Metadata = {
  description:
    "The evidence, consensus, permission, budget and public-record controls governing BoardlessAI.",
  title: "Governance"
};

const controls = [
  {
    title: "Structured proposals",
    text: "Every candidate carries a task type, bounded scope, evidence references, owner, expected outcome and cost."
  },
  {
    title: "Deterministic consensus",
    text: "Candidate authorship is hidden; four formal seats use ranked Borda voting with a rotating chair."
  },
  {
    title: "Independent veto",
    text: "AUDIT can block unsupported claims, unsafe patches, security risk and control regressions."
  },
  {
    title: "All-in budget",
    text: "Calls, media, treasury payments and commitments share one $20 monthly operating ceiling."
  },
  {
    title: "Human authority",
    text: "Credentials, legal acts, brand clearance, high-impact spend and Tier C organization changes require explicit approval."
  },
  {
    title: "Truthful unknowns",
    text: "Unavailable data is n/a, fixture evidence is excluded and no-action decisions remain part of the public record."
  }
] as const;

const stepTags = ["SCOUT", "COUNCIL", "PEOPLE", "BORDA", "FORGE", "LEDGER"];

const agentMay = [
  "Research allowlisted public sources.",
  "Score opportunities and recommend NO_ACTION.",
  "Edit allowlisted repository paths through review gates.",
  "Prepare experiments, pages and social drafts.",
  "Publish only after credentials, scope and channel approval exist."
] as const;

const humanOnly = [
  "Supply or rotate credentials and secrets.",
  "Accept terms, sign contracts or form legal entities.",
  "Clear or rename the company brand.",
  "Approve external spend outside pre-authorized bounds.",
  "Make Tier C control or organization changes."
] as const;

export default function GovernancePage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[0.875rem] border border-l-[3px] border-[var(--accent)] bg-[var(--surface-raised)] p-5 text-sm leading-6 text-[var(--mist)]">
            Autonomy does not expand authority. Missing credentials, permission
            or evidence always fails closed.
          </div>
        }
        description="BoardlessAI delegates operations to agents, not accountability. The system is designed around explicit authority, bounded context and reversible work."
        eyebrow="Operating constitution"
        title="Governance by evidence"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pt-24 md:px-10">
        <div className="panel-grid md:grid-cols-2 lg:grid-cols-3">
          {controls.map((control, index) => (
            <div
              className="flex min-h-62 flex-col justify-between bg-[var(--card)] p-8 transition-colors hover:bg-[var(--surface-raised)] md:p-10"
              key={control.title}
            >
              <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-[var(--accent)]">
                {String(index + 1).padStart(2, "0")}
              </p>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em]">
                  {control.title}
                </h2>
                <p className="mt-4 text-[0.90625rem] leading-6 text-[var(--fog)]">
                  {control.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
        <SectionHeading
          description="The same loop handles strategy, builds, growth, finance, social, incidents and organization changes."
          eyebrow="Decision sequence"
          title="From observation to verified record"
        />
        <div className="border-t border-[var(--border)]">
          {governanceSteps.map((step, index) => (
            <div
              className="grid gap-4 border-b border-[var(--border)] px-4 py-7 transition-colors hover:bg-[var(--surface-raised)] md:grid-cols-12 md:items-baseline md:gap-8"
              key={step.number}
            >
              <span className="font-mono text-xs tracking-[0.1em] text-[var(--accent)] md:col-span-1">
                {step.number}
              </span>
              <h3 className="text-[1.6875rem] font-semibold leading-tight tracking-[-0.04em] md:col-span-3">
                {step.title}
              </h3>
              <p className="max-w-3xl text-[0.96875rem] leading-7 text-[var(--fog)] md:col-span-7">
                {step.description}
              </p>
              <span className="font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--iron)] md:col-span-1 md:justify-self-end">
                {stepTags[index]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
          <SectionHeading
            description="The boundary is deliberate: agents can prepare and execute reversible work, while people retain legal and credential authority."
            eyebrow="Authority matrix"
            title="What agents may—and may not—do"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              {
                label: "Agent authority",
                title: "Bounded and reversible",
                items: agentMay,
                color: "text-[var(--success)]",
                marker: "+"
              },
              {
                label: "Human authority",
                title: "Explicit approval only",
                items: humanOnly,
                color: "text-[var(--accent)]",
                marker: "—"
              }
            ].map((group) => (
              <div
                className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]"
                key={group.label}
              >
                <div className="border-b border-[var(--border)] px-8 py-7 md:px-9">
                  <p className={`mono-label text-[0.65625rem] ${group.color}`}>
                    {group.label}
                  </p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
                    {group.title}
                  </h3>
                </div>
                <div className="grid gap-4 px-8 py-7 md:px-9">
                  {group.items.map((item) => (
                    <div
                      className="grid grid-cols-[1rem_1fr] gap-3 text-[0.90625rem] leading-6 text-[var(--ash)]"
                      key={item}
                    >
                      <span className={group.color}>{group.marker}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <p className="mono-label text-[var(--accent)]">
              Organization changes
            </p>
            <h2 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.05em]">
              Roles cannot rewrite their own controls.
            </h2>
          </div>
          <div className="grid gap-4 md:col-span-8 lg:grid-cols-3">
            {[
              ["Tier A", "Prompt or routing refinement", "PEOPLE", false],
              ["Tier B", "Mandate or release control", "PEOPLE + AUDIT", false],
              ["Tier C", "Authority, budget or human boundary", "HUMAN_APPROVAL", true]
            ].map(([tier, scope, required, critical]) => (
              <div
                className={`flex min-h-52 flex-col justify-between rounded-[1.125rem] border bg-[var(--card)] p-8 ${
                  critical
                    ? "border-[var(--accent)]"
                    : "border-[var(--border)]"
                }`}
                key={String(tier)}
              >
                <span
                  className={`self-start rounded-full border px-3 py-1 font-mono text-[0.625rem] uppercase tracking-[0.16em] ${
                    critical
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--slate)] text-[var(--fog)]"
                  }`}
                >
                  {String(tier)}
                </span>
                <div>
                  <p className="font-semibold leading-snug">{String(scope)}</p>
                  <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--fog)]">
                    Required: {String(required)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 pb-24 md:px-10 md:pb-30">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--accent)] p-10 text-[var(--obsidian)] md:col-span-4 md:p-12">
              <p className="mono-label text-[0.65625rem] font-semibold">
                Consensus fallback
              </p>
              <p className="mt-12 text-[2.875rem] font-semibold tracking-[-0.06em]">
                NO_ACTION
              </p>
            </div>
            <div className="bg-[var(--card)] p-10 md:col-span-8 md:p-12">
              <h3 className="text-2xl font-semibold tracking-[-0.04em]">
                Abstention is an engineered outcome.
              </h3>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">
                If proposals are invalid, evidence is missing, costs are unsafe,
                AUDIT vetoes or the KEEPER recheck fails, the system does
                nothing externally and records why. It never improvises around
                a failed control.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
