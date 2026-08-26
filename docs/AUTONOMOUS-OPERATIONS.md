# Autonomous Operations backbone

The Operations backbone observes and coordinates existing venture runners. It is not a content
router, scheduler, treasury, provider registry, publishing service or deployment controller. Its
cross-service authority is exactly `config/venture-capabilities.json`; an absent health edge is a
denial, even when both nodes live in this repository.

## Canonical records

| Concern | Versioned truth | Configuration or state |
| --- | --- | --- |
| Registered operational nodes | `operations-node-registry/1` | `config/operations-nodes.json` |
| Node service levels | `venture-slo/1` | `config/venture-slos.json` |
| Common run evidence | `venture-run-receipt/1` | `state/operations/run-receipts/<node>/` |
| Current health | `venture-operation-health/1` | `state/operations/health/<node>/current.json` |
| Bounded Operations view | `operations-snapshot/1` | produced from typed health adapters |
| Capacity decision | `operations-capacity-plan/1` | `state/operations/capacity/` |
| Efficiency evidence | `operations-efficiency-observation/1` | `state/operations/efficiency/` |
| Shared coordination | `shared-resource-lease/1` | `state/operations/leases/` |
| Recovery authority | `venture-recovery-policy/1` | `config/operations-recovery.json` |
| Recovery history | `venture-recovery-attempt/1` | `state/operations/recovery/` |
| Owner escalation | compatible `owner-attention/1` extension | `state/owner-attention.json` |
| Bounded incident view | `operations-incident-snapshot/1` | `state/operations/incidents/current.json` |
| Migration evidence | `operations-migration-report/1` | `state/operations/migration/current.json` |

Domain receipts remain canonical. A common run receipt names those records and normalizes only
execution metadata. It never copies an article, manuscript, research dossier, provider payload,
private annotation, campaign package or credential. Dry and fixture receipts do not count toward
live reliability or recovery statistics.

## Health and SLO semantics

Every node in the capability map has exactly one operational registration and SLO. The registry
check fails when any of those sets drifts. A future venture therefore enters Operations by adding
configuration and an adapter, not by changing a universal switch statement.

`healthy`, `quiet`, `held`, `degraded`, `stale`, `failing`, `paused`, `setup-needed` and
`unavailable` are separate states. A valid `NO_WORK`, `NO_POST`, off-day or authority-held receipt
may satisfy its node's SLO. Missing evidence is `unavailable`; it is never converted to success or
failure. One malformed receipt is dropped and counted without taking down another adapter.

An adapter reads only its node's canonical loader or common receipt ledger. Dependency health is
bounded operational evidence. `orchestrator/src/operations/health.ts` resolves an exact
source, target, `health-read` capability and `venture-operation-health/1` schema before returning
a ref. It cannot read dependency content. BOOKSOFHISTORY and Tehdejší svět remain isolated;
Personal Growth has no portfolio or Kvórum dependency; Door Money exposes no private knowledge.

## Capacity planning

`planOperationsCapacity` is a deterministic pre-run coordinator. The existing Prague dispatcher
still decides what is due, the domain runner still decides `WORK`, `NO_WORK` or `held`, and the
existing budget and provider registries still define headroom. The planner then:

1. removes not-due and domain-held work;
2. records honest `NO_WORK` skips;
3. reuses an accepted artifact only for the same node, phase, input, configuration and model;
4. respects active leases and writer/provider collisions;
5. keeps mandatory work ahead of optional work;
6. defers or holds work that exceeds its own or company headroom;
7. hands selected ids back to the owning runners.

The plan contains operational metadata only. It never borrows another venture's allocation,
removes evidence gates or invents work for an empty slot. A lease is idempotent and expiring and
grants no content access, authority or spend. Operations cannot acquire the deployment gate. The
deployment posture from #422 is read-only evidence and every capacity plan records
`deployment.scheduled: false`.

## Recovery and owner attention

Recovery is evaluated against one exact node and phase policy. There is no wildcard `auto-fix`.
All shared policies are `$0`, bounded by attempts and cooldown, and list the permanent prohibitions:
accounts, OAuth or secrets, scope expansion, budget increase, content approval, capability change,
outreach, contest entry, monetization and deployment.

The deterministic controller chooses at most one action. Ambiguous provider or delivery state is
reconciled before replay. An active global or node kill switch, missing lease, expired authority,
uncleared transient condition, exhausted attempt limit or nonzero incremental cost holds the
action. Execution is possible only through an injected owning-domain primitive; the controller
does not edit venture content.

Operational escalation extends the existing `owner-attention.json`. A stable condition key
deduplicates repeated observations, preserves first and last seen times, gives one exact owner
action and says which scopes continue unaffected. The regular owner-attention collector preserves
these incidents instead of creating a second task store.

## Incident runbook

1. Read the current health record and referenced domain receipt. Treat malformed or absent
   evidence as unavailable.
