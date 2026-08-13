import type { AdminKvorumMonitorDay, AdminKvorumSnapshot } from "@/lib/admin-kvorum";

const STATUS_COLOUR: Record<AdminKvorumMonitorDay["sourceResults"][number]["status"], string> = {
  success: "#86efac",
  fixture: "#f5d90a",
  skipped: "#a1a1aa",
  failed: "#f87171"
};

function usd(value: number): string {
  return `$${value.toFixed(3)}`;
}

export function weeklyEntityHeat(
  days: readonly AdminKvorumMonitorDay[],
  labels: Readonly<Record<string, string>>
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
    return (
      <section className="rounded-[10px] border border-[#26262b] bg-[#101013] p-3.5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Apify quota</h3>
        <p className="mt-2 text-[12.5px] leading-[1.55] text-[#d4d4d8]">
          {snapshot.quotaState === "missing"
            ? "No quota record has been written yet. This does not mean the share is available."
            : "The saved quota record cannot be read, so no usage number is shown."}
        </p>
      </section>
    );
  }
  const quota = snapshot.quota;
  const percent = quota.shareCapUsd > 0 ? Math.min(100, (quota.estimatedUsedUsd / quota.shareCapUsd) * 100) : 0;
  return (
    <section className="rounded-[10px] border border-[#26262b] bg-[#101013] p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Apify quota · {quota.month}</h3>
        <span className="font-mono text-[11px] tabular-nums text-[#f5d90a]">
          {usd(quota.estimatedUsedUsd)} / {usd(quota.shareCapUsd)} venture share
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#26262b]">
        <span className="block h-full bg-[#f5d90a]" style={{ width: `${percent.toFixed(2)}%` }} />
      </div>
      <dl className="mt-3 grid gap-2 text-[11.5px] text-[#a1a1aa] sm:grid-cols-3">
        <div><dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#94949c]">Reserved per run</dt><dd className="mt-1 tabular-nums">{usd(quota.reservedPerRun)}</dd></div>
        <div><dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#94949c]">Shared account used</dt><dd className="mt-1 tabular-nums">{quota.sharedAccountUsedUsd === null ? "not recorded" : usd(quota.sharedAccountUsedUsd)}</dd></div>
        <div><dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#94949c]">Last recorded</dt><dd className="mt-1 tabular-nums">{quota.updatedAt}</dd></div>
      </dl>
      {quota.perActorCounts.length ? (
        <div className="mt-3 overflow-x-auto" data-horizontal-scroll>
          <div className="flex min-w-max gap-2">
            {quota.perActorCounts.map((actor) => (
              <span className="rounded-[7px] border border-[#3f3f46] bg-[#0d0d10] px-2.5 py-2 font-mono text-[9.5px] text-[#a1a1aa]" key={actor.actorId}>
                {actor.actorId} · {actor.runs} runs · {actor.items} items · {usd(actor.estimatedUsd)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11.5px] text-[#94949c]">No actor run is recorded in this month.</p>
      )}
      <p className="mt-3 text-[11px] leading-[1.5] text-[#94949c]">
        This bar is a record, not permission to run. Source and account approvals still gate every external call.
      </p>
    </section>
  );
}

function SourceHealth({ day }: { day: AdminKvorumMonitorDay }) {
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Source health · recorded response</h3>
      <div className="overflow-x-auto pb-1" data-horizontal-scroll>
        <div className="flex min-w-max gap-2">
          {day.sourceResults.map((source) => {
            const colour = STATUS_COLOUR[source.status];
            return (
              <article
                className="w-64 rounded-[9px] border bg-[#101013] p-3"
                key={`${source.kind}-${source.sourceId}`}
                style={{ borderColor: colour }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: colour }}>{source.status}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#94949c]">{source.kind}</span>
                </div>
                <p className="mt-2 text-[12.5px] font-semibold text-[#e4e4e7]">{source.sourceId}</p>
                <p className="mt-1 font-mono text-[10px] tabular-nums text-[#a1a1aa]">
                  {source.attempted ? "attempted" : "not attempted"} · {source.count} kept
                </p>
                {source.reason ? <p className="mt-2 text-[11px] leading-[1.45] text-[#94949c]">{source.reason}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ClusterDigest({ day }: { day: AdminKvorumMonitorDay }) {
  if (day.clusters.length === 0) {
    return (
      <p className="rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[12.5px] text-[#d4d4d8]">
        This receipt retained no ranked cluster. The digest is honestly quiet.
      </p>
    );
  }
  return (
    <section className="grid gap-3">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Ranked digest</h3>
      {day.clusters.map((cluster) => (
        <article className="rounded-[10px] border border-[#26262b] bg-[#101013] p-3.5" key={cluster.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#f5d90a]">Rank {cluster.rank.position} · score {cluster.rank.score}</p>
              <h4 className="mt-1 text-[16px] font-semibold text-[#f4f4f5]">{cluster.title}</h4>
            </div>
            {cluster.continuationOf ? (
              <span className="rounded-full border border-[#3f3f46] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#a1a1aa]">
                continuation
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {cluster.entityIds.map((entity) => <span className="rounded-full bg-[#1e1e22] px-2 py-1 text-[10px] text-[#a1a1aa]" key={entity}>{entity}</span>)}
            {cluster.topicTokens.map((topic) => <span className="rounded-full bg-[#111005] px-2 py-1 text-[10px] text-[#d8cf69]" key={topic}>#{topic}</span>)}
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {cluster.sources.map((source) => (
              <div className="rounded-[8px] border border-[#26262b] bg-[#0d0d10] p-3" key={`${cluster.id}-${source.sourceId}-${source.url}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <a className="text-[12px] font-semibold text-[#f5d90a] underline" href={source.url} rel="noreferrer" target="_blank">{source.sourceName}</a>
                  {source.discoveryOnly ? <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#f5a524]">context only</span> : null}
                </div>
                <p className="mt-2 text-[12px] leading-[1.55] text-[#d4d4d8]">{source.excerpt}</p>
                <p className="mt-2 font-mono text-[9px] tabular-nums text-[#94949c]">{source.publishedAt}</p>
                {source.engagement ? (
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#a1a1aa]">
                    {source.engagement.likes ?? "—"} likes · {source.engagement.comments ?? "—"} comments · {source.engagement.shares ?? "—"} shares
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function EntityHeatmap({ snapshot }: { snapshot: AdminKvorumSnapshot }) {
  const heat = weeklyEntityHeat(snapshot.monitor, snapshot.entityLabels);
  const maximum = heat[0]?.mentions ?? 1;
  return (
    <section className="rounded-[10px] border border-[#26262b] bg-[#101013] p-3.5">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Entity heat · latest seven recorded days</h3>
      {heat.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {heat.map((entity) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" key={entity.id}>
              <div className="min-w-0">
                <div className="flex justify-between gap-2 text-[11px] text-[#d4d4d8]"><span className="truncate">{entity.label}</span><span className="tabular-nums text-[#a1a1aa]">{entity.mentions}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#26262b]"><span className="block h-full bg-[#f5d90a]" style={{ width: `${(entity.mentions / maximum) * 100}%` }} /></div>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="mt-2 text-[12px] text-[#94949c]">No retained cluster contains an entity in this window.</p>}
    </section>
  );
}

function PurgeClock({ day }: { day: AdminKvorumMonitorDay }) {
  return (
    <section className="rounded-[10px] border border-[#26262b] bg-[#101013] p-3.5">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Raw-item purge clock</h3>
      <p className="mt-2 text-[13px] leading-[1.55] text-[#d4d4d8]">
        {day.purge.retentionDays}-day window · items older than <span className="font-mono text-[#f5d90a]">{day.purge.cutoffPublishedAt}</span> were eligible at the last evaluation.
      </p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#a1a1aa]">
        Evaluated {day.purge.evaluatedAt} · {day.purge.rawItemsBefore} before · {day.purge.rawItemsAfter} after · {day.purge.purgedCount} purged
      </p>
    </section>
  );
}

export function KvorumMonitorPanel({ snapshot }: { snapshot: AdminKvorumSnapshot }) {
  const day = snapshot.monitor[0] ?? null;
  return (
    <div className="grid gap-4">
      {snapshot.unreadable > 0 ? (
        <p className="rounded-[9px] border border-[#92400e] bg-[#160f07] p-3 text-[12px] text-[#f5a524]">
          {snapshot.unreadable} Kvórum state {snapshot.unreadable === 1 ? "record was" : "records were"} dropped because they could not be read.
        </p>
      ) : null}
      <Quota snapshot={snapshot} />
      {!day ? (
        <p className="rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] leading-[1.55] text-[#d4d4d8]">
          {snapshot.monitorState === "missing"
            ? "The Kvórum monitor has not written its first receipt yet."
            : snapshot.monitorState === "unreadable"
              ? "Monitor receipts exist, but none can be read safely."
              : "The monitor store exists and contains no receipt."}
        </p>
      ) : (
        <>
          <header className="rounded-[10px] border border-[#26262b] bg-[#0c0c0f] p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div><p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#f5d90a]">Latest monitor digest</p><h2 className="mt-1 text-[18px] font-semibold text-[#f4f4f5]">{day.date}</h2></div>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#a1a1aa]">{day.itemsKept} raw items retained</span>
            </div>
            {day.fixtureOnly ? <p className="mt-3 text-[12px] text-[#f5a524]">Fixture-only receipt: no external source was attempted and no spend occurred.</p> : null}
          </header>
          <SourceHealth day={day} />
          <ClusterDigest day={day} />
          <div className="grid gap-4 xl:grid-cols-2"><EntityHeatmap snapshot={snapshot} /><PurgeClock day={day} /></div>
        </>
      )}
      <p className="text-[11px] leading-[1.5] text-[#94949c]">
        Read-only. Source enablement lives in reviewed configuration; this panel cannot fetch, spend or change it.
      </p>
    </div>
  );
}
