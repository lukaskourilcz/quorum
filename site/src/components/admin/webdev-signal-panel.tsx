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
  AdminWebDevSignalSnapshot,
  WebDevAdminDay,
  WebDevAdminEdition,
  WebDevAdminMeasure
} from "@/lib/admin-webdev-signal";

/**
 * The WebDev Signal workspace, answering its operational question first.
 *
 * That question is "what is today's most important web-development update, and is every Czech and
 * English package safe and ready" — so Today leads, and every other tab exists to explain the
 * answer rather than to fill a screen. Sources says what ran, Decision says why one story won or
 * why there is none, the two edition tabs say whether each locale is safe, and Results says what
 * the window has measured so far.
 *
 * Every tab reads one snapshot. Nothing here scans state, calls a provider or fetches a source.
 */

export const WEBDEV_TABS = [
  "today",
  "decision",
  "sources",
  "edition-cs",
  "edition-en",
  "delivery",
  "results"
] as const;

export type WebDevTab = (typeof WEBDEV_TABS)[number];

const TAB_LABEL: Record<WebDevTab, string> = {
  today: "Today",
  decision: "Decision",
  sources: "Sources",
  "edition-cs": "Czech edition",
  "edition-en": "English edition",
  delivery: "Design & delivery",
  results: "Results & health"
};

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

/**
 * A measure that could not be taken says so in words.
 *
 * "Unavailable" alone sends the reader looking for a fault. The reason is the difference between
 * "this day published nothing, so there is no reach" and "the provider did not answer".
 */
function Measure({ measure, format }: { measure: WebDevAdminMeasure; format?: (value: number) => string }) {
  if (measure.value !== null) return <>{format ? format(measure.value) : String(measure.value)}</>;
  return (
    <span className="text-[var(--admin-foreground-muted)]">
      Unavailable{measure.unavailableReason ? ` — ${measure.unavailableReason.replaceAll("-", " ")}` : ""}
    </span>
  );
}

function outcomeTone(outcome: WebDevAdminDay["outcome"]): "success" | "neutral" | "warning" {
  if (outcome === "selected") return "success";
  // NO_EDITION is the product working, so it is never styled as a problem.
  return outcome === "NO_EDITION" ? "neutral" : "warning";
}

function outcomeLabel(outcome: WebDevAdminDay["outcome"]): string {
  if (outcome === "selected") return "Edition selected";
  return outcome === "NO_EDITION" ? "No edition today" : "Did not run";
}

function NoDays({ snapshot }: { snapshot: AdminWebDevSignalSnapshot }) {
  return (
    <AdminStateMessage
      description={
        snapshot.authority.foundingCountersigned
          ? "The founding is countersigned and the desk is built, but no daily scan has run yet. Live behaviour stays held by the founding decision, and the owner creates the four Instagram and Threads accounts before anything can be delivered."
          : "The founding decision is not countersigned, so the desk holds. Nothing here is broken; the venture has no authority to run."
      }
      state="unavailable"
      title="WebDev Signal has not run a day yet"
    />
  );
}

function Today({ snapshot }: { snapshot: AdminWebDevSignalSnapshot }) {
  const day = snapshot.days[0];
  if (!day) return <NoDays snapshot={snapshot} />;
  return (
    <div className="grid min-w-0 gap-4" data-webdev-tab="today">
      <Card note={day.provenance} title={`${day.date} — ${outcomeLabel(day.outcome)}`}>
        <div className="flex flex-wrap gap-2">
          <AdminStatusBadge tone={outcomeTone(day.outcome)}>{outcomeLabel(day.outcome)}</AdminStatusBadge>
          {day.ownerOverride ? <AdminEntityBadge>owner override</AdminEntityBadge> : null}
        </div>
        <p className="mt-3 text-[length:var(--admin-type-body)]">{day.reason}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetric label="Sources healthy" note={`${day.sources.attempted} attempted`} value={String(day.sources.healthy)} />
          <AdminMetric label="Eligible candidates" note={`${day.candidates.fetched} fetched`} value={String(day.candidates.eligible)} />
          <AdminMetric label="Model calls" note="deterministic path" value={String(day.cost.modelCalls)} />
          <AdminMetric label="Provider cost" note="this day" value={`$${day.cost.providerCostUsd.toFixed(2)}`} />
        </div>
      </Card>
      <EditionSummary editions={day.editions} />
    </div>
  );
}