2. Confirm the exact capability, SLO, recovery policy, budget, kill switches and lease.
3. Reconcile ambiguous external state before any replay.
4. Execute one permitted action through the owning primitive and append its attempt record.
5. Update bounded health and incident snapshots. Do not change unrelated nodes.
6. Escalate one deduplicated item when policy requires the owner.

An expired connection pauses that connection, not its venture's unrelated profiles. A renderer
failure holds the same accepted payload; it does not ask a model for replacement content. A Door
Money private-store outage pauses Door Money while Design Lab and Social Distribution keep their
own health. A deployment problem is reported and handled by the explicit release runbook in
`docs/ENGINEERING.md`; recovery never deploys.

## Protected Operations control center

`/admin/operations` is protected by the existing `/admin` session boundary and composes one
server-only snapshot in `site/src/lib/admin-operations.ts`. The browser receives a deliberately
small operational projection: registry identity and stage, validated health/SLO reasons, cadence,
capacity decisions, budget and provider headroom, cache/reuse counts, incident actions, capability
counts, a compact reference to the canonical Implementation Plans snapshot and the read-only Git
deployment posture.

The reader parses or drops each record independently. Missing state remains unavailable, planned
or optional work remains held, and a malformed node cannot hide the other nodes. It never scans a
venture content directory and never returns articles, drafts, manuscripts, research, private
knowledge, political output, Personal Growth data, Contest Radar entries, contacts, provider
payloads or credentials. Credential-shaped text in an otherwise valid operational reason is
redacted again at the Admin boundary. Client code does not read state or GitHub and does not derive
health or implementation progress.

The control center can copy its sanitized diagnostic summary and record a protected refresh request.
The request is cooldown-bound and is consumed by the existing orchestrator checkpoint; it does not
run a provider, read GitHub from the browser or create another scheduler. On a first checkout, valid
registries still render while absent health, capacity and incident records stay explicitly unavailable.
It cannot change a capability edge, cadence, budget, provider, credential, content approval, account,
monetization plan or deployment. The full program/work-item interface remains owned by
`/admin/implementation-plans`; Operations embeds only a compact summary from the same #419 reader.
Monetization is information-only and design-template sales remain absent.

The live cycle materializes `state/operations/current.json` and one current health record per node at
the existing night checkpoint, or sooner for a valid Admin refresh request. It reads the common
append-only receipt ledger and canonical owner-attention incidents only. Dependency health settles
to a deterministic snapshot before persistence, so a retry at the same checkpoint is idempotent.

## Release stages

- **Stage 0 — contracts and fixtures:** capability, health, capacity, recovery and progress contracts
  exist without changing external behavior.
- **Stage 1 — observe only:** the current release materializes receipt-backed health and incidents,
  and exposes protected read-only Operations and Implementation Plans views.
- **Stage 2 — narrow deterministic recovery:** existing `$0`, idempotent recovery primitives may run
  only through an exact recorded policy and their owning domain primitive.
- **Stage 3 — governed routine self-healing:** remains inactive until each exact action is separately
  countersigned. Publishing, contest entry, accounts, credentials, deployment and monetization stay
  separately governed or prohibited.

Code existence never activates a later stage. Run
`pnpm --filter @boardlessai/orchestrator operations:release-audit` for the deterministic repository
gate; it exits non-zero when any registry, authority, isolation, Admin, deployment or migration check
fails.

## Migration and rollback

`pnpm --filter @boardlessai/orchestrator operations:migrate` reads optional JSON candidates from
`state/operations/migration-input/`. A candidate must already be an exact
`venture-run-receipt/1`, belong to a registered non-held node and reference canonical domain
evidence. The migration does not derive or fabricate a run from domain content. Dry/fixture and
unknown-node candidates are dropped, malformed or conflicting receipt ids are isolated, and
planned/paused nodes remain held.

The target common ledger is append-only. An exact existing receipt is `unchanged`, so rerunning the
migration creates no duplicate. The report counts `migrated`, `unchanged`, `held`, `unavailable`,
`dropped` and `malformed` and is written to `state/operations/migration/current.json`.

Migration inputs and every domain record are preserved. There is deliberately no automatic rollback deletion.
If a bad operator-supplied candidate was accepted, first activate the relevant
recovery kill switch, preserve the migration report and common ledger, correct the source evidence,
and restore the append-only Operations state from the pre-migration backup under the normal owner
runbook. Never delete domain receipts or rewrite history in place.

## Final release gate

`orchestrator/tests/operations-release.test.ts` runs the permanent final audit. It verifies exact
node/capability/SLO/recovery coverage, distinct outcomes, canonical receipt references, the sole
Europe/Prague scheduler, capacity and recovery authority limits, canonical owner attention,
venture isolation, #419/#431/#428 progress ownership, protected Admin reads, the #422 deployment
guard, information-only monetization and idempotent migration.

Social Distribution, Contest Radar and unfinished WebDev Signal integration may remain honestly
planned/held and do not fail the company gate. Contest Radar is registry metadata only in this
release; no Contest Radar runtime, feature workspace or entry data is implemented here.
