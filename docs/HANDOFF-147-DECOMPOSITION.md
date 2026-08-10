# Handoff: what is left of issue 47 (decompose `cycle.ts` and `portfolio/run.ts`)

Issue 47 asked for mechanical extraction until no hand-written file in the touched areas is over
about 500 lines. Part of it is done and merged; this file is the rest, written so somebody can pick
it up without re-deriving anything.

## What is done

`orchestrator/src/cycle.ts` went from **2,194 lines to 1,234**, as pure moves — nothing renamed, no
signature changed, no logic touched, and re-exports left in place so every existing caller and test
still imports these names from `./cycle.js`:

| Module | Lines | What moved |
| --- | ---: | --- |
| `cycle/commissions.ts` | 270 | the morning board's commission gate: the vote, the room request, the priority proposal, and what a venture that got no room is told |
| `cycle/caught-up.ts` | 631 | the three DNESKAi room runners — dry, live edition, live product |
| `cycle/ledger.ts` | 133 | the arithmetic about money and days: enforced caps, month spend, cycles remaining, yesterday |
| `cycle/types.ts` | 78 | `CycleOptions`, `CycleResult` and `hasDeliveredPublishedEdition`, extracted so `cycle.ts` and `cycle/caught-up.ts` need not import each other |

Full gate was green after the extraction: 1,288 orchestrator, 443 site, 126 studio tests,
typecheck clean.

## What is left

### 1. `cycle.ts` is still 1,234 lines

What remains is essentially `runCycle` itself. **It cannot be finished as a pure move**, which is
why it was stopped rather than pushed through: `runCycle` is one long function whose parts share
local state (`artifactRoot`, `cycleId`, `now`, `stages`, `morningContext`, `measuredCouncil`,
`artifacts`), so extracting a section means deciding what to thread through it. That is a redesign,
and issue 47 says explicitly: *move code verbatim; no renames, no signature changes, no
refactoring-while-moving.*

The seams inside `runCycle`, in the order they appear, each a candidate for its own module once
somebody decides on the parameter object:

- **the double-fire and already-recorded guards** — the front of the function, before any work
- **the morning shift**: money and KPIs, the autonomy snapshot, the priority-queue bootstrap, the
  operations packet, the live council, the commission loop, the proposal resolution, the skip loop
- **the operations review resolution** — verdicts, fix tasks, growth ideas, the decision file
- **the artifact writers** — the four `atomicWriteJson` calls and the arrays that feed them
- **the night tail** — the ecosystem refresh, the content gate, the weekly and monthly reports,
  the retro, the owner-attention collector

The honest way to do it: define one `CycleContext` object (roots, ids, clock, stage, limits) built
once at the top, hand it to each extracted step, and move the steps one at a time with the full
gate green after each. That is a real design decision, and it should be its own issue rather than
smuggled in under a refactor labelled mechanical.

### 2. `orchestrator/src/portfolio/run.ts` is untouched, at 1,722 lines

Issue 47 names three seams for it — room lifecycle, room content, and the `RoomStayedShut` family.
Nothing was extracted. It was left alone deliberately: the `cycle.ts` work used the time budgeted
for both, and doing half of `run.ts` badly is worse than doing none of it.

Its seams look cleaner than `runCycle`'s, because the file is already several top-level functions
rather than one long one. Start there.

### 3. The other two files on the debt list

`docs/ENGINEERING.md` rule 8 also names `site/src/components/decision-replay.tsx` (1,340) and
`site/src/lib/office-walkthrough.ts` (831). Neither is in issue 47's scope; both are still over the
cap and worth their own pass.

## How to verify any of it

Each commit's diff must be explainable as pure moves, and the gate must be green at every step:

```bash
pnpm test && pnpm typecheck && pnpm -C site lint
```

The re-export pattern in `cycle.ts` is what keeps a move from becoming a rename. Copy it: extract,
re-export the moved names from the original module, and no caller or test has to change.
