# The engineering contract

One ruleset, written once, the same in every repository this owner runs. Each rule carries the
incident that created it — a rule whose reason has been forgotten is followed until it is
inconvenient and then dropped.

Where a generic recommendation and a rule here disagree, this file wins. Where this file and a
documented product invariant disagree, the invariant wins and this file gets amended.

## Architecture and data

**1. Schema-first boundaries.** Every artifact that crosses a boundary has a versioned contract in
`contracts/`. Readers parse-or-drop, count what they dropped, and say so; nothing throws on bad
data. *Why:* one malformed idea in an append-only ledger used to return `null` for the whole file,
which took `/admin` down until somebody hand-edited state.

**2. Recorded, not re-derived.** A model's verdict and anything delivered are written once and read
back forever. *Why:* `orchestrator/src/images/verdict-store.ts` states it in its own header — a
model asked twice can answer differently, so a re-derived record shows the owner a decision that
was never made.

**3. One writer per state path.** Append-only ledgers, atomic writes, and an idempotency key on
anything a retry could double-write. *Why:* the launch binder wanted a plan's status and the rating
route wanted to set it; adding a second writer to `state/ventures/*/plans/` would have kept two
copies of one fact in sync forever. Reading the ledger was cheaper and truer.

**4. One resolver per config concern.** Never a literal copy of a budget number, a model id or a
path. *Why:* `orchestrator/src/portfolio/limits.ts:9-17` records it — article production carried
its own `$2.20 / $42 / $50`, the figures of a decision the owner had already superseded with
`$1.00 / $25 / $30`, and it went on spending against the replaced one. The same rule caught a day
tile scaled to a literal `$1` beside three scaled to `$30`.

**5. Reserve before, record after.** Every paid call reserves its estimate, then records what it
actually cost; bill before the gate is asked. *Why:* `orchestrator/src/images/ladder.ts:275-285` —
a gate that can refuse must not be able to refuse for free, or a loop of refusals is a loop of
unbilled calls.

**6. Failure posture.** A malformed item costs one item. A failing source costs a section and a
line in the receipt. Neither costs the run. Every non-event writes a reason record. *Why:* the
meeting-skip pattern — a meeting that did not happen and left no record is indistinguishable from
one nobody scheduled, and explaining what did not happen is half of what an operations record is
for.

**7. `null` is not `0`.** A rate with no denominator, a period nothing was measured over and a
score nobody produced are all absences. *Why:* "Releases that passed 0%" announced a catastrophe on
a week when nothing had been released at all.

## Modules

**8. A soft cap of about 400 lines per hand-written file.** Named debt, at the time of writing:
`orchestrator/src/cycle.ts` (2,194), `orchestrator/src/portfolio/run.ts` (1,720),
`site/src/components/decision-replay.tsx` (1,340), `site/src/lib/office-walkthrough.ts` (831).
*Why:* the cap is not about beauty — every one of those files has had a bug that survived review
because the reviewer could not hold the file in their head.

**9. Domain folders, not type folders.** A helper graduates to shared at its third caller, not its
second. *Why:* two callers is a coincidence; three is a pattern.

**10. No dead code kept alive by its own tests.** `orchestrator/src/council.ts` and
`orchestrator/src/consensus.ts` are imported by nothing but their tests. Revive them or delete
them. *Why:* a green test suite over unreachable code reports a system that does not exist.

## Site and React

**11. One styling dialect per surface, documented.** The token dialect for the classic pages;
literal hex for the office walkthrough and the admin shell. Extract a local component before its
second consumer copies it, not after. *Why:* `Tile` and `Panel` sat module-private in the admin
page until a second view needed them; extracting them first is the cheap moment.

**12. Custom hooks for any client behaviour used twice.** Components stay presentational. Every
filesystem read lives in a `server-only` lib module and crosses to the client once, as plain JSON.
*Why:* the office walkthrough pattern — that single crossing is also the sanitising boundary, and
one boundary is auditable where twelve are not.

**13. Honest rendering.** A missing record is named, not omitted. Machine text never reaches a
public page. *Why:* the four-layer sanitiser chain exists because a raw contract token once
reached a reader, and because an omitted row reads as "nothing happened".

## Process

**14. Comments state constraints the code cannot show.** Never narration. A comment that says what
the next line does is noise; a comment that says why the obvious approach was wrong is the only
copy of that knowledge.

**15. Architecture tests for cross-repository invariants.** *Why:* the skills drift test — two
copies of a file that must stay identical will not stay identical unless something fails when they
diverge.

**16. Small commits, one concern each.** Board findings become `- [ ]` tasks in a dated decision
file under `state/decisions/`, and a session ticks them off one commit at a time.

**17. Every repository carries this file.** `CLAUDE.md`, `AGENTS.md` and `CONTRIBUTING.md` point at
it rather than restating it, because a rule stated in four places is four rules that will drift.
