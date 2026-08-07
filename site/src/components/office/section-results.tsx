"use client";

import { useEffect, useRef, useState } from "react";
import type { OfficeMeasure, OfficeResults } from "@/lib/office-walkthrough";

/**
 * The wallboard, drawn inside the plate and mapped onto the dark screen of the photograph.
 *
 * The rect below is measured against the 1376×768 image: the near-black screen area runs
 * x 33.2→66.6%, y 22→57.6%. Because the board lives inside the plate it inherits the plate's
 * parallax and its extra `translateY(10.2%)`, so the type stays on the screen as the section
 * moves. `container-type: size` is what lets everything inside be sized in `cq` units and scale
 * with the mapped screen instead of with the viewport.
 *
 * Nothing here ever scrolls. Both states — the overview and the five project screens — swap inside
 * the same rect with the body vertically centred, because a screen on a wall that scrolls is a
 * browser window, not a wallboard.
 *
 * The prototype drifted the spend figure by a cent every few seconds so the board would not read
 * as a screenshot. That is dropped: these are the company's real recorded numbers, and inventing
 * movement in them would make the board say something the ledger does not. The count-up on entry
 * stays, because it arrives at the true value rather than departing from it.
 */

const SCREEN_RECT = { left: "33.2%", top: "22%", width: "33.4%", height: "35.6%" } as const;

const STATE_COLOR: Record<OfficeMeasure["state"], string> = {
  "On track": "#dcfce7",
  "At risk": "#fef3c7",
  "Off track": "#fee2e2",
  "Not measurable yet": "#94949c"
};

/** How a figure reads once it has a number. `null` never reaches these. */
type Format = (value: number) => string;

const asCount: Format = (value) => String(Math.round(value));
const asPercent: Format = (value) => `${Math.round(value)}%`;
const asUsd: Format = (value) => `$${value.toFixed(2)}`;

/**
 * One figure, counted up from zero on entry — through the DOM, not through state.
 *
 * The element is server-rendered carrying its true value, so a reader without JavaScript and any
 * crawler both see the real number rather than a board claiming the company published nothing.
 * The animation then writes `textContent` directly, the way the header clock does. Driving it
 * through `setState` instead would mean either shipping a zero in the HTML or re-rendering the
 * whole wallboard sixty times a second to move five numbers.
 *
 * `null` is not zero. A figure the record cannot supply prints an em dash and never animates,
 * because on this board zero is a measurement and may not double as a loading state.
 */
