import Link from "next/link";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminListRow,
  AdminSectionHeading,
  AdminStatusBadge,
  adminButtonVariants,
} from "./admin-primitives";
import type { GoViralProfileStatus } from "@/lib/goviral-profile";

/** Read-only status for the owner-authored profile consumed as data by the weekly room. */
export function GoViralProfilePanel({ profile }: { profile: GoViralProfileStatus }) {
  const total = profile.sections.length;
  const headline = profile.state === "missing" ? "The writing profile is gone"
    : profile.state === "template" ? "The writing profile is still the blank template"
      : profile.state === "filled" ? "The writing profile is filled in"
        : `The writing profile is part-written — ${profile.filledCount} of ${total} sections`;
  const consequence = profile.state === "filled"
    ? "The weekly trend brief writes to your voice, audiences and veto list."
    : profile.state === "missing"
      ? "Nothing tells the weekly brief who it is writing for. Restore the file from git before the next Monday run."
      : "Until it is filled in, the weekly trend brief leans on the two magazines’ niches and says so. It will not invent a voice for you.";

  return (
    <AdminCard className="border-l-[3px] border-l-[var(--admin-section-accent)]">
      <AdminCardHeader>
        <AdminSectionHeading
          actions={<AdminStatusBadge tone={profile.state === "filled" ? "success" : profile.state === "missing" ? "destructive" : "warning"}>{profile.state === "filled" ? "Ready" : "Needs you"}</AdminStatusBadge>}
          description={consequence}
          title={headline}
        />
      </AdminCardHeader>
      <AdminCardContent className="grid gap-4">
        {total > 0 ? (
          <ul className="m-0 grid list-none p-0">
            {profile.sections.map((section) => (
              <li key={section.title}>
                <AdminListRow className="px-0">
                  <AdminStatusBadge tone={section.filled ? "success" : "neutral"}>{section.filled ? "Filled" : "Empty"}</AdminStatusBadge>
                  <span className={section.filled ? "text-[var(--admin-foreground)]" : "text-[var(--admin-foreground-muted)]"}>{section.title}</span>
                </AdminListRow>
              </li>
            ))}
          </ul>
        ) : null}
        {profile.state === "missing" ? null : <Link className={`${adminButtonVariants({ variant: "secondary" })} justify-self-start`} href={`/admin/files/${profile.relativePath}`}>Read the file →</Link>}
        <p className="m-0 break-all text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">state/{profile.relativePath} · edit it in your editor, not here</p>
      </AdminCardContent>
    </AdminCard>
  );
}
