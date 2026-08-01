# Audience metrics deferred

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `autonomy-metrics-deferred-2026-08-01`

Source: Autonomy Build prompt (owner-countersigned)

## Decision

This build must not collect, ingest or display visitor, reader or engagement metrics.
`METRICS_INGESTION_ENABLED` stays `false`. SPLIT stays idle. Social A/B variants rotate
deterministically and receipts record the chosen variant without fetching performance
data.

Phase 3 may define analytics, experiments and SPLIT learning after the owner changes
this gate. This record does not authorize personal-data collection or a new analytics
account.

## Approval reference

`owner-request:2026-08-01-autonomy-metrics-deferred`
