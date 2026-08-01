import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
export const metadata: Metadata = {
  description:
    "The source, voting, permission, budget and publishing rules used by BoardlessAI.",
  title: "Rules"
};

const controls = [
  {
    title: "Every idea needs the basics",
    text: "Each idea states the job, its limits, sources, responsible role, expected result and cost."
  },
  {
    title: "Voting follows the same rules",
    text: "The author is hidden while four decision makers rank the choices. A different role chairs each meeting."
  },
  {
    title: "Safety can stop the work",
    text: "AUDIT can block unsupported claims, unsafe code changes, security risks and weaker safeguards."
  },
  {
    title: "One monthly spending limit",
    text: "AI services, media, payments and subscriptions share one owner-approved monthly limit. A proposed increase does not count until it is signed."
  },
  {
    title: "Some choices belong to people",
    text: "Passwords, legal acts, brand approval, larger spending and major changes to the system need direct human approval."
  },
  {
    title: "Unknown means unknown",
    text: "Missing data is shown as n/a, sample data never counts as proof and decisions to do nothing remain public."
  }
] as const;

const stepTags = ["RESEARCH", "SUGGEST", "CHOOSE TEAM", "DECIDE", "BUILD", "CHECK"];

const decisionSteps = [
  ["01", "Learn", "The research role gathers information from named public sources that the system is allowed to read."],
  ["02", "Suggest", "The decision makers suggest clear options with sources, expected cost and a reason to stop."],
  ["03", "Choose the team", "Only useful specialists join the meeting. Required safety and budget roles cannot be removed."],
  ["04", "Decide", "Four roles rank the choices. The safety reviewer can block an unsafe action."],
  ["05", "Do the work", "Approved code changes and queued tasks run within limits for each call, day and month."],
  ["06", "Check and publish", "The team checks the result and cost, then publishes the useful record without private system data."]
] as const;

const agentMay = [
  "Research approved public sources.",
  "Score business ideas and recommend doing nothing when proof is weak.",
  "Edit approved parts of the code after required reviews.",
  "Prepare tests, pages and checked social posts.",
  "Publish only after account, health, safety and release checks pass."
] as const;

const humanOnly = [
  "Provide or change passwords and secret keys.",
  "Accept terms, sign contracts or form legal entities.",
  "Approve or rename the company brand.",
  "Approve outside spending beyond the agreed limit.",
  "Make major changes to permissions, budgets or the AI team."
] as const;

export default function GovernancePage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[0.875rem] border border-l-[3px] border-[var(--accent)] bg-[var(--surface-raised)] p-5 text-sm leading-6 text-[var(--mist)]">
            AI roles cannot give themselves more power. Work stops when a
            password, permission or reliable source is missing.
          </div>
        }
        description="AI roles handle the daily work, but they do not get unlimited authority. Every action has clear limits and should be easy to review or undo."
        eyebrow="Company rules"
        title="How the AI team is kept in check"
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
          description="The same six steps are used for plans, code, marketing, money, social posts, problems and team changes."
          eyebrow="How a decision is made"
          title="From a source to a checked result"
        />
        <div className="border-t border-[var(--border)]">
          {decisionSteps.map(([number, title, description], index) => (
            <div
              className="grid gap-4 border-b border-[var(--border)] px-4 py-7 transition-colors hover:bg-[var(--surface-raised)] md:grid-cols-12 md:items-baseline md:gap-8"
              key={number}
            >
              <span className="font-mono text-xs tracking-[0.1em] text-[var(--accent)] md:col-span-1">
                {number}
              </span>
              <h3 className="text-[1.6875rem] font-semibold leading-tight tracking-[-0.04em] md:col-span-3">
                {title}
              </h3>
              <p className="max-w-3xl text-[0.96875rem] leading-7 text-[var(--fog)] md:col-span-7">
                {description}
              </p>
              <span className="font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)] md:col-span-1 md:justify-self-end">
                {stepTags[index]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
          <SectionHeading
            description="AI roles can prepare and carry out work that is easy to undo. People keep control of legal decisions, passwords and other sensitive actions."
            eyebrow="Who can do what"
            title="What AI roles can and cannot do"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              {
                label: "AI role permissions",
                title: "Limited and easy to undo",
                items: agentMay,
                color: "text-[var(--success-soft)]",
                marker: "+"
              },
              {
                label: "Human-only decisions",
                title: "Needs direct approval",
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
              Changes to the AI team
            </p>
            <h2 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.05em]">
              AI roles cannot rewrite their own limits.
            </h2>
          </div>
          <div className="grid gap-4 md:col-span-8 lg:grid-cols-3">
            {[
              ["Small", "Wording or meeting assignment change", "PEOPLE", false],
              ["Medium", "Role responsibility or release check", "PEOPLE + AUDIT", false],
              ["Major", "Permission, budget or human-only rule", "OWNER APPROVAL", true]
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
                    Needs: {String(required)}
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
                Safe fallback
              </p>
              <p className="mt-12 text-[2.875rem] font-semibold tracking-[-0.06em]">
                DO NOTHING
              </p>
            </div>
            <div className="bg-[var(--card)] p-10 md:col-span-8 md:p-12">
              <h3 className="text-2xl font-semibold tracking-[-0.04em]">
                Doing nothing is a valid decision.
              </h3>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">
                If an idea is invalid, sources are missing, costs are unsafe,
                AUDIT blocks it or the final rules check fails, the system takes
                no outside action and saves the reason. It cannot work around a
                failed safety check.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
