import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminEntityBadge,
  AdminMetric,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import type { AdminKvorumMonitorDay, AdminKvorumSnapshot } from "@/lib/admin-kvorum";

type SourceStatus = AdminKvorumMonitorDay["sourceResults"][number]["status"];

function sourceTone(status: SourceStatus): "success" | "information" | "neutral" | "destructive" {
  if (status === "success") return "success";
  if (status === "fixture") return "information";
  if (status === "failed") return "destructive";
  return "neutral";
}

function usd(value: number): string {
  return `$${value.toFixed(3)}`;
}

export function weeklyEntityHeat(
  days: readonly AdminKvorumMonitorDay[],
  labels: Readonly<Record<string, string>>,
): Array<{ id: string; label: string; mentions: number }> {
  const latest = days.map((day) => day.date).sort().at(-1);
  if (!latest) return [];
  const cutoff = new Date(`${latest}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const day of days.filter((entry) => entry.date >= cutoffDay && entry.date <= latest)) {
    for (const cluster of day.clusters) {
      for (const entityId of cluster.entityIds) counts.set(entityId, (counts.get(entityId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, mentions]) => ({ id, label: labels[id] ?? id.replaceAll("-", " "), mentions }))
    .sort((left, right) => right.mentions - left.mentions || left.label.localeCompare(right.label, "cs"));
}

function Quota({ snapshot }: { snapshot: AdminKvorumSnapshot }) {
  if (!snapshot.quota) {
    return <AdminStateMessage state={snapshot.quotaState === "unreadable" ? "malformed" : "unavailable"}
      title="Apify quota"
      description={snapshot.quotaState === "missing"
        ? "No quota record has been written yet. This does not mean the share is available."
        : "The saved quota record cannot be read, so no usage number is shown."} />;
  }
  const quota = snapshot.quota;
  const percent = quota.shareCapUsd > 0 ? Math.min(100, (quota.estimatedUsedUsd / quota.shareCapUsd) * 100) : 0;
  return (
    <AdminCard>
      <AdminCardContent>
        <AdminMetric label={`Apify quota · ${quota.month}`} progress={percent} value={`${usd(quota.estimatedUsedUsd)} / ${usd(quota.shareCapUsd)} venture share`} />
        <div className="m-0 mt-3 grid divide-y divide-[var(--admin-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0" data-admin-metrics>
          <AdminMetric className="px-3 first:pl-0" label="Reserved per run" value={usd(quota.reservedPerRun)} />
          <AdminMetric className="px-3" label="Shared account used" value={quota.sharedAccountUsedUsd === null ? "Not recorded" : usd(quota.sharedAccountUsedUsd)} />
          <AdminMetric className="px-3 last:pr-0" label="Last recorded" value={<span className="break-all text-[length:var(--admin-type-control)]">{quota.updatedAt}</span>} />
        </div>
        {quota.perActorCounts.length ? (
          <div className="mt-3 overflow-x-auto pb-1" data-horizontal-scroll>
            <div className="flex min-w-max gap-2">
              {quota.perActorCounts.map((actor) => (
                <AdminEntityBadge className="py-2" key={actor.actorId}>
                  {actor.actorId} · {actor.runs} runs · {actor.items} items · {usd(actor.estimatedUsd)}
                </AdminEntityBadge>
              ))}
            </div>
          </div>
        ) : <AdminStateMessage className="mt-3" state="initial-empty" title="No actor run is recorded in this month." />}
        <p className="m-0 mt-3 text-[length:var(--admin-type-label)] leading-5 text-[var(--admin-foreground-muted)]">
          This bar is a record, not permission to run. Source and account approvals still gate every external call.
        </p>
      </AdminCardContent>
    </AdminCard>
  );
}

function SourceHealth({ day }: { day: AdminKvorumMonitorDay }) {
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Source health · recorded response</h3>
      <div className="overflow-x-auto pb-1" data-horizontal-scroll>
        <div className="flex min-w-max gap-2">
          {day.sourceResults.map((source) => (
            <article className="w-64 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3" key={`${source.kind}-${source.sourceId}`}>
              <div className="flex items-center justify-between gap-2">
                <AdminStatusBadge tone={sourceTone(source.status)}>{source.status}</AdminStatusBadge>
                <AdminEntityBadge>{source.kind}</AdminEntityBadge>
              </div>
              <p className="m-0 mt-2 text-[length:var(--admin-type-control)] font-semibold">{source.sourceId}</p>
              <p className="admin-tabular m-0 mt-1 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{source.attempted ? "attempted" : "not attempted"} · {source.count} kept</p>
              {source.reason ? <p className="m-0 mt-2 text-[length:var(--admin-type-label)] leading-5 text-[var(--admin-foreground-muted)]">{source.reason}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClusterDigest({ day }: { day: AdminKvorumMonitorDay }) {
  if (day.clusters.length === 0) {
    return <AdminStateMessage state="initial-empty" title="This receipt retained no ranked cluster." description="The digest is honestly quiet." />;
  }
  return (
    <section className="grid gap-3">
      <h3 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Ranked digest</h3>
      {day.clusters.map((cluster) => (
        <AdminCard key={cluster.id}>
          <AdminCardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="m-0 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Rank {cluster.rank.position} · score {cluster.rank.score}</p>
                <h4 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{cluster.title}</h4>
              </div>
              {cluster.continuationOf ? <AdminStatusBadge tone="information">Continuation</AdminStatusBadge> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cluster.entityIds.map((entity) => <AdminEntityBadge key={entity}>{entity}</AdminEntityBadge>)}
              {cluster.topicTokens.map((topic) => <AdminEntityBadge key={topic}>#{topic}</AdminEntityBadge>)}
            </div>
            <div className="mt-3 grid divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              {cluster.sources.map((source) => (
                <div className="min-w-0 p-3" key={`${cluster.id}-${source.sourceId}-${source.url}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <a className="admin-focus-ring rounded-[var(--admin-radius-sm)] text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] underline underline-offset-2" href={source.url} rel="noreferrer" target="_blank">{source.sourceName}</a>
                    {source.discoveryOnly ? <AdminStatusBadge tone="warning">Context only</AdminStatusBadge> : null}
                  </div>
                  <p className="m-0 mt-2 text-[length:var(--admin-type-control)] leading-5">{source.excerpt}</p>
                  <p className="m-0 mt-2 break-all text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{source.publishedAt}</p>
                  {source.engagement ? <p className="admin-tabular m-0 mt-1 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{source.engagement.likes ?? "—"} likes · {source.engagement.comments ?? "—"} comments · {source.engagement.shares ?? "—"} shares</p> : null}
                </div>
              ))}
            </div>
          </AdminCardContent>
        </AdminCard>
      ))}
    </section>
  );
}

