# Phased social activation

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `autonomy-social-activation-2026-08-01`

Source: Autonomy Build prompt (owner-countersigned)

## Decision

Organic social posting is pre-authorized per project after its deterministic health
condition passes and its platform credentials exist. Caught Up needs seven consecutive
verified deliveries. MMA Files needs ten verified article deliveries with no unresolved
failure in the window. Titty Tuesdays needs platform credentials, four launch-ready
campaigns and a passing deterministic safety checker.

Each project keeps its own state. The manual global `SOCIAL_KILL_SWITCH` overrides
every project state. The publisher may post validated queue items only. It may not
follow, like, comment, send messages or automate engagement.

Every post needs an idempotency key, a platform receipt and a zero-model live-post
check. A failed check gets one retry. A second failure pauses social posting for that
project and reports the failure in the daily digest.

## Approval reference

`owner-request:2026-08-01-autonomy-social-activation`
