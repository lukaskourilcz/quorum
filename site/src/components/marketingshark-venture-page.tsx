import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { formatDate } from "@/lib/utils";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

async function directoryNames(absolute: string): Promise<string[]> {
  try {
    return await readdir(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function optionalJson<T>(absolute: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(absolute, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

interface LedgerShape {
  brands?: Record<string, {
    epoch?: number;
    served?: Array<{ date?: string; hookA?: string }>;
    reshuffles?: unknown[];
  }>;
}

/**
 * What the room has actually produced, counted from what is committed.
 *
 * Nothing is projected. A venture founded today shows no packages and says so, which is the
 * honest state; the bank size is read from the snapshot rather than restated, so it cannot drift
 * away from the file the room actually serves from.
 */
async function marketingSharkSummary(): Promise<{
  days: string[];
  bankSize: number;
  rotation: number;
  brandsEnabled: string[];
}> {
  const [packageDays, bank, ledger, config] = await Promise.all([
    directoryNames(path.join(repositoryRoot, "state", "ventures", "marketingshark", "packages")),
    optionalJson<{ questions?: unknown[] }>(path.join(repositoryRoot, "state", "marketingshark", "question-banks", "devshark.json")),
    optionalJson<LedgerShape>(path.join(repositoryRoot, "state", "marketingshark", "ledger.json")),
    optionalJson<{ brands?: Array<{ id: string; enabled: boolean; displayName: string }> }>(
      path.join(repositoryRoot, "config", "marketingshark.json"))
  ]);

  const served = ledger?.brands?.devshark?.served ?? [];
  return {
    days: packageDays.filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse(),
    bankSize: bank?.questions?.length ?? 0,
    rotation: new Set(served.map((entry) => entry.hookA).filter(Boolean)).size,
    brandsEnabled: (config?.brands ?? []).filter((brand) => brand.enabled).map((brand) => brand.displayName)
  };
}

export async function MarketingSharkVenturePage() {
  const { days, bankSize, rotation, brandsEnabled } = await marketingSharkSummary();
  const latest = days[0];
  return (
    <PageShell>
      <article>
        <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-20">
          <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/ventures">
            <ArrowLeft aria-hidden="true" className="size-4" />
            All projects
          </Link>
          <div className="mt-10 grid gap-10 md:grid-cols-12 md:items-end">
            <div className="min-w-0 md:col-span-8">
              <div className="flex flex-wrap gap-2">
                <Badge>Project 008</Badge>
                <Badge>Drafts for approval</Badge>
              </div>
              <h1 className="mt-7 text-[clamp(3.5rem,9vw,8rem)] font-semibold leading-[0.84] tracking-[-0.075em]">
                marketing<span className="sm:inline"><br className="sm:hidden" />Shark</span><span className="text-[var(--accent)]">.</span>
              </h1>
            </div>
            <div className="md:col-span-4">
              <p className="text-lg leading-8 text-[var(--muted-foreground)]">
                One meeting every weekday morning drafts one devShark post in English: a quiz
                question on Monday and Thursday, one screen of the product on Tuesday, an Easy
                coding challenge on Wednesday and the week&apos;s recap on Friday. Each is five
                slides with its own caption for LinkedIn, Instagram and Threads.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] md:grid-cols-3">
            {[
              ["Packages drafted", latest ? `${days.length} drafted · latest ${formatDate(latest)}` : "None drafted yet."],
              ["Questions in the bank", bankSize > 0 ? `${bankSize.toLocaleString("en-GB")} imported, served one a day.` : "No bank imported yet."],
              ["Hook patterns used", rotation > 0 ? `${rotation} so far.` : "None used yet."]
            ].map(([title, body]) => (
              <div className="bg-[var(--card)] p-7 md:p-9" key={title}>
                <CheckCircle2 aria-hidden="true" className="size-5 text-[var(--accent)]" />
                <h2 className="mt-8 text-xl font-semibold">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--fog)]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-8 md:grid-cols-12">
            <div className="md:col-span-5">
              <Badge>How it works</Badge>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">
                One paid step, and eleven that cost nothing.
              </h2>
              <p className="mt-5 text-sm leading-6 text-[var(--muted-foreground)]">
                Which post runs, which facts it may state, which opening line it may carry, how it
                is drawn and where it is stored are all decided in code. The only thing bought from
                a model is the writing itself, once per brand per weekday. The weekend has no room.
              </p>
            </div>
            <div className="grid gap-5 md:col-span-7">
              {[
                ["The question is chosen, not generated", "Every question is served once before any repeats. The order comes from the bank itself, so the same day always produces the same question."],
                ["An opening line has to be true", "Each hook carries conditions: four options, a hard question, real code. A line whose conditions do not hold is not offered that day."],
                ["Code owns the facts", "The screen, the challenge and the week's numbers come from devShark's own records and the fact sheet in effect. The writer fills in the words around them, and a number the facts do not state is refused."],
                ["Nothing is sent without the owner", "The day ends with three drafts in the Admin Queue, one per platform, each drawn and checked. None is sent until the owner approves it."]
              ].map(([title, body]) => (
                <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6" key={title}>
                  <h3 className="text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--fog)]">{body}</p>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
          <div className="grid gap-6 md:grid-cols-2">
            <Callout tone="accent">
              <LockKeyhole aria-hidden="true" className="mb-4 size-5" />
              <strong>Nothing posts without an approval.</strong> A publishing path to devShark&apos;s
              LinkedIn, Instagram and Threads profiles is registered and held. It opens only once
              the owner countersigns the decision and connects the profiles, and then only for a
              post the owner approves in the Queue. The kill switch stops all of it.
            </Callout>
            <Callout>
              <strong>The product is read, never changed.</strong> devShark&apos;s questions and
              challenges are consumed as pinned snapshots with their source commit recorded.{" "}
              {brandsEnabled[0]
                ? `${brandsEnabled[0]} is the only product it promotes.`
                : "No brand is switched on today."}{" "}
              Nothing is written back to the product.
            </Callout>
          </div>
        </section>
      </article>
    </PageShell>
  );
}
