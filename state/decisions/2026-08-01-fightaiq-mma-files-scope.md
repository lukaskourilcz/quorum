# FightAIQ and MMA Files organization scope

Date: 2026-08-01

Decider: Lukas Kouril, owner

Status: approved

Decision id: `fightaiq-mma-files-ufc-oktagon-only`

## Decision

FightAIQ and MMA Files now cover UFC and Oktagon only. This decision supersedes the
three-organization scope in the FightAIQ founding record. Existing meeting records and
the founding record stay unchanged as audit history.

CORNER owns UFC scouting. SPOTTER owns Oktagon scouting. Their sources, prompts, routing
tags and quality checks must match that split. Contracts reject fighter, event, odds and
article references from any other organization.

FightAIQ remains in data-only mode. The owner must review one full UFC event and one full
Oktagon event before considering live analysis. MMA Files may write only from verified
FightAIQ packets inside the same two-organization scope.

The later `mma-files-public-delivery` decision makes MMA Files the public presentation
layer for these records while leaving this live-analysis gate unchanged.

## Approval reference

`owner-request:2026-08-01-ufc-oktagon-only`

The owner approved this scope change in the active Codex task on 2026-08-01.
