"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mark } from "@/components/brand/mark";
import { OfficeMood, OfficePlate } from "@/components/office/office-plate";
import { SectionCalendar } from "@/components/office/section-calendar";
import { SectionMeetings } from "@/components/office/section-meetings";
import { SectionProjects } from "@/components/office/section-projects";
import { SectionResults } from "@/components/office/section-results";
import { SectionTeam } from "@/components/office/section-team";
import { SectionWorkflows } from "@/components/office/section-workflows";
import type { WorkspaceChannelId } from "@/lib/meeting-feed";
import type { OfficeWalkthroughData } from "@/lib/office-walkthrough";
import { FooterDialogLinks } from "@/components/footer-dialogs";
import {
  INNER_LOCK_MS,
  LOCK_MS,
  armWheelGesture,
  createWheelGestureState,
  shouldWheelAct
} from "@/components/office/wheel-gesture";

/**
 * The office walkthrough: eight full-viewport rooms, one wheel gesture each.
 *
 * Everything interactive on the home page lives under this one client component, because the
 * behaviours are entangled — the wheel lock has to know whether the pointer is inside the
 * workspace window, the parallax has to know which section is on screen, and the mood tint has to
 * be on the root that every section reads. Splitting them would mean synchronising them.
 *
 * Three rules the layout depends on:
 *
 * - Wheel-driven section jumping binds only above 1024px. Below that the page is an ordinary
 *   document: sections are auto-height, snap is off and nothing is intercepted, because
 *   scroll-jacking a phone is how a visitor loses the page.
 * - The workspace window is exempt from the wheel handler entirely, so its message pane scrolls
 *   natively and never triggers a section jump.
 * - `prefers-reduced-motion` turns off snap, parallax and playback together. The record then
 *   renders in full at once, which is the honest fallback: it is a transcript either way.
 */

const SECTIONS = [
  "intro", "calendar", "meetings", "projects", "facilities", "team", "results", "company"
] as const;

const NAV = [
  { index: 1, label: "Calendar" },
  { index: 2, label: "Meetings" },
  { index: 3, label: "Projects" },
  { index: 4, label: "Facilities" },
  { index: 5, label: "Team" },
  { index: 6, label: "Results" },
  { index: 7, label: "Company" }
] as const;

/**
 * How long a jump's destination stays authoritative over the live scroll position.
 *
 * Comfortably longer than a smooth scroll takes, and short enough that a scrollbar drag or an
 * anchor link a moment later counts from where the reader actually is.
 */
const PENDING_TTL_MS = 1_200;

/** Prague wall time drives both the header clock and the mood wash on every section. */
const MOODS = {
  morning: ["linear-gradient(180deg, rgba(255,214,168,.12), rgba(9,9,11,.34))", ".9"],
  day: ["linear-gradient(180deg, rgba(240,246,255,.05), rgba(9,9,11,.24))", ".95"],
  evening: ["linear-gradient(180deg, rgba(255,138,58,.14), rgba(9,9,11,.46))", ".82"],
  night: ["linear-gradient(180deg, rgba(26,38,72,.3), rgba(9,9,11,.66))", ".62"]
} as const;

function pragueParts(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Prague"
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hour: value("hour"), minute: value("minute") };
}

/**
 * The walkthrough's own link row.
 *
 * Following one of these used to leave the walkthrough for a page built in the previous design,
 * which is a strange thing to happen to a reader halfway down a guided tour of an office. The
 * content opens where they are; the pages still exist and still resolve.
 */
const COMPANY_DIALOGS = [
  { topic: "rules" as const, label: "Rules" },
  { topic: "about" as const, label: "About" },
  { topic: "money" as const, label: "Money" },
  { topic: "privacy" as const, label: "Privacy" },
  { topic: "disclosure" as const, label: "Disclosure" },
  { topic: "updates" as const, label: "Updates" }
];

/** Files, not pages. A feed opened in a dialog is a feed nothing can subscribe to. */
const COMPANY_FEEDS = [
  { href: "/feed.xml", label: "RSS" },
  { href: "/decisions.xml", label: "Decisions RSS" }
];

