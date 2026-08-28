import Link from "next/link";
import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEmptyState,
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
import { SOCIAL_PROFILE_SECTIONS, type SocialProfileSectionId } from "@/lib/social-profiles/model";
import type { AdminSocialProfilesSnapshot, SocialProfileView } from "@/lib/social-profiles/snapshot";

const statusTone = (value: string) => value === "active" || value === "ready" || value === "healthy" || value === "allowed"
  ? "success" as const
  : value === "rejected" || value === "retired" || value === "denied" || value === "expired"
    ? "destructive" as const
    : value === "proposed" || value === "draft" || value === "not-configured"
      ? "neutral" as const
      : "warning" as const;

function sectionHref(section: SocialProfileSectionId, fixtures: boolean): string {
  return `/admin/social-profiles?section=${section}${fixtures ? "&fixtures=profile-matrix" : ""}`;
}

function ProfileIdentity({ profile }: { profile: SocialProfileView["profile"] }) {
  return (
    <div className="flex min-w-52 items-center gap-3">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] font-mono text-[length:var(--admin-type-label)] font-semibold uppercase text-[var(--admin-foreground-muted)]">
        {profile.displayLabel.slice(0, 2)}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-[var(--admin-foreground)]">{profile.displayLabel}</span>
        <span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{profile.ventureRef ?? "Company"} · {profile.role}</span>
      </span>
    </div>
  );
}

function Connections({ profile }: { profile: SocialProfileView }) {
  if (!profile.connections.length) return <AdminStateMessage state="held" title="Not configured" description="No platform connection, public handle or credential reference is recorded." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {profile.connections.map((connection) => (
        <div className="min-w-0 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3" key={connection.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 font-semibold capitalize">{connection.platform}</p>
            <AdminStatusBadge tone={statusTone(connection.currentState)}>{connection.currentState}</AdminStatusBadge>
          </div>
          <dl className="mt-3 grid grid-cols-[minmax(8rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[length:var(--admin-type-control)]">
            <dt className="text-[var(--admin-foreground-muted)]">Public handle</dt><dd className="m-0 break-words">{connection.publicHandle ?? "Not configured"}</dd>
            <dt className="text-[var(--admin-foreground-muted)]">Connection health</dt><dd className="m-0 break-words">{connection.health.status}{connection.health.unavailableReason ? ` · ${connection.health.unavailableReason}` : ""}</dd>
            <dt className="text-[var(--admin-foreground-muted)]">Token</dt><dd className="m-0"><AdminStatusBadge tone={statusTone(connection.tokenHealth)}>{connection.tokenHealth}</AdminStatusBadge></dd>
            <dt className="text-[var(--admin-foreground-muted)]">App review</dt><dd className="m-0"><AdminStatusBadge tone={statusTone(connection.appReviewHealth)}>{connection.appReviewHealth}</AdminStatusBadge></dd>
            <dt className="text-[var(--admin-foreground-muted)]">Last verified</dt><dd className="m-0">{connection.lastVerified?.at ?? "Unavailable"}</dd>
            <dt className="text-[var(--admin-foreground-muted)]">Credential ref</dt><dd className="m-0 break-all font-mono text-[length:var(--admin-type-label)]">{connection.credentialRef ?? "Not configured"}</dd>
            <dt className="text-[var(--admin-foreground-muted)]">Account id ref</dt><dd className="m-0 break-all font-mono text-[length:var(--admin-type-label)]">{connection.nativeAccountIdRef ?? "Not configured"}</dd>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">{connection.approvedScopes.map((scope) => <AdminEntityBadge key={scope}>{scope}</AdminEntityBadge>)}</div>
        </div>
      ))}
    </div>
  );
}

