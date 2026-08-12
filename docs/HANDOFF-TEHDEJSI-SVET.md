# Tehdejší svět — implementation handoff

Written 2026-08-12, mid-programme. It covers what is built, the two architecture
decisions that changed after the issues were written, and what the next session picks up.
Delete it when TS-24c closes.

The governing records are `state/decisions/2026-08-12-tehdejsi-svet-founding.md` (the
countersignature, the approval gates, the checklist) and `docs/ENGINEERING.md` (the
clean-code contract). `docs/TEHDEJSI-SVET-VENTURE-DESIGN.md` is the strategy.
`docs/tehdejsi-svet-venture-implementation.md` is the original spec and is now partly
superseded — see *Two things the issues no longer say* below.

## Where the work landed

Branch `agent/tehdejsi-svet`, merged to `main`. Four commits:

| Commit | Covers |
| --- | --- |
| `e723b3c` | TS-00, TS-01 — audit and the founding decision |
| `7ecced5` | TS-02a…TS-03d — registry, schemas, meeting policy, cron and workflow |
| `52807d4` | TS-04a…TS-04c — LETOPIS and VERBA seated end to end |
| `18eaa30` | the `ts-desk` dispatch and its $0 checkpoint runner |
| `b2e27e2` | the Door Money merge — see *Merging with Door Money* below |

Issues TS-00 through TS-04c (289–299) are done. TS-05a is half done: the runner dispatch
exists, the cycle state machine does not.

## What actually runs today

`ts-desk` fires at 18:00 Prague through `site/vercel.json` and reaches
`runTehdejsiSvetCycle` in `orchestrator/src/ventures/tehdejsi-svet/run.ts`. Until the
owner countersigns, it records a $0 checkpoint that says the editorial pipeline is not
built: no model call, no product data, no channel, no network. A hand-run of the closed
live room writes nothing at all, so it never claims a calendar slot. A second firing for a
date already recorded is a no-op.

That runner is scaffolding with an honest face, not a stub to leave in place. TS-05a
replaces its body with the real two-day cycle; the pause gate, the duplicate guard and the
$0 failure posture are the parts worth keeping.

## Two things the issues no longer say

The issue bodies were written from the original spec. The owner narrowed the design twice
after that, and the founding decision records both under *Adapted during implementation*.
Where an issue and this section disagree, this section wins.

**1. There is no link to the `dontwannaknow` repository. None.** Not a workflow, not a
CLI over a clone, not a token, not an API call. This repository borrows marketingShark's
*pattern* — a committed, hash-verified file that the room reads and nothing else — but
none of its plumbing, and the two repositories stay strangers.

What the desk reads is a facts file committed here by hand: the interesting era and
history facts, copied across once, each carrying its own source. The room generates from
that file and from nothing else.

The consequences for the open issues:

- **TS-07** is no longer "the `tehdejsi:sync` CLI". It is the contract, the authoring and
  the validation of the committed facts file. No clone is read.
- **TS-08** is the loader for that file: read, verify the content hash, cache, and abort
  on mismatch. A hand-edited facts file must stop the room rather than quietly change what
  it claims.
- **TS-10b** — the product-repo read-only pin — has nothing left to pin. Close it as
  withdrawn, and note the withdrawal on the issue so the reason survives.
- **TS-06a/TS-06b** keep their shape. The build rules (`shareSafe: false` omitted,
  excluded media omitted) now describe what a human must honour when copying facts across,
  and the tests still prove the loader refuses a file that breaks them.

**2. The snapshot is committed, never fetched.** This is the earlier adaptation and it
still holds. The daily room touches no network, the day is reproducible offline, and
`api.github.com` gains no new runtime use.

## What is left

39 open issues, TS-05a through TS-24c (300–337), in the order the founding checklist
lists them. Roughly:

- **The read layer** — TS-05a…TS-08. Cycle state machine, scaffold, facts-file contract,
  exclusion tests, authoring, loader.
- **Selection** — TS-09a…TS-12. Scorer, shortlist records, research reuse with its
  `$0.30`-per-brief and `$2.00`-per-month ceilings, sensitivity tiers, terminology table,
  the remembrance and no-flags lints, the `tehdejsi-story` evidence kind.
