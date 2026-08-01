# Agent-owned content release

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `autonomy-content-release-2026-08-01`

Source: Autonomy Build prompt (owner-countersigned)

## Decision

Caught Up and MMA Files agents own their content release from internal editorial
selection through delivery and deterministic post-deploy proof. HERALD or CANVAS
selects the work, AUDIT may veto it, STET may hold it, and RELAY delivers only a
validated, hashed package.

The post-deploy verifier replaces the former owner review gates. It must confirm the
target commit, CI, both language routes, matching content marker, hero image and any
required image attribution. A failed proof gets one delivery retry. A second failure
reverts the target delivery commit, pauses that project and enters the daily digest.

Owner ratings remain optional input. They cannot block publication. The owner remains
pull-only through the daily digest and kill switches.

## Superseded requirements

This decision removes the requirements for one owner-reviewed live Caught Up delivery,
owner review of the first three editions, and one owner-reviewed MMA Files article and
FightAIQ delivery. It does not remove credential, legal, budget, evidence or safety
gates.

## Approval reference

`owner-request:2026-08-01-autonomy-content-release`
