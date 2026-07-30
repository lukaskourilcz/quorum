"use client";

import {
  ArrowDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Gauge,
  Pause,
  Play,
  RotateCcw
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AgentPortrait } from "@/components/agent-portrait";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Agent, AgentId } from "@/data/agents";
import type {
  RoomTranscript,
  RoomTurn,
  RoomTurnMode
} from "@/data/fixtures";
import { cn } from "@/lib/utils";

export interface ReplayChapter {
  id: string;
  label: string;
  title: string;
  summary: string;
  startTurn: number;
}

export interface ReplayForecastOption {
  id: string;
  label: string;
  detail: string;
}

export interface ReplayVerdict {
  outcomeId: string;
  label: string;
  summary: string;
}

const modeLabel: Record<RoomTurnMode, string> = {
  gavel: "opens the room",
  statement: "sets a position",
  response: "responds",
  "reads-ledger": "checks the ledger",
  "raises-concern": "tests the case",
  veto: "records a veto",
  vote: "casts a vote",
  close: "closes the room"
};

const modeTone: Record<
  RoomTurnMode,
  "neutral" | "accent" | "warning" | "success" | "dark"
> = {
  gavel: "accent",
  statement: "neutral",
  response: "neutral",
  "reads-ledger": "dark",
  "raises-concern": "warning",
  veto: "accent",
  vote: "success",
  close: "accent"
};

const speeds = [1, 1.5, 2] as const;

function turnDuration(turn: RoomTurn, speed: number) {
  const wordCount = turn.text.trim().split(/\s+/).length;
  return Math.min(7_200, Math.max(3_400, 1_900 + wordCount * 54)) / speed;
}

function chapterForTurn(chapters: readonly ReplayChapter[], turn: number) {
  return [...chapters]
    .reverse()
    .find((chapter) => chapter.startTurn <= turn) ?? chapters[0];
}

function nextChapterStart(
  chapters: readonly ReplayChapter[],
  activeChapter: ReplayChapter
) {
  const currentChapterIndex = chapters.findIndex(
    (chapter) => chapter.id === activeChapter.id
  );
  return chapters[currentChapterIndex + 1]?.startTurn;
}

function getAgent(agents: readonly Agent[], id: AgentId) {
  return agents.find((agent) => agent.id === id);
}

