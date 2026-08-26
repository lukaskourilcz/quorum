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
