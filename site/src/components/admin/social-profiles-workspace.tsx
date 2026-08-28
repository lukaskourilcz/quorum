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
import { SocialCampaignActions } from "./social-campaign-actions";
import { SocialNetworkShareKitActions } from "./social-network-share-kit-actions";
import { SocialProfileLifecycleActions } from "./social-profile-lifecycle-actions";

const statusTone = (value: string) => ["active", "ready", "healthy", "allowed", "pass", "approved", "eligible", "selected", "enabled", "direct-core", "published", "reconciled"].includes(value)
  ? "success" as const
  : ["rejected", "reject", "retired", "denied", "expired", "failed", "cancelled"].includes(value)
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
        <div><AdminSectionHeading className="mb-3" title="Safe lifecycle actions" description="Every action appends bounded evidence; none grants external authority." /><SocialProfileLifecycleActions connections={profile.connections} lifecycle={profile.lifecycle} profileId={profile.profile.id} /></div>
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

function Campaigns({ campaignId, snapshot }: { campaignId?: string; snapshot: AdminSocialProfilesSnapshot }) {
  const selected = snapshot.campaigns.find(({ campaign }) => campaign.id === campaignId) ?? null;
  const skipped = snapshot.campaignDecisions.filter(({ decision }) => decision === "skip");
  return (
    <div className="grid gap-4" data-social-profiles-section="campaigns">
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Campaigns · ${snapshot.campaigns.length}`} description="One immutable draft per verified release. Primary-only, held and SKIP outcomes are normal; relationship and Contest Radar sources are not part of this core." /></AdminCardHeader><AdminCardContent>
        {snapshot.campaigns.length ? <AdminTableRegion label="Verified-release campaigns"><AdminTable><thead><tr><AdminTableHead>Release</AdminTableHead><AdminTableHead>Outcome</AdminTableHead><AdminTableHead>Targets</AdminTableHead><AdminTableHead>Approval</AdminTableHead><AdminTableHead>Provider / results</AdminTableHead></tr></thead><tbody>
          {snapshot.campaigns.map(({ campaign }) => <tr key={campaign.id}><AdminTableCell><Link className="admin-focus-ring block rounded-sm" href={`/admin/social-profiles?section=campaigns&campaign=${campaign.id}`}><span className="block font-semibold">{campaign.sourceVentureId}</span><span className="block font-mono text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{campaign.releaseId}</span></Link></AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(campaign.selectionOutcome)}>{campaign.selectionOutcome}</AdminStatusBadge></AdminTableCell><AdminTableCell>{campaign.targets.filter(({ fit }) => fit === "eligible").length} eligible · {campaign.targets.filter(({ fit }) => fit !== "eligible").length} SKIP/held</AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(campaign.status)}>{campaign.status}</AdminStatusBadge></AdminTableCell><AdminTableCell>{campaign.providerAvailability} · results {campaign.measurementAvailability}</AdminTableCell></tr>)}
        </tbody></AdminTable></AdminTableRegion> : <AdminEmptyState title="No verified-release campaigns" description="No validated campaign record exists. Draft releases, failed deliveries, fixtures, public-page scrapes and Contest Radar candidates are not converted into placeholders." />}
      </AdminCardContent></AdminCard>
      {skipped.length ? <AdminCard><AdminCardHeader><AdminSectionHeading title={`Recorded SKIP decisions · ${skipped.length}`} description="Rejected inputs remain visible evidence and never become queue items." /></AdminCardHeader><AdminCardContent><div className="grid gap-2">{skipped.map((item) => <div className="grid gap-1 rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3 sm:grid-cols-[minmax(10rem,0.6fr)_minmax(0,1fr)]" key={item.id}><span><strong>{item.sourceVentureId}</strong><span className="block font-mono text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{item.releaseId}</span></span><span className="text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{item.reasons.join(" · ")}</span></div>)}</div></AdminCardContent></AdminCard> : null}
      {selected ? <AdminCard data-social-campaign-detail={selected.campaign.id}><AdminCardHeader><AdminSectionHeading title={`${selected.campaign.sourceVentureId} · ${selected.campaign.releaseId}`} description={`${selected.campaign.selectionOutcome} · ${selected.campaign.status} · immutable ${selected.immutableStatus}`} /></AdminCardHeader><AdminCardContent className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AdminCallout tone="information"><p className="m-0 font-semibold">Verified release</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)]">{selected.campaign.releaseVerification.verifiedAt}</p><p className="m-0 mt-1 break-all font-mono text-[length:var(--admin-type-micro)]">{selected.campaign.releaseVerification.evidenceRef}</p></AdminCallout><AdminCallout tone={selected.campaign.providerAvailability === "available" ? "success" : "warning"}><p className="m-0 font-semibold">Provider: {selected.campaign.providerAvailability}</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)]">Results: {selected.campaign.measurementAvailability}; no zero is inferred.</p></AdminCallout><AdminCallout tone="neutral"><p className="m-0 font-semibold">Policy {selected.campaign.effectiveDecision.policyVersion}</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)]">Selector {selected.campaign.effectiveDecision.selectorVersion} · capability map {selected.campaign.effectiveDecision.capabilityMapVersion}</p></AdminCallout><AdminCallout tone={selected.rejectedEvents ? "warning" : "neutral"}><p className="m-0 font-semibold">Owner events</p><p className="m-0 mt-1 text-[length:var(--admin-type-control)]">{selected.appliedEvents} applied · {selected.rejectedEvents} stale/rejected</p></AdminCallout></div>
        <div><AdminSectionHeading className="mb-3" title="Target decision" description="Hard gates run before scoring. Missing evidence contributes nothing positive." /><div className="grid gap-3">{selected.campaign.targets.map((target) => <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3" key={target.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="m-0 font-semibold">{target.role} · {target.profileId}</p><div className="flex gap-2"><AdminStatusBadge tone={statusTone(target.fit)}>{target.fit}</AdminStatusBadge><AdminStatusBadge tone={target.selection.score.total === null ? "neutral" : "information"}>{target.selection.score.total === null ? "not scored" : `score ${target.selection.score.total}`}</AdminStatusBadge></div></div><p className="mt-2 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{target.reasons.join(" · ")}</p><div className="mt-3 flex flex-wrap gap-1.5">{target.selection.hardGates.map((gate) => <AdminStatusBadge key={`${target.id}-${gate.gate}`} tone={statusTone(gate.status)}>{gate.gate}: {gate.status}</AdminStatusBadge>)}</div></div>)}</div></div>
        <div><AdminSectionHeading className="mb-3" title="Immutable campaign items" description="Copy, evidence, target, policy and stagger window hashes form the owner-approval binding." /><div className="grid gap-3">{selected.campaign.channelItems.map((item) => <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3" key={item.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="m-0 font-semibold">{item.channel} · {item.locale} · {item.copy.commentaryType}</p><AdminStatusBadge tone={statusTone(item.approval.status)}>{item.approval.status}</AdminStatusBadge></div><p className="mt-3 whitespace-pre-wrap text-[length:var(--admin-type-body)]">{item.copy.text}</p><dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[length:var(--admin-type-control)]"><dt className="text-[var(--admin-foreground-muted)]">Window</dt><dd className="m-0 break-words">{item.window.notBefore} → {item.window.notAfter}</dd><dt className="text-[var(--admin-foreground-muted)]">Destination</dt><dd className="m-0 break-all">{item.copy.destination}</dd><dt className="text-[var(--admin-foreground-muted)]">UTM</dt><dd className="m-0 break-all font-mono text-[length:var(--admin-type-label)]">{item.utm.source} / {item.utm.campaign} / {item.utm.content}</dd><dt className="text-[var(--admin-foreground-muted)]">Evidence</dt><dd className="m-0 break-words">{item.copy.factualClaimRefs.join(" · ")}</dd><dt className="text-[var(--admin-foreground-muted)]">Binding</dt><dd className="m-0 break-all font-mono text-[length:var(--admin-type-micro)]">{item.approval.bindingHash}</dd></dl></div>)}</div></div>
        <div><AdminSectionHeading className="mb-3" title="Safe campaign actions" description="Approvals bind exact immutable targets. A copy or window edit invalidates the existing approval." /><SocialCampaignActions campaign={selected.campaign} targetApprovalHashes={selected.targetApprovalHashes} /></div>
      </AdminCardContent></AdminCard> : null}
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

function Network({ snapshot }: { snapshot: AdminSocialProfilesSnapshot }) {
  const { benchmark, contacts, shareKits } = snapshot.network;
  return (
    <div className="grid gap-4" data-social-profiles-section="network">
      <AdminCard><AdminCardHeader><AdminSectionHeading title="Optional Network" description="A private owner-managed directory for genuine opt-in relationships. The planning benchmark is not a release gate and never becomes fabricated progress." /></AdminCardHeader><AdminCardContent className="grid gap-3 sm:grid-cols-3">
        <AdminMetric label="Planning benchmark" value={benchmark.target} note="Optional long-term target" />
        <AdminMetric label="Recorded relationships" value={benchmark.actual} note="Owner-entered real records" />
        <AdminMetric label="Opted in or active" value={benchmark.optedInOrActive} note="Dated consent evidence" />
      </AdminCardContent></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Relationships · ${contacts.length}`} description="Contacts remain separate from owned profiles, credentials and queue identities. Public references and private notes are withheld from this table." /></AdminCardHeader><AdminCardContent>
        {contacts.length ? <AdminTableRegion label="Distribution relationships"><AdminTable><thead><tr><AdminTableHead>Relationship</AdminTableHead><AdminTableHead>Status</AdminTableHead><AdminTableHead>Consent</AdminTableHead><AdminTableHead>Fit</AdminTableHead><AdminTableHead>Last activity</AdminTableHead></tr></thead><tbody>
          {contacts.map((contact) => <tr key={contact.id}><AdminTableCell><span className="block font-semibold">{contact.label}</span><span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{contact.type}</span></AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(contact.relationshipStatus)}>{contact.relationshipStatus}</AdminStatusBadge></AdminTableCell><AdminTableCell>{contact.consentRecordedAt ?? "Not recorded"}</AdminTableCell><AdminTableCell>{contact.platforms.join("/") || "No platform"} · {contact.languages.join("/")} · {contact.markets.join("/")}</AdminTableCell><AdminTableCell>{contact.lastSharedAt ?? contact.lastContactedAt ?? "No contact recorded"}</AdminTableCell></tr>)}
        </tbody></AdminTable></AdminTableRegion> : <AdminEmptyState title="No Network relationships" description="The real directory is empty. The 50-relationship benchmark does not seed contacts, consent or progress." />}
      </AdminCardContent></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Manual share kits · ${shareKits.length}`} description="Kits are copied or downloaded for an opted-in relationship. BoardlessAI never sends, posts or communicates as the contact." /></AdminCardHeader><AdminCardContent>
        {shareKits.length ? <div className="grid gap-3">{shareKits.map((kit) => <article className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3" key={kit.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="m-0 font-semibold">{kit.sourceVentureId} · {kit.channel}/{kit.locale}</p><AdminStatusBadge tone={statusTone(kit.status)}>{kit.status}</AdminStatusBadge></div><p className="mt-2 text-[length:var(--admin-type-body)]">{kit.factualSummary}</p><p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{kit.relevanceReason}</p><SocialNetworkShareKitActions kit={kit} /></article>)}</div> : <AdminEmptyState title="No assigned share kits" description="A kit appears only after an approved campaign, exact capability fit and dated opt-in evidence all pass." />}
      </AdminCardContent></AdminCard>
      <AdminCallout tone="information">Network controls never send an email or DM, follow an account, post as a contact or infer identity and consent from UTM activity.</AdminCallout>
    </div>
  );
}

function Providers({ snapshot }: { snapshot: AdminSocialProfilesSnapshot }) {
  const control = snapshot.providerControl;
  return (
    <div className="grid gap-4" data-social-profiles-section="providers">
      <AdminCard><AdminCardHeader><AdminSectionHeading title="Providers & automation health" description="BoardlessAI owns strategy, approvals, queue, campaign, receipt and learning truth. Providers transport exact approved items or report bounded status only." /></AdminCardHeader><AdminCardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Direct core" value={control.summary.directCoreAvailable ? "Available" : "Unavailable"} note="Implementation posture, not live authority" />
        <AdminMetric label="Active bindings" value={control.summary.activeBindings} note="At most one per connection" />
        <AdminMetric label="Held bindings" value={control.summary.heldBindings} note="Owner setup remains external" />
        <AdminMetric label="Ambiguous receipts" value={control.summary.ambiguousReceipts} note="Must reconcile before resend" />
      </AdminCardContent></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Provider registry · ${control.providers.length}`} description="Direct Meta is the retained core. Buffer, Metricool and n8n are optional and held; Make and Ayrshare keep their dated verdicts." /></AdminCardHeader><AdminCardContent>
        {control.providers.length ? <AdminTableRegion label="Social provider registry"><AdminTable><thead><tr><AdminTableHead>Provider</AdminTableHead><AdminTableHead>Posture</AdminTableHead><AdminTableHead>Version</AdminTableHead><AdminTableHead>Reverify</AdminTableHead><AdminTableHead>Plan / limits</AdminTableHead></tr></thead><tbody>
          {control.providers.map(({ provider, posture, activeBindings, bindingCount }) => <tr key={provider.id}><AdminTableCell><span className="block font-semibold">{provider.name}</span><span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{provider.role} · {provider.supportedPlatforms.join("/")}</span></AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(posture)}>{posture}</AdminStatusBadge><span className="mt-1 block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{provider.verdict} · {activeBindings}/{bindingCount} active</span></AdminTableCell><AdminTableCell>{provider.implementationVersion}<span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{provider.apiVersion ?? "No API adapter"}</span></AdminTableCell><AdminTableCell>{provider.reverifyBy}</AdminTableCell><AdminTableCell>{provider.plan}<span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{provider.monthlyCostPosture}</span></AdminTableCell></tr>)}
        </tbody></AdminTable></AdminTableRegion> : <AdminEmptyState title="Provider registry unavailable" description="No provider is inferred from connection or environment state." />}
      </AdminCardContent></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Connection bindings · ${control.bindings.length}`} description="Credential reference names may be shown; values never cross this server boundary. A binding is not publishing authority." /></AdminCardHeader><AdminCardContent>
        {control.bindings.length ? <AdminTableRegion label="Provider connection bindings"><AdminTable><thead><tr><AdminTableHead>Connection</AdminTableHead><AdminTableHead>Provider / mode</AdminTableHead><AdminTableHead>Token / app review</AdminTableHead><AdminTableHead>Rate / plan</AdminTableHead><AdminTableHead>Setup or attention</AdminTableHead></tr></thead><tbody>
          {control.bindings.map(({ binding, provider, latestHealth, setupReason }) => <tr key={binding.id}><AdminTableCell><span className="block font-mono text-[length:var(--admin-type-label)]">{binding.connectionId}</span><span className="block text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]">{binding.credentialRefs.join(" · ")}</span></AdminTableCell><AdminTableCell><span className="block font-semibold">{provider.name}</span><AdminStatusBadge tone={statusTone(binding.mode)}>{binding.mode}</AdminStatusBadge></AdminTableCell><AdminTableCell>{latestHealth ? `${latestHealth.tokenStatus} / ${latestHealth.appReviewStatus}` : "Unavailable / unavailable"}</AdminTableCell><AdminTableCell>{latestHealth ? `${latestHealth.rateLimitStatus} / ${latestHealth.planLimitStatus}` : "Unavailable / unavailable"}</AdminTableCell><AdminTableCell>{latestHealth?.nextSafeAction ?? setupReason}</AdminTableCell></tr>)}
        </tbody></AdminTable></AdminTableRegion> : <AdminEmptyState title="No provider bindings" description="No connection is silently assigned to a provider." />}
      </AdminCardContent></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Recent provider evidence · ${control.receipts.length}`} description="Normalized delivery evidence excludes raw provider payloads and cannot authorize a retry or failover." /></AdminCardHeader><AdminCardContent>
        {control.receipts.length ? <AdminTableRegion label="Provider delivery evidence"><AdminTable><thead><tr><AdminTableHead>Attempt</AdminTableHead><AdminTableHead>Provider</AdminTableHead><AdminTableHead>State</AdminTableHead><AdminTableHead>Status</AdminTableHead><AdminTableHead>Reconciliation</AdminTableHead></tr></thead><tbody>{control.receipts.slice(0, 50).map((receipt) => <tr key={receipt.id}><AdminTableCell>{receipt.requestedAt}</AdminTableCell><AdminTableCell>{receipt.providerId}</AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(receipt.state)}>{receipt.state}</AdminStatusBadge></AdminTableCell><AdminTableCell>{receipt.status}{receipt.error ? ` · ${receipt.error}` : ""}</AdminTableCell><AdminTableCell>{receipt.reconciliationRef ?? (receipt.state === "ambiguous" ? "Required before resend" : "Not required")}</AdminTableCell></tr>)}</tbody></AdminTable></AdminTableRegion> : <AdminEmptyState title="No provider delivery evidence" description="No transport attempt is represented. Missing evidence is not converted to a zero or success." />}
      </AdminCardContent></AdminCard>
      {control.migrations.length ? <AdminCallout tone="warning">{control.migrations.length} provider binding migration record(s) require explicit history-preserving review.</AdminCallout> : <AdminCallout tone="information">No provider migration is in progress. Errors never trigger automatic failover, a plan change or a purchase.</AdminCallout>}
    </div>
  );
}