export function DecisionReplay({
  agents,
  chapters,
  forecastOptions,
  transcript,
  verdict
}: {
  agents: readonly Agent[];
  chapters: readonly ReplayChapter[];
  forecastOptions: readonly ReplayForecastOption[];
  transcript: RoomTranscript;
  verdict: ReplayVerdict;
}) {
  const [selectedForecast, setSelectedForecast] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof speeds)[number]>(1);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const replayRef = useRef<HTMLElement>(null);

  const lastTurnIndex = transcript.turns.length - 1;
  const currentTurn = transcript.turns[currentTurnIndex]!;
  const currentAgent = getAgent(agents, currentTurn.agent);
  const addressedAgent = currentTurn.addressedTo
    ? getAgent(agents, currentTurn.addressedTo)
    : undefined;
  const activeChapter = useMemo(
    () => chapterForTurn(chapters, currentTurnIndex),
    [chapters, currentTurnIndex]
  );
  const followingChapterStart = activeChapter
    ? nextChapterStart(chapters, activeChapter)
    : undefined;
  const selectedForecastOption = forecastOptions.find(
    (option) => option.id === selectedForecast
  );
  const forecastMatched =
    selectedForecast !== null && selectedForecast === verdict.outcomeId;
  const progress = ((currentTurnIndex + 1) / transcript.turns.length) * 100;

  const goToTurn = useCallback(
    (turn: number) => {
      const nextTurn = Math.min(lastTurnIndex, Math.max(0, turn));
      setCurrentTurnIndex(nextTurn);
      if (nextTurn < lastTurnIndex) {
        setIsPlaying(false);
      }
    },
    [lastTurnIndex]
  );

  const togglePlayback = useCallback(() => {
    if (!hasStarted) return;
    if (currentTurnIndex === lastTurnIndex) {
      setCurrentTurnIndex(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying((playing) => !playing);
  }, [currentTurnIndex, hasStarted, lastTurnIndex]);

  const startReplay = useCallback(
    (withPlayback: boolean) => {
      setHasStarted(true);
      setCurrentTurnIndex(0);
      setIsPlaying(withPlayback && !prefersReducedMotion);
      window.requestAnimationFrame(() => {
        replayRef.current?.focus({ preventScroll: true });
      });
    },
    [prefersReducedMotion]
  );

  const resetReplay = useCallback(() => {
    setHasStarted(false);
    setCurrentTurnIndex(0);
    setIsPlaying(false);
    setSelectedForecast(null);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (!isPlaying || !hasStarted) return;
    const timer = window.setTimeout(() => {
      if (currentTurnIndex >= lastTurnIndex) {
        setIsPlaying(false);
        return;
      }
      setCurrentTurnIndex((turn) => turn + 1);
    }, turnDuration(currentTurn, speed));
    return () => window.clearTimeout(timer);
  }, [
    currentTurn,
    currentTurnIndex,
    hasStarted,
    isPlaying,
    lastTurnIndex,
    speed
  ]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setIsPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, a, input, select, textarea, [contenteditable='true']"
        )
      ) {
        return;
      }
      if (!hasStarted) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToTurn(currentTurnIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToTurn(currentTurnIndex + 1);
      }
      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [currentTurnIndex, goToTurn, hasStarted, togglePlayback]);

  if (!currentAgent || !activeChapter) return null;

  return (
    <section
      aria-label="Decision Replay"
      className="border-b border-[var(--border)] bg-[var(--graphite)] text-[var(--snow)]"
      id="decision-replay"
      ref={replayRef}
      tabIndex={-1}
    >
      <p aria-live="polite" className="sr-only">
        {hasStarted
          ? `Turn ${currentTurnIndex + 1} of ${transcript.turns.length}. ${currentAgent.id} ${modeLabel[currentTurn.mode]}.`
          : "Decision Replay ready."}
      </p>

      <div className="mx-auto max-w-[var(--container)] px-5 py-8 md:px-10 md:py-12">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone="accent">Decision Replay</Badge>
            <Badge className="border-[var(--iron)] bg-[var(--graphite)] text-[var(--paper)]">
              Recorded fixture
            </Badge>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--ash)]">
              {hasStarted
                ? `${String(currentTurnIndex + 1).padStart(2, "0")} / ${String(transcript.turns.length).padStart(2, "0")}`
                : `${transcript.turns.length} turns`}
            </span>
          </div>
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] px-3 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--iron)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            href="#full-transcript"
          >
            Read the full transcript
            <ArrowDown aria-hidden="true" className="size-4" />
          </a>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--iron)] bg-[var(--obsidian)]">
          {!hasStarted ? (
            <div className="grid min-h-[38rem] lg:grid-cols-12">
              <div className="relative flex flex-col justify-between overflow-hidden p-7 md:p-10 lg:col-span-7 lg:min-h-[42rem] lg:p-12">
                <div
                  aria-hidden="true"
                  className="editorial-grid absolute inset-0 opacity-15"
                />
                <div
                  aria-hidden="true"
                  className="absolute -right-32 -top-32 size-[34rem] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_21%,transparent),transparent_65%)]"
                />
                <div className="relative">
                  <p className="mono-label text-[var(--accent)]">
                    Before the gavel
                  </p>
                  <h2 className="mt-5 max-w-3xl text-[clamp(2.6rem,6vw,5.6rem)] font-semibold leading-[0.9] tracking-[-0.06em]">
                    Three ideas.
                    <br />
                    Zero real signals.
                    <br />
                    What would you do
                    <span className="text-[var(--accent)]">?</span>
                  </h2>
                  <p className="mt-7 max-w-xl text-base leading-7 text-[var(--ash)] md:text-lg">
                    Make a private forecast, then watch the council test the
                    budget, audience and evidence before it votes.
                  </p>
                </div>
                <div className="relative mt-12 grid gap-3 sm:grid-cols-3">
                  {[
                    ["34/50", "Best idea score", "Gate: 35"],
                    ["0/3", "Eligible sources", "Gate: 3"],
                    ["$0.00", "Actual API cost", "Offline run"]
                  ].map(([value, label, foot]) => (
                    <div
                      className="border-t border-[var(--iron)] pt-4"
                      key={label}
                    >
                      <p className="text-3xl font-semibold tracking-[-0.05em] tabular-nums">
                        {value}
                      </p>
                      <p className="mt-2 text-sm text-[var(--ash)]">{label}</p>
                      <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                        {foot}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-[var(--iron)] bg-[var(--graphite)] p-7 md:p-10 lg:col-span-5 lg:border-l lg:border-t-0 lg:p-12">
                <p className="mono-label text-[var(--ash)]">
                  Your call stays private
                </p>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
                  What should the council do?
                </h3>
                <div className="mt-7 grid gap-3">
                  {forecastOptions.map((option) => {
                    const selected = selectedForecast === option.id;
                    return (
                      <button
                        aria-pressed={selected}
                        className={cn(
                          "group min-h-24 rounded-[var(--radius-button)] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                          selected
                            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--graphite))]"
                            : "border-[var(--iron)] bg-[var(--obsidian)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                        )}
                        key={option.id}
                        onClick={() => setSelectedForecast(option.id)}
                        type="button"
                      >
                        <span className="flex items-start gap-3">
                          <span
                            className={cn(
                              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                              selected
                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--obsidian)]"
                                : "border-[var(--steel)] text-transparent"
                            )}
                          >
                            {selected ? (
                              <Check aria-hidden="true" className="size-3.5" />
                            ) : (
                              <Circle aria-hidden="true" className="size-2" />
                            )}
                          </span>
                          <span>
                            <span className="block text-sm font-semibold text-[var(--paper)]">
                              {option.label}
                            </span>
                            <span className="mt-1.5 block text-xs leading-5 text-[var(--ash)]">
                              {option.detail}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-7 grid gap-3">
                  <Button
                    className="w-full"
                    disabled={!selectedForecast}
                    onClick={() => startReplay(true)}
                    variant="accent"
                  >
                    <Play aria-hidden="true" className="size-4 fill-current" />
                    Lock forecast and watch
                  </Button>
                  <Button
                    className="w-full border-[var(--iron)] bg-transparent text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                    onClick={() => startReplay(false)}
                    variant="secondary"
                  >
                    Step through without a forecast
                  </Button>
                </div>
                <p className="mt-5 text-xs leading-5 text-[var(--fog)]">
                  No account, points or bet. Your choice stays in this tab and
                  is never sent.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid lg:grid-cols-12">
                <div className="relative min-h-[33rem] overflow-hidden p-7 md:p-10 lg:col-span-8 lg:min-h-[40rem] lg:p-12">
                  <div
                    aria-hidden="true"
                    className="editorial-grid absolute inset-0 opacity-10"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute -left-36 bottom-[-18rem] size-[38rem] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_68%)]"
                  />

                  <div className="relative flex h-full flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <AgentPortrait
                          agent={currentAgent}
                          className="size-12 shrink-0 rounded-full ring-1 ring-[var(--steel)] md:size-14"
                          priority
                        />
                        <div>
                          <p className="font-mono text-sm font-semibold tracking-[-0.01em] text-[var(--paper)]">
                            {currentAgent.id}
                          </p>
                          <p className="mt-1 text-xs text-[var(--ash)]">
                            {currentAgent.title}
                          </p>
                        </div>
                      </div>
                      <Badge tone={modeTone[currentTurn.mode]}>
                        {modeLabel[currentTurn.mode]}
                      </Badge>
                    </div>

                    <div
                      className="flex flex-1 flex-col justify-center py-10 md:py-14"
                      key={currentTurnIndex}
                    >
                      {addressedAgent ? (
                        <p className="mb-4 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">
                          To {addressedAgent.id}
                        </p>
                      ) : null}
                      <blockquote className="max-w-4xl text-[clamp(1.55rem,3.2vw,3rem)] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--snow)]">
                        “{currentTurn.text}”
                      </blockquote>
                      {currentTurn.evidenceRefs?.length ? (
                        <div className="mt-7 flex flex-wrap gap-2">
                          <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
                            On record
                          </span>
                          {currentTurn.evidenceRefs.map((reference) => (
                            <span
                              className="rounded-full border border-[var(--steel)] px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--ash)]"
                              key={reference}
                            >
                              {reference}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--iron)] pt-5 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                      <span>Turn {currentTurnIndex + 1}</span>
                      <span>{activeChapter.label}</span>
                      <span>{isPlaying ? `Playing at ${speed}×` : "Paused"}</span>
                    </div>
                  </div>
                </div>

                <aside className="border-t border-[var(--iron)] bg-[var(--graphite)] p-7 md:p-10 lg:col-span-4 lg:border-l lg:border-t-0">
                  <p className="mono-label text-[var(--accent)]">Now in room</p>
                  <h3 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.045em]">
                    {activeChapter.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-[var(--ash)]">
                    {activeChapter.summary}
                  </p>

                  <div className="mt-8 border-t border-[var(--iron)] pt-6">
                    <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                      Your forecast
                    </p>
                    <p className="mt-3 text-sm font-semibold text-[var(--paper)]">
                      {selectedForecastOption?.label ?? "No forecast made"}
                    </p>
                  </div>

                  <div className="mt-8 border-t border-[var(--iron)] pt-6">
                    <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                      In the room
                    </p>
                    <div
                      aria-label="Agents in the room"
                      className="mt-4 flex flex-wrap gap-2"
                      role="list"
                    >
                      {agents.map((agent) => (
                        <div
                          aria-label={`${agent.id}, ${agent.title}`}
                          className={cn(
                            "rounded-full transition-opacity",
                            agent.id === currentAgent.id
                              ? "ring-2 ring-[var(--accent)]"
                              : "opacity-45"
                          )}
                          key={agent.id}
                          role="listitem"
                        >
                          <AgentPortrait
                            agent={agent}
                            className="size-9 rounded-full"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {followingChapterStart !== undefined ? (
                    <button
                      className="mt-8 w-full rounded-[var(--radius-button)] border border-[var(--iron)] bg-[var(--obsidian)] p-4 text-left transition-colors hover:border-[var(--steel)] hover:bg-[var(--iron)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      onClick={() => goToTurn(followingChapterStart)}
                      type="button"
                    >
                      <span className="mono-label text-[0.625rem] text-[var(--fog)]">
                        Jump to next chapter
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-[var(--paper)]">
                        {
                          chapters.find(
                            (chapter) =>
                              chapter.startTurn === followingChapterStart
                          )?.title
                        }
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                      </span>
                    </button>
                  ) : (
                    <div className="mt-8 rounded-[var(--radius-button)] border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--graphite))] p-5">
                      <p className="mono-label text-[0.625rem] text-[var(--accent)]">
                        Recorded verdict
                      </p>
                      <p className="mt-3 text-lg font-semibold text-[var(--paper)]">
                        {verdict.label}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[var(--ash)]">
                        {verdict.summary}
                      </p>
                      <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-[var(--paper)]">
                        <span className="flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--obsidian)]">
                          {forecastMatched ? (
                            <Check aria-hidden="true" className="size-3.5" />
                          ) : (
                            <Circle aria-hidden="true" className="size-2" />
                          )}
                        </span>
                        {selectedForecast === null
                          ? "You watched without a forecast."
                          : forecastMatched
                            ? "Your forecast matched the room."
                            : "The evidence gate changed the call."}
                      </p>
                    </div>
                  )}
                </aside>
              </div>

              <div className="border-t border-[var(--iron)] bg-[var(--graphite)] p-5 md:p-6">
                <label className="sr-only" htmlFor="replay-progress">
                  Replay progress
                </label>
                <input
                  className="h-11 w-full cursor-pointer accent-[var(--accent)]"
                  id="replay-progress"
                  max={lastTurnIndex}
                  min={0}
                  onChange={(event) => goToTurn(Number(event.target.value))}
                  step={1}
                  type="range"
                  value={currentTurnIndex}
                />
                <div
                  aria-hidden="true"
                  className="-mt-6 mb-5 h-1 overflow-hidden rounded-full bg-[var(--iron)]"
                >
                  <div
                    className="h-full bg-[var(--accent)] transition-[width] duration-200 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      aria-label="Previous turn"
                      className="border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                      disabled={currentTurnIndex === 0}
                      onClick={() => goToTurn(currentTurnIndex - 1)}
                      size="small"
                      variant="secondary"
                    >
                      <ChevronLeft aria-hidden="true" className="size-4" />
                      Previous
                    </Button>
                    <Button
                      className="min-w-28"
                      onClick={togglePlayback}
                      size="small"
                      variant="accent"
                    >
                      {isPlaying ? (
                        <Pause
                          aria-hidden="true"
                          className="size-4 fill-current"
                        />
                      ) : (
                        <Play
                          aria-hidden="true"
                          className="size-4 fill-current"
                        />
                      )}
                      {isPlaying
                        ? "Pause"
                        : currentTurnIndex === lastTurnIndex
                          ? "Replay"
                          : "Play"}
                    </Button>
                    <Button
                      aria-label="Next turn"
                      className="border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                      disabled={currentTurnIndex === lastTurnIndex}
                      onClick={() => goToTurn(currentTurnIndex + 1)}
                      size="small"
                      variant="secondary"
                    >
                      Next
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 inline-flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                      <Gauge aria-hidden="true" className="size-3.5" />
                      Pace
                    </span>
                    {speeds.map((option) => (
                      <button
                        aria-pressed={speed === option}
                        className={cn(
                          "min-h-9 rounded-[var(--radius-button)] border px-3 font-mono text-[0.6875rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                          speed === option
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--obsidian)]"
                            : "border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)]"
                        )}
                        key={option}
                        onClick={() => setSpeed(option)}
                        type="button"
                      >
                        {option}×
                      </button>
                    ))}
                    <Button
                      className="ml-1 border-[var(--iron)] bg-transparent text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                      onClick={resetReplay}
                      size="small"
                      variant="ghost"
                    >
                      <RotateCcw aria-hidden="true" className="size-3.5" />
                      Start over
                    </Button>
                  </div>
                </div>

                {prefersReducedMotion ? (
                  <p className="mt-4 text-xs leading-5 text-[var(--fog)]">
                    Reduced motion is active. The replay starts paused for
                    manual stepping.
                  </p>
                ) : (
                  <p className="mt-4 text-xs leading-5 text-[var(--fog)]">
                    Keyboard: left and right arrows change turns. Space pauses
                    or resumes when focus is outside a control.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
          <span>Recorded public turns only</span>
          <span>No simulated dialogue · no forecast telemetry</span>
        </div>
      </div>
    </section>
  );
}
