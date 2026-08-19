import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEntityBadge,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion,
} from "./admin-primitives";
import type { HookBrainSnapshot } from "@/lib/hook-brain";

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <AdminCard>
        <AdminCardHeader>
          <AdminSectionHeading description={subtitle} title={<span id={id}>{title}</span>} />
        </AdminCardHeader>
        <AdminCardContent>{children}</AdminCardContent>
      </AdminCard>
    </section>
  );
}

/**
 * Wide tables scroll inside their own container.
 *
 * The containment e2e guard reads an unmarked horizontal scroller as page overflow, so a real one
 * carries `data-horizontal-scroll`.
 */
function Scroller({ label, children }: { label: string; children: React.ReactNode }) {
  return <AdminTableRegion label={label}>{children}</AdminTableRegion>;
}

export function HookBrainAdminPanel({ snapshot }: { snapshot: HookBrainSnapshot }) {
  return (
    <div className="mt-8 grid min-w-0 gap-6">
      <AdminCallout>
        The studio assigns every hook. A gate licenses a claim, so a hook may only front an item
        whose metadata makes its <code>truthRequires</code> true — and when nothing is eligible the
        template&rsquo;s own headline renders and the pack is logged as <code>no-hook</code>. A
        missing hook never blocks a pack.
      </AdminCallout>

      <Section
        id="hook-libraries"
        title="Libraries"
        subtitle="One library per surface. An empty library is a valid state, not a failure: news and MMA hooks are not written yet, so those packs take the fallback every time."
      >
        <Scroller label="Hook libraries">
          <AdminTable className="min-w-[36rem]">
            <thead><tr>
              <AdminTableHead scope="col">Surface</AdminTableHead>
              <AdminTableHead scope="col">Hooks</AdminTableHead>
              <AdminTableHead scope="col">Archetypes</AdminTableHead>
              <AdminTableHead scope="col">State</AdminTableHead>
            </tr></thead>
            <tbody>
              {snapshot.surfaces.map((surface) => (
                <tr key={surface.surface}>
                  <AdminTableCell className="font-mono">{surface.surface}</AdminTableCell>
                  <AdminTableCell className="admin-tabular">{surface.hooks}</AdminTableCell>
                  <AdminTableCell className="admin-tabular">{surface.archetypes}</AdminTableCell>
                  <AdminTableCell className="text-[var(--admin-foreground-muted)]">{surface.note ?? "Authored"}</AdminTableCell>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </Scroller>
      </Section>

      <Section
        id="hook-cooldowns"
        title="Channel cooldown occupancy"
        subtitle="Every follower sees every post, so a channel cools a hook for max(2 × cooldownDays, 14) days — twice the in-app rule, because there is no per-user dilution to average a repeat away."
      >
        {/* Both tables below are driven by `state/ventures/carousel-studio/hook-channels.json`,
            which the first posting day creates. Until then an empty table is not a result, so
            the copy says which day fills it rather than rendering headers over nothing. */}
        {snapshot.channels.length === 0
          ? (
            <AdminStateMessage
              description="This table fills on the first posting day and shows one row per channel from then on."
              state="initial-empty"
              title="No hook has been posted yet, so no channel is cooling anything."
            />
          )
          : (
            <Scroller label="Channel cooldown occupancy">
              <AdminTable className="min-w-[40rem]">
                <thead><tr>
                  <AdminTableHead scope="col">Channel</AdminTableHead>
                  <AdminTableHead scope="col">Cooling</AdminTableHead>
                  <AdminTableHead scope="col">Posts on file</AdminTableHead>
                  <AdminTableHead scope="col">Last post</AdminTableHead>
                </tr></thead>
                <tbody>
                  {snapshot.channels.map((channel) => (
                    <tr key={channel.channel}>
                      <AdminTableCell className="font-mono">{channel.channel}</AdminTableCell>
                      <AdminTableCell className="admin-tabular">
                        {channel.cooling}
                        {channel.librarySize > 0 ? <span className="text-[var(--admin-foreground-muted)]"> / {channel.librarySize}</span> : null}
                      </AdminTableCell>
                      <AdminTableCell className="admin-tabular">{channel.posts}</AdminTableCell>
                      <AdminTableCell className="admin-tabular font-mono">{channel.lastPostedOn ?? "—"}</AdminTableCell>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </Scroller>
          )}
      </Section>

      <Section
        id="hook-previews"
        title="Fixture assignments"
        subtitle="The real assignment, run against fixture items that carry real quiz metadata. No channel history is fed in — a preview is a picture of the gates, not of a channel's week."
      >
        <Scroller label="Fixture hook assignments">
          <AdminTable className="min-w-[52rem]">
            <thead><tr>
              <AdminTableHead scope="col">Vertical</AdminTableHead>
              <AdminTableHead scope="col">Topic</AdminTableHead>
              <AdminTableHead scope="col">Slide 1</AdminTableHead>
              <AdminTableHead scope="col">Hook</AdminTableHead>
              <AdminTableHead scope="col">Gates</AdminTableHead>
              <AdminTableHead scope="col">Eligible</AdminTableHead>
            </tr></thead>
            <tbody>
              {snapshot.previews.map((preview) => (
                <tr key={`${preview.vertical}-${preview.topic}`}>
                  <AdminTableCell className="font-mono">{preview.vertical}</AdminTableCell>
                  <AdminTableCell>{preview.topic}</AdminTableCell>
                  <AdminTableCell>
                    {preview.en
                      ? <><span className="block">{preview.en}</span><span className="mt-1 block text-[var(--admin-foreground-muted)]">{preview.cs}</span></>
                      : <span className="text-[var(--admin-foreground-muted)]">Template headline (no-hook)</span>}
                  </AdminTableCell>
                  <AdminTableCell className="break-all font-mono">
                    {preview.hookId ?? "—"}
                    {preview.archetype ? <span className="mt-1 block text-[var(--admin-foreground-muted)]">{preview.archetype}</span> : null}
                  </AdminTableCell>
                  <AdminTableCell className="break-all font-mono">{preview.gates.join(", ") || "—"}</AdminTableCell>
                  <AdminTableCell className="admin-tabular">{preview.eligibleCount}</AdminTableCell>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </Scroller>
      </Section>

      <Section
        id="hook-recent"
        title="Last 20 assignments"
        subtitle="What actually posted, with the size of the set each hook was chosen from. A logged fallback counts as a pass — an unlogged missing assignment does not."
      >
        {snapshot.recent.length === 0
          ? (
            <AdminStateMessage
              description="Every pack that goes out lands here, including the ones that took the no-hook fallback."
              state="initial-empty"
              title="Nothing has posted yet, so there is no assignment history to show."
            />
          )
          : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <AdminEntityBadge>{snapshot.recent.length} shown</AdminEntityBadge>
                <AdminStatusBadge tone={snapshot.fallbackCount > 0 ? "warning" : "success"}>
                  {snapshot.fallbackCount} no-hook fallback{snapshot.fallbackCount === 1 ? "" : "s"}
                </AdminStatusBadge>
              </div>
              <Scroller label="Recent hook assignments">
                <AdminTable className="min-w-[48rem]">
                  <thead><tr>
                    <AdminTableHead scope="col">Date</AdminTableHead>
                    <AdminTableHead scope="col">Channel</AdminTableHead>
                    <AdminTableHead scope="col">Item</AdminTableHead>
                    <AdminTableHead scope="col">Hook</AdminTableHead>
                    <AdminTableHead scope="col">Eligible</AdminTableHead>
                  </tr></thead>
                  <tbody>
                    {snapshot.recent.map((row) => (
                      <tr key={`${row.channel}-${row.date}-${row.itemId}`}>
                        <AdminTableCell className="admin-tabular font-mono">{row.date}</AdminTableCell>
                        <AdminTableCell className="break-all font-mono">{row.channel}</AdminTableCell>
                        <AdminTableCell className="break-all font-mono">{row.itemId}</AdminTableCell>
                        <AdminTableCell>
                          {row.hookId
                            ? <><span className="break-all font-mono">{row.hookId}</span><span className="mt-1 block text-[var(--admin-foreground-muted)]">{row.archetype}</span></>
                            : <AdminStatusBadge tone="warning">no-hook · {row.fallback}</AdminStatusBadge>}
                        </AdminTableCell>
                        <AdminTableCell className="admin-tabular">{row.eligibleCount}</AdminTableCell>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              </Scroller>
            </>
          )}
      </Section>

    </div>
  );
}
