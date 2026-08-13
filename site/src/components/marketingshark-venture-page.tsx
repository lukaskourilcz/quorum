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
                <Badge>Drafts only</Badge>
              </div>
              <h1 className="mt-7 text-[clamp(3.5rem,9vw,8rem)] font-semibold leading-[0.84] tracking-[-0.075em]">
                marketing<span className="sm:inline"><br className="sm:hidden" />Shark</span><span className="text-[var(--accent)]">.</span>
              </h1>
            </div>
            <div className="md:col-span-4">
              <p className="text-lg leading-8 text-[var(--muted-foreground)]">
                One meeting every morning takes a single question out of devShark&apos;s own quiz
                bank and writes it up as a Czech and an English carousel — the real question, the
                real answer, and the product mentioned once at the end.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] md:grid-cols-3">
            {[
              ["Packages drafted", latest ? `${days.length} drafted · latest ${formatDate(latest)}` : "None drafted yet."],
              ["Questions in the bank", bankSize > 0 ? `${bankSize.toLocaleString("en-GB")} imported, served one a day.` : "No bank imported yet."],
              ["Hook patterns used", rotation > 0 ? `${rotation} of 16 so far.` : "None used yet."]
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
                Which question runs, which opening line it may carry, whether that line is true of
                it, how it is drawn and where it is stored are all decided in code. The only thing
                bought from a model is the writing itself, once per brand per day.
              </p>
            </div>
            <div className="grid gap-5 md:col-span-7">
              {[
                ["The question is chosen, not generated", "Every question is served once before any repeats. The order comes from the bank itself, so the same day always produces the same question."],
                ["An opening line has to be true", "Each hook carries conditions — four options, a hard question, real code — and a line whose conditions do not hold is not offered that day."],
                ["Czech is written, not translated", "The product's own Czech is reference material. The carousel is written in Czech, in the register a Czech developer actually uses."],
                ["Nothing leaves as a post", "The day ends with a draft, its two carousels drawn and checked, waiting for a person."]
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
              <strong>Nothing here posts.</strong> marketingShark owns no social account, no
              credentials and no publishing path. Every carousel it writes is stored as a draft for
              a person to review.
            </Callout>
            <Callout>
              <strong>The bank is read, never changed.</strong> devShark&apos;s questions are
              consumed as a pinned snapshot with its source commit recorded.{" "}
              {brandsEnabled.length === 1
                ? `${brandsEnabled[0]} is the only brand running today.`
                : `${brandsEnabled.join(" and ")} are running today.`}{" "}
              Nothing is written back to the product.
            </Callout>
          </div>
        </section>
      </article>
    </PageShell>
  );
}