function ContentRunway({ profileId, snapshot }: { profileId?: string; snapshot: AdminSocialProfilesSnapshot }) {
  const runway = snapshot.contentRunway;
  const selected = runway.profiles.find(({ strategy }) => strategy.profileId === profileId) ?? null;
  return (
    <div className="grid gap-4" data-social-profiles-section="content-runway">
      <AdminCard><AdminCardHeader><AdminSectionHeading title="Content runway" description="Versioned editorial constitutions and deterministic planning inventory. Candidates are not final copy, approval, queue items or publishing authority." /></AdminCardHeader><AdminCardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Canonical strategies" value={runway.summary.strategies} note="One per recorded real profile" />
        <AdminMetric label="Healthy runway" value={runway.summary.healthy} note="At least seven eligible coverage days" />
        <AdminMetric label="Low / no runway" value={runway.summary.lowOrNoRunway} note="Honest incident evidence" />
        <AdminMetric label="Inventory unavailable" value={runway.summary.unavailable} note="No count is inferred" />
        <AdminMetric label="Recorded build cost" value={`$${runway.summary.actualCostUsd.toFixed(2)}`} note="Provider/model calls stay bounded" />
      </AdminCardContent></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading title={`Profile constitutions · ${runway.profiles.length}`} description="#415 ratios/runway and #424 capabilities remain referenced policy; this view does not duplicate their resolver logic." /></AdminCardHeader><AdminCardContent>
        {runway.profiles.length ? <AdminTableRegion label="Social profile content runway"><AdminTable><thead><tr><AdminTableHead>Profile strategy</AdminTableHead><AdminTableHead>Coverage</AdminTableHead><AdminTableHead>Inventory</AdminTableHead><AdminTableHead>Original / support</AdminTableHead><AdminTableHead>Latest build</AdminTableHead></tr></thead><tbody>
          {runway.profiles.map(({ strategy, inventory, latestReceipt, state }) => <tr key={strategy.id}><AdminTableCell><Link className="admin-focus-ring block rounded-sm" href={`/admin/social-profiles?section=content-runway&profile=${strategy.profileId}`}><span className="block font-semibold">{strategy.profileId}</span><span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">v{strategy.version} · review {strategy.reviewDate}</span></Link></AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(state)}>{state}</AdminStatusBadge><span className="mt-1 block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{inventory ? `${inventory.coverageDays}/${inventory.horizonDays} days` : "Unavailable"}</span></AdminTableCell><AdminTableCell>{inventory ? `${inventory.counts.original} original · ${inventory.counts.reserve} reserve · ${inventory.counts.recurring} recurring · ${inventory.counts.campaign} campaign` : "No inventory record"}</AdminTableCell><AdminTableCell>{inventory ? `${inventory.ratioProjection.original} / ${inventory.ratioProjection.support}` : "Unavailable"}</AdminTableCell><AdminTableCell>{latestReceipt ? `${latestReceipt.status} · $${latestReceipt.actualCostUsd.toFixed(2)} · ${latestReceipt.reusedCandidates} reused` : "No build receipt"}</AdminTableCell></tr>)}
        </tbody></AdminTable></AdminTableRegion> : <AdminEmptyState title="No profile strategies" description="No strategy or inventory placeholder is inferred from a venture name." />}
      </AdminCardContent></AdminCard>
      {selected ? <AdminCard data-social-runway-detail={selected.strategy.profileId}><AdminCardHeader><AdminSectionHeading title={`${selected.strategy.profileId} · strategy v${selected.strategy.version}`} description={`${selected.strategy.pillarCount} pillar(s) · ${selected.strategy.formats.length} recurring format(s) · review ${selected.strategy.reviewDate}`} /></AdminCardHeader><AdminCardContent className="grid gap-5">
        <div className="grid gap-3 lg:grid-cols-3"><AdminCallout tone="information"><p className="m-0 font-semibold">Cadence constitution</p><p className="m-0 mt-1">{selected.strategy.cadence.minimumPerWeek} min · {selected.strategy.cadence.targetPerWeek} target · {selected.strategy.cadence.maximumPerWeek} max / week</p></AdminCallout><AdminCallout tone="neutral"><p className="m-0 font-semibold">Generation boundary</p><p className="m-0 mt-1">Deterministic first · {selected.strategy.maximumModelCallsPerBuild} model calls · ${selected.strategy.maximumCostUsdPerBuild.toFixed(2)} max · {selected.strategy.rendererRef}</p></AdminCallout><AdminCallout tone={selected.state === "healthy" ? "success" : "warning"}><p className="m-0 font-semibold">Runway: {selected.state}</p><p className="m-0 mt-1">{selected.inventory ? `${selected.inventory.coverageDays} coverage days · ${selected.inventory.counts.eligible} eligible · ${selected.inventory.counts.held} held` : "No current inventory exists; no zero or post is inferred."}</p></AdminCallout></div>
        <div><AdminSectionHeading className="mb-3" title="Policy references" description="Central values stay in their owning policy and capability map." /><div className="flex flex-wrap gap-2">{Object.values(selected.strategy.policyRefs).map((ref) => <AdminEntityBadge key={ref}>{ref}</AdminEntityBadge>)}</div></div>
        <div><AdminSectionHeading className="mb-3" title={`Candidates · ${selected.inventory?.candidates.length ?? 0}`} description="Due/expiry, evidence, asset and authority states are visible; final copy is always false." />{selected.inventory?.candidates.length ? <AdminTableRegion label="Content inventory candidates"><AdminTable><thead><tr><AdminTableHead>Candidate</AdminTableHead><AdminTableHead>Due / expiry</AdminTableHead><AdminTableHead>Asset / evidence</AdminTableHead><AdminTableHead>Authority</AdminTableHead><AdminTableHead>Campaign ref</AdminTableHead></tr></thead><tbody>{selected.inventory.candidates.map((candidate) => <tr key={candidate.id}><AdminTableCell><span className="block font-semibold">{candidate.candidateType} · {candidate.formatId}</span><span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{candidate.platform}/{candidate.locale} · {candidate.classification}</span></AdminTableCell><AdminTableCell>{candidate.usefulWindow.earliest}<span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">expires {candidate.usefulWindow.expiresAt}</span></AdminTableCell><AdminTableCell>{candidate.asset.readiness} · {candidate.evidenceRefs.length} evidence ref(s)<span className="block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">alt text {candidate.asset.altTextReady ? "ready/not required" : "held"}</span></AdminTableCell><AdminTableCell><AdminStatusBadge tone={statusTone(candidate.state)}>{candidate.state}</AdminStatusBadge><span className="mt-1 block text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{candidate.authorityClass} · final copy false</span></AdminTableCell><AdminTableCell>{candidate.campaignRef ?? "Not a campaign"}</AdminTableCell></tr>)}</tbody></AdminTable></AdminTableRegion> : <AdminEmptyState title="No inventory candidates" description="LOW_RUNWAY, NO_CANDIDATE and unavailable are valid. No post is forced to satisfy a target count." />}</div>
        {selected.latestReceipt ? <AdminCallout tone="information"><p className="m-0 font-semibold">Latest {selected.latestReceipt.mode} build: {selected.latestReceipt.status}</p><p className="m-0 mt-1">{selected.latestReceipt.generatedCandidates} generated · {selected.latestReceipt.reusedCandidates} reused · {selected.latestReceipt.expiredCandidates} expired · ${selected.latestReceipt.actualCostUsd.toFixed(2)} actual cost · {selected.latestReceipt.providerCallsAvoided} call(s) avoided</p></AdminCallout> : <AdminStateMessage state="unavailable" title="No inventory build receipt" description="The strategy is canonical, but the existing scheduler/capacity path has not recorded a build." />}
        {selected.incidents.length ? <AdminCallout tone="warning">{selected.incidents.map(({ code, reason }) => `${code}: ${reason}`).join(" · ")}</AdminCallout> : null}
        <AdminCallout tone="neutral">Owner veto, stricter correction, candidate expiry and governed refill requests may append evidence later. This issue exposes no queue, publish, account activation or routine-scope action.</AdminCallout>
      </AdminCardContent></AdminCard> : null}
    </div>
  );
}

