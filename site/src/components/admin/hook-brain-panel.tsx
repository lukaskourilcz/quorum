import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { HookBrainSnapshot } from "@/lib/hook-brain";

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6">
      <h3 className="text-xl font-semibold tracking-[-0.02em]" id={id}>{title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fog)]">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Wide tables scroll inside their own container.
 *
 * The containment e2e guard reads an unmarked horizontal scroller as page overflow, so a real one
 * carries `data-horizontal-scroll`.
 */
function Scroller({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto" data-horizontal-scroll>{children}</div>;
}

const CELL = "px-3 py-2 text-left align-top";
const HEAD = `${CELL} font-mono text-xs uppercase tracking-[0.1em] text-[var(--fog)]`;

export function HookBrainAdminPanel({ snapshot }: { snapshot: HookBrainSnapshot }) {
  return (
    <div className="mt-8 grid gap-6">
      <Callout>
        The studio assigns every hook. A gate licenses a claim, so a hook may only front an item
        whose metadata makes its <code>truthRequires</code> true — and when nothing is eligible the
        template&rsquo;s own headline renders and the pack is logged as <code>no-hook</code>. A
        missing hook never blocks a pack.
      </Callout>

      <Section
        id="hook-libraries"
        title="Libraries"
        subtitle="One library per surface. An empty library is a valid state, not a failure: news and MMA hooks are not written yet, so those packs take the fallback every time."
      >
        <Scroller>
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead><tr className="border-b border-[var(--border)]">
              <th className={HEAD} scope="col">Surface</th>
              <th className={HEAD} scope="col">Hooks</th>
              <th className={HEAD} scope="col">Archetypes</th>
              <th className={HEAD} scope="col">State</th>
            </tr></thead>
            <tbody>
              {snapshot.surfaces.map((surface) => (
                <tr className="border-b border-[var(--border)]/50" key={surface.surface}>
                  <td className={`${CELL} font-mono`}>{surface.surface}</td>
                  <td className={CELL}>{surface.hooks}</td>
                  <td className={CELL}>{surface.archetypes}</td>
                  <td className={`${CELL} text-[var(--fog)]`}>{surface.note ?? "Authored"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </Section>

      <Section
        id="hook-cooldowns"
        title="Channel cooldown occupancy"
        subtitle="Every follower sees every post, so a channel cools a hook for max(2 × cooldownDays, 14) days — twice the in-app rule, because there is no per-user dilution to average a repeat away."
      >
        {snapshot.channels.length === 0
          ? <p className="text-sm text-[var(--fog)]">No channel has posted yet.</p>
          : (
            <Scroller>
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead><tr className="border-b border-[var(--border)]">
                  <th className={HEAD} scope="col">Channel</th>
                  <th className={HEAD} scope="col">Cooling</th>
                  <th className={HEAD} scope="col">Posts on file</th>
                  <th className={HEAD} scope="col">Last post</th>
                </tr></thead>
                <tbody>
                  {snapshot.channels.map((channel) => (
                    <tr className="border-b border-[var(--border)]/50" key={channel.channel}>
                      <td className={`${CELL} font-mono`}>{channel.channel}</td>
                      <td className={CELL}>
                        {channel.cooling}
                        {channel.librarySize > 0 ? <span className="text-[var(--fog)]"> / {channel.librarySize}</span> : null}
                      </td>
                      <td className={CELL}>{channel.posts}</td>
                      <td className={`${CELL} font-mono text-xs`}>{channel.lastPostedOn ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
          )}
      </Section>

      <Section
        id="hook-previews"
        title="Fixture assignments"
        subtitle="The real assignment, run against fixture items that carry real quiz metadata. No channel history is fed in — a preview is a picture of the gates, not of a channel's week."
      >
        <Scroller>
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead><tr className="border-b border-[var(--border)]">
              <th className={HEAD} scope="col">Vertical</th>
              <th className={HEAD} scope="col">Topic</th>
              <th className={HEAD} scope="col">Slide 1</th>
              <th className={HEAD} scope="col">Hook</th>
              <th className={HEAD} scope="col">Gates</th>
              <th className={HEAD} scope="col">Eligible</th>
            </tr></thead>
            <tbody>
              {snapshot.previews.map((preview) => (
                <tr className="border-b border-[var(--border)]/50" key={`${preview.vertical}-${preview.topic}`}>
                  <td className={`${CELL} font-mono`}>{preview.vertical}</td>
                  <td className={CELL}>{preview.topic}</td>
                  <td className={CELL}>
                    {preview.en
                      ? <><span className="block">{preview.en}</span><span className="mt-1 block text-[var(--fog)]">{preview.cs}</span></>
                      : <span className="text-[var(--fog)]">Template headline (no-hook)</span>}
                  </td>
                  <td className={`${CELL} font-mono text-xs`}>
                    {preview.hookId ?? "—"}
                    {preview.archetype ? <span className="mt-1 block text-[var(--fog)]">{preview.archetype}</span> : null}
                  </td>
                  <td className={`${CELL} font-mono text-xs`}>{preview.gates.join(", ") || "—"}</td>
                  <td className={CELL}>{preview.eligibleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </Section>

      <Section
        id="hook-recent"
        title="Last 20 assignments"
        subtitle="What actually posted, with the size of the set each hook was chosen from. A logged fallback counts as a pass — an unlogged missing assignment does not."
      >
        {snapshot.recent.length === 0
          ? <p className="text-sm text-[var(--fog)]">Nothing has been assigned yet.</p>
          : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge>{snapshot.recent.length} shown</Badge>
                <Badge tone={snapshot.fallbackCount > 0 ? "warning" : "success"}>
                  {snapshot.fallbackCount} no-hook fallback{snapshot.fallbackCount === 1 ? "" : "s"}
                </Badge>
              </div>
              <Scroller>
                <table className="w-full min-w-[48rem] border-collapse text-sm">
                  <thead><tr className="border-b border-[var(--border)]">
                    <th className={HEAD} scope="col">Date</th>
                    <th className={HEAD} scope="col">Channel</th>
                    <th className={HEAD} scope="col">Item</th>
                    <th className={HEAD} scope="col">Hook</th>
                    <th className={HEAD} scope="col">Eligible</th>
                  </tr></thead>
                  <tbody>
                    {snapshot.recent.map((row) => (
                      <tr className="border-b border-[var(--border)]/50" key={`${row.channel}-${row.date}-${row.itemId}`}>
                        <td className={`${CELL} font-mono text-xs`}>{row.date}</td>
                        <td className={`${CELL} font-mono text-xs`}>{row.channel}</td>
                        <td className={`${CELL} font-mono text-xs`}>{row.itemId}</td>
                        <td className={CELL}>
                          {row.hookId
                            ? <><span className="font-mono text-xs">{row.hookId}</span><span className="mt-1 block text-[var(--fog)]">{row.archetype}</span></>
                            : <Badge tone="warning">no-hook · {row.fallback}</Badge>}
                        </td>
                        <td className={CELL}>{row.eligibleCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            </>
          )}
      </Section>

    </div>
  );
}
