"use client";

import {
  ArrowDown,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Gauge,
  ListVideo,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Users
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AgentPortrait } from "@/components/agent-portrait";
import { publicAgentText, publicAgentTitle } from "@/components/agent-language";
import { describeReference } from "@/lib/reference-label";
import {
  buildReplayMomentUrl,
  buildReplayPlaylist,
  clearReplayMomentUrl,
  findPlaylistTurnAtOrAfter,
  normalizeTurnIndexes,
  parseReplayMoment,
  type ReplayCut,
  type ReplayMoment
} from "@/components/decision-replay-model";
import { RoomMessageTime } from "@/components/room-message-time";
import { resolveRoomTurnTiming } from "@/components/room-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageContent,
  MessageHeader,
  MessageList,
  MessageMeta,
  MessageName,
  MessageRole
} from "@/components/ui/message";
import { usePreservePageScroll } from "@/components/use-preserve-page-scroll";
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

export interface ReplayVerdict {
  label: string;
  summary: string;
}

export type { ReplayCut } from "@/components/decision-replay-model";

const modeLabel: Record<RoomTurnMode, string> = {
  gavel: "opens the meeting",
  statement: "sets a position",
  response: "responds",
  "reads-ledger": "checks the budget record",
  "raises-concern": "tests the case",
  veto: "records a veto",
  vote: "casts a vote",
  close: "closes the meeting"
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
  cuts,
  transcript,
  verdict
}: {
  agents: readonly Agent[];
  chapters: readonly ReplayChapter[];
  cuts: readonly ReplayCut[];
  transcript: RoomTranscript;
  verdict: ReplayVerdict;
}) {
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof speeds)[number]>(1);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [selectedCutId, setSelectedCutId] = useState("full");
  const [followedAgent, setFollowedAgent] = useState<AgentId | null>(null);
  const [bookmarkedTurns, setBookmarkedTurns] = useState<number[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [resumeMoment, setResumeMoment] = useState<ReplayMoment | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const replayRef = useRef<HTMLElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const preservePageScroll = usePreservePageScroll();

  const lastTurnIndex = transcript.turns.length - 1;
  const bookmarkStorageKey = `boardlessai:replay:bookmarks:${transcript.openedAt}`;
  const progressStorageKey = `boardlessai:replay:progress:${transcript.openedAt}`;
  const savedCut = useMemo<ReplayCut>(
    () => ({
      detail: `${bookmarkedTurns.length} saved ${bookmarkedTurns.length === 1 ? "message" : "messages"} on this device.`,
      id: "saved",
      label: "Saved points",
      turnIndexes: bookmarkedTurns
    }),
    [bookmarkedTurns]
  );
  const availableCuts = useMemo(
    () => (bookmarkedTurns.length ? [...cuts, savedCut] : cuts),
    [bookmarkedTurns.length, cuts, savedCut]
  );
  const selectedCut =
    availableCuts.find((cut) => cut.id === selectedCutId) ??
    cuts.find((cut) => cut.id === "full") ??
    cuts[0];
  const selectedTurnIndexes =
    selectedCut?.id === "saved"
      ? bookmarkedTurns
      : selectedCut?.turnIndexes;
  const unfilteredPlaylist = useMemo(
    () =>
      buildReplayPlaylist({
        followedAgent: null,
        transcript,
        turnIndexes: selectedTurnIndexes
      }),
    [selectedTurnIndexes, transcript]
  );
  const filteredPlaylist = useMemo(
    () =>
      buildReplayPlaylist({
        followedAgent,
        transcript,
        turnIndexes: selectedTurnIndexes
      }),
    [followedAgent, selectedTurnIndexes, transcript]
  );
  const playlist = filteredPlaylist.length
    ? filteredPlaylist
    : unfilteredPlaylist;
  const currentPosition = Math.max(0, playlist.indexOf(currentTurnIndex));
  const lastPlaylistPosition = Math.max(0, playlist.length - 1);
  const currentTurn = transcript.turns[currentTurnIndex]!;
  const currentTurnTiming = resolveRoomTurnTiming(
    transcript,
    currentTurnIndex
  );
  const currentAgent = getAgent(agents, currentTurn.agent);
  const activeChapter = useMemo(
    () => chapterForTurn(chapters, currentTurnIndex),
    [chapters, currentTurnIndex]
  );
  const followingChapterStart = activeChapter
    ? nextChapterStart(chapters, activeChapter)
    : undefined;
  const followingChapterCandidate =
    followingChapterStart === undefined
      ? undefined
      : findPlaylistTurnAtOrAfter(playlist, followingChapterStart);
  const followingChapterTurn =
    followingChapterCandidate !== undefined &&
    followingChapterCandidate > currentTurnIndex
      ? followingChapterCandidate
      : undefined;
  const progress = playlist.length
    ? ((currentPosition + 1) / playlist.length) * 100
    : 0;
  const isBookmarked = bookmarkedTurns.includes(currentTurnIndex);
  const showVerdict =
    currentTurnIndex >= (chapters.at(-1)?.startTurn ?? lastTurnIndex);
  const sharedCutId = selectedCutId === "saved" ? "full" : selectedCutId;
  const replayedTurnIndexes = playlist.slice(0, currentPosition + 1);
  const upcomingTurnIndex = isPlaying
    ? playlist[currentPosition + 1]
    : undefined;
  const upcomingTurn =
    upcomingTurnIndex === undefined
      ? undefined
      : transcript.turns[upcomingTurnIndex];
  const typingAgent = upcomingTurn
    ? getAgent(agents, upcomingTurn.agent)
    : undefined;
  const availableSeatIds = useMemo(() => {
    const ids = new Set<AgentId>();
    unfilteredPlaylist.forEach((turnIndex) => {
      const turn = transcript.turns[turnIndex];
      if (turn) {
        ids.add(turn.agent);
        if (turn.addressedTo) ids.add(turn.addressedTo);
      }
    });
    return ids;
  }, [transcript, unfilteredPlaylist]);

  const goToPlaylistPosition = useCallback(
    (position: number) => {
      const boundedPosition = Math.min(
        lastPlaylistPosition,
        Math.max(0, position)
      );
      const nextTurn = playlist[boundedPosition];
      if (nextTurn === undefined) return;
      setCurrentTurnIndex(nextTurn);
      setIsPlaying(false);
    },
    [lastPlaylistPosition, playlist]
  );

  const togglePlayback = useCallback(() => {
    if (!hasStarted) return;
    if (currentPosition === lastPlaylistPosition) {
      const firstTurn = playlist[0];
      if (firstTurn === undefined) return;
      setCurrentTurnIndex(firstTurn);
      setIsPlaying(true);
      return;
    }
    setIsPlaying((playing) => !playing);
  }, [currentPosition, hasStarted, lastPlaylistPosition, playlist]);

  const startReplay = useCallback(
    (withPlayback: boolean) => {
      const firstTurn = playlist[0] ?? 0;
      setHasStarted(true);
      setCurrentTurnIndex(firstTurn);
      setIsPlaying(withPlayback && !prefersReducedMotion);
      window.requestAnimationFrame(() => {
        replayRef.current?.focus({ preventScroll: true });
      });
    },
    [playlist, prefersReducedMotion]
  );

  const continueReplay = useCallback(() => {
    if (!resumeMoment) return;
    setSelectedCutId(resumeMoment.cutId);
    setFollowedAgent(resumeMoment.followedAgent);
    setCurrentTurnIndex(resumeMoment.turnIndex);
    setHasStarted(true);
    setIsPlaying(!prefersReducedMotion);
    window.requestAnimationFrame(() => {
      replayRef.current?.focus({ preventScroll: true });
    });
  }, [prefersReducedMotion, resumeMoment]);

  const resetReplay = useCallback(() => {
    setHasStarted(false);
    setCurrentTurnIndex(0);
    setIsPlaying(false);
    setSelectedCutId("full");
    setFollowedAgent(null);
    setResumeMoment(null);
    setActionStatus("");
    window.localStorage.removeItem(progressStorageKey);
    window.history.replaceState(
      null,
      "",
      clearReplayMomentUrl(window.location.href)
    );
  }, [progressStorageKey]);

  const selectCut = useCallback(
    (cut: ReplayCut) => {
      const cutPlaylist = buildReplayPlaylist({
        followedAgent,
        transcript,
        turnIndexes: cut.id === "saved" ? bookmarkedTurns : cut.turnIndexes
      });
      const fallbackPlaylist = buildReplayPlaylist({
        followedAgent: null,
        transcript,
        turnIndexes: cut.id === "saved" ? bookmarkedTurns : cut.turnIndexes
      });
      const nextPlaylist = cutPlaylist.length ? cutPlaylist : fallbackPlaylist;
      setSelectedCutId(cut.id);
      if (!cutPlaylist.length) setFollowedAgent(null);
      if (nextPlaylist[0] !== undefined) setCurrentTurnIndex(nextPlaylist[0]);
      setIsPlaying(false);
      setActionStatus(`${cut.label} selected.`);
    },
    [bookmarkedTurns, followedAgent, transcript]
  );

  const followSeat = useCallback(
    (agentId: AgentId | null) => {
      const nextPlaylist = buildReplayPlaylist({
        followedAgent: agentId,
        transcript,
        turnIndexes: selectedTurnIndexes
      });
      if (!nextPlaylist.length) return;
      setFollowedAgent(agentId);
      setCurrentTurnIndex(nextPlaylist[0]!);
      setIsPlaying(false);
      setActionStatus(agentId ? `Following ${agentId}.` : "Showing everyone.");
    },
    [selectedTurnIndexes, transcript]
  );

  const toggleBookmark = useCallback(() => {
    if (isBookmarked) {
      const nextSavedTurns = bookmarkedTurns.filter(
        (turn) => turn !== currentTurnIndex
      );
      setBookmarkedTurns(nextSavedTurns);
      setActionStatus(`Message ${currentTurnIndex + 1} removed from saved points.`);
      if (selectedCutId === "saved") {
        if (nextSavedTurns.length) {
          const nextPosition = Math.min(
            currentPosition,
            nextSavedTurns.length - 1
          );
          setCurrentTurnIndex(nextSavedTurns[nextPosition]!);
        } else {
          setSelectedCutId("full");
          setFollowedAgent(null);
          setCurrentTurnIndex(0);
        }
      }
      return;
    }
    setBookmarkedTurns(
      [...bookmarkedTurns, currentTurnIndex].sort((a, b) => a - b)
    );
    setActionStatus(`Message ${currentTurnIndex + 1} saved on this device.`);
  }, [
    bookmarkedTurns,
    currentPosition,
    currentTurnIndex,
    isBookmarked,
    selectedCutId
  ]);

  const shareMoment = useCallback(async () => {
    const url = buildReplayMomentUrl(window.location.href, {
      cutId: sharedCutId,
      followedAgent,
      turnIndex: currentTurnIndex
    });
    const shareData = {
      text: `${currentAgent?.id ?? "The team"} ${modeLabel[currentTurn.mode]} in ${activeChapter?.label ?? "this part"}.`,
      title: `BoardlessAI meeting replay · Message ${currentTurnIndex + 1}`,
      url
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setActionStatus(`Message ${currentTurnIndex + 1} shared.`);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setActionStatus(`Link to message ${currentTurnIndex + 1} copied.`);
    } catch {
      setActionStatus("Sharing is unavailable in this browser.");
    }
  }, [
    activeChapter?.label,
    currentAgent?.id,
    currentTurn.mode,
    currentTurnIndex,
    followedAgent,
    sharedCutId
  ]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current?.requestFullscreen();
      }
    } catch {
      setActionStatus("Focus mode is unavailable in this browser.");
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let storedBookmarks: number[] = [];
      try {
        const value = window.localStorage.getItem(bookmarkStorageKey);
        const parsed: unknown = value ? JSON.parse(value) : [];
        if (Array.isArray(parsed)) {
          storedBookmarks = normalizeTurnIndexes(
            transcript.turns.length,
            parsed.filter((turn): turn is number => typeof turn === "number")
          );
          setBookmarkedTurns(storedBookmarks);
        }
      } catch {
        setActionStatus("Saved moments could not be read on this device.");
      }

      const cutIds = new Set(cuts.map((cut) => cut.id));
      const agentIds = new Set(agents.map((agent) => agent.id));
      const sharedMoment = parseReplayMoment({
        agentIds,
        cutIds,
        search: window.location.search,
        turnCount: transcript.turns.length
      });

      if (sharedMoment) {
        const cut = cuts.find((item) => item.id === sharedMoment.cutId);
        const basePlaylist = buildReplayPlaylist({
          followedAgent: null,
          transcript,
          turnIndexes: cut?.turnIndexes
        });
        const seatPlaylist = buildReplayPlaylist({
          followedAgent: sharedMoment.followedAgent,
          transcript,
          turnIndexes: cut?.turnIndexes
        });
        const sharedPlaylist = seatPlaylist.length
          ? seatPlaylist
          : basePlaylist;
        setSelectedCutId(sharedMoment.cutId);
        setFollowedAgent(
          seatPlaylist.length ? sharedMoment.followedAgent : null
        );
        setCurrentTurnIndex(
          sharedPlaylist.includes(sharedMoment.turnIndex)
            ? sharedMoment.turnIndex
            : (sharedPlaylist[0] ?? 0)
        );
        setHasStarted(true);
        setIsPlaying(false);
      } else {
        try {
          const storedProgress = window.localStorage.getItem(
            progressStorageKey
          );
          const parsed: unknown = storedProgress
            ? JSON.parse(storedProgress)
            : null;
          if (
            parsed &&
            typeof parsed === "object" &&
            "turnIndex" in parsed &&
            "cutId" in parsed &&
            "followedAgent" in parsed
          ) {
            const candidate = parsed as ReplayMoment;
            const validCut =
              cutIds.has(candidate.cutId) ||
              (candidate.cutId === "saved" && storedBookmarks.length > 0);
            const validAgent =
              candidate.followedAgent === null ||
              agentIds.has(candidate.followedAgent);
            const candidateCut = cuts.find(
              (item) => item.id === candidate.cutId
            );
            const candidatePlaylist = buildReplayPlaylist({
              followedAgent: candidate.followedAgent,
              transcript,
              turnIndexes:
                candidate.cutId === "saved"
                  ? storedBookmarks
                  : candidateCut?.turnIndexes
            });
            if (
              Number.isInteger(candidate.turnIndex) &&
              candidate.turnIndex > 0 &&
              candidate.turnIndex < lastTurnIndex &&
              validCut &&
              validAgent &&
              candidatePlaylist.includes(candidate.turnIndex)
            ) {
              setResumeMoment(candidate);
            }
          }
        } catch {
          setActionStatus("Replay progress could not be read on this device.");
        }
      }
      setStorageReady(true);
      setCanFullscreen(
        Boolean(
          document.fullscreenEnabled && playerRef.current?.requestFullscreen
        )
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    agents,
    bookmarkStorageKey,
    cuts,
    lastTurnIndex,
    progressStorageKey,
    transcript
  ]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(
        bookmarkStorageKey,
        JSON.stringify(bookmarkedTurns)
      );
    } catch {}
  }, [bookmarkedTurns, bookmarkStorageKey, storageReady]);

  useEffect(() => {
    if (!storageReady || !hasStarted) return;
    const moment = {
      cutId: selectedCutId,
      followedAgent,
      turnIndex: currentTurnIndex
    } satisfies ReplayMoment;
    try {
      window.localStorage.setItem(progressStorageKey, JSON.stringify(moment));
    } catch {}
    window.history.replaceState(
      null,
      "",
      buildReplayMomentUrl(window.location.href, {
        ...moment,
        cutId: sharedCutId
      })
    );
  }, [
    currentTurnIndex,
    followedAgent,
    hasStarted,
    progressStorageKey,
    selectedCutId,
    sharedCutId,
    storageReady
  ]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!isPlaying || !hasStarted) return;
    const timer = window.setTimeout(() => {
      const nextTurn = playlist[currentPosition + 1];
      if (nextTurn === undefined) {
        setIsPlaying(false);
        return;
      }
      setCurrentTurnIndex(nextTurn);
    }, turnDuration(currentTurn, speed));
    return () => window.clearTimeout(timer);
  }, [
    currentTurn,
    currentPosition,
    hasStarted,
    isPlaying,
    playlist,
    speed
  ]);

  useEffect(() => {
    if (!hasStarted) return;
    const chat = chatScrollRef.current;
    if (!chat) return;
    chat.scrollTo({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      top: chat.scrollHeight
    });
  }, [currentTurnIndex, hasStarted, prefersReducedMotion]);

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
        goToPlaylistPosition(currentPosition - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToPlaylistPosition(currentPosition + 1);
      }
      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [
    currentPosition,
    goToPlaylistPosition,
    hasStarted,
    togglePlayback
  ]);

  if (!currentAgent || !activeChapter) return null;

  return (
    <section
      aria-label="Meeting replay"
      className="border-b border-[var(--border)] bg-[var(--graphite)] text-[var(--snow)]"
      id="decision-replay"
      onChangeCapture={preservePageScroll}
      onClickCapture={preservePageScroll}
      ref={replayRef}
      tabIndex={-1}
    >
      <p aria-live="polite" className="sr-only">
        {hasStarted
          ? `${selectedCut?.label ?? "View"}. Point ${currentPosition + 1} of ${playlist.length}. Recorded message ${currentTurnIndex + 1}. ${currentAgent.id} ${modeLabel[currentTurn.mode]}. Sent ${currentTurnTiming.iso}.`
          : "Meeting replay ready."}
      </p>

      <div className="mx-auto max-w-[var(--container)] px-5 py-8 md:px-10 md:py-12">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone="accent">Meeting replay</Badge>
            <Badge className="border-[var(--iron)] bg-[var(--graphite)] text-[var(--paper)]">
              Saved test meeting
            </Badge>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--ash)]">
              {hasStarted
                ? `${String(currentTurnIndex + 1).padStart(2, "0")} / ${String(transcript.turns.length).padStart(2, "0")}`
                : `${transcript.turns.length} messages`}
            </span>
          </div>
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] px-3 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--iron)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            href="#full-transcript"
          >
            Read every message
            <ArrowDown aria-hidden="true" className="size-4" />
          </a>
        </div>

        <div
          className={cn(
            "overflow-hidden rounded-[var(--radius-card)] border border-[var(--iron)] bg-[var(--obsidian)]",
            isFullscreen &&
              "h-screen w-screen overflow-y-auto rounded-none border-0"
          )}
          ref={playerRef}
        >
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
                    Recorded group chat
                  </p>
                  <h2 className="mt-5 max-w-3xl text-[clamp(2.6rem,6vw,5.6rem)] font-semibold leading-[0.9] tracking-[-0.06em]">
                    Watch the team
                    <br />
                    message through
                    <br />
                    the decision
                    <span className="text-[var(--accent)]">.</span>
                  </h2>
                  <p className="mt-7 max-w-xl text-base leading-7 text-[var(--ash)] md:text-lg">
                    The replay draws each bubble from the saved meeting
                    record. The next speaker types before their message
                    appears.
                  </p>
                </div>
                <div className="relative mt-12 grid gap-3 sm:grid-cols-3">
                  {[
                    ["34/50", "Best idea score", "Needs 35"],
                    ["0/3", "Real sources", "Needs 3"],
                    ["$0.00", "AI service cost", "Test run"]
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
                <p className="mono-label text-[var(--ash)]">Open the chat</p>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
                  BoardlessAI standup
                </h3>
                <div className="mt-7 rounded-[var(--radius-button)] border border-[var(--iron)] bg-[var(--obsidian)] p-5">
                  <div className="flex items-center gap-3">
                    <AgentPortrait
                      agent={currentAgent}
                      className="size-11 rounded-full ring-1 ring-[var(--steel)]"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[var(--paper)]">
                        {publicAgentTitle(currentAgent)} is typing
                      </p>
                      <p className="mt-1 text-xs text-[var(--ash)]">
                        The first recorded message is ready to replay.
                      </p>
                    </div>
                  </div>
                  <div aria-hidden="true" className="mt-5 flex gap-1.5">
                    <span className="size-2 rounded-full bg-[var(--accent)]" />
                    <span className="size-2 rounded-full bg-[var(--accent)] opacity-70" />
                    <span className="size-2 rounded-full bg-[var(--accent)] opacity-40" />
                  </div>
                </div>
                <div className="mt-7 grid gap-3">
                  <Button
                    className="w-full"
                    onClick={() => startReplay(true)}
                    variant="accent"
                  >
                    <Play aria-hidden="true" className="size-4 fill-current" />
                    Start chat replay
                  </Button>
                  {resumeMoment ? (
                    <Button
                      className="w-full border-[var(--iron)] bg-transparent text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                      onClick={continueReplay}
                      variant="ghost"
                    >
                      <RotateCcw aria-hidden="true" className="size-4" />
                      Continue at message {resumeMoment.turnIndex + 1}
                    </Button>
                  ) : null}
                </div>
                <p className="mt-5 text-xs leading-5 text-[var(--fog)]">
                  No account or response is required. Saved points and unfinished
                  progress stay in this browser.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-[var(--iron)] bg-[var(--graphite)] p-5 md:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <p className="inline-flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
                      <ListVideo aria-hidden="true" className="size-3.5" />
                      Choose a view
                    </p>
                    <div
                      aria-label="Meeting view"
                      className="mt-3 flex flex-wrap gap-2"
                      role="group"
                    >
                      {availableCuts.map((cut) => (
                        <button
                          aria-pressed={selectedCutId === cut.id}
                          className={cn(
                            "min-h-11 rounded-[var(--radius-button)] border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                            selectedCutId === cut.id
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--obsidian)]"
                              : "border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                          )}
                          key={cut.id}
                          onClick={() => selectCut(cut)}
                          type="button"
                        >
                          {cut.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[var(--fog)]">
                      {actionStatus || selectedCut?.detail}
                    </p>
                  </div>

                  <div
                    aria-label="Tools for this point"
                    className="flex flex-wrap gap-2"
                    role="group"
                  >
                    <Button
                      aria-pressed={isBookmarked}
                      className="min-h-11 border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                      onClick={toggleBookmark}
                      size="small"
                      variant="secondary"
                    >
                      {isBookmarked ? (
                        <BookmarkCheck aria-hidden="true" className="size-4" />
                      ) : (
                        <Bookmark aria-hidden="true" className="size-4" />
                      )}
                      {isBookmarked ? "Saved" : "Save this point"}
                    </Button>
                    <Button
                      className="min-h-11 border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                      onClick={shareMoment}
                      size="small"
                      variant="secondary"
                    >
                      <Share2 aria-hidden="true" className="size-4" />
                      Share this point
                    </Button>
                    {canFullscreen ? (
                      <Button
                        aria-pressed={isFullscreen}
                        className="min-h-11 border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                        onClick={toggleFullscreen}
                        size="small"
                        variant="secondary"
                      >
                        {isFullscreen ? (
                          <Minimize2 aria-hidden="true" className="size-4" />
                        ) : (
                          <Maximize2 aria-hidden="true" className="size-4" />
                        )}
                        {isFullscreen ? "Exit focus" : "Focus mode"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-12">
                <div className="relative min-h-[33rem] overflow-hidden p-5 md:p-7 lg:col-span-8 lg:min-h-[40rem] lg:p-9">
                  <div
                    aria-hidden="true"
                    className="editorial-grid absolute inset-0 opacity-10"
                  />
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-center justify-between gap-4 border-b border-[var(--iron)] pb-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div aria-hidden="true" className="flex -space-x-3">
                          {agents.slice(0, 4).map((agent) => (
                            <AgentPortrait
                              agent={agent}
                              className="size-9 rounded-full ring-2 ring-[var(--obsidian)]"
                              key={agent.id}
                            />
                          ))}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--paper)]">
                            BoardlessAI standup
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--ash)]">
                            {agents.length} AI roles · saved public messages
                          </p>
                        </div>
                      </div>
                      <Badge tone={isPlaying ? "accent" : "dark"}>
                        {isPlaying ? "Replaying" : "Paused"}
                      </Badge>
                    </div>

                    <div
                      className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1"
                      data-replay-chat
                      ref={chatScrollRef}
                    >
                      <p className="mb-4 text-center font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
                        {activeChapter.label} · recorded conversation
                      </p>
                      <MessageList className="gap-3 border-0 bg-transparent p-0 md:gap-4">
                        {replayedTurnIndexes.map((turnIndex) => {
                          const turn = transcript.turns[turnIndex];
                          const speaker = turn
                            ? getAgent(agents, turn.agent)
                            : undefined;
                          const listener = turn?.addressedTo
                            ? getAgent(agents, turn.addressedTo)
                            : undefined;
                          if (!turn || !speaker) return null;
                          const isCurrent = turnIndex === currentTurnIndex;
                          const emphasis =
                            turn.agent === "AUDIT"
                              ? "control"
                              : turn.mode === "veto" || turn.mode === "vote"
                                ? "accent"
                                : "default";
                          return (
                            <Message
                              className={cn(
                                "transition-opacity duration-200",
                                isCurrent && "opacity-100"
                              )}
                              key={`${turn.agent}-${turnIndex}`}
                            >
                              <MessageAvatar>
                                <AgentPortrait
                                  agent={speaker}
                                  className="size-9 rounded-full md:size-10"
                                />
                              </MessageAvatar>
                              <MessageBubble emphasis={emphasis}>
                                <MessageHeader>
                                  <MessageName>{publicAgentTitle(speaker)}</MessageName>
                                  <MessageRole>AI role</MessageRole>
                                  <Badge className="ml-auto" tone={modeTone[turn.mode]}>
                                    {modeLabel[turn.mode]}
                                  </Badge>
                                </MessageHeader>
                                {listener ? (
                                  <p className="mb-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
                                    To {publicAgentTitle(listener)}
                                  </p>
                                ) : null}
                                <MessageContent>
                                  {publicAgentText(turn.text)}
                                </MessageContent>
                                <MessageMeta>
                                  <RoomMessageTime
                                    className="text-[var(--ash)]"
                                    timing={resolveRoomTurnTiming(transcript, turnIndex)}
                                  />
                                  {turn.evidenceRefs?.map((reference) => {
                                    const described = describeReference(reference);
                                    return described ? (
                                      <span
                                        className="rounded-full border border-[var(--slate)] px-2 py-0.5 text-[var(--ash)]"
                                        key={reference}
                                      >
                                        {described.label}
                                      </span>
                                    ) : null;
                                  })}
                                </MessageMeta>
                              </MessageBubble>
                            </Message>
                          );
                        })}
                      </MessageList>
                      {typingAgent ? (
                        <div
                          aria-live="polite"
                          className="mt-4 flex items-center gap-3"
                          data-replay-typing
                          role="status"
                        >
                          <AgentPortrait
                            agent={typingAgent}
                            className="size-9 rounded-full md:size-10"
                          />
                          <div className="rounded-[var(--radius-button)] border border-[var(--iron)] bg-[var(--graphite)] px-4 py-3">
                            <p className="text-xs text-[var(--ash)]">
                              {publicAgentTitle(typingAgent)} is typing
                            </p>
                            <div aria-hidden="true" className="mt-2 flex gap-1">
                              <span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.2s]" />
                              <span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.1s]" />
                              <span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)]" />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--iron)] pt-4 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                      <span>Message {currentTurnIndex + 1}</span>
                      <span>
                        Point {currentPosition + 1}/{playlist.length}
                      </span>
                      <span>{isPlaying ? `Playing at ${speed}×` : "Paused"}</span>
                    </div>
                  </div>
                </div>

                <aside className="border-t border-[var(--iron)] bg-[var(--graphite)] p-7 md:p-10 lg:col-span-4 lg:border-l lg:border-t-0">
                  <p className="mono-label text-[var(--accent)]">Current part</p>
                  <h3 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.045em]">
                    {activeChapter.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-[var(--ash)]">
                    {activeChapter.summary}
                  </p>

                  <div className="mt-8 border-t border-[var(--iron)] pt-6">
                    <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                      Follow one role
                    </p>
                    <ul
                      aria-label="Follow one AI role"
                      className="mt-4 flex flex-wrap gap-2"
                    >
                      <li>
                        <button
                          aria-label="Show everyone"
                          aria-pressed={followedAgent === null}
                          className={cn(
                            "flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                            followedAgent === null
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--obsidian)]"
                              : "border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)]"
                          )}
                          onClick={() => followSeat(null)}
                          type="button"
                        >
                          <Users aria-hidden="true" className="size-4" />
                          All
                        </button>
                      </li>
                      {agents.map((agent) => (
                        <li key={agent.id}>
                          <button
                            aria-label={`Follow ${publicAgentTitle(agent)}`}
                            aria-pressed={followedAgent === agent.id}
                            className={cn(
                              "flex size-11 items-center justify-center rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-20",
                              followedAgent === agent.id
                                ? "ring-2 ring-[var(--accent)]"
                                : agent.id === currentAgent.id
                                  ? "opacity-100 ring-1 ring-[var(--steel)]"
                                  : "opacity-50 hover:opacity-100"
                            )}
                            disabled={!availableSeatIds.has(agent.id)}
                            onClick={() => followSeat(agent.id)}
                            title={`Follow ${publicAgentTitle(agent)}`}
                            type="button"
                          >
                            <AgentPortrait
                              agent={agent}
                              className="size-9 rounded-full"
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs leading-5 text-[var(--fog)]">
                      {followedAgent
                        ? `${followedAgent} statements and addressed exchanges.`
                        : "Everyone who took part is shown."}
                    </p>
                  </div>

                  {showVerdict ? (
                    <div className="mt-8 rounded-[var(--radius-button)] border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--graphite))] p-5">
                      <p className="mono-label text-[0.625rem] text-[var(--accent)]">
                        Saved decision
                      </p>
                      <p className="mt-3 text-lg font-semibold text-[var(--paper)]">
                        {verdict.label}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[var(--ash)]">
                        {verdict.summary}
                      </p>
                    </div>
                  ) : followingChapterTurn !== undefined ? (
                    <button
                      className="mt-8 w-full rounded-[var(--radius-button)] border border-[var(--iron)] bg-[var(--obsidian)] p-4 text-left transition-colors hover:border-[var(--steel)] hover:bg-[var(--iron)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      onClick={() => {
                        setCurrentTurnIndex(followingChapterTurn);
                        setIsPlaying(false);
                      }}
                      type="button"
                    >
                      <span className="mono-label text-[0.625rem] text-[var(--fog)]">
                        Jump to the next part
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
                    <div className="mt-8 rounded-[var(--radius-button)] border border-[var(--iron)] bg-[var(--obsidian)] p-5">
                      <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                        This view is finished
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[var(--ash)]">
                        This view ends before the saved decision.
                      </p>
                      <Button
                        className="mt-4 w-full"
                        onClick={() => {
                          setSelectedCutId("full");
                          setFollowedAgent(null);
                          setCurrentTurnIndex(
                            chapters.at(-1)?.startTurn ?? lastTurnIndex
                          );
                          setIsPlaying(false);
                        }}
                        size="small"
                        variant="accent"
                      >
                        Watch the decision
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  )}
                </aside>
              </div>

              <div className="border-t border-[var(--iron)] bg-[var(--graphite)] p-5 md:p-6">
                <label className="sr-only" htmlFor="replay-progress">
                  Meeting progress
                </label>
                <input
                  className="h-11 w-full cursor-pointer accent-[var(--accent)]"
                  id="replay-progress"
                  max={lastPlaylistPosition}
                  min={0}
                  onChange={(event) =>
                    goToPlaylistPosition(Number(event.target.value))
                  }
                  step={1}
                  type="range"
                  value={currentPosition}
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
                      aria-label="Previous message"
                      className="border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                      disabled={currentPosition === 0}
                      onClick={() =>
                        goToPlaylistPosition(currentPosition - 1)
                      }
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
                        : currentPosition === lastPlaylistPosition
                          ? "Replay"
                          : "Play"}
                    </Button>
                    <Button
                      aria-label="Next message"
                      className="border-[var(--iron)] bg-[var(--obsidian)] text-[var(--paper)] hover:border-[var(--steel)] hover:bg-[var(--iron)]"
                      disabled={currentPosition === lastPlaylistPosition}
                      onClick={() =>
                        goToPlaylistPosition(currentPosition + 1)
                      }
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
                          "min-h-11 rounded-[var(--radius-button)] border px-3 font-mono text-[0.6875rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
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
                    Keyboard: left and right arrows change messages. Space pauses
                    or resumes when focus is outside a control.
                    {isFullscreen ? " Press Escape to exit focus mode." : ""}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
          <span>Saved public messages only</span>
          <span>No invented dialogue · private tools stay on this device</span>
        </div>
      </div>
    </section>
  );
}