function EditionSummary({ editions }: { editions: WebDevAdminEdition[] }) {
  if (editions.length === 0) {
    return (
      <AdminStateMessage
        description="No edition was selected for this day, so neither locale has a package. That is the desk refusing filler rather than a failure."
        state="unavailable"
        title="No packages for this day"
      />
    );
  }
  return (
    <Card title="Both editions">
      <AdminTableRegion label="Edition state by locale">
        <AdminTable>
          <thead>
            <tr>
              <AdminTableHead scope="col">Locale</AdminTableHead>
              <AdminTableHead scope="col">Package</AdminTableHead>
              <AdminTableHead scope="col">Claim parity</AdminTableHead>
              <AdminTableHead scope="col">Accessibility</AdminTableHead>
              <AdminTableHead scope="col">Render</AdminTableHead>
              <AdminTableHead scope="col">Delivery</AdminTableHead>
            </tr>
          </thead>
          <tbody>
            {editions.map((edition) => (
              <tr key={edition.locale} data-webdev-edition={edition.locale}>
                <AdminTableCell>{edition.locale === "cs" ? "Czech" : "English"}</AdminTableCell>
                <AdminTableCell>
                  <AdminStatusBadge tone={edition.state === "valid" ? "success" : edition.state === "held" ? "warning" : "neutral"}>
                    {edition.state}
                  </AdminStatusBadge>
                </AdminTableCell>
                <AdminTableCell>{edition.claimParity}</AdminTableCell>
                <AdminTableCell>{edition.accessibility}</AdminTableCell>
                <AdminTableCell>{edition.renderState}</AdminTableCell>
                <AdminTableCell>{edition.deliveryState}</AdminTableCell>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </AdminTableRegion>
    </Card>
  );
}

function Decision({ snapshot }: { snapshot: AdminWebDevSignalSnapshot }) {
  const day = snapshot.days[0];
  if (!day) return <NoDays snapshot={snapshot} />;
  return (
    <div className="grid min-w-0 gap-4" data-webdev-tab="decision">
      <Card note={day.outcome} title="Why this story, or why none">
        <p className="text-[length:var(--admin-type-body)]">{day.reason}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetric label="Score margin" note="winner over runner-up" value={<Measure format={(value) => value.toFixed(3)} measure={day.scoreMargin} />} />
          <AdminMetric label="Confidence" note="winner" value={<Measure format={(value) => value.toFixed(3)} measure={day.confidence} />} />
          <AdminMetric label="Held candidates" note="failed a gate" value={String(day.candidates.held)} />
          <AdminMetric label="Duplicates collapsed" note="clustered" value={String(day.candidates.duplicatesCollapsed)} />
        </div>
        <p className="mt-4 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
          GoVIRAL: {day.goviral.status}
          {day.goviral.status === "used"
            ? day.goviral.changedWinner ? " — changed which record won" : " — did not change which record won"
            : ""}
        </p>
      </Card>
      <AdminCallout tone="information">
        GoVIRAL is optional momentum intelligence. It cannot create a candidate, establish a fact,
        force a selection or supply copy.
      </AdminCallout>
    </div>
  );
}

function Sources({ snapshot }: { snapshot: AdminWebDevSignalSnapshot }) {
  const day = snapshot.days[0];
  if (!day) return <NoDays snapshot={snapshot} />;
  return (
    <div className="grid min-w-0 gap-4" data-webdev-tab="sources">
      <Card note={`${day.sources.configured} configured`} title="What ran">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetric label="Attempted" note="this day" value={String(day.sources.attempted)} />
          <AdminMetric label="Healthy" note="parsed and kept" value={String(day.sources.healthy)} />
          <AdminMetric label="Failed" note="failed or malformed" value={String(day.sources.failed)} />
          <AdminMetric label="Layout changes" note="needs a re-audit" value={String(day.sources.layoutChanges)} />
        </div>
        <p className="mt-4 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
          {day.sources.authorityClassesCovered} authority {day.sources.authorityClassesCovered === 1 ? "class" : "classes"} produced a kept item.
          Only audited official and primary sources carry factual authority; a secondary source can lead to a story but never establish one.
        </p>
      </Card>
    </div>
  );
}

function Edition({ snapshot, locale }: { snapshot: AdminWebDevSignalSnapshot; locale: "cs" | "en" }) {
  const day = snapshot.days[0];
  if (!day) return <NoDays snapshot={snapshot} />;
  const edition = day.editions.find((entry) => entry.locale === locale);
  if (!edition) {
    return (
      <AdminStateMessage
        description="This day selected no story, so this locale has no package. Both editions come from one accepted evidence brief; neither is a translation of the other."
        state="unavailable"
        title={`No ${locale === "cs" ? "Czech" : "English"} package for this day`}
      />
    );
  }
  return (
    <div className="grid min-w-0 gap-4" data-webdev-tab={locale}>
      <Card note={edition.state} title={`${locale === "cs" ? "Czech" : "English"} edition`}>
        <div className="flex flex-wrap gap-2">
          <AdminStatusBadge tone={edition.state === "valid" ? "success" : "warning"}>{edition.state}</AdminStatusBadge>
          <AdminEntityBadge>claim parity {edition.claimParity}</AdminEntityBadge>
          <AdminEntityBadge>accessibility {edition.accessibility}</AdminEntityBadge>
        </div>
        {edition.holdReasons.length > 0 ? (
          <ul className="mt-3 grid gap-1 text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">
            {edition.holdReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        ) : (
          <p className="mt-3 text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">
            Nothing is holding this edition.
          </p>
        )}
      </Card>
    </div>
  );
}

function Delivery({ snapshot }: { snapshot: AdminWebDevSignalSnapshot }) {
  return (
    <div className="grid min-w-0 gap-4" data-webdev-tab="delivery">
      <Card note={`${snapshot.profiles.length} profiles`} title="Destinations">
        {snapshot.profiles.length === 0 ? (
          <AdminStateMessage
            description="No WebDev Signal profile is registered yet."
            state="unavailable"
            title="No profiles"
          />
        ) : (
          <AdminTableRegion label="WebDev Signal social profiles">
            <AdminTable>
              <thead>
                <tr>
                  <AdminTableHead scope="col">Profile</AdminTableHead>
                  <AdminTableHead scope="col">Locale</AdminTableHead>
                  <AdminTableHead scope="col">Lifecycle</AdminTableHead>
                  <AdminTableHead scope="col">Connections</AdminTableHead>
                </tr>
              </thead>
              <tbody>
                {snapshot.profiles.map((profile) => (
                  <tr key={profile.id} data-webdev-profile={profile.id}>
                    <AdminTableCell>{profile.displayLabel}</AdminTableCell>
                    <AdminTableCell>{profile.locale}</AdminTableCell>
                    <AdminTableCell>
                      <AdminStatusBadge tone={profile.liveEligible ? "success" : "neutral"}>{profile.lifecycle}</AdminStatusBadge>
                    </AdminTableCell>
                    <AdminTableCell>
                      {profile.connections.length === 0 ? "None — the owner creates the account" : profile.connections.join(", ")}
                    </AdminTableCell>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </AdminTableRegion>
        )}
      </Card>
      <AdminCallout tone="warning">
        Nothing in this workspace posts, schedules or touches a credential. The owner creates and
        authorizes every account; until then each profile stays a proposal with no connection.
      </AdminCallout>
    </div>
  );
}

function Results({ snapshot }: { snapshot: AdminWebDevSignalSnapshot }) {
  const { baseline } = snapshot;
  if (!baseline) {
    return (
      <AdminStateMessage
        description="The 28-day baseline is built from observations, and none has been recorded. A verdict before the window fills would not be evidence."
        state="unavailable"
        title="No baseline yet"
      />
    );
  }
  const percent = (value: { rate: number | null; numerator: number; denominator: number }): string =>
    value.rate === null ? `No data (0 of ${value.denominator})` : `${Math.round(value.rate * 100)}% (${value.numerator}/${value.denominator})`;
  return (
    <div className="grid min-w-0 gap-4" data-webdev-tab="results">
      <Card note={baseline.verdict} title={`Baseline ${baseline.startsOn} – ${baseline.endsOn}`}>
        <p className="text-[length:var(--admin-type-body)]">{baseline.verdictReason}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetric label="Days observed" note={`of ${baseline.windowDays}`} value={String(baseline.observedDays)} />
          <AdminMetric label="Eligible story rate" note="of scanned days" value={percent(baseline.eligibleStoryRate)} />
          <AdminMetric label="Claim parity" note="of judged editions" value={percent(baseline.claimParityRate)} />
          <AdminMetric label="Verified publish" note="of valid editions" value={percent(baseline.verifiedPublishRate)} />
        </div>
        <p className="mt-4 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
          {baseline.modelCalls} model {baseline.modelCalls === 1 ? "call" : "calls"} · ${baseline.providerCostUsd.toFixed(2)} provider cost across the window.
        </p>
      </Card>
    </div>
  );
}

export function WebDevSignalPanel({
  snapshot,
  tab
}: {
  snapshot: AdminWebDevSignalSnapshot;
  tab: WebDevTab;
}) {
  return (
    <div className="grid min-w-0 gap-4" data-webdev-workspace={tab}>
      {snapshot.unreadable > 0 ? (
        <AdminCallout tone="warning">
          {snapshot.unreadable} {snapshot.unreadable === 1 ? "record was" : "records were"} dropped as unreadable.
          Counts only: a malformed file never sends a repository path to the browser.
        </AdminCallout>
      ) : null}
      {tab === "today" ? <Today snapshot={snapshot} /> : null}
      {tab === "decision" ? <Decision snapshot={snapshot} /> : null}
      {tab === "sources" ? <Sources snapshot={snapshot} /> : null}
      {tab === "edition-cs" ? <Edition locale="cs" snapshot={snapshot} /> : null}
      {tab === "edition-en" ? <Edition locale="en" snapshot={snapshot} /> : null}
      {tab === "delivery" ? <Delivery snapshot={snapshot} /> : null}
      {tab === "results" ? <Results snapshot={snapshot} /> : null}
    </div>
  );
}

export function webDevTabLabel(tab: WebDevTab): string {
  return TAB_LABEL[tab];
}

/** An unknown bookmark falls back to the tab that answers the operational question. */
export function resolveWebDevTab(value: string | undefined): WebDevTab {
  return (WEBDEV_TABS as readonly string[]).includes(value ?? "") ? (value as WebDevTab) : "today";
}