function EntityHeatmap({ snapshot }: { snapshot: AdminKvorumSnapshot }) {
  const heat = weeklyEntityHeat(snapshot.monitor, snapshot.entityLabels);
  const maximum = heat[0]?.mentions ?? 1;
  return (
    <AdminCard>
      <AdminCardContent>
        <h3 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Entity heat · latest seven recorded days</h3>
        {heat.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{heat.map((entity) => (
          <div className="min-w-0" key={entity.id}>
            <div className="flex justify-between gap-2 text-[length:var(--admin-type-control)]"><span className="truncate">{entity.label}</span><span className="admin-tabular text-[var(--admin-foreground-muted)]">{entity.mentions}</span></div>
            <div aria-label={`${entity.label}: ${entity.mentions} mentions`} aria-valuemax={maximum} aria-valuemin={0} aria-valuenow={entity.mentions} className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--admin-surface-muted)]" role="meter"><span className="block h-full bg-[var(--admin-section-accent)]" style={{ width: `${(entity.mentions / maximum) * 100}%` }} /></div>
          </div>
        ))}</div> : <AdminStateMessage className="mt-2" state="initial-empty" title="No retained cluster contains an entity in this window." />}
      </AdminCardContent>
    </AdminCard>
  );
}

function PurgeClock({ day }: { day: AdminKvorumMonitorDay }) {
  return (
    <AdminCard>
      <AdminCardContent>
        <h3 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Raw-item purge clock</h3>
        <p className="m-0 mt-2 text-[length:var(--admin-type-body)] leading-5">{day.purge.retentionDays}-day window · items older than <span className="admin-tabular">{day.purge.cutoffPublishedAt}</span> were eligible at the last evaluation.</p>
        <p className="admin-tabular m-0 mt-2 text-[length:var(--admin-type-label)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Evaluated {day.purge.evaluatedAt} · {day.purge.rawItemsBefore} before · {day.purge.rawItemsAfter} after · {day.purge.purgedCount} purged</p>
      </AdminCardContent>
    </AdminCard>
  );
}

export function KvorumMonitorPanel({ snapshot }: { snapshot: AdminKvorumSnapshot }) {
  const day = snapshot.monitor[0] ?? null;
  const emptyTitle = snapshot.monitorState === "missing"
    ? "The Kvórum monitor has not written its first receipt yet."
    : snapshot.monitorState === "unreadable"
      ? "Monitor receipts exist, but none can be read safely."
      : "The monitor store exists and contains no receipt.";
  return (
    <div className="grid gap-4">
      {snapshot.unreadable > 0 ? <AdminCallout tone="warning">{snapshot.unreadable} Kvórum state {snapshot.unreadable === 1 ? "record was" : "records were"} dropped because they could not be read.</AdminCallout> : null}
      <Quota snapshot={snapshot} />
      {!day ? <AdminStateMessage state={snapshot.monitorState === "unreadable" ? "malformed" : "initial-empty"} title={emptyTitle} /> : (
        <>
          <AdminCard>
            <AdminCardContent className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="m-0 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Latest monitor digest</p><h2 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{day.date}</h2></div>
              <AdminEntityBadge>{day.itemsKept} raw items retained</AdminEntityBadge>
              {day.fixtureOnly ? <AdminCallout className="w-full" tone="information">Fixture-only receipt: no external source was attempted and no spend occurred.</AdminCallout> : null}
            </AdminCardContent>
          </AdminCard>
          <SourceHealth day={day} />
          <ClusterDigest day={day} />
          <div className="grid gap-4 xl:grid-cols-2"><EntityHeatmap snapshot={snapshot} /><PurgeClock day={day} /></div>
        </>
      )}
      <AdminCallout>Read-only. Source enablement lives in reviewed configuration; this panel cannot fetch, spend or change it.</AdminCallout>
    </div>
  );
}