function ProfileDetail({ profile }: { profile: SocialProfileView }) {
  return (
    <AdminCard data-social-profile-detail={profile.profile.id}>
      <AdminCardHeader>
        <AdminSectionHeading title={profile.profile.displayLabel} description={`${profile.profile.role} · ${profile.profile.ventureRef ?? "company"}`} />
      </AdminCardHeader>
      <AdminCardContent className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div><p className="m-0 text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Purpose</p><p className="mt-1 text-[length:var(--admin-type-body)]">{profile.profile.purpose}</p></div>
          <div><p className="m-0 text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Audience</p><p className="mt-1 text-[length:var(--admin-type-body)]">{profile.profile.audience}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminStatusBadge tone={statusTone(profile.lifecycle)}>{profile.lifecycle}</AdminStatusBadge>
          <AdminStatusBadge tone={statusTone(profile.capability.decision)}>#424 {profile.capability.decision}</AdminStatusBadge>
          {profile.profile.languages.map((language) => <AdminEntityBadge key={language}>{language}</AdminEntityBadge>)}
          {profile.profile.markets.map((market) => <AdminEntityBadge key={market}>{market}</AdminEntityBadge>)}
        </div>
        <AdminCallout tone={profile.capability.decision === "allowed" ? "success" : "warning"}>
          <p className="m-0 font-semibold">Package capability</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)]">{profile.capability.reason}</p>
          <p className="m-0 mt-2 font-mono text-[length:var(--admin-type-micro)]">{profile.capability.mapVersion ?? "map unavailable"} · {profile.capability.governingReference ?? "no governing reference"}</p>
        </AdminCallout>
        <AdminCallout tone={profile.paused || profile.activation?.status === "paused" ? "warning" : "neutral"}>
          <p className="m-0 font-semibold">Activation: {profile.activation?.status ?? "not configured"}{profile.paused ? " · profile paused" : ""}</p>
          <p className="m-0 mt-1 text-[length:var(--admin-type-control)]">{profile.activation ? `${profile.activation.counter}/${profile.activation.required} readiness evidence · ${profile.activation.reason}` : "No activation counter applies to this profile."}</p>
        </AdminCallout>
        {profile.profile.ventureRef === "door-money" ? <AdminCallout tone="information">Private-data boundary: this view receives package references only. It exposes no manuscript, source chunk, embedding or unpublished text.</AdminCallout> : null}
        <div><AdminSectionHeading className="mb-3" title="Connections" description="Reference names are visible; secret values and native account values never cross the server boundary." /><Connections profile={profile} /></div>
        <div><AdminSectionHeading className="mb-2" title="Provenance" /><p className="m-0 break-words text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{profile.profile.provenance.evidenceRefs.join(" · ")}</p></div>
      </AdminCardContent>
    </AdminCard>
  );
}

