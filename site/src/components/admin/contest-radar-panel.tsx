import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEntityBadge,
  AdminMetric,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion
} from "./admin-primitives";
import type {
  AdminContestRadarSnapshot,
  ContestAdminFact,
  ContestAdminRow
} from "@/lib/admin-contest-radar";

/**
 * Soutěžní radar: what is worth the owner's evening, and what the system will not do about it.
 *
 * The list answers one question first — which of these should I do tonight — so it leads with the
 * ranked opportunities and their deadlines. Everything else explains that order.
 *
 * Two product rules are visible rather than hidden in a score. A purchase-required contest is
 * labelled and sits in its own band, because the system never buys the required product. And a
 * fact nobody stated shows as unavailable with its reason, never as a zero or a blank, because
 * "no prize stated" and "prize stated but unreadable" send the owner to different places.
 *
 * There is no enter button anywhere in this workspace, and there is nothing behind one.
 */

export const CONTEST_TABS = ["today", "sources", "results"] as const;

export type ContestTab = (typeof CONTEST_TABS)[number];

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminSectionHeading actions={note ? <AdminEntityBadge>{note}</AdminEntityBadge> : undefined} title={title} />
      </AdminCardHeader>
      <AdminCardContent>{children}</AdminCardContent>
    </AdminCard>
  );
}

/** A fact the sources did not supply says which kind of missing it is. */
function Fact({ fact, format }: { fact: ContestAdminFact; format?: (value: string | number | boolean) => string }) {
  if (fact.value !== null) {
    return (
      <>
        {format ? format(fact.value) : String(fact.value)}
        {fact.confidence && fact.confidence !== "stated"
          ? <span className="ml-1 text-[var(--admin-foreground-muted)]">({fact.confidence})</span>
          : null}
      </>
    );
  }
  return (
    <span className="text-[var(--admin-foreground-muted)]">
      {fact.unavailableReason ? fact.unavailableReason.replaceAll("-", " ") : "unavailable"}
    </span>
  );
}

function purchaseTone(row: ContestAdminRow): "warning" | "neutral" {
  return row.purchaseRequired.value === true ? "warning" : "neutral";
}