- **Production** — TS-13…TS-14b. Day A brief, Day B bilingual production, the anti-mirror
  rule, both-language gates.
- **The Design Lab** — TS-15a…TS-18. Cyrillic-complete committed fonts and their
  glyph-coverage test, brand tokens, the bilingual family kit, the photo variant with
  mandatory attribution, recorded summaries, the determinism test.
- **Admin** — TS-19…TS-20d. Approval write path with the blocking tier-2 review, the
  server-only loader, the three panels.
- **Signals and the spine** — TS-21a…TS-23b. Community signals, the product-insight queue,
  the GoVIRAL topic set and timing factor, owner results, the experiment ladder.
- **Close-out** — TS-24a…TS-24c. Documentation truth, INBOX approvals, honest gaps,
  the checkbox sweep, and deleting the spec.

Then the other programmes, untouched: SWEEP (338–350) and REV (351–364).

## Traps this branch already hit

- **An agent id lives in four enums.** `config/agents.json` is not enough:
  `orchestrator/src/types.ts`, `orchestrator/src/contracts/common.ts`,
  `orchestrator/src/org/registry.ts` and `site/src/data/agents.ts` (two unions plus
  `TextModelRole`) all have to gain the name.
- **A phase lives in about a dozen.** Registering `ts-desk` broke 43 tests until the
  calendar enums and their `||` chains, the agenda phases, the site's `SCHEDULED_PHASES`,
  the cost table, the workflow exclusions, the brand hue, the slot label, the admin tabs
  and the degradation ladder all knew about it.
- **Roster and count assertions are everywhere.** The branch alone moved 44→46 agents,
  35→37 active and 8→9 projects; after the Door Money merge the committed numbers are 48
  profiles, 39 seated, 24 Anthropic and 15 OpenAI active, 10 projects and 13 scheduled
  rooms. A new venture also shifts the ideation rotation, which moves the date a test pins.
- **`docs/ECOSYSTEM.md` is generated.** `pnpm run docs:check` fails after any count moves;
  `pnpm run docs:refresh` is the fix.
- **"bilingual" is a banned word** in an agent's public description —
  `czech-only-publishing.test.ts` enforces it.
- **A `calendar-cost` label must equal the `configuredTextModel` label**, and an agent
  with no priced call must not be billed at all. QUILL follows the `bh-desk` precedent.
- **Run the gate from inside a package.** `--root orchestrator` from the repo root makes
  `repoRoot` resolve to the parent directory and invents four ENOENT failures.

## Merging with Door Money

Door Money landed on `main` while this branch was open, and both ventures registered a
room, two agents and a set of admin tabs against the same closed enums. Every shared list
conflicted; all of it resolved as additive. Two resolutions were judgement rather than
concatenation, and both are recorded in the merge commit:

- `ROOM_DEGRADATION_ORDER` gained `ts-desk` between `dm-desk` and `bh-desk`. The monthly
  rung is unchanged — `ts-desk` and `bh-desk` still yield at the same headroom — but when
  only one of the two must go, the daily desk goes first: it costs one feature, while a
  dropped BOOKSOFHISTORY day stalls a three-day cycle that has already paid for research.
- `paths.ts` now owns the persona directory map. Main replaced the branch's inline
  prompt-path branching with one `nestedPersonaDirectories` table; that is the better
  shape and is now the only place a venture's prompt folder is named.

Expect the same shape from the Kvórum branch, which is still unmerged and additionally
collides on the `venture-recommendation` contract.

## Gate at handoff

Green: orchestrator 1580, site 520, studio 135, both typechecks, lint,
`pnpm run docs:check`. `--phase ts-desk --dry` records a $0 paused checkpoint;
`bh-desk` and `dm-desk` still run clean beside it.

## Nothing was opened

No account, no channel, no credential, no scope, no spend. `PORTFOLIO_LIVE_ENABLED`
governs whether the phase reaches the runner at all, and the founding decision is still
pending countersignature, so the room stays at $0 either way. The five approval items
(`TS-SNAPSHOT-001`, `TS-MEDIA-002`, `TS-ACCOUNTS-003`, `TS-RESEARCH-004`,
`TS-RESULTS-005`) are unresolved and belong to the owner.
