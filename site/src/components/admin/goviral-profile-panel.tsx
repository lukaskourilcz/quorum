import Link from "next/link";
import type { GoViralProfileStatus } from "@/lib/goviral-profile";

/**
 * What GoVIRAL is waiting for, at the top of its workspace.
 *
 * Read-only on purpose. The file is prose the owner writes in their own words and the room reads
 * as data; a textarea in the admin would be a second writer on a path nothing else writes, for a
 * job a text editor already does. The panel's whole responsibility is to stop the file being
 * invisible and to say what its state costs.
 */
export function GoViralProfilePanel({ profile }: { profile: GoViralProfileStatus }) {
  const total = profile.sections.length;
  const headline =
    profile.state === "missing" ? "The writing profile is gone"
      : profile.state === "template" ? "The writing profile is still the blank template"
        : profile.state === "filled" ? "The writing profile is filled in"
          : `The writing profile is part-written — ${profile.filledCount} of ${total} sections`;

  const consequence =
    profile.state === "filled"
      ? "The weekly trend brief writes to your voice, your audiences and your veto list."
      : profile.state === "missing"
        ? "Nothing tells the weekly brief who it is writing for. Restore the file from git before the next Monday run."
        : "Until it is filled in, the weekly trend brief leans on the two magazines' niches and says so — it will not invent a voice for you.";

  return (
    <div className="rounded-[12px] border border-[#26262b] bg-[#0c0c0f]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e1e22] px-[18px] py-3.5">
        <p className="m-0 text-[14px] font-semibold">{headline}</p>
        <span
          className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
          style={{ color: profile.state === "filled" ? "#4ade80" : "#f5a524" }}
        >
          {profile.state === "filled" ? "ready" : "needs you"}
        </span>
      </div>
      <div className="grid gap-4 p-[18px]">
        <p className="m-0 text-[13px] leading-[1.6] text-[#d4d4d8]">{consequence}</p>

        {total > 0 ? (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {profile.sections.map((section) => (
              <li className="flex items-baseline gap-2.5 text-[13px]" key={section.title}>
                <span
                  aria-hidden="true"
                  className="font-mono text-[11px]"
                  style={{ color: section.filled ? "#4ade80" : "#71717a" }}
                >
                  {section.filled ? "●" : "○"}
                </span>
                <span className={section.filled ? "text-[#d4d4d8]" : "text-[#94949c]"}>{section.title}</span>
                {section.filled ? null : (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#71717a]">empty</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {profile.state === "missing" ? null : (
          <Link
            className="justify-self-start rounded-[9px] border border-[#3f3f46] bg-[#101013] px-[13px] py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5]"
            href={`/admin/files/${profile.relativePath}`}
          >
            Read the file →
          </Link>
        )}
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717a]">
          state/{profile.relativePath} · edit it in your editor, not here
        </p>
      </div>
    </div>
  );
}
