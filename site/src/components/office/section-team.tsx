"use client";

import Image from "next/image";
import type { OfficeTeam } from "@/lib/office-walkthrough";

/**
 * The roster by reception.
 *
 * The whole roster renders on arrival. It used to open twelve specialists and hide the rest behind
 * a "Full team" control, which bought one row of names for a click and a second state to reason
 * about — so the control is gone and the list takes an inner scroll instead. Only the list
 * scrolls: `overscroll-behavior: contain` is what stops a wheel at its end from jumping to the
 * next section mid-read.
 *
 * Portraits appear here and nowhere else in the walkthrough. At 38px inside a card they read as
 * identity; at 36px inside a dense message list they read as noise, which is why the workspace
 * uses initials tiles instead.
 */
export function SectionTeam({ team }: { team: OfficeTeam }) {
  return (
    <div
      className="w-full rounded-[14px] border border-[#3f3f46] bg-[rgba(11,11,13,.9)] shadow-[0_40px_120px_rgba(0,0,0,.65)] backdrop-blur-[16px] max-lg:max-w-[1160px] lg:h-[65vh] lg:w-[65vw]"
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
        <p className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#94949c]">
          {team.council.length + team.specialists.length} active roles
        </p>
      </div>

      <div className="shrink-0 px-[22px] pb-1.5 pt-[18px]">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bai-accent)]">
          Council · {team.council.length} votes
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-team-council>
          {team.council.map((role) => {
            // AUDIT holds the veto, and the card says so with a border rather than a badge.
            const veto = role.id === "AUDIT";
            return (
              <div
                className="flex gap-3 rounded-[10px] p-3.5"
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
                  <p className="font-mono text-[12.5px] font-semibold text-[#f4f4f5]">{role.id}</p>
                  <p className="mt-1 text-[12px] leading-[1.45] text-[#94949c]">{role.line}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-[22px] pb-[18px] pt-4">
        <p className="mb-3 shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#94949c]">
          Specialists · no vote
        </p>
        {/*
          Every specialist renders, and the list scrolls inside itself rather than pushing the
          panel past one viewport. `overscroll-behavior: contain` keeps a wheel that reaches the
          end of the list from carrying the reader into the next section mid-read.
        */}
        {/* `tabIndex` because the list scrolls: a scrollable region with no focusable content
            inside it is unreachable by keyboard, and axe fails the whole page for it. */}
        <div
          aria-label="Specialist roles"
          className="grid grid-cols-1 gap-x-[22px] gap-y-2.5 sm:grid-cols-2 xl:grid-cols-4"
          data-team-list
          role="group"
          tabIndex={0}
          style={{
            flex: 1,
            minHeight: 0,
            alignContent: "start",
            overflowY: "auto",
            overscrollBehavior: "contain",
            paddingRight: "8px"
          }}
        >
          {team.specialists.map((role) => (
            <div className="flex gap-2.5 border-t border-[#1e1e22] pt-2.5" key={role.id}>
              <span className="w-[62px] shrink-0 font-mono text-[12px] font-semibold text-[#f4f4f5]">
                {role.id}
              </span>
              <p className="text-[12px] leading-[1.45] text-[#94949c]">{role.line}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
