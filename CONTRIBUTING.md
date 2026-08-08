# Contributing

Working rules for this repository live in `CLAUDE.md` (and its mirror `AGENTS.md`) — the map,
the golden rules, the commands and the git workflow. This file covers the conventions that are
easy to get wrong because they cross a repository boundary.

## Hook and viral-copy knowledge lives here, and only here

`docs/hooks/` is the canonical knowledge base for hooks and short-form viral copy across the
whole repository family: the devShark and geoShark in-app hooks, marketingShark's carousel
slide-1 lines, and social copy generally. The libraries sit beside the Design Lab's engine in
`studio/hooks/`, one library per surface — quiz, news and mma. They front the carousels this
repository posts; the quiz apps deliberately receive no hook copy (see
`docs/hooks/06-hook-brain.md`). A new surface's library is written here, beside the engine,
never in its own repo — and its first job is enumerating the metadata that surface's items
actually carry, because a gate that cannot read a field licenses nothing.

**Never copy a hook doc or a hook library into a venture repository.** A forked playbook drifts
within weeks, and the two libraries that existed before this was written had already diverged:
one of them was still shipping a hook that promised a ten-second timer to a card that had no
timer.

### Write A/B learnings into this repository

When a hook A/B readout comes in, the result goes into the **Results log at the bottom of
`docs/hooks/03-metrics-and-testing.md`**, in this repository — never into a venture repo, never
into an app's README, never only into a meeting record.

Alongside it, update the hook's entry in `studio/hooks/quiz.research.json`:

- Promote `citationConfidence` to `measured` **only** for an effect confirmed by our own data.
  That tag is reserved for it and is the strongest one we have.
- Never upgrade a tag to sound more authoritative, and never invent a citation. `[verified]`
  means someone opened the source.
- Apply the kill rules in `03`: completion −2pp or next-day return −1pp against control retires
  the hook, whatever it did to swipe-through. The guardrails are veto players, not tie-breakers.

The reason the log lives here is that a venture repo sees one surface. The library serves several,
the mechanisms port between them even when the strings do not, and a lesson recorded next to one
venture's code is a lesson the next surface's author will never find.

### Before a hook library ships

`pnpm lint:hooks` must pass. It enforces the craft caps from `02-hook-craft-rules.md` as checks —
character budgets, the identical-pair budget, the archetype cap, the declension rule for `{topic}`
in Czech, the pool floor per gate. Warnings do not block — the three unreachable geo variants are
a standing, deliberate state — but read them rather than skipping past them.

If a lint rule fails on a shipped string, **report it — do not rewrite the line.** The copy is
final and length-budgeted, and a rule that disagrees with a deliberate exception is a rule to
discuss, not a string to quietly edit.

## Contracts

A new bounded contract needs its zod schema in `orchestrator/src/contracts/`, an entry in
`ContractSchemas`, a `valid` and a `poison` fixture under `contracts/fixtures/`, and a run of
`pnpm contracts:export`. The poison fixture should encode the failure the contract exists to
prevent, not an arbitrary type error.

## Shared skills

Four skills in `.claude/skills/` are vendored verbatim from upstream; nineteen are mirrored
byte-for-byte into `.agents/skills/`. Edit both copies in the same commit —
`orchestrator/tests/architecture.test.ts` fails on any drift, file by file.
