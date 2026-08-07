"use client";

import type { OfficeProject } from "@/lib/office-walkthrough";

/**
 * Five frames on the meeting-room wall.
 *
 * A card with no live URL renders nothing in that slot — no "coming soon", no disabled link, no
 * placeholder. Three of the five have no public address yet, and a card that says so twice is a
 * card that says nothing; the frame just ends after the description.
 */
export function SectionProjects({ projects }: { projects: OfficeProject[] }) {
  return (
    <div className="mx-auto w-full max-w-[1240px]">
      <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#a1a1aa]">
        {projects.length} projects on the wall. Each has its own room and its own rules.
      </p>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:gap-4"
        data-proj-grid
      >
        {projects.map((project) => (
          <div
            className="flex rounded-[5px] border border-[#52525b] bg-[rgba(11,11,13,.92)] p-[7px] shadow-[0_26px_60px_rgba(0,0,0,.55)]"
            data-proj-card
            key={project.id}
          >
            <div className="flex flex-1 flex-col gap-3 border border-[#26262b] bg-[linear-gradient(180deg,#121216,#0a0a0c)] px-[18px] py-5 lg:min-h-[250px] xl:min-h-[318px]">
              <span
                className="font-mono text-[9.5px] uppercase tracking-[0.14em]"
                style={{ color: project.daily ? "var(--bai-accent)" : "#94949c" }}
              >
                {project.status}
              </span>
              <p className="text-[21px] font-semibold tracking-[-0.03em]">{project.name}</p>
              <p className="flex-1 text-[13px] leading-[1.6] text-[#a1a1aa]">{project.description}</p>
              {project.url ? (
                <a
                  className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#a1a1aa] transition-colors hover:text-[var(--bai-accent)] hover:underline"
                  href={project.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {project.url.replace(/^https?:\/\//u, "").replace(/\/$/u, "")} →
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