function SimulationMatrix({ snapshot }: { snapshot: AdminSocialProfilesSnapshot }) {
  if (!snapshot.simulationsIncluded) return null;
  return <AdminCard className="mt-4" data-social-profile-simulations="explicit"><AdminCardHeader><AdminSectionHeading title="Synthetic visual QA · excluded from totals" description="50 deterministic #406 fixtures. They are not accounts, proposals, evidence or a production fallback." /></AdminCardHeader><AdminCardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{snapshot.simulations.map(({ profile, preview }) => <div className="min-w-0 rounded-[var(--admin-radius)] border border-dashed border-[var(--admin-border-strong)] p-3" key={profile.id}><p className="m-0 break-words font-semibold">{profile.displayLabel}</p><div className="mt-2 flex flex-wrap gap-1"><AdminStatusBadge tone="information">simulation</AdminStatusBadge><AdminStatusBadge tone={statusTone(preview.setupState)}>{preview.setupState}</AdminStatusBadge><AdminEntityBadge>{preview.platform}</AdminEntityBadge></div></div>)}</div></AdminCardContent></AdminCard>;
}

export function SocialProfilesWorkspace({ campaignId, profileId, section, snapshot }: { campaignId?: string; profileId?: string; section: SocialProfileSectionId; snapshot: AdminSocialProfilesSnapshot }) {
  return (
    <div data-social-profiles-workspace>
      <div className="mb-4 grid overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] sm:grid-cols-2 xl:grid-cols-5"><AdminMetric label="Venture Profiles" value={snapshot.ventureProfiles.length} note="Recorded real profiles" /><AdminMetric label="Amplification Profiles" value={snapshot.amplificationProfiles.length} note="Real or proposed" /><AdminMetric label="Campaigns" value={snapshot.campaigns.length} note="Verified releases only" /><AdminMetric label="Lifecycle events" value={snapshot.activity.length + snapshot.campaignActivity.length} note="Append-only evidence" /><AdminMetric label="Operational results" value="Unavailable" note="Owned by #412" /></div>
      <nav aria-label="Social Profiles sections" className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-1" data-horizontal-scroll>
        {SOCIAL_PROFILE_SECTIONS.map((item) => <Link aria-current={section === item.id ? "page" : undefined} className="admin-focus-ring flex min-h-[var(--admin-touch-target)] shrink-0 items-center rounded-[var(--admin-radius-sm)] px-3 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground-muted)] data-[active=true]:bg-[var(--admin-surface)] data-[active=true]:text-[var(--admin-foreground)]" data-active={section === item.id} href={sectionHref(item.id, snapshot.simulationsIncluded)} key={item.id}>{item.label}</Link>)}
      </nav>
      {section === "venture-profiles" ? <VentureProfiles profileId={profileId} snapshot={snapshot} /> : section === "amplification-profiles" ? <AmplificationProfiles profileId={profileId} snapshot={snapshot} /> : section === "campaigns" ? <Campaigns campaignId={campaignId} snapshot={snapshot} /> : section === "network" ? <Network snapshot={snapshot} /> : section === "providers" ? <Providers snapshot={snapshot} /> : section === "content-runway" ? <ContentRunway profileId={profileId} snapshot={snapshot} /> : <ActivitySetup snapshot={snapshot} />}
      <SimulationMatrix snapshot={snapshot} />
    </div>
  );
}
