"use client";

import type { CSSProperties, ReactNode } from "react";
import type { OfficeWorkflows } from "@/lib/office-workflows-model";
import type { PanelPlace } from "@/components/office/workflows-panels";

/**
 * The four panel bodies, and nothing else.
 *
 * Split out of `workflows-panels.tsx` so the home page can leave them behind. They are the
 * heaviest interaction-gated weight the walkthrough has — four full drawings, a 49-card hook rack,
 * a seven-beat courier sequence — and a reader who never opens the dock never needs a byte of
 * them. The chrome that renders *around* a panel stays in the other file, because it is on screen
 * the moment the section is, and a dynamic import of a module holding both would have pulled these
 * back in through the static edge.
 *
 * A body is used at two sizes and is written for both. Above 1024px the panel is an overlay laid
 * over the plan, leaving 14 units of the drawing visible on every side so it reads as the room
 * opened rather than as a new screen. Below it, the same body is an ordinary expandable block in
 * the page's flow, because nothing on a phone is intercepted.
 *
 * Nothing here animates a cost on a free path. The one moving cost is the DNESKAi panel's $0.50
 * bar, and it advances only on curation and the write/review loop: summaries, hook assignment,
 * question selection, rendering, every gate and every verification move it not at all.
 *
 * Nothing changed in the split beyond the file this lives in.
 */

const MONO = "var(--font-ibm-plex-mono), monospace";
const DNESKAI = "#fe45e2";

const heading: CSSProperties = {
  margin: 0,
  fontFamily: MONO,
  fontSize: "10.5px",
  textTransform: "uppercase",
  letterSpacing: ".14em",
  color: "#94949c"
};

const body: CSSProperties = { margin: 0, fontSize: "12.5px", lineHeight: 1.45, color: "#d4d4d8" };

const caption: CSSProperties = {
  margin: 0,
  fontFamily: MONO,
  fontSize: "10.5px",
  lineHeight: 1.5,
  letterSpacing: ".06em",
  color: "#94949c"
};

const figure: CSSProperties = {
  margin: 0,
  fontSize: "19px",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: "#f4f4f5"
};

/** The 32 adapters the morning scan reaches, grouped as the run groups them. */
const ADAPTERS: ReadonlyArray<[string, number]> = [
  ["rss", 21], ["html", 4], ["arxiv", 2], ["bluesky", 1],
  ["github", 1], ["hn", 1], ["spaceflight", 1], ["stackexchange", 1]
];

/** The desk's ring. `paid` is what moves the cost bar; everything else is arithmetic and free. */
const DESK_STAGES: ReadonlyArray<{ label: string; paid: boolean }> = [
  { label: "curate", paid: true },
  { label: "write", paid: true },
  { label: "draft check", paid: false },
  { label: "editor review", paid: true },
  { label: "final check", paid: false }
];

function column(index: number, animate: boolean): CSSProperties {
  return animate
    ? { animation: `wf-column 300ms cubic-bezier(.22,.61,.36,1) ${180 + index * 50}ms backwards` }
    : {};
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={heading}>{title}</p>
      {children}
    </div>
  );
}