function Today({ snapshot }: { snapshot: AdminContestRadarSnapshot }) {
  if (snapshot.records.length === 0) {
    return (
      <AdminStateMessage
        description={
          snapshot.authority.foundingCountersigned
            ? "The venture is founded and the scan is built, but no run has recorded a contest yet. Every paid path stays held by the founding decision; the free scan is what produces this list."
            : "The founding decision is not countersigned, so nothing runs. Nothing here is broken."
        }
        state="unavailable"
        title="No contests on file yet"
      />
    );
  }

  // Purchase-required contests sort last here for the same reason they rank last: the system will
  // not buy the required product, so they are a different category of thing.
  const ordered = [...snapshot.records].sort((left, right) => {
    const band = Number(left.purchaseRequired.value === true) - Number(right.purchaseRequired.value === true);
    if (band !== 0) return band;
    const leftDeadline = typeof left.deadline.value === "string" ? left.deadline.value : "9999-12-31";
    const rightDeadline = typeof right.deadline.value === "string" ? right.deadline.value : "9999-12-31";
    return leftDeadline.localeCompare(rightDeadline) || left.title.localeCompare(right.title);
  });

  return (
    <div className="grid min-w-0 gap-4" data-contest-tab="today">
      <Card note={`${snapshot.records.length} on file`} title="Worth an evening">
        <AdminTableRegion label="Contest opportunities">
          <AdminTable>
            <thead>
              <tr>
                <AdminTableHead scope="col">Contest</AdminTableHead>
                <AdminTableHead scope="col">Deadline</AdminTableHead>
                <AdminTableHead scope="col">Prize</AdminTableHead>
                <AdminTableHead scope="col">Effort</AdminTableHead>
                <AdminTableHead scope="col">Entry cost</AdminTableHead>
                <AdminTableHead scope="col">Readiness</AdminTableHead>
              </tr>
            </thead>
            <tbody>
              {ordered.map((row) => (
                <tr key={row.id} data-contest-row={row.id}>
                  <AdminTableCell>
                    <a className="admin-focus-ring underline-offset-2 hover:underline" href={row.canonicalUrl} rel="noreferrer noopener" target="_blank">
                      {row.title}
                    </a>
                    {row.conflicts.length > 0 ? (
                      <span className="ml-2"><AdminStatusBadge tone="warning">sources disagree</AdminStatusBadge></span>
                    ) : null}
                  </AdminTableCell>
                  <AdminTableCell className="admin-tabular whitespace-nowrap"><Fact fact={row.deadline} /></AdminTableCell>
                  <AdminTableCell><Fact fact={row.prizeDescription} /></AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap">{row.effortTier}</AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap">
                    <AdminStatusBadge tone={purchaseTone(row)}>
                      {row.purchaseRequired.value === true ? "purchase required" : "check the rules"}
                    </AdminStatusBadge>
                  </AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap">{row.readiness}</AdminTableCell>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminTableRegion>
      </Card>
      <AdminCallout tone="warning">
        Contest Radar never enters, submits, follows, comments, buys or claims anything. Every
        entry is yours to make, and eligibility and purchase rules need the contest&rsquo;s own
        rules page before you do.
      </AdminCallout>
    </div>
  );
}

function Sources({ snapshot }: { snapshot: AdminContestRadarSnapshot }) {
  const byVerdict = (verdict: string) => snapshot.sources.filter((source) => source.verdict === verdict);
  return (
    <div className="grid min-w-0 gap-4" data-contest-tab="sources">
      <Card note={`${snapshot.sources.length} audited`} title="Where the list comes from">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetric label="Enabled" note="fetched or read" value={String(byVerdict("enabled").length)} />
          <AdminMetric label="Held" note="waiting on you" value={String(byVerdict("held").length)} />
          <AdminMetric label="Disabled" note="off by choice" value={String(byVerdict("disabled").length)} />
          <AdminMetric label="Rejected" note="the site said no" value={String(byVerdict("rejected").length)} />
        </div>
        <AdminTableRegion label="Audited contest sources">
          <AdminTable>
            <thead>
              <tr>
                <AdminTableHead scope="col">Source</AdminTableHead>
                <AdminTableHead scope="col">Track</AdminTableHead>
                <AdminTableHead scope="col">Verdict</AdminTableHead>
                <AdminTableHead scope="col">Why</AdminTableHead>
                <AdminTableHead scope="col">Verified</AdminTableHead>
              </tr>
            </thead>
            <tbody>
              {snapshot.sources.map((source) => (
                <tr key={source.id} data-contest-source={source.id}>
                  <AdminTableCell>
                    {source.name}
                    {source.discoveryOnly ? <span className="ml-2"><AdminEntityBadge>discovery only</AdminEntityBadge></span> : null}
                  </AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap">{source.track}</AdminTableCell>
                  <AdminTableCell className="whitespace-nowrap">
                    <AdminStatusBadge tone={
                      source.verdict === "enabled" ? "success"
                        : source.verdict === "held" ? "information"
                          : source.verdict === "rejected" ? "risk" : "neutral"
                    }>
                      {source.verdict}
                    </AdminStatusBadge>
                  </AdminTableCell>
                  <AdminTableCell>{source.verdictReason}</AdminTableCell>
                  <AdminTableCell className="admin-tabular whitespace-nowrap">{source.lastVerifiedOn}</AdminTableCell>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminTableRegion>
      </Card>
      <AdminCallout tone="information">
        A discovery-only source can open an investigation and never establish a fact. A rejected
        one refused a plain request; nothing here works around a login page or a bot check.
      </AdminCallout>
    </div>
  );
}

function Results({ snapshot }: { snapshot: AdminContestRadarSnapshot }) {
  const latest = snapshot.runs[0];
  const standing = snapshot.ownerEvents.filter((event) => event.stands);
  return (
    <div className="grid min-w-0 gap-4" data-contest-tab="results">
      {latest ? (
        <Card note={latest.outcome} title={`Last scan — ${latest.date}`}>
          <p className="text-[length:var(--admin-type-body)]">{latest.reason}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminMetric label="Records" note={`${latest.candidates} candidates`} value={String(latest.records)} />
            <AdminMetric label="Cache reused" note="sources unchanged" value={String(latest.cacheReused)} />
            <AdminMetric label="Model calls" note="free path" value={String(latest.modelCalls)} />
            <AdminMetric label="Spend" note="this scan" value={`$${(latest.modelUsd + latest.apifyUsd).toFixed(2)}`} />
          </div>
          <p className="mt-4 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
            {latest.nextSafeAction}
          </p>
        </Card>
      ) : (
        <AdminStateMessage description="No scan has recorded a run yet." state="unavailable" title="No runs on file" />
      )}

      <Card note={`${standing.length} standing`} title="What you did">
        {standing.length === 0 ? (
          <p className="text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">
            Nothing recorded yet. Entries and outcomes are yours to log after you make them.
          </p>
        ) : (
          <AdminTableRegion label="Owner events">
            <AdminTable>
              <thead>
                <tr>
                  <AdminTableHead scope="col">When</AdminTableHead>
                  <AdminTableHead scope="col">Contest</AdminTableHead>
                  <AdminTableHead scope="col">Action</AdminTableHead>
                  <AdminTableHead scope="col">Result</AdminTableHead>
                  <AdminTableHead scope="col">Minutes</AdminTableHead>
                </tr>
              </thead>
              <tbody>
                {standing.map((event) => (
                  <tr key={event.id} data-contest-event={event.id}>
                    <AdminTableCell className="admin-tabular whitespace-nowrap">{event.recordedAt.slice(0, 10)}</AdminTableCell>
                    <AdminTableCell>{event.contestId}</AdminTableCell>
                    <AdminTableCell className="whitespace-nowrap">{event.action}</AdminTableCell>
                    <AdminTableCell className="whitespace-nowrap">{event.result ?? "—"}</AdminTableCell>
                    <AdminTableCell className="admin-tabular whitespace-nowrap">{event.actualMinutes ?? "—"}</AdminTableCell>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </AdminTableRegion>
        )}
      </Card>
    </div>
  );
}

export function ContestRadarPanel({
  snapshot,
  tab
}: {
  snapshot: AdminContestRadarSnapshot;
  tab: ContestTab;
}) {
  return (
    <div className="grid min-w-0 gap-4" data-contest-workspace={tab}>
      {snapshot.unreadable > 0 ? (
        <AdminCallout tone="warning">
          {snapshot.unreadable} {snapshot.unreadable === 1 ? "record was" : "records were"} dropped as unreadable.
          Counts only: no repository path reaches this page.
        </AdminCallout>
      ) : null}
      {tab === "today" ? <Today snapshot={snapshot} /> : null}
      {tab === "sources" ? <Sources snapshot={snapshot} /> : null}
      {tab === "results" ? <Results snapshot={snapshot} /> : null}
    </div>
  );
}

/** An unknown bookmark falls back to the tab that answers the operational question. */
export function resolveContestTab(value: string | undefined): ContestTab {
  return (CONTEST_TABS as readonly string[]).includes(value ?? "") ? (value as ContestTab) : "today";
}