export function OfficeWalkthrough({ data }: { data: OfficeWalkthroughData }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  /** Which wheel events move the walk, and which are one gesture still arriving. */
  const gestureRef = useRef(createWheelGestureState());
  /** The room a jump is currently travelling to, and when it set off. */
  const pendingIndexRef = useRef<number | null>(null);
  const jumpAtRef = useRef(0);

  const [active, setActive] = useState(0);
  const [weekIndex, setWeekIndex] = useState(data.currentWeek);
  const [channelId, setChannelId] = useState<WorkspaceChannelId>(
    // Open on the room with the most recent record rather than a hard-coded channel: on a day the
    // story desk did not sit, a fixed default would open an empty room.
    () => [...data.channels].sort((left, right) =>
      (right.days.at(-1)?.date ?? "").localeCompare(left.days.at(-1)?.date ?? "")
    )[0]?.id ?? data.channels[0]!.id
  );
  const [playDay, setPlayDay] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [meetingsSeen, setMeetingsSeen] = useState(false);
  const [workflowsSeen, setWorkflowsSeen] = useState(false);
  const [resultsSeen, setResultsSeen] = useState(false);
  /** The replay's scrim is a section-level decorative layer, so the section raises its state here. */
  const [workflowsReplaying, setWorkflowsReplaying] = useState(false);

  const week = data.weeks[weekIndex] ?? data.weeks[data.currentWeek]!;

  const sections = useCallback(
    () => Array.from(trackRef.current?.querySelectorAll<HTMLElement>("[data-sec]") ?? []),
    []
  );

  const topOf = (section: HTMLElement) => section.getBoundingClientRect().top + window.scrollY;

  /** The last section whose top is above the viewport midpoint. */
  const currentIndex = useCallback(() => {
    const middle = window.scrollY + window.innerHeight / 2;
    let best = 0;
    sections().forEach((section, index) => {
      if (topOf(section) <= middle) best = index;
    });
    return best;
  }, [sections]);

  const goTo = useCallback(
    (index: number) => {
      const all = sections();
      if (all.length === 0) return;
      const clamped = Math.max(0, Math.min(all.length - 1, index));
      const target = all[clamped]!;
      jumpAtRef.current = Date.now();
      armWheelGesture(gestureRef.current, jumpAtRef.current, LOCK_MS);
      pendingIndexRef.current = clamped;
      window.scrollTo({ top: topOf(target), behavior: reduceMotion ? "auto" : "smooth" });
      setActive(clamped);
    },
    [sections, reduceMotion]
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  /**
   * Scope the snap to this page.
   *
   * `scroll-snap-type` has to sit on the scrolling element, which is shared with every other
   * route. Marking `<html>` while the walkthrough is mounted is what keeps a proximity snap off
   * `/calendar` and `/agents`, where it would fight their own long scrolls.
   */
  useEffect(() => {
    document.documentElement.dataset.officeWalkthrough = "true";
    return () => {
      delete document.documentElement.dataset.officeWalkthrough;
    };
  }, []);

  /** Clock and mood. The clock writes through a ref so a ticking minute costs no re-render. */
  useEffect(() => {
    const apply = () => {
      const { hour, minute } = pragueParts();
      if (clockRef.current) {
        clockRef.current.textContent = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      }
      const mood = hour < 6 || hour >= 21 ? "night" : hour < 9 ? "morning" : hour < 17 ? "day" : "evening";
      const [tint, brightness] = MOODS[mood];
      const root = rootRef.current;
      if (root) {
        root.style.setProperty("--bai-tint", tint);
        root.style.setProperty("--bai-img-b", brightness);
      }
    };
    apply();
    const timer = setInterval(apply, 30_000);
    return () => clearInterval(timer);
  }, []);

  /** Parallax and the active-section marker, both off one rAF-throttled scroll handler. */
  useEffect(() => {
    const onScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const viewportHeight = window.innerHeight;
        const wide = window.innerWidth >= 761;
        for (const section of sections()) {
          const progress = (topOf(section) - window.scrollY) / viewportHeight;
          const plate = section.querySelector<HTMLElement>("[data-plate-inner]");
          if (plate) {
            const plateY = plate.dataset.plateY ?? "0px";
            plate.style.transform = reduceMotion || !wide
              ? `translate(-50%, -50%) translateY(${plateY})`
              : `translate(-50%, -50%) translateY(${plateY}) translate3d(${(progress * -46).toFixed(1)}px, ${(progress * 30).toFixed(1)}px, 0) scale(1.07)`;
          }
          const foreground = section.querySelector<HTMLElement>("[data-fg]");
          if (foreground) {
            foreground.style.transform = reduceMotion || !wide
              ? ""
              : `translate3d(0, ${(progress * -22).toFixed(1)}px, 0)`;
            foreground.style.opacity = reduceMotion || !wide
              ? ""
              : String(1 - Math.min(0.6, Math.abs(progress) * 0.7));
          }
        }
        // Playback and the wallboard count-up both start when the walk reaches their room, and
        // this is where that is known. An IntersectionObserver was the obvious mechanism and the
        // wrong one: it fires on scroll but not on a jump, so arriving by the nav button or the
        // dot rail left the workspace sitting on a day divider with no messages under it. The
        // active index is true for every route in, including a jump.
        const index = currentIndex();
        // The jump has landed once the live position agrees with where it was going, and from
        // then on the live position is the truth again.
        if (pendingIndexRef.current === index) pendingIndexRef.current = null;
        /*
         * While a jump is still travelling, the marker stays on the destination.
         *
         * A smooth scroll sweeps the live position through every room between here and there, and
         * marking each one in turn is what made the nav dot flicker across the rail on the way. The
         * destination is the honest answer for as long as the jump is in flight; the same TTL the
         * wheel handler uses gives the live position back if the scroll never arrives.
         */
        const pending = pendingIndexRef.current;
        const travelling = pending !== null && Date.now() - jumpAtRef.current <= PENDING_TTL_MS;
        setActive(travelling ? pending! : index);
        if (index >= 2) setMeetingsSeen(true);
        if (index >= 4) setWorkflowsSeen(true);
        if (index >= 6) setResultsSeen(true);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [sections, currentIndex, reduceMotion]);

  /** One wheel gesture, one section — above 1024px only. */
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (reduceMotion || window.innerWidth < 1024) return;
      const target = event.target;
      // The workspace window is exempt entirely, so its pane scrolls natively.
      if (workspaceRef.current && target instanceof Node && workspaceRef.current.contains(target)) return;
      // So is an open Workflows panel: it is one screenful of a floor plan's depth, and a reader
      // reading down it is not asking to leave the room.
      if (target instanceof Element && target.closest("[data-wheel-exempt]")) return;
      event.preventDefault();

      const now = Date.now();
      if (!shouldWheelAct(gestureRef.current, now, event.deltaY)) return;

      const all = sections();
      // While a jump is still animating, the live scroll position is mid-flight and reports
      // the room being left. Stepping from there sends the next gesture back to where it is
      // already going, so it counts from the pending target instead.
      //
      // The target has to expire on a clock of its own. Clearing it only when the scroll
      // handler sees it arrive is not enough: a jump that moves nothing — the last room, or a
      // scroll the browser declines to animate — fires no scroll event at all, and a target
      // cleared only there stays stale for every gesture that follows.
      if (pendingIndexRef.current !== null && now - jumpAtRef.current > PENDING_TTL_MS) {
        pendingIndexRef.current = null;
      }
      const current = pendingIndexRef.current ?? currentIndex();
      const section = all[current];
      if (!section) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      const viewportHeight = window.innerHeight;
      const viewTop = window.scrollY;
      const viewBottom = viewTop + viewportHeight;
      const sectionTop = topOf(section);
      const sectionBottom = sectionTop + section.offsetHeight;
      // A section taller than the viewport scrolls inside itself first, then hands over.
      if (section.offsetHeight > viewportHeight + 8) {
        if (direction > 0 && viewBottom < sectionBottom - 8) {
          armWheelGesture(gestureRef.current, now, INNER_LOCK_MS);
          window.scrollBy({ top: Math.min(440, sectionBottom - viewBottom), behavior: "smooth" });
          return;
        }
        if (direction < 0 && viewTop > sectionTop + 8) {
          armWheelGesture(gestureRef.current, now, INNER_LOCK_MS);
          window.scrollBy({ top: -Math.min(440, viewTop - sectionTop), behavior: "smooth" });
          return;
        }
      }
      goTo(current + direction);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [sections, currentIndex, goTo, reduceMotion]);

  /** Keyboard walking. Ignored inside the workspace and inside any field. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
        if (workspaceRef.current?.contains(target) && target !== document.body) return;
      }
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        goTo((pendingIndexRef.current ?? currentIndex()) + 1);
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        goTo((pendingIndexRef.current ?? currentIndex()) - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goTo(SECTIONS.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, currentIndex]);

  const openFromCalendar = useCallback(
    (channel: WorkspaceChannelId, date: string) => {
      setChannelId(channel);
      setPlayDay(date);
      setMeetingsSeen(true);
      goTo(2);
    },
    [goTo]
  );

  /**
   * A fixed slot, always painted, whatever the active section is.
   *
   * The dot used to be 7px when inactive and 10px when active, so every scroll resized two of the
   * eight and shifted the column between them. The button's box is now constant and only what is
   * drawn inside it changes — which is what "the indicator never changes a box" means when the
   * indicator is the whole control.
   */
  const dotStyle = useMemo(
    () => () => ({
      width: "10px",
      height: "10px",
      display: "grid",
      placeItems: "center",
      padding: 0,
      border: 0,
      background: "transparent",
      cursor: "pointer"
    }),
    []
  );

  const dotMarkStyle = useMemo(
    () => (index: number) => ({
      width: index === active ? "10px" : "7px",
      height: index === active ? "10px" : "7px",
      borderRadius: "50%",
      border: `1px solid ${index === active ? "var(--bai-accent)" : "#3f3f46"}`,
      background: index === active ? "var(--bai-accent)" : "transparent"
    }),
    [active]
  );

  return (
    <div
      className="relative bg-[#09090b] text-[#f4f4f5]"
      data-bai-root
      ref={rootRef}
      style={{
        // Defaults so the first paint is never unstyled; the effect above replaces them within a frame.
        ["--bai-accent" as string]: "var(--ember)",
        ["--bai-tint" as string]: MOODS.day[0],
        ["--bai-img-b" as string]: MOODS.day[1]
      }}
    >
      <header className="fixed inset-x-0 top-0 z-[60] flex min-h-17 items-center border-b border-[#26262b] bg-[rgba(9,9,11,.72)] backdrop-blur-[18px]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 px-4 md:gap-12 md:px-10">
          <button
            className="flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-[#f4f4f5]"
            onClick={() => goTo(0)}
            type="button"
          >
            <Mark />
            <span>BoardlessAI</span>
          </button>
          {/*
            The active mark takes no layout space at all.
            It used to be an inline dot rendered at zero opacity when inactive, which stopped the
            rail twitching by making every label carry twelve pixels of permanent empty gap for a
            dot that was not there — the owner's report was the gap, not the twitch. Absolutely
            positioned under the label it is out of the flow entirely: nothing reserves room for
            it, nothing moves when it appears, and the row measures the same in both states.
          */}
          <nav
            aria-label="Primary"
            className="hide-scrollbar flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto md:gap-2"
            data-horizontal-scroll
            data-nav
          >
            {NAV.map((entry) => (
              <button
                aria-current={active === entry.index ? "true" : undefined}
                className="relative inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 py-2 text-[12px] font-medium text-[#d4d4d8] transition-colors hover:bg-[#202024] hover:text-white md:px-3 md:text-[13px]"
                data-nav-item
                key={entry.label}
                onClick={() => goTo(entry.index)}
                type="button"
              >
                {entry.label}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-[3px] left-1/2 size-[5px] -translate-x-1/2 rounded-full bg-[var(--bai-accent)] transition-opacity"
                  style={{ opacity: active === entry.index ? 1 : 0 }}
                />
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-[#3f3f46] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#d4d4d8]">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[var(--bai-accent)] [animation:bai-pulse_1.8s_ease-in-out_infinite]"
            />
            <span className="hidden sm:inline">Prague</span>
            <span className="tabular-nums text-white" ref={clockRef}>
              --:--
            </span>
          </div>
        </div>
      </header>

      <div
        aria-hidden="true"
        className="fixed right-5 top-1/2 z-[60] hidden -translate-y-1/2 flex-col items-center gap-3 md:flex"
        data-dots
      >
        {SECTIONS.map((id, index) => (
          <button data-dot key={id} onClick={() => goTo(index)} style={dotStyle()} title={id} type="button">
            <span aria-hidden="true" style={dotMarkStyle(index)} />
          </button>
        ))}
      </div>

      {/*
        A real `main` landmark. The walkthrough is eight sections under one root, and shipping it
        as a bare `div` left the page with no main landmark at all — which a screen reader uses to
        skip the header, and which the responsive guard uses to know the page rendered.
      */}
      <main data-track ref={trackRef}>
        {/* 00 Intro */}
        <section
          className="relative h-auto min-h-[100svh] overflow-hidden bg-[#09090b] lg:h-[100svh] lg:min-h-0"
          data-sec
          id="intro"
        >
          <OfficePlate
            alt="Office with a view of Prague"
            eager
            filter="saturate(.86) contrast(1.02) brightness(var(--bai-img-b, .84))"
            image="office-window"
            width="max(100vw, 179.2svh)"
          />
          <OfficeMood />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(90deg, rgba(9,9,11,.88), rgba(9,9,11,.22) 54%, rgba(9,9,11,.55))" }}
          />
          <div
            className="relative flex min-h-[100svh] flex-col justify-end px-4 pb-13 pt-21 lg:absolute lg:inset-0 lg:min-h-0 lg:p-0"
            data-fg
          >
            <div className="mx-auto w-full max-w-[1400px] lg:px-10 lg:pb-15">
              <h1
                className="m-0 max-w-[20ch] text-[38px] font-semibold leading-[0.92] tracking-[-0.04em] lg:text-[clamp(3rem,6.4vw,6.4rem)] lg:tracking-[-0.055em]"
                data-hero-title
                style={{ textWrap: "balance" }}
              >
                The AI company that governs itself
                <span style={{ color: "var(--bai-accent)" }}>.</span>
              </h1>
              <p
                className="mt-4.5 max-w-[54ch] text-[15px] leading-[1.62] text-[#a1a1aa] lg:mt-6.5 lg:text-[16px]"
                data-hero-copy
                style={{ textWrap: "pretty" }}
              >
                A team of AI agents holds its meetings every day, decides, and publishes two Czech
                magazines. This page is their office: walk through it and you will see what was
                discussed, what was decided and what went out into the world.
              </p>
              <div className="mt-9 flex items-center">
                <button
                  className="inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] text-[#f4f4f5] transition-colors hover:text-[var(--bai-accent)]"
                  onClick={() => goTo(1)}
                  type="button"
                >
                  Walk the office
                  <svg
                    aria-hidden="true"
                    className="size-4 [animation:bai-hint_2.4s_ease-in-out_infinite]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 01 Calendar */}
        <section
          className="relative h-auto min-h-[100svh] overflow-hidden bg-[#0b0b0d] lg:h-[100svh] lg:min-h-0"
          data-sec
          id="calendar"
        >
          <OfficePlate
            alt="Empty office wall with a whiteboard"
            filter="saturate(.55) brightness(.5)"
            image="office-whiteboard"
            width="max(132vw, 232svh)"
          />
          <OfficeMood />
          <div
            className="relative flex min-h-[100svh] items-center justify-center px-4 pb-13 pt-21 lg:absolute lg:inset-0 lg:min-h-0 lg:px-10 lg:pb-11 lg:pt-23"
            data-fg
          >
            <SectionCalendar
              canStepBack={weekIndex > 0}
              canStepForward={weekIndex < data.weeks.length - 1}
              onOpen={openFromCalendar}
              onStepBack={() => setWeekIndex((index) => Math.max(0, index - 1))}
              onStepForward={() => setWeekIndex((index) => Math.min(data.weeks.length - 1, index + 1))}
              week={week}
            />
          </div>
        </section>

        {/* 02 Meetings */}
        <section
          className="relative min-h-[100svh] overflow-hidden"
          data-sec
          id="meetings"
          style={{ background: "linear-gradient(180deg, #2b2b30 0%, #232327 46%, #1a1a1e 100%)" }}
        >
          <OfficePlate
            alt="Office wall with a large display"
            filter="saturate(.7) brightness(.7)"
            image="office-display"
            width="max(168vw, 300svh)"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(120% 70% at 50% -10%, rgba(255,255,255,.05), transparent 60%)" }}
          />
          <OfficeMood />
          <div
            className="relative flex min-h-[100svh] flex-col items-center justify-center px-4 pb-13 pt-21 lg:px-10 lg:pb-11 lg:pt-23"
            data-fg
            ref={workspaceRef}
          >
            <SectionMeetings
              channelId={channelId}
              channels={data.channels}
              day={playDay}
              onSelect={(channel, day) => {
                setChannelId(channel);
                setPlayDay(day);
              }}
              reduceMotion={reduceMotion}
              visible={meetingsSeen}
            />
          </div>
        </section>

        {/* 03 Projects */}
        <section
          className="relative h-auto min-h-[100svh] overflow-hidden bg-[#0b0b0d] lg:h-[100svh] lg:min-h-0"
          data-sec
          id="projects"
        >
          <OfficePlate
            alt="Meeting room with a wall of frames"
            filter="saturate(.5) brightness(.44)"
            image="office-frames"
            width="max(118vw, 211svh)"
          />
          <OfficeMood />
          <div
            className="relative flex min-h-[100svh] flex-col justify-center px-4 pb-13 pt-21 lg:absolute lg:inset-0 lg:min-h-0 lg:px-10 lg:pb-11 lg:pt-23"
            data-fg
          >
            <SectionProjects projects={data.projects} />
          </div>
        </section>

        {/* 04 Facilities */}
        <section
          className="relative h-auto min-h-[100svh] overflow-hidden bg-[#0b0b0d] lg:h-[100svh] lg:min-h-0"
          data-sec
          id="facilities"
        >
          {/*
            D8: the whiteboard is the surface the plan is drawn on, so both its edges have to be
            in frame. The whiteboard fills about 68% of the photograph's height, so at the old
            `264svh` — a plate 147% of the viewport tall — it rendered at exactly 100% of the
            viewport and both edges sat on the bezel. `150vw` was the other half of the problem:
            on a wide, short viewport it won the `max()` and re-cropped what `svh` had fixed.

            Coverage is the hard constraint, and below 1024px it is the binding one: the section
            is auto-height there and stacks the plan, the key and four folded panels, so it runs
            well past 100svh — 1166px at a 768 x 1024 viewport. 190svh framed the whiteboard
            beautifully and let the photograph's own bottom edge into that frame, which is worse
            than the crop it fixed. 200svh covers it with 57px to spare and still leaves the
            whiteboard 45–101px of clearance at every desktop viewport, after the 1.07 scale and
            the ±46/30px drift.

            The calendar section reuses this photograph at its own crop and is untouched.
          */}
          <OfficePlate
            alt="Empty office wall with a whiteboard"
            filter="saturate(.32) brightness(.3) contrast(1.06)"
            image="office-whiteboard"
            width="max(105vw, 200svh)"
          />
          <OfficeMood />
          {/*
            The replay's scrim. It sits after the mood and switches the real Prague sky off, which
            is half of what makes a recording read as a recording rather than as the building. Like
            every decorative layer on this page it may never take a click — the panels and the plan
            live underneath it.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-[420ms] ease-out"
            style={{ background: "#09090b", opacity: workflowsReplaying ? 0.42 : 0 }}
          />
          {/*
            Wider gutters than the other sections and a shallower bottom, because the plan has no
            card of its own: the section's own edges are the drawing's frame, and every pixel of
            width and height here is width and height the floor plan gets to use.
          */}
          <div
            className="relative flex min-h-[100svh] items-stretch justify-center px-4 pb-13 pt-21 lg:absolute lg:inset-0 lg:min-h-0 lg:px-4 lg:pb-5 lg:pt-23"
            data-fg
          >
            <SectionWorkflows
              active={workflowsSeen}
              data={data.workflows}
              onReplayChange={setWorkflowsReplaying}
              reduceMotion={reduceMotion}
            />
          </div>
        </section>

        {/* 05 Team */}
        <section
          className="relative h-auto min-h-[100svh] overflow-hidden bg-[#0b0b0d] lg:h-[100svh] lg:min-h-0"
          data-sec
          id="team"
        >
          <OfficePlate
            alt="Office reception"
            filter="saturate(.55) brightness(.5)"
            image="office-reception"
            width="max(112vw, 200svh)"
          />
          <OfficeMood />
          <div
            className="relative flex min-h-[100svh] items-center justify-center px-4 pb-13 pt-21 lg:absolute lg:inset-0 lg:min-h-0 lg:px-10 lg:pb-11 lg:pt-23"
            data-fg
          >
            <SectionTeam team={data.team} />
          </div>
        </section>

        {/* 06 Results — no heading; the screen carries its own. */}
        <section
          className="relative h-[100svh] overflow-hidden bg-[#0b0b0d]"
          data-sec
          id="results"
        >
          <OfficePlate
            alt="Television on the office wall"
            filter="saturate(.7) brightness(.72)"
            image="office-display"
            plateY="10.2%"
            width="max(160vw, 286svh)"
          >
            <SectionResults active={resultsSeen} reduceMotion={reduceMotion} results={data.results} />
          </OfficePlate>
          {/*
            The tint sits after the content, which is what dims the room around the lit screen.
            `pointer-events: none` on it is load-bearing: without it, it covers the wallboard.
          */}
          <OfficeMood />
        </section>

        {/* 07 Company */}
        <section className="relative min-h-[100svh] overflow-hidden bg-[#09090b]" data-sec id="company">
          <OfficePlate
            alt="The office in the evening, on the way to the door"
            filter="saturate(.45) brightness(.3)"
            image="office-reception"
            width="max(148vw, 265svh)"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(9,9,11,.5), rgba(9,9,11,.82))" }}
          />
          <div
            className="relative flex min-h-[100svh] flex-col justify-end px-4 pt-21 lg:px-10 lg:pt-26"
            data-fg
          >
            <div className="mx-auto w-full max-w-[1240px]">
              <div className="grid grid-cols-1 gap-8 pb-11 lg:grid-cols-[7fr_5fr] lg:gap-14" data-company-grid>
                <div>
                  <p
                    className="m-0 max-w-[26ch] text-[30px] font-semibold leading-[1.06] tracking-[-0.05em] lg:text-[44px]"
                    data-company-title
                  >
                    The lights go out, the record stays
                    <span style={{ color: "var(--bai-accent)" }}>.</span>
                  </p>
                  <p className="mt-5.5 max-w-[58ch] text-[15px] leading-[1.65] text-[#a1a1aa]">
                    BoardlessAI is an experiment in running a small company with AI roles. The
                    council decides, specialists do the work, and everything that passes
                    verification stays visible: meetings, decisions, sources, costs and open
                    questions. We do not measure visitors.
                  </p>
                </div>
                <div className="grid content-start gap-2.5 pt-1.5">
                  <FooterDialogLinks
                    className="grid grid-cols-2 gap-x-6 gap-y-2.5"
                    facts={data.footerFacts}
                    linkClassName="text-left text-[13.5px] text-[#d4d4d8] transition-colors hover:text-white"
                    links={COMPANY_DIALOGS}
                  />
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {COMPANY_FEEDS.map((link) => (
                      <li key={link.href}>
                        <Link className="text-[13.5px] text-[#d4d4d8] transition-colors hover:text-white" href={link.href}>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex items-center justify-between gap-6 border-t border-[#1e1e22] pb-6.5 pt-4.5">
                <div className="flex items-center gap-2.5">
                  <Mark className="size-6" />
                  <span className="text-[13.5px] font-semibold">BoardlessAI</span>
                </div>
                <p className="m-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#94949c]">
                  © {new Date().getUTCFullYear()} BoardlessAI
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