function DneskaiBody({ data, animate }: { data: OfficeWorkflows; animate: boolean }) {
  const { gates, editionCap } = data;
  return (
    <>
      <div style={{ ...column(0, animate), padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <Section title="The morning line">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 14px" }}>
            {ADAPTERS.map(([kind, count]) => (
              <div key={kind} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ display: "flex", gap: "2px", flexWrap: "wrap", maxWidth: "60px" }}>
                  {Array.from({ length: count }, (_, index) => (
                    <span key={index} style={{ width: "3px", height: "10px", background: "#d4d4d8" }} />
                  ))}
                </span>
                <span style={{ ...caption, fontSize: "9.5px" }}>{`${kind} ${count}`}</span>
              </div>
            ))}
          </div>
          <div style={{ height: "6px", background: "#d4d4d8", opacity: 0.6, borderRadius: "3px" }} />
          {/*
            Two closed gates cross the line before any of it. A gate is a closed leaf across the
            lane — the one place in the whole section a door leaf appears at all, which is what
            makes a closed gate read as closed. It is never a red stop and never a broken line.
          */}
          {[
            [`fewer than ${gates.minimumSuccessfulSources} sources answering`],
            [`fewer than ${gates.minimumCandidateItems} candidates`]
          ].map(([threshold]) => (
            <div key={threshold} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "34px", height: "2.5px", background: DNESKAI }} />
              <span style={{ ...caption, color: DNESKAI }}>no_edition</span>
              <span style={caption}>{threshold}</span>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[
              ["sources answering", "the scan"],
              ["80 candidates", "the digest cap"],
              [`${gates.maximumCurationCandidates} to the editor`, "curation"],
              ["1 chosen", "the edition"]
            ].map(([rung, note]) => (
              <div key={rung} style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "1px solid #1e1e22", paddingTop: "6px" }}>
                <span style={caption}>{note}</span>
                <span style={{ ...body, fontVariantNumeric: "tabular-nums" }}>{rung}</span>
              </div>
            ))}
          </div>
          <p style={{ ...caption, fontStyle: "italic" }}>a closed gate is a finished day</p>
        </Section>
      </div>

      <div style={{ ...column(1, animate), padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <Section title="The desk">
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {DESK_STAGES.map((stage) => (
              <div key={stage.label} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <span
                  style={{
                    width: "11px",
                    height: "11px",
                    borderRadius: "50%",
                    border: stage.label === "draft check" ? `2px solid ${DNESKAI}` : "1px solid #3f3f46",
                    background: stage.paid ? "#26262b" : "transparent"
                  }}
                />
                <span style={body}>{stage.label}</span>
                <span style={{ ...caption, marginLeft: "auto" }}>{stage.paid ? "paid" : "free"}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <span style={caption}>{`return 1 · return 2 — up to ${gates.maximumRegenerationAttempts} rewrites, then the day is finished`}</span>
          </div>
          <p style={{ ...caption, fontStyle: "italic", color: "#d4d4d8" }}>
            it catches the violation before the review is paid for
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ height: "6px", borderRadius: "3px", background: "#1e1e22", display: "block", overflow: "hidden" }}>
              {/* Three of five stages are paid, so the bar rests where the paid work actually
                  reaches. It moves on curation and the write/review loop and on nothing else. */}
              <span style={{ display: "block", height: "100%", width: "60%", background: DNESKAI }} />
            </span>
            <span style={caption}>{`$${editionCap.toFixed(2)} edition allowance`}</span>
          </div>
          <p style={caption}>{`a draft scoring under ${gates.minimumScore} goes back; ${gates.targetWords.toLocaleString("en")} Czech words is the target`}</p>
        </Section>
      </div>

      <div style={{ ...column(2, animate), padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <Section title="The picture">
          {[
            { title: "curated scene", note: "the desk names what the photograph should show" },
            { title: "licensed search", note: "four providers, each with its own licence terms" },
            { title: "deterministic plate", note: "a delivered state" }
          ].map((rung, index) => (
            <div
              key={rung.title}
              style={{
                border: "1px solid #26262b",
                borderRadius: "8px",
                background: "#0e0e12",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "6px"
              }}
            >
              <span style={body}>{rung.title}</span>
              {index === 1 ? (
                <span style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                  {["openverse", "wikimedia", "nasa", "pexels"].map((provider) => (
                    <span
                      key={provider}
                      style={{
                        ...caption,
                        border: "1px solid #26262b",
                        borderRadius: "6px",
                        padding: "2px 6px"
                      }}
                    >
                      {provider}
                    </span>
                  ))}
                </span>
              ) : null}
              {/* The plate is drawn as a finished thing, because it is a legitimate delivered
                  state and not a fallback. No empty frame and no apology. */}
              {index === 2 ? (
                <span
                  style={{
                    display: "block",
                    height: "42px",
                    borderRadius: "6px",
                    background: `repeating-linear-gradient(115deg, ${DNESKAI}22 0 7px, #0e0e12 7px 16px), radial-gradient(120% 90% at 22% 12%, ${DNESKAI}44, transparent 62%)`
                  }}
                />
              ) : null}
              <span style={caption}>{rung.note}</span>
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- workshop */

/** The rack, sized from the library that is actually written rather than from a fixed grid. */
function HookRack({ count, colour, animate, compact }: { count: number; colour: string; animate: boolean; compact: boolean }) {
  const columns = compact ? 4 : Math.min(10, Math.max(5, Math.ceil(count / 5)));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: "4px",
        ...(animate ? { animation: "wf-sweep 760ms linear 500ms backwards" } : {})
      }}
    >
      {Array.from({ length: count }, (_, index) => {
        // Three quarters of any rack is greyed for an item, because a hook may only render on
        // content whose metadata makes its claim true. The greying is the honesty model, drawn.
        const state = index === 6 ? "drawn" : index % 7 === 3 ? "cooled" : index % 3 === 0 ? "eligible" : "greyed";
        return (
          <span
            key={index}
            style={{
              height: "22px",
              borderRadius: "4px",
              display: "block",
              ...(state === "drawn"
                ? { background: `${colour}24`, border: `2px solid ${colour}` }
                : state === "eligible"
                  ? { background: "#0e0e12", border: `1px solid ${colour}` }
                  : state === "cooled"
                    ? { background: "#0e0e12", border: "1px dashed #26262b" }
                    : { background: "#101013", border: "1px solid #1e1e22" })
            }}
            title={
              state === "drawn"
                ? "Drawn: the seeded pick over what survived the gates, the cooldown and the archetype rule."
                : state === "eligible"
                  ? "Eligible: this item's own metadata makes this line true."
                  : state === "cooled"
                    ? "Removed by cooldown: this channel ran it too recently."
                    : "Greyed by gate: this line would not be true of this item."
            }
          />
        );
      })}
    </div>
  );
}

function WorkshopBody({
  data,
  animate,
  compact,
  surface,
  onSurface
}: {
  data: OfficeWorkflows;
  animate: boolean;
  compact: boolean;
  surface: "quiz" | "news" | "mma";
  onSurface: (next: "quiz" | "news" | "mma") => void;
}) {
  const { hooks, example, gates } = data;
  const libraries = [
    { id: "quiz" as const, label: "quiz", count: hooks.quiz, colour: "#a5d8f3" },
    { id: "news" as const, label: "news", count: hooks.news, colour: DNESKAI },
    { id: "mma" as const, label: "mma", count: hooks.mma, colour: "#f7a8ea" }
  ];
  const active = libraries.find((entry) => entry.id === surface) ?? libraries[0]!;

  return (
    <>
      <div style={{ ...column(0, animate), padding: "18px 20px", display: "grid", gap: "18px", gridTemplateColumns: compact ? "1fr" : "4fr 6fr" }}>
        <Section title="The fold">
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            {Array.from({ length: 22 }, (_, index) => (
              <span key={index} style={{ height: "3px", background: "#26262b", display: "block" }} />
            ))}
          </div>
          <p style={caption}>{`${gates.targetWords.toLocaleString("en")} Czech words`}</p>
        </Section>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={heading}>The summary that is handed over</p>
          {/*
            The desk already decided what the piece was about and wrote it down, so delivery hands
            the workshop a summary rather than an article. The article's own order is kept: a
            reader who swipes reads the beginning of the piece, not a shuffle of its middle.
          */}
          <div style={{ border: "1px solid #26262b", borderRadius: "10px", background: "#0e0e12", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {example ? (
              <>
                <span style={caption}>{example.kicker}</span>
                <span style={{ ...body, fontSize: "14px", fontWeight: 600, color: "#f4f4f5" }}>{example.headline}</span>
                <span style={body}>{example.standfirst}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {Array.from({ length: example.passageCount }, (_, index) => (
                    <span key={index} style={{ height: "6px", borderRadius: "3px", background: index === 0 ? "#3f3f46" : "#1e1e22" }} />
                  ))}
                </span>
                {/*
                  No source count here, by owner decision.

                  The figure belongs to the summary rather than to the piece: an edition's summary
                  is built from the package's own structured points and carries an empty `sources`
                  list by construction, so any number printed beside a sourced article would be
                  read as a claim about the article. The count still resolves — it is a row of the
                  data contract — and the card simply does not show it.
                */}
                <span style={caption}>
                  {[`${example.passageCount} passages`, ...(example.heroCredit ? [example.heroCredit] : [])]
                    .join(" · ")}
                </span>
              </>
            ) : (
              <>
                <span style={caption}>kicker · headline · standfirst</span>
                <span style={body}>
                  Three to eight passages in the article&rsquo;s own order, and the
                  photograph&rsquo;s credit, which is mandatory whenever there is a photograph.
                </span>
                <span style={caption}>NO EDITION ON RECORD YET</span>
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/*
              Two slips of the same shape and one equals sign is the whole claim. Neither slip
              prints a hash: the render hash is not a figure this section can resolve, and a
              number nothing recorded would undo exactly the claim the device is making.
            */}
            {[0, 1].map((slip) => (
              <span key={slip} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "3px" }}>
                {[0, 1, 2].map((line) => (
                  <span key={line} style={{ display: "block", width: "62px", height: "4px", borderRadius: "2px", background: "#3f3f46" }} />
                ))}
              </span>
            ))}
            <span style={{ ...figure, fontSize: "15px", order: 1 }}>=</span>
            <span style={{ ...caption, fontStyle: "italic", order: 2 }}>same input, same bytes</span>
          </div>
        </div>
      </div>

      <div style={{ ...column(1, animate), padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
          <p style={heading}>The hook rack</p>
          <span style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
            {libraries.map((library) => (
              <button
                key={library.id}
                onClick={() => onSurface(library.id)}
                style={{
                  border: `1px solid ${library.id === active.id ? "#a1a1aa" : "#3f3f46"}`,
                  borderRadius: "8px",
                  background: "#101013",
                  padding: "4px 9px",
                  fontFamily: MONO,
                  fontSize: "10.5px",
                  textTransform: "uppercase",
                  letterSpacing: ".1em",
                  color: library.id === active.id ? "#f4f4f5" : "#d4d4d8",
                  cursor: "pointer"
                }}
                type="button"
              >
                {`${library.label} ${library.count ?? "—"}`}
              </button>
            ))}
          </span>
        </div>
        {active.count === null ? (
          <p style={body}>
            No library is written for this surface. That is a valid state: the item takes a logged
            no-hook fallback and the template&rsquo;s own headline renders. A missing hook never
            blocks a pack.
          </p>
        ) : (
          <>
            <HookRack animate={animate} colour={active.colour} compact={compact} count={active.count} />
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {/*
                The seal is the eligible set: every hook inside it was checked against this item's
                own metadata, so anything in it is honest and anything outside it is a claim
                nothing verified. Widening the set changes the seal and the package stops
                validating — which is why an override may only pick another card from the same
                hand.
              */}
              <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: active.colour }} />
              <span style={caption}>the eligible set is the licence</span>
              <span style={{ ...caption, marginLeft: "auto" }}>
                {`Tier B ${data.hooks.quizTierB ?? "—"} · outside the hand, the seal breaks and nothing ships`}
              </span>
            </div>
            <p style={caption}>
              When an item&rsquo;s metadata makes nothing in the rack true, the assignment records
              the seed and the set it evaluated, logs a no-hook fallback and renders the
              template&rsquo;s own headline. Ordinary, not broken.
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ courier */

const BEATS: ReadonlyArray<{ line: string; note: string }> = [
  { line: "A key is cut for one door", note: "token scoped to one repository" },
  { line: "The house does its own shelving", note: "the target repo's consumer script runs inside" },
  { line: "The checklist at the shelf", note: "four files pass · a stray file bounces" },
  { line: "Three checklists, side by side", note: "a dataset cannot reach the article shelf" },
  { line: "Commit, push, the site rebuilds", note: "delivery bot · one rebase retry" },
  { line: "Round the front, ticket against the page", note: "two halves of the content hash match" },
  { line: "Seven ticks, receipt filed", note: "the package reference, on the commit" }
];

function BeatDrawing({ index, animate }: { index: number; animate: boolean }) {
  if (index === 2) {
    // A literal filter. The bounce is the whole point of the beat and it is drawn, not written.
    return (
      <svg aria-hidden="true" height={54} style={{ display: "block" }} viewBox="0 0 96 54" width="100%">
        <path d="M8 8 H88 L60 30 V48 L44 42 V30 Z" fill="none" stroke="#94949c" strokeWidth={1.4} />
        {[0, 1, 2, 3].map((file) => (
          <rect fill="#3f3f46" height={4} key={file} rx={1} width={12} x={22 + file * 14} y={2} />
        ))}
        <rect
          fill="none"
          height={5}
          rx={1}
          stroke={DNESKAI}
          strokeWidth={1.2}
          style={animate ? { animation: "wf-bounce 480ms cubic-bezier(.2,.8,.3,1.2) 900ms backwards" } : undefined}
          width={13}
          x={44}
          y={10}
        />
      </svg>
    );
  }
  if (index === 3) {
    // Nothing is greyed out. The route is absent, which is a different claim and the true one.
    return (
      <svg aria-hidden="true" height={54} style={{ display: "block" }} viewBox="0 0 96 54" width="100%">
        {[0, 1, 2].map((lane) => (
          <g key={lane}>
            <rect fill="none" height={44} rx={2} stroke="#26262b" width={26} x={2 + lane * 32} y={4} />
            {[12, 22, 32].map((y) => (
              <path d={`M${8 + lane * 32} ${y} H${22 + lane * 32}`} key={y} stroke="#94949c" strokeWidth={1.2} />
            ))}
            {lane === 2 ? <path d={`M${68} 40 H${88}`} stroke="#94949c" strokeWidth={2.4} /> : null}
          </g>
        ))}
      </svg>
    );
  }
  if (index === 5) {
    // Two torn halves that either fit or do not: a comparison of two strings, drawn as objects.
    return (
      <svg aria-hidden="true" height={54} style={{ display: "block" }} viewBox="0 0 96 54" width="100%">
        <path d="M6 14 H44 L38 22 L44 30 L38 38 H6 Z" fill="none" stroke="#94949c" strokeWidth={1.4} />
        <path d="M90 14 H46 L52 22 L46 30 L52 38 H90 Z" fill="none" stroke="#94949c" strokeWidth={1.4} />
      </svg>
    );
  }
  return null;
}

function CourierBody({ data, animate, compact }: { data: OfficeWorkflows; animate: boolean; compact: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "repeat(7, minmax(0, 1fr))",
        gap: "1px",
        background: "#1e1e22"
      }}
    >
      {BEATS.map((beat, index) => (
        <div
          key={beat.line}
          style={{
            background: "#0b0b0d",
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "9px",
            ...column(index, animate)
          }}
        >
          <span style={{ ...caption, color: DNESKAI }}>{String(index + 1).padStart(2, "0")}</span>
          <span style={body}>{beat.line}</span>
          <BeatDrawing animate={animate} index={index} />
          <span style={caption}>
            {index === 6 && data.receipt ? data.receipt.packageRef : beat.note}
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------- the window and the signal */

function EdgesBody({ data, animate, shuttered, onShuttered }: {
  data: OfficeWorkflows;
  animate: boolean;
  shuttered: boolean;
  onShuttered: (next: boolean) => void;
}) {
  const { bank } = data;
  return (
    <>
      <div style={{ ...column(0, animate), padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <Section title="The window">
          <svg aria-hidden="true" height={92} style={{ display: "block" }} viewBox="0 0 240 92" width="100%">
            <path d="M40 58 H200" stroke="#fde68a" strokeWidth={2} />
            {shuttered ? (
              <g stroke="#94949c" strokeWidth={1.2}>
                {Array.from({ length: 14 }, (_, index) => (
                  <path d={`M${44 + index * 11} 40 L${52 + index * 11} 56`} key={index} />
                ))}
              </g>
            ) : null}
            <path
              d={shuttered ? "M18 84 H120 V62" : "M18 84 H150 V62"}
              fill="none"
              stroke="#94949c"
              strokeDasharray="3 6"
              strokeWidth={1.6}
            />
            {!shuttered ? <path d="M132 62 V80 H24" fill="none" stroke="#fde68a" strokeWidth={2} /> : null}
          </svg>
          <p style={body}>
            {shuttered
              ? "The storefront cannot reach the feed, so it falls back to concept mode and shows no catalogue at all."
              : "The storefront reaches in and pulls a sanitized catalog feed through the sill. Nobody inside walks to the window and nobody delivers to it."}
          </p>
          <p style={caption}>
            {shuttered ? "concept mode · commerceMode: precommerce" : "crosses: sanitized catalog feed"}
          </p>
          <p style={caption}>cannot cross: no price, no stock, no purchase path</p>
          <p style={{ ...caption, fontStyle: "italic", color: "#d4d4d8" }}>
            an unreachable engine can close the window and can never open it
          </p>
          <button
            aria-pressed={shuttered}
            onClick={() => onShuttered(!shuttered)}
            style={{
              alignSelf: "flex-start",
              border: "1px solid #3f3f46",
              borderRadius: "9px",
              background: "#101013",
              padding: "6px 11px",
              fontFamily: MONO,
              fontSize: "10.5px",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              color: "#d4d4d8",
              cursor: "pointer"
            }}
            type="button"
          >
            {shuttered ? "Show the open window" : "Show the shuttered state"}
          </button>
        </Section>
      </div>

      <div style={{ ...column(1, animate), padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <Section title="The signal">
          <svg aria-hidden="true" height={72} style={{ display: "block" }} viewBox="0 0 240 72" width="100%">
            <path
              d="M28 40 H170"
              stroke="#bbf7d0"
              strokeDasharray="2 7"
              strokeLinecap="round"
              strokeWidth={2}
            />
            {[110, 170].map((x) => (
              <rect fill="none" height={22} key={x} stroke="#bbf7d0" strokeWidth={1.4} width={40} x={x} y={29} />
            ))}
            <g stroke="#94949c" strokeWidth={1.4}>
              <rect fill="none" height={26} width={20} x={8} y={27} />
              <path d="M8 27 L28 53 M28 27 L8 53" />
            </g>
          </svg>
          <p style={body}>
            GoVIRAL&rsquo;s line ends inside the two magazine rooms and starts nowhere else. It owns
            no exit, no dock bay and no address of its own, and the plan says so by never letting
            it reach a wall.
          </p>
          <p style={caption}>
            crosses: at most one trend, as a tiebreaker between equally sourced candidates
          </p>
          <p style={caption}>cannot cross: never a substitute for sourcing</p>
        </Section>

        <Section title="The corridor">
          {/*
            Amendment: this edge records a completed import and nothing more. The bank came in
            once, the app that sent it is standalone, and no automation runs between the two
            repositories in either direction. The row states the hand-over and says plainly that
            nothing goes back, because a reader who sees a corridor will otherwise assume traffic.
          */}
          {bank ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
              <span style={figure}>{bank.questions.toLocaleString("en")}</span>
              <span style={body}>questions, handed over once</span>
              <span style={{ ...caption, marginLeft: "auto" }}>{`imported ${bank.importedOn}`}</span>
            </div>
          ) : (
            <p style={body}>The question bank is not on record here.</p>
          )}
          <p style={caption}>
            crosses: nothing today — the quiz app is standalone and keeps its own questions
          </p>
          <p style={caption}>cannot cross: nothing goes back the other way</p>
        </Section>
      </div>

      <div
        style={{
          gridColumn: "1 / -1",
          background: "#0b0b0d",
          padding: "12px 20px",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 22px",
          ...column(2, animate)
        }}
      >
        {[
          "courier exit → DNESKAi magazine",
          "courier exit → MMA Files magazine",
          "dock bay → the storefront collects its own feed",
          "corridor ← the question bank, imported once"
        ].map((edge) => (
          <span key={edge} style={caption}>
            {edge}
          </span>
        ))}
      </div>
    </>
  );
}

export function WorkflowsPanelBody({
  place,
  data,
  animate,
  compact,
  surface,
  onSurface,
  shuttered,
  onShuttered
}: {
  place: PanelPlace;
  data: OfficeWorkflows;
  animate: boolean;
  compact: boolean;
  surface: "quiz" | "news" | "mma";
  onSurface: (next: "quiz" | "news" | "mma") => void;
  shuttered: boolean;
  onShuttered: (next: boolean) => void;
}) {
  if (place === "caught-up") return <DneskaiBody animate={animate} data={data} />;
  if (place === "carousel-studio") {
    return (
      <WorkshopBody
        animate={animate}
        compact={compact}
        data={data}
        onSurface={onSurface}
        surface={surface}
      />
    );
  }
  if (place === "dock") return <CourierBody animate={animate} compact={compact} data={data} />;
  return <EdgesBody animate={animate} data={data} onShuttered={onShuttered} shuttered={shuttered} />;
}
