"use client";

import Image from "next/image";
import { useState } from "react";
import type { OfficeTeam } from "@/lib/office-walkthrough";

/** How many specialists the compact view shows before "Full team →" opens the rest. */
const COMPACT_SPECIALISTS = 12;

/**
 * The roster by reception.
 *
 * "Full team" expands in place: the panel keeps its position and grows, and the specialist list
 * takes an inner scroll rather than pushing the section past one viewport. Only the list scrolls —
 * `overscroll-behavior: contain` is what stops a wheel at its end from jumping to the next
 * section mid-read.
 *
 * Portraits appear here and nowhere else in the walkthrough. At 38px inside a card they read as
 * identity; at 36px inside a dense message list they read as noise, which is why the workspace
 * uses initials tiles instead.
 */
export function SectionTeam({ team }: { team: OfficeTeam }) {
  const [full, setFull] = useState(false);
  const specialists = full ? team.specialists : team.specialists.slice(0, COMPACT_SPECIALISTS);
  const hidden = team.specialists.length - COMPACT_SPECIALISTS;

  return (
    <div
      className="w-full max-w-[1160px] rounded-[14px] border border-[#3f3f46] bg-[rgba(11,11,13,.9)] shadow-[0_40px_120px_rgba(0,0,0,.65)] backdrop-blur-[16px]"
      data-team-panel
    >
      <div className="flex items-center justify-between gap-6 border-b border-[#26262b] px-[22px] py-3.5">
        <p className="text-[13px] leading-[1.5] text-[#94949c]">
          The agent roster by reception. Four roles vote; the rest join when their field is needed.
        </p>
        <button
          aria-expanded={full}
          className="shrink-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] px-3 py-[7px] font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5]"
          onClick={() => setFull((open) => !open)}
          type="button"
        >
          {full ? "← Close" : "Full team →"}
        </button>
      </div>

      <div className="px-[22px] pb-1.5 pt-[18px]">
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

      <div className="px-[22px] pb-[18px] pt-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#94949c]">
          Specialists · no vote
        </p>
        <div
          className="grid grid-cols-1 gap-x-[22px] gap-y-2.5 sm:grid-cols-2 xl:grid-cols-4"
          data-team-list
          style={
            full
              ? { maxHeight: "296px", overflowY: "auto", overscrollBehavior: "contain", paddingRight: "8px" }
              : undefined
          }
        >
          {specialists.map((role) => (
            <div className="flex gap-2.5 border-t border-[#1e1e22] pt-2.5" key={role.id}>
              <span className="w-[62px] shrink-0 font-mono text-[12px] font-semibold text-[#f4f4f5]">
                {role.id}
              </span>
              <p className="text-[12px] leading-[1.45] text-[#94949c]">{role.line}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#94949c]">
          {full
            ? `${team.council.length + team.specialists.length} active roles · ${team.standDownCount} stood down when the roster was cut`
            : `+ ${hidden} more roles that open only for their own field`}
        </p>
      </div>
    </div>
  );
}
