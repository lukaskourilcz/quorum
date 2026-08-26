# Implementation programs

Implementation progress is repository evidence, not a GitHub label report. The canonical registry
is `config/implementation-programs.json`; the canonical runtime view is
`state/programs/current.json`. Admin reads that snapshot and does not independently query GitHub,
scan the repository or derive a more optimistic state.

## Registered hierarchy

The versioned registry contains six programs: Personal Growth, Social Distribution, Contest
Radar, Autonomous Operations, Deployment Cost Control and WebDev Signal. Each program declares
its parent issue, ordered phases, prerequisites, safe parallel groups, protected-file collision
groups and final release item. Work items declare their issue, dependencies, deliverables, probes,
owner-only setup classes, completion policy and optional weight.

A shared work item is one registry record with more than one `programRefs` value. Issues #420,
#421 and #430 therefore have one canonical state even when more than one program displays them.
Held optional work has a null weight and does not reduce mandatory completion. A program cannot
report 100% until its declared final gate is complete.

The public contracts are:

- `implementation-program/1`
- `implementation-work-item/1`
- `implementation-progress/1`
- `implementation-progress-event/1`

Their generated JSON Schemas and valid/poison fixtures live under `contracts/`.

## Evidence and state resolution

`orchestrator/src/programs/` owns the resolver. It combines three bounded evidence classes:

1. read-only GitHub issue, timeline, pull-request and check evidence;
2. typed repository, contract, test and release-receipt probes declared in the registry;
3. the last valid progress snapshot and sanitized GitHub ETag cache.

The resolver distinguishes `not-started`, `ready`, `in-progress`,
`implemented-awaiting-verification`, `owner-action`, `blocked`, `complete`, `held-optional`,
`stale`, `inconsistent` and `superseded`. Closing an issue is not sufficient when the completion
policy also requires a merged pull request or passing probes. Missing live evidence retains the
last-known-good item as stale; malformed items are isolated and counted.

Active items that share a protected-file collision group block one another. Current, next
unblocked and parallel-safe selections are deterministic registry-order results, never queue
guesses.

## Synchronization and persistence

The normal live synchronizer joins the night checkpoint when either `GITHUB_TOKEN` is present or
`PROGRAMS_PUBLIC_GITHUB_SYNC=1` explicitly allows anonymous public reads. `CI=true` always disables
live GitHub synchronization. Per-item reads are concurrency-bounded, ETag-aware and failure
isolated; arbitrary issue bodies and credentials are never persisted.

Run an explicit local synchronization with:

```bash
pnpm --dir orchestrator programs:sync -- --public
```

Add `--force` only when deliberately bypassing the fifteen-minute synchronization cooldown.

The one writer uses a lock and atomic replacement for:

- `state/programs/current.json`
- `state/programs/last-known-good.json`
- `state/programs/github-cache.json`

Meaningful state transitions append to `state/programs/events/YYYY-MM.jsonl`. An unchanged refresh
does not append another event.

## Protected Admin view and refresh

`/admin/implementation-plans` renders portfolio, program and work-item views from the sanitized
server-only reader in `site/src/lib/admin-implementation-plans.ts`. It exposes exact state reasons,
dependencies, blockers, probes, pull requests, owner actions, discrepancies and recommended next
actions. Missing, stale, partial and malformed snapshots are named; an unknown percentage falls
back to exact mandatory counts.

The Admin refresh button does not call GitHub. Its authenticated, same-origin endpoint atomically
writes `state/programs/refresh-request.json` with a fifteen-minute request cooldown. The next live
orchestrator checkpoint consumes a valid request only when it is newer than the canonical
snapshot; the retained receipt makes this idempotent. CI and unconfigured environments still make
no network request.

Relevant venture workspaces render compact summaries from the same snapshot. The Company rail
links to the dedicated portfolio, so a summary and detail page cannot disagree about progress.
