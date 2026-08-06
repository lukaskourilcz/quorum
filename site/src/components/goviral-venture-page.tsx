import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { parsePublicIdeaLedger } from "@/lib/idea-ledger-model";
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

async function optionalText(absolute: string): Promise<string | null> {
  try {
    return await readFile(absolute, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * What the room has actually produced, counted from what is committed.
 *
 * Nothing here is projected or estimated. A room that has met once shows one brief; a room that
 * has not met yet shows none and says so, which is the honest state of a venture founded today.
 */
async function goViralSummary(): Promise<{ briefs: string[]; ideas: number; snapshots: string[] }> {
  const [planFiles, snapshotFiles, ledger] = await Promise.all([
    directoryNames(path.join(repositoryRoot, "state", "ventures", "goviral", "plans")),
    directoryNames(path.join(repositoryRoot, "state", "goviral", "trends")),
    optionalText(path.join(repositoryRoot, "state", "ideas", "goviral", "ledger.jsonl"))
  ]);
  return {
    briefs: planFiles
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/^plan-/u, "").slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort()
      .reverse(),
    ideas: ledger ? (parsePublicIdeaLedger(ledger, "goviral") ?? []).length : 0,
    snapshots: snapshotFiles
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => name.slice(0, 10))
      .sort()
      .reverse()
  };
}

export async function GoViralVenturePage() {
  const { briefs, ideas, snapshots } = await goViralSummary();
  const latestBrief = briefs[0];
  const latestSnapshot = snapshots[0];
  return (
    <PageShell>
      <article>
        <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-20">
          <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/ventures">
            <ArrowLeft aria-hidden="true" className="size-4" />
            All projects
          </Link>
          <div className="mt-10 grid gap-10 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8">
              <div className="flex flex-wrap gap-2">
                <Badge>Project 007</Badge>
                <Badge>Drafts only</Badge>
              </div>
              <h1 className="mt-7 text-[clamp(3.5rem,9vw,8rem)] font-semibold leading-[0.84] tracking-[-0.075em]">
                GoVIRAL<span className="text-[var(--accent)]">.</span>
              </h1>
            </div>
            <div className="md:col-span-4">
              <p className="text-lg leading-8 text-[var(--muted-foreground)]">
                One meeting a week reads public Instagram and Threads data, says what is genuinely
                rising, and writes it up as things to publish — for the owner, and for the two
                magazines.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] md:grid-cols-3">
            {[
              ["Weekly briefs", latestBrief ? `${briefs.length} written · latest ${formatDate(latestBrief)}` : "None written yet."],
              ["Ideas recorded", ideas === 1 ? "1 idea on the ledger." : `${ideas} ideas on the ledger.`],
              ["Trend snapshots", latestSnapshot ? `${snapshots.length} stored · latest ${formatDate(latestSnapshot)}` : "None stored yet."]
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
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">Mondays, and only Mondays.</h2>
              <p className="mt-5 text-sm leading-6 text-[var(--muted-foreground)]">
                Before the meeting opens, a deterministic step reads public posts from a small,
                fixed list of topics. The room then sees the numbers — how fast things are rising,
                which formats carry them, what went quiet — and never the posts themselves.
              </p>
            </div>
            <div className="grid gap-5 md:col-span-7">
              {[
                ["The owner's weekly brief", "Trend calls with the numbers behind them, concrete things to write, and one trend deliberately skipped with the reason."],
                ["Marketing for the magazines", "Ideas for DNESKAi and MMA Files, recorded on the idea ledger for you to rate."],
                ["One handover, at most", "If a trend genuinely belongs to another desk, the room hands it over as tomorrow's agenda. Usually it does not."]
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
              <strong>Nothing here posts.</strong> The room produces drafts and plans. It cannot
              publish, schedule, buy advertising or open an account, and it never promises a
              follower or reach number.
            </Callout>
            <Callout>
              <strong>Scraped data stays data.</strong> Public posts are read for their numbers,
              kept for thirty days and then deleted. No post, handle or image is ever republished
              on any BoardlessAI surface.
            </Callout>
          </div>
        </section>
      </article>
    </PageShell>
  );
}