function Figure({
  label,
  value,
  format,
  active,
  reduceMotion,
  span,
  children
}: {
  label: string;
  value: number | null;
  format: Format;
  active: boolean;
  reduceMotion: boolean;
  span?: boolean;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || value === null || !active) return;
    if (reduceMotion) {
      element.textContent = format(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      element.textContent = format(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, active, reduceMotion, format]);

  return (
    <div className="flex flex-col justify-center" style={span ? { gridColumn: "span 2" } : undefined}>
      <p
        className="m-0 font-mono uppercase tracking-[0.12em] text-[#94949c]"
        data-k="label"
        style={{ fontSize: "1.7cqw" }}
      >
        {label}
      </p>
      <p
        className="m-0 font-semibold leading-none tracking-[-0.05em] tabular-nums text-[#f4f4f5]"
        data-k="value"
        ref={ref}
        style={{ fontSize: "5.4cqw", marginTop: "0.4%" }}
      >
        {value === null ? "—" : format(value)}
      </p>
      {children}
    </div>
  );
}

export function SectionResults({
  results,
  active,
  reduceMotion
}: {
  results: OfficeResults;
  /** True once the section is ≥35% on screen, which is what starts the count-up. */
  active: boolean;
  reduceMotion: boolean;
}) {
  const [view, setView] = useState<"overview" | "project">("overview");
  const [index, setIndex] = useState(0);

  const projects = results.projects;
  const project = projects[index] ?? projects[0] ?? null;
  const showProject = view === "project" && project !== null;
  const spendPercent = results.monthlySpend === null
    ? 0
    : Math.min(100, (results.monthlySpend / results.limit) * 100);

  const step = (delta: number) => {
    if (projects.length === 0) return;
    setIndex((current) => ((current + delta) % projects.length + projects.length) % projects.length);
  };

  const buttonStyle = {
    border: "1px solid #3f3f46",
    borderRadius: "0.8cqw",
    background: "rgba(255, 255, 255, .05)",
    padding: "0.9cqw 1.5cqw",
    fontSize: "1.4cqw",
    letterSpacing: "0.1em",
    color: "#f4f4f5",
    cursor: "pointer"
  } as const;

  return (
    <div
      className="absolute overflow-hidden bg-[#06060a] shadow-[inset_0_0_60px_rgba(0,0,0,.9)]"
      data-tv
      style={{ ...SCREEN_RECT, containerType: "size" }}
    >
      <div className="absolute inset-0 flex flex-col" style={{ padding: "3.4% 3.8%" }}>
        <div
          className="flex items-baseline justify-between gap-4 border-b border-[#26262b]"
          style={{ paddingBottom: "1.4%" }}
        >
          <p
            className="m-0 font-mono font-semibold uppercase tracking-[0.14em] text-[var(--bai-accent)]"
            data-k="title"
            style={{ fontSize: "2cqw" }}
          >
            {showProject ? project!.name : "Results · this month"}
          </p>
          <p
            className="m-0 font-mono uppercase tracking-[0.1em] text-[#94949c]"
            data-k="meta"
            style={{ fontSize: "1.7cqw" }}
          >
            {showProject
              ? `${project!.stage} · project ${index + 1} / ${projects.length}`
              : "Prague · from the record"}
          </p>
        </div>

        {showProject ? (
          <div
            className="flex flex-1 flex-col justify-center"
            style={{ gap: "3.4%", padding: "1% 0 0" }}
          >
            <p className="m-0 leading-[1.4] text-[#a1a1aa]" data-k="obj" style={{ fontSize: "1.75cqw" }}>
              {project!.objective}
            </p>
            {project!.measures.length === 0 ? (
              <p className="m-0 text-[#94949c]" style={{ fontSize: "1.75cqw" }}>
                No measure for this project has a reading in the current quarter yet.
              </p>
            ) : (
              <div
                className="grid grid-cols-2"
                data-k="pgrid"
                style={{ gap: "4% 3%" }}
              >
                {project!.measures.map((measure) => (
                  <div className="flex flex-col" key={measure.label} style={{ gap: "0.5cqw" }}>
                    <p
                      className="m-0 truncate font-mono uppercase tracking-[0.12em] text-[#94949c]"
                      data-k="label"
                      style={{ fontSize: "1.5cqw" }}
                    >
                      {measure.label}
                    </p>
                    <div className="flex items-baseline" style={{ gap: "1.3cqw" }}>
                      <p
                        className="m-0 font-semibold leading-none tracking-[-0.05em] tabular-nums text-[#f4f4f5]"
                        data-k="value"
                        style={{ fontSize: "4.2cqw" }}
                      >
                        {measure.value}
                      </p>
                      <span
                        className="font-mono uppercase tracking-[0.1em]"
                        data-k="state"
                        style={{ fontSize: "1.35cqw", color: STATE_COLOR[measure.state] }}
                      >
                        {measure.state}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div
              className="flex items-center font-mono uppercase tracking-[0.1em] text-[#94949c]"
              data-k="standing"
              style={{ gap: "1.6cqw", fontSize: "1.4cqw" }}
            >
              <span>This quarter</span>
              <span style={{ color: STATE_COLOR["On track"] }}>{project!.standing.onTrack} on track</span>
              <span style={{ color: STATE_COLOR["At risk"] }}>{project!.standing.atRisk} at risk</span>
              <span style={{ color: STATE_COLOR["Off track"] }}>{project!.standing.offTrack} off track</span>
              <span>{project!.standing.unavailable} not measurable</span>
            </div>
          </div>
        ) : (
          <div
            className="grid flex-1 grid-cols-3 content-center"
            data-k="grid"
            style={{ gap: "9% 2.4%", padding: "2% 0 0" }}
          >
            <Figure
              active={active}
              format={asCount}
              label="Published articles"
              reduceMotion={reduceMotion}
              value={results.articles}
            />
            <Figure
              active={active}
              format={asPercent}
              label="Publishing reliability"
              reduceMotion={reduceMotion}
              value={results.reliability}
            />
            <Figure
              active={active}
              format={asUsd}
              label="Cost per article"
              reduceMotion={reduceMotion}
              value={results.costPerArticle}
            />
            <Figure
              active={active}
              format={asUsd}
              label={`Monthly spend of the $${results.limit} limit`}
              reduceMotion={reduceMotion}
              span
              value={results.monthlySpend}
            >
              <span
                className="overflow-hidden rounded-full bg-[#1e1e22]"
                style={{ marginTop: "1.4%", height: "0.7cqw" }}
              >
                <span
                  className="block h-full bg-[var(--bai-accent)] transition-[width] duration-[1200ms] ease-out"
                  style={{ width: `${spendPercent.toFixed(1)}%` }}
                />
              </span>
            </Figure>
            <Figure
              active={active}
              format={asCount}
              label="Ideas from meetings"
              reduceMotion={reduceMotion}
              value={results.ideas}
            />
          </div>
        )}

        <div
          className="flex items-center border-t border-[#26262b]"
          style={{ gap: "1.1cqw", paddingTop: "1.4%" }}
        >
          {showProject ? (
            <>
              <button aria-label="Previous project" data-k="btn" onClick={() => step(-1)} style={buttonStyle} type="button">
                ‹
              </button>
              {projects.map((entry, entryIndex) => {
                const on = entryIndex === index;
                return (
                  <button
                    data-k="chip"
                    key={entry.id}
                    onClick={() => {
                      setIndex(entryIndex);
                      setView("project");
                    }}
                    style={{
                      border: `1px solid ${on ? "var(--bai-accent)" : "#3f3f46"}`,
                      borderRadius: "0.8cqw",
                      background: on ? "color-mix(in srgb, var(--bai-accent) 15%, transparent)" : "rgba(255,255,255,.03)",
                      padding: "0.9cqw 1.2cqw",
                      fontSize: "1.3cqw",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: on ? "#ffffff" : "#a1a1aa",
                      cursor: "pointer",
                      whiteSpace: "nowrap"
                    }}
                    type="button"
                  >
                    {entry.name}
                  </button>
                );
              })}
              <button aria-label="Next project" data-k="btn" onClick={() => step(1)} style={buttonStyle} type="button">
                ›
              </button>
              <button
                data-k="btn"
                onClick={() => setView("overview")}
                style={{ ...buttonStyle, marginLeft: "auto" }}
                type="button"
              >
                Overview
              </button>
            </>
          ) : (
            <>
              <button
                data-k="btn"
                disabled={projects.length === 0}
                onClick={() => {
                  setView("project");
                  setIndex(0);
                }}
                style={{ ...buttonStyle, opacity: projects.length === 0 ? 0.4 : 1 }}
                type="button"
              >
                Full KPIs ›
              </button>
              <span
                className="ml-auto font-mono uppercase tracking-[0.1em] text-[#94949c]"
                style={{ fontSize: "1.35cqw" }}
              >
                {projects.length} projects on record
              </span>
            </>
          )}
        </div>
      </div>

      {/* Screen realism. Both layers are decoration and neither may take a click. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(160deg, rgba(255,255,255,.07), transparent 42%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 [animation:bai-scan_9s_linear_infinite]"
        style={{
          height: "18%",
          background: "linear-gradient(180deg, transparent, rgba(255,255,255,.045), transparent)"
        }}
      />
    </div>
  );
}
