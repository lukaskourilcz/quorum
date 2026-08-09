"use client";

import Image from "next/image";
import type { OfficeTeam } from "@/lib/office-walkthrough";

/**
 * The roster by reception.
 *
 * Every role in the registry, and every one of them labelled. It used to show the council plus
 * whichever specialists were active and put the rest behind a "stood down" count with no way to
 * reach them — a footnote saying nine roles exist that you may not read. A paused role is a real
 * part of how the company is arranged and so is a retired one, so both appear with the word on
 * them. Only the list scrolls: `overscroll-behavior: contain` is what stops a wheel at its end
 * from jumping to the next section mid-read.
 *
 * Portraits appear here and nowhere else in the walkthrough. At 38px inside a card they read as
 * identity; at 36px inside a dense message list they read as noise, which is why the workspace
 * uses initials tiles instead.
 */
/**
 * Paused and retired, said rather than implied by absence.
 *
 * An active role carries no tag: labelling the normal case is noise, and a roster where most
 * entries wear a badge reads as a roster of exceptions.
 */
function StatusTag({ status }: { status: OfficeTeam["council"][number]["status"] }) {
  if (status === "active") return null;
  return (
    <span
      className="rounded-full border border-[#3f3f46] px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#94949c]"
      data-team-status={status}
    >
      {status}
    </span>
  );
}

export function SectionTeam({ team }: { team: OfficeTeam }) {
  return (
    <div
      className="w-full rounded-[14px] border border-[#3f3f46] bg-[rgba(11,11,13,.9)] shadow-[0_40px_120px_rgba(0,0,0,.65)] backdrop-blur-[16px] max-lg:max-w-[1160px] lg:max-h-[78vh] lg:w-[74vw]"
      data-team-panel
      style={{ display: "flex", flexDirection: "column", maxHeight: "100%" }}
    >
      <div className="flex shrink-0 items-center justify-between gap-6 border-b border-[#26262b] px-[22px] py-3.5">
        {/*
          The roster carries names and portraits, so this is the one place on the home page a
          reader could take it for a staff list. The disclosure was on the home page before the
          office walkthrough replaced it and was lost in that rewrite; the smoke test kept asking
          for it, which is how it turned up. It belongs beside the faces rather than in a footer.
        */}
        <p className="text-[13px] leading-[1.5] text-[#94949c]">
          The agent roster by reception. Four roles vote; the rest join when their field is needed.
          They are software roles, not people.
        </p>
        <p className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#94949c]" data-team-count>
          {team.council.length + team.specialists.length} roles · {team.activeCount} active
        </p>
      </div>

      {/*
        One scroller for the roster, not two.
        At 65% of a laptop viewport the panel has about 300px for its body, and giving the
        specialists their own window left them four rows tall while the council sat fixed above.
        Council and specialists scroll together, so a short screen shortens the view rather than
        squeezing one half of it.
      */}
      {/* `tabIndex` because it scrolls: a scrollable region with no focusable content inside it
          cannot be reached from a keyboard, and axe fails the whole page for it. The rule moved
          with the scroller when council and specialists were joined into one. */}
      <div
        aria-label="The roster"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto [overscroll-behavior:contain]"
        data-team-scroll
        role="group"
        tabIndex={0}
      >
      <div className="shrink-0 px-[22px] pb-1 pt-3.5">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bai-accent)]">
          Council · {team.council.length} votes
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4" data-team-council>
          {team.council.map((role) => {
            // AUDIT holds the veto, and the card says so with a border rather than a badge.
            const veto = role.id === "AUDIT";
            return (
              <div
                className="flex gap-3 rounded-[10px] p-3"
                key={role.id}
                style={{
                  border: `1px solid ${veto ? "var(--bai-accent)" : "#2e2e34"}`,
                  background: veto ? "linear-gradient(180deg, rgba(255,90,0,.1), #101013)" : "#101013"
                }}
              >
                {role.portrait ? (
                  <Image
                    alt={role.portraitAlt}
                    className="size-[38px] shrink-0 rounded-md object-cover object-top grayscale brightness-[0.84] contrast-105"
                    height={38}
                    sizes="38px"
                    src={role.portrait}
                    width={38}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-[38px] shrink-0 place-items-center rounded-md border border-[#2e2e34] bg-[#16161a] font-mono text-[12.5px] font-semibold text-[#d4d4d8]"
                  >
                    {role.id.slice(0, 2)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-1.5 font-mono text-[12.5px] font-semibold text-[#f4f4f5]">
                    {role.id}
                    <StatusTag status={role.status} />
                  </p>
                  <p className="mt-1 text-[12px] leading-[1.45] text-[#94949c]">{role.line}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-[22px] pb-3.5 pt-3">
        <p className="mb-2 shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#94949c]">
          Specialists and venture roles · no vote
        </p>
        {/*
          Every specialist renders, and the list scrolls inside itself rather than pushing the
          panel past one viewport. `overscroll-behavior: contain` keeps a wheel that reaches the
          end of the list from carrying the reader into the next section mid-read.
        */}
        {/* `tabIndex` because the list scrolls: a scrollable region with no focusable content
            inside it is unreachable by keyboard, and axe fails the whole page for it. */}
        {/*
          Three columns at laptop width and four above it. Two columns put twenty-two of the
          thirty-eight below the fold of the panel's own scroller, and a roster most of which is
          reached by scrolling a window inside a window is a roster the reader will assume is
          twenty long — which is what happened.
        */}
        <div
          className="grid grid-cols-1 gap-x-[18px] gap-y-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-team-list
        >
          {team.specialists.map((role) => (
            /*
              One line per role, and that is the whole design decision.
              Thirty-eight roles at two or three lines each is four hundred pixels below the fold
              of a panel that is two thirds of a laptop screen, which is why a reader counted this
              roster at twenty. A name and a title fit on one line; the mandate is a title
              attribute here and prose on the agent's own page, where there is room to read it.
            */
            <div
              className="flex min-w-0 items-baseline gap-2 border-t border-[#1e1e22] pt-1"
              data-team-role
              key={role.id}
              title={role.line}
            >
              <span className="w-[58px] shrink-0 font-mono text-[11.5px] font-semibold leading-[1.6] text-[#f4f4f5]">
                {role.id}
              </span>
              <span className="truncate text-[11.5px] leading-[1.6] text-[#94949c]">{role.title}</span>
              <StatusTag status={role.status} />
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
