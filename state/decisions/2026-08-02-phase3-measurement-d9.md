# D9 — measurement-ready contracts without data collection

Date: 2026-08-02

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `D9`

## Owner direction

BoardlessAI may ship the Phase 3 measurement contracts, deterministic experiment
assignment, administrative readiness views and honest `unavailable` KPI states. It
must not collect visitor, reader, follower or engagement data until the owner chooses
an analytics provider and explicitly enables lawful ingestion.

`METRICS_INGESTION_ENABLED=false` remains the effective setting. SPLIT stays disabled;
REACH may prepare contract-valid drafts only when its project control is re-enabled,
but neither role may request or infer outcome data. A/B assignment and social receipts
prove which bounded variant was used, not how a person behaved.

## Authority and approval reference

This record consolidates the Phase 3 implementation instruction supplied by the owner
with the earlier `autonomy-metrics-deferred-2026-08-01` decision. It does not authorize
an analytics account, cookies, personal-data processing, tracking pixels or a change
to public indexing.
