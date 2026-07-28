import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel, ShieldAlert } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { agentById } from "@/data/agents";
import { standups } from "@/data/fixtures";
import type { RoomTurnMode } from "@/data/fixtures";
import { formatDate } from "@/lib/utils";

export function generateStaticParams() {
  return standups.map((standup) => ({ date: standup.date }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const standup = standups.find((item) => item.date === date);
  return {
    description: standup
      ? `Boardroom transcript for the ${formatDate(date)} standup — human-readable dialogue between the seated agents.`
      : "BoardlessAI room transcript.",
    robots: standup?.fixture ? { follow: true, index: false } : undefined,
    title: standup ? `Room · ${formatDate(date)}` : "Room transcript"
  };
}

const modeLabel: Record<RoomTurnMode, string> = {
  gavel: "opens the room",
  statement: "on the record",
  response: "responds",
  "reads-ledger": "reads from the ledger",
  "raises-concern": "raises a concern",
  veto: "veto held",
  vote: "casts vote",
  close: "closes the room"
};

const modeTone: Record<
  RoomTurnMode,
  "neutral" | "accent" | "warning" | "success" | "dark"
> = {
  gavel: "accent",
  statement: "neutral",
  response: "neutral",
  "reads-ledger": "neutral",
  "raises-concern": "warning",
  veto: "accent",
  vote: "success",
  close: "accent"
};

function formatCetTime(iso: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague"
  }).format(new Date(iso));
}

export default async function StandupRoomPage({
  params
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const standup = standups.find((item) => item.date === date);
  if (!standup) {
    notFound();
  }
  const transcript = standup.roomTranscript;
  const gavelAgent = agentById.get(transcript.gavel);

  return (
    <PageShell>
      <article>
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-18">
            <Link
              className={buttonVariants({ variant: "ghost", size: "small" })}
              href={`/standups/${standup.date}`}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to standup
            </Link>
            <div className="mt-10 flex flex-wrap gap-2">
              <Badge tone="accent">Room transcript</Badge>
              <Badge>{standup.fixture ? "Offline fixture" : "Live"}</Badge>
              <Badge tone="dark">{standup.stage}</Badge>
            </div>
            <h1 className="mt-7 max-w-4xl break-words text-[clamp(2.5rem,6vw,5.5rem)] font-semibold leading-[0.9] tracking-[-0.06em]">
              What the room actually said
              <span className="text-[var(--accent)]">.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-[var(--muted-foreground)] md:text-lg">
              A plain-language reconstruction of the {formatDate(date)}{" "}
              {standup.phase} cycle. Each turn shows who was speaking, who
              they were addressing and what part of the decision was under
              discussion. No hidden reasoning — just the record.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm text-[var(--muted-foreground)]">
              <span>
                Opened{" "}
                <span className="font-mono text-[var(--foreground)]">
                  {formatCetTime(transcript.openedAt)}
                </span>{" "}
                CET
              </span>
              <span>
                Closed{" "}
                <span className="font-mono text-[var(--foreground)]">
                  {formatCetTime(transcript.closedAt)}
                </span>{" "}
                CET
              </span>
              {gavelAgent ? (
                <span className="inline-flex items-center gap-1.5">
                  <Gavel aria-hidden="true" className="size-3.5" />
                  Chaired by{" "}
                  <span className="font-mono text-[var(--foreground)]">
                    {gavelAgent.id}
                  </span>
                </span>
              ) : null}
              <span>{transcript.turns.length} turns</span>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-16">
          <div className="mb-10 rounded-[var(--radius-button)] border border-l-[3px] border-[var(--accent)] bg-[var(--surface-raised)] p-5 text-sm leading-6 text-[var(--mist)]">
            <p className="mono-label mb-2 text-[0.65625rem] text-[var(--accent)]">
              Setting
            </p>
            <p className="break-words">{transcript.setting}</p>
          </div>

          <ol className="grid gap-5">
            {transcript.turns.map((turn, index) => {
              const speaker = agentById.get(turn.agent);
              if (!speaker) return null;
              const listener = turn.addressedTo
                ? agentById.get(turn.addressedTo)
                : null;
              const isAudit = turn.agent === "AUDIT";
              return (
                <li
                  className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-5"
                  key={index}
                >
                  <div className="flex flex-col items-center gap-2">
                    <AgentPortrait
                      agent={speaker}
                      className="size-12 rounded-full sm:size-14"
                    />
                    <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                      #{String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div
                    className={`min-w-0 rounded-[var(--radius-button)] border ${
                      isAudit
                        ? "border-l-[3px] border-l-[var(--accent)] border-[var(--border)]"
                        : "border-[var(--border)]"
                    } bg-[var(--card)] p-5 md:p-6`}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2 gap-y-1.5">
                      <span className="font-mono text-[0.8125rem] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
                        {speaker.id}
                      </span>
                      <span className="min-w-0 truncate text-[0.75rem] text-[var(--fog)]">
                        · {speaker.title}
                      </span>
                      {isAudit ? (
                        <ShieldAlert
                          aria-label="Control seat"
                          className="size-4 shrink-0 text-[var(--accent)]"
                        />
                      ) : null}
                      <Badge className="ml-auto" tone={modeTone[turn.mode]}>
                        {modeLabel[turn.mode]}
                      </Badge>
                    </div>
                    {listener ? (
                      <p className="mb-2 font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--fog)]">
                        → to {listener.id}
                      </p>
                    ) : null}
                    <p className="break-words text-[0.9375rem] leading-7 text-[var(--mist)] md:text-base">
                      {turn.text}
                    </p>
                    {turn.evidenceRefs && turn.evidenceRefs.length ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                        <span className="mono-label text-[0.625rem] text-[var(--fog)]">
                          Cites
                        </span>
                        {turn.evidenceRefs.map((ref) => (
                          <span
                            className="rounded-full border border-[var(--slate)] px-2.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--ash)]"
                            key={ref}
                          >
                            {ref}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {turn.cite ? (
                      <p className="mt-3 border-t border-[var(--border)] pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                        source · {turn.cite}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-12 flex flex-col items-start gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="min-w-0">
              <p className="mono-label text-[0.65625rem] text-[var(--accent)]">
                Room outcome
              </p>
              <p className="mt-2 break-words text-xl font-semibold tracking-[-0.03em] md:text-2xl">
                {standup.decision.outcome}
              </p>
              <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-[var(--fog)]">
                {standup.decision.summary}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href={`/standups/${standup.date}`}
              >
                Full standup record
              </Link>
              <Link
                className={buttonVariants({ variant: "ghost" })}
                href="/boardroom"
              >
                How the room is built
              </Link>
            </div>
          </div>
        </section>
      </article>
    </PageShell>
  );
}
