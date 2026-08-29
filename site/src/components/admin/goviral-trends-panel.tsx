import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminSectionHeading,
  AdminStatusBadge
} from "./admin-primitives";
import type { AdminGoViralTrends } from "@/lib/goviral-trends";

/**
 * What is viral this week, which is what the owner opens this workspace for.
 *
 * Aggregate signals only: topic sets with their engagement, the ranked hashtags with their
 * week-over-week movement, the audio riding the reels, and the two magazine shortlists. No
 * scraped post ever renders here — the snapshot's raw items are transient, untrusted material.
 */
function delta(value: number | null): string {
  if (value === null) return "new";
  if (value === 0) return "±0";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}/h`;
}

function perHour(value: number): string {
  return `${value.toFixed(1)}/h`;
}

export function GoViralTrendsPanel({ trends }: { trends: AdminGoViralTrends }) {
  if (trends.state === "missing") {
    return (
      <AdminCard>
        <AdminCardHeader>
          <AdminSectionHeading
            actions={<AdminStatusBadge tone="neutral">Waiting on data</AdminStatusBadge>}
            description={trends.droppedSnapshots > 0
              ? `${trends.droppedSnapshots} stored ${trends.droppedSnapshots === 1 ? "snapshot" : "snapshots"} could not be read; nothing renderable remains.`
              : "The Monday scout has not written a snapshot yet. It runs free-of-charge and no-ops until the approved APIFY_TOKEN is added to the repository's Actions secrets; the first Monday after that, this panel fills itself."}
            title="No trend snapshot yet"
          />
        </AdminCardHeader>
      </AdminCard>
    );
  }
  return (
    <AdminCard className="border-l-[3px] border-l-[var(--admin-section-accent)]">
      <AdminCardHeader>
        <AdminSectionHeading
          actions={<AdminStatusBadge tone="success">Week of {trends.snapshotDate}</AdminStatusBadge>}
          description="Aggregated from public posts, pruned after thirty days. Numbers are likes per hour; nothing here is a repost."
          title="What is viral right now"
        />
      </AdminCardHeader>
      <AdminCardContent className="grid gap-5">
        {trends.droppedSnapshots > 0 ? (
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
            {trends.droppedSnapshots} older {trends.droppedSnapshots === 1 ? "snapshot" : "snapshots"} could not be read and {trends.droppedSnapshots === 1 ? "was" : "were"} skipped.
          </p>
        ) : null}
        {trends.topics.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2" data-goviral-topics>
            {trends.topics.map((topic) => (
              <div className="grid gap-1 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3" key={topic.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="m-0 text-[length:var(--admin-type-body)] font-semibold text-[var(--admin-foreground)]">{topic.label}</h3>
                  <span className="admin-tabular text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{topic.items} posts · median {perHour(topic.medianEngagementPerHour)}</span>
                </div>
                {topic.topHashtags.length > 0 ? (
                  <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{topic.topHashtags.join(" · ")}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {trends.hashtags.length > 0 ? (
          <table className="w-full border-collapse text-[length:var(--admin-type-control)]" aria-label="Ranked hashtags">
            <thead>
              <tr className="text-left text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
                <th className="py-1 pr-3 font-semibold">Hashtag</th>
                <th className="py-1 pr-3 font-semibold">Topic</th>
                <th className="py-1 pr-3 text-right font-semibold">Posts</th>
                <th className="py-1 pr-3 text-right font-semibold">Engagement</th>
                <th className="py-1 text-right font-semibold">Week over week</th>
              </tr>
            </thead>
            <tbody>
              {trends.hashtags.map((tag) => (
                <tr className="border-t border-[var(--admin-border)]" key={`${tag.topicSet}-${tag.hashtag}`}>
                  <td className="py-1.5 pr-3 font-semibold text-[var(--admin-foreground)]">{tag.hashtag}</td>
                  <td className="py-1.5 pr-3 text-[var(--admin-foreground-muted)]">{tag.topicSet}</td>
                  <td className="admin-tabular py-1.5 pr-3 text-right">{tag.posts}</td>
                  <td className="admin-tabular py-1.5 pr-3 text-right">{perHour(tag.engagementPerHour)}</td>
                  <td className="admin-tabular py-1.5 text-right">{delta(tag.weekOverWeekDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {trends.audio.length > 0 ? (
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
            <span className="font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground)]">Audio riding the reels: </span>
            {trends.audio.map((track) => `${track.title}${track.artist ? ` — ${track.artist}` : ""} (${track.reels})`).join(" · ")}
          </p>
        ) : null}
        {(["ai", "mma"] as const).map((magazine) =>
          trends.forMagazines[magazine].length > 0 ? (
            <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]" key={magazine}>
              <span className="font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground)]">{magazine === "ai" ? "For DNESKAi: " : "For MMA Files: "}</span>
              {trends.forMagazines[magazine].map((lead) => `${lead.topic} (${perHour(lead.engagementPerHour)}, ${delta(lead.weekOverWeekDelta)})`).join(" · ")}
            </p>
          ) : null
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
