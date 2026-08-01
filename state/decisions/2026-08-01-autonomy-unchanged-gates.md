# Autonomy gates that remain human-only

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `autonomy-unchanged-gates-2026-08-01`

Source: Autonomy Build prompt (owner-countersigned)

## Decision

The autonomy build does not authorize budget increases, unplanned spend, new
credentials or accounts, legal changes, commerce, payments, ads, personal-data
collection or MMA Files indexing. The owner still controls each of those actions.

`FIGHTAIQ_ANALYSIS_ENABLED` stays `false`. FightAIQ may build deterministic readiness
dossiers, but only the owner may approve the analysis-mode change.

Evidence, bounded packets, receipt idempotency, one serialized state writer, schema
validation, allowlisted network access and existing kill switches remain mandatory.

## Approval reference

`owner-request:2026-08-01-autonomy-unchanged-gates`