function VentureProfiles({ profileId, snapshot }: { profileId?: string; snapshot: AdminSocialProfilesSnapshot }) {
  const selected = snapshot.ventureProfiles.find(({ profile }) => profile.id === profileId) ?? null;
  return (
    <div className="grid gap-4" data-social-profiles-section="venture-profiles">
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Venture Profiles · ${snapshot.ventureProfiles.length}`} description="Only recorded official profile records appear. A venture without a profile record is absent from this total." /></AdminCardHeader><AdminCardContent>
        {snapshot.ventureProfiles.length ? <AdminTableRegion label="Venture Profiles"><AdminTable><thead><tr><AdminTableHead>Profile</AdminTableHead><AdminTableHead>Platforms</AdminTableHead><AdminTableHead>Lifecycle</AdminTableHead><AdminTableHead>Capability</AdminTableHead><AdminTableHead>Setup</AdminTableHead></tr></thead><tbody>
          {snapshot.ventureProfiles.map((profile) => <tr key={profile.profile.id}><AdminTableCell><Link className="admin-focus-ring rounded-sm" href={`/admin/social-profiles?section=venture-profiles&profile=${profile.profile.id}`}><ProfileIdentity profile={profile.profile} /></Link></AdminTableCell><AdminTableCell>{profile.connections.length ? profile.connections.map(({ platform }) => platform).join(", ") : "Not configured"}</AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(profile.lifecycle)}>{profile.lifecycle}</AdminStatusBadge></AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(profile.capability.decision)}>{profile.capability.decision}</AdminStatusBadge></AdminTableCell><AdminTableCell>{profile.connections.length ? `${profile.connections.filter(({ currentState }) => currentState === "ready").length}/${profile.connections.length} ready` : "Manual setup"}</AdminTableCell></tr>)}
        </tbody></AdminTable></AdminTableRegion> : <AdminEmptyState title="No Venture Profiles" description="No validated official profile record exists. The Admin does not create account placeholders." />}
      </AdminCardContent></AdminCard>
      {selected ? <ProfileDetail profile={selected} /> : null}
    </div>
  );
}

function AmplificationProfiles({ profileId, snapshot }: { profileId?: string; snapshot: AdminSocialProfilesSnapshot }) {
  const selected = snapshot.amplificationProfiles.find(({ proposal }) => proposal.profileId === profileId) ?? null;
  return (
    <div className="grid gap-4" data-social-profiles-section="amplification-profiles">
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Amplification Profiles · ${snapshot.amplificationProfiles.length}`} description="Transparent owned-brand proposals only. Simulations and contacts cannot enter this group." /></AdminCardHeader><AdminCardContent>
        {snapshot.amplificationProfiles.length ? <div className="grid gap-3">{snapshot.amplificationProfiles.map(({ proposal, purposeVerdict }) => <Link className="admin-focus-ring flex min-h-[var(--admin-touch-target)] flex-wrap items-center gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3" href={`/admin/social-profiles?section=amplification-profiles&profile=${proposal.profileId}`} key={proposal.id}><span className="min-w-0 flex-1"><span className="block font-semibold">{proposal.workingName}</span><span className="text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{proposal.archetype} · {proposal.languages.join("/")} · {proposal.markets.join("/")}</span></span><AdminStatusBadge tone={statusTone(purposeVerdict)}>{purposeVerdict}</AdminStatusBadge></Link>)}</div> : <AdminEmptyState title="No Amplification Profiles" description="The #415 portfolio is intentionally empty. No account, fake person or sample amplifier has been added." />}
      </AdminCardContent></AdminCard>
      {selected ? <AdminCard data-social-profile-detail={selected.proposal.profileId}><AdminCardHeader><AdminSectionHeading title={selected.proposal.workingName} description={`${selected.proposal.archetype} · ${selected.proposal.lifecycle}`} /></AdminCardHeader><AdminCardContent className="grid gap-4"><AdminCallout tone={selected.purposeVerdict === "accept" ? "success" : "warning"}><p className="m-0 font-semibold">#415 purpose verdict: {selected.purposeVerdict}</p><p className="m-0 mt-1">{selected.purposeReason}</p></AdminCallout><div className="grid gap-4 lg:grid-cols-2"><p className="m-0"><strong>Independent purpose:</strong> {selected.proposal.independentReasonToFollow}</p><p className="m-0"><strong>Original promise:</strong> {selected.proposal.originalContentPromise}</p></div><p className="m-0">Runway: {selected.proposal.launchRunway.completedOriginalPosts}/{selected.proposal.launchRunway.requiredOriginalPosts} recorded originals. Operational post counts remain unavailable.</p><p className="m-0">Validation: review after {selected.proposal.validationPlan.reviewAfterDays} days. Stop conditions: {selected.proposal.validationPlan.stopConditions.join("; ")}</p>{selected.policy ? <AdminCallout tone="information">Central policy {selected.policy.version}: at least {(selected.policy.values.minimumOriginalContentRatio * 100).toFixed(0)}% original content, no more than {(selected.policy.values.maximumVentureSupportRatio * 100).toFixed(0)}% venture support, {selected.policy.values.sameSourceVentureCooldownDays}-day same-source cooldown.</AdminCallout> : <AdminStateMessage state="unavailable" title="Amplification policy unavailable" />}</AdminCardContent></AdminCard> : null}
    </div>
  );
}

function ActivitySetup({ snapshot }: { snapshot: AdminSocialProfilesSnapshot }) {
  return (
    <div className="grid gap-4" data-social-profiles-section="activity-setup">
      <AdminCard><AdminCardHeader><AdminSectionHeading title="Activation and setup posture" description="Lifecycle evidence and stop controls only; Campaigns, Providers and Results have separate owning issues." /></AdminCardHeader><AdminCardContent className="grid gap-3 sm:grid-cols-2"><AdminCallout tone={snapshot.posture.globalKillSwitch === "engaged" ? "warning" : "information"}><p className="m-0 font-semibold">Global kill switch: {snapshot.posture.globalKillSwitch}</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)]">Live authority remains held under {snapshot.posture.ownerDecisionRef}.</p></AdminCallout><AdminCallout tone={snapshot.posture.repositoryPause ? "warning" : "neutral"}><p className="m-0 font-semibold">Repository pause: {snapshot.posture.repositoryPause ? "engaged" : "not recorded"}</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)]">Profile and connection pause records still apply independently.</p></AdminCallout></AdminCardContent></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Lifecycle activity · ${snapshot.activity.length}`} /></AdminCardHeader><AdminCardContent>{snapshot.activity.length ? <div className="grid gap-2">{snapshot.activity.map((event) => <div className="grid gap-1 rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]" key={event.eventId}><time className="font-mono text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{event.at}</time><span className="min-w-0"><strong>{event.profileId}</strong><span className="block text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{event.reason}</span></span><AdminStatusBadge tone={statusTone(event.action)}>{event.action}</AdminStatusBadge></div>)}</div> : <AdminEmptyState title="No lifecycle events" description="No proposal, setup, connection, pause, reauthorisation, disconnect, retire or rejection event has been recorded." />}</AdminCardContent></AdminCard>
      {snapshot.unavailable.length || Object.values(snapshot.dropped).some(Boolean) ? <AdminStateMessage state="malformed" title="Some Social Profiles evidence could not be used" description={`${snapshot.unavailable.join(" · ") || "No unavailable source"}. Dropped: ${Object.entries(snapshot.dropped).map(([key, value]) => `${key} ${value}`).join(", ")}.`} /> : <AdminStateMessage state="success" title="All available core records parsed" description="No malformed core profile, connection, amplifier, event or pause record was dropped." />}
    </div>
  );
}

function SimulationMatrix({ snapshot }: { snapshot: AdminSocialProfilesSnapshot }) {
  if (!snapshot.simulationsIncluded) return null;
  return <AdminCard className="mt-4" data-social-profile-simulations="explicit"><AdminCardHeader><AdminSectionHeading title="Synthetic visual QA · excluded from totals" description="50 deterministic #406 fixtures. They are not accounts, proposals, evidence or a production fallback." /></AdminCardHeader><AdminCardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{snapshot.simulations.map(({ profile, preview }) => <div className="min-w-0 rounded-[var(--admin-radius)] border border-dashed border-[var(--admin-border-strong)] p-3" key={profile.id}><p className="m-0 break-words font-semibold">{profile.displayLabel}</p><div className="mt-2 flex flex-wrap gap-1"><AdminStatusBadge tone="information">simulation</AdminStatusBadge><AdminStatusBadge tone={statusTone(preview.setupState)}>{preview.setupState}</AdminStatusBadge><AdminEntityBadge>{preview.platform}</AdminEntityBadge></div></div>)}</div></AdminCardContent></AdminCard>;
}

export function SocialProfilesWorkspace({ profileId, section, snapshot }: { profileId?: string; section: SocialProfileSectionId; snapshot: AdminSocialProfilesSnapshot }) {
  return (
    <div data-social-profiles-workspace>
      <div className="mb-4 grid overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] sm:grid-cols-4"><AdminMetric label="Venture Profiles" value={snapshot.ventureProfiles.length} note="Recorded real profiles" /><AdminMetric label="Amplification Profiles" value={snapshot.amplificationProfiles.length} note="Real or proposed" /><AdminMetric label="Lifecycle events" value={snapshot.activity.length} note="Append-only evidence" /><AdminMetric label="Operational metrics" value="Unavailable" note="Owned by #412" /></div>
      <nav aria-label="Social Profiles sections" className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-1" data-horizontal-scroll>
        {SOCIAL_PROFILE_SECTIONS.map((item) => <Link aria-current={section === item.id ? "page" : undefined} className="admin-focus-ring flex min-h-[var(--admin-touch-target)] shrink-0 items-center rounded-[var(--admin-radius-sm)] px-3 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground-muted)] data-[active=true]:bg-[var(--admin-surface)] data-[active=true]:text-[var(--admin-foreground)]" data-active={section === item.id} href={sectionHref(item.id, snapshot.simulationsIncluded)} key={item.id}>{item.label}</Link>)}
      </nav>
      {section === "venture-profiles" ? <VentureProfiles profileId={profileId} snapshot={snapshot} /> : section === "amplification-profiles" ? <AmplificationProfiles profileId={profileId} snapshot={snapshot} /> : <ActivitySetup snapshot={snapshot} />}
      <SimulationMatrix snapshot={snapshot} />
    </div>
  );
}
