# Tehdejší svět — implementation handoff

Written 2026-08-12, mid-programme, last updated at `ecf21ce`. It covers what is built,
the architecture decisions that changed after the issues were written, the deviations
from the spec that need the owner's eye, and what the next session picks up. Delete it
when TS-24c closes.

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
| `91cad97` | TS-06a…TS-08 and TS-10b — the facts file, its loader and the no-link guard |
| `c03df18` | TS-05a, TS-05b, TS-09a, TS-09b — the two-day cycle, the scorer and recorded shortlists |
| `ce1490c` | TS-11b, TS-11c — the terminology table and the craft lints |
| `1a84bdf` | TS-11a — the tier classifier and what a tier does to a package |
| `e0fd916` | TS-12 — the `tehdejsi-story` evidence kind and its recommendation shape |
| `a364261` | TS-10a — the research ledger, its ceilings and its idempotency |
| `fddb511` | TS-13 — Day A: one call, and the canonical language-neutral brief |
| `5ec3343` | TS-14a — Day B: the two passes and the anti-mirror rule |
| `9d232ee` | TS-14b — the production gates and the drop tally |
| `22d3ce7` | TS-15a, TS-15b — Literata and Inter, and the glyph-coverage test |
| `bc2c53c` | TS-16 — brand tokens: paper and ink |
| `5da93a6` | TS-17a — the bilingual family kit |
| `ecf21ce` | TS-17b — the photo variant's mandatory attribution |

Everything from TS-00 through TS-17b is done and closed: issues 289–321 except the three
that were never opened. `main` is at `ecf21ce`.

Every scheduled venture phase was dry-run end to end after the merge — `ts-desk`,
`dm-desk`, `dm-growth`, `bh-desk`, `ms-daily`, `gv-brief`, `tt-marketing`, `cu-product`,
`mag-editorial`, `mag-desk`, `mma-intake`, `mma-analysis` — and all twelve dispatch and
complete. No phase reaches the "Unsupported venture phase" branch.

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
- **TS-10b** is inverted rather than withdrawn. A read-only pin assumed a connection to
  keep read-only; there is none. The guard worth having is stronger: a test that fails if
  any module, workflow, script or config here references `dontwannaknow` or its host at
  all.
- **TS-06a/TS-06b** keep their shape. The build rules (`shareSafe: false` omitted,
  excluded media omitted) now describe what a human must honour when copying facts across,
  and the tests still prove the loader refuses a file that breaks them.

**2. The snapshot is committed, never fetched.** This is the earlier adaptation and it
still holds. The daily room touches no network, the day is reproducible offline, and
`api.github.com` gains no new runtime use.

## What is built

Everything from the facts file to the finished card, minus the wiring that joins them.

- **Read and select.** `facts.ts` loads the committed, hash-verified facts file and aborts
  on mismatch. `scorer.ts` ranks deterministically and records the shortlist. `state.ts`
  walks the two-day cycle, stretching rather than skipping. All free, so all of it runs
  even while the room is paused — a paused evening leaves a reviewable shortlist rather
  than a blank.
- **Decide what a subject costs.** `gates.ts` treats the declared tier as a floor and never
  a ceiling, matching the seven blocking subjects by wording *and* by year range. Tier
  effects are returned as data. Excluded categories refuse the draft outright.
- **Research.** `research.ts` reuses before it buys, keys purchases on `(topicKey,
  briefHash)`, and refuses rather than trims at `$0.30`/brief and `$2.00`/month. Used-flags
  are appends, not mutations.
- **Write.** `briefs.ts` turns one LETOPIS call into a canonical, language-neutral brief.
  `produce.ts` runs the Czech pass, then the Ukrainian pass over the same brief plus the
  Czech copy with the anti-mirror instruction. `production-gates.ts` fails packages rather
  than fixing them, and tallies the drops.
- **Draw.** Literata and Inter ship Cyrillic-complete with a glyph-coverage test. The brand
  is paper and ink. `families-tehdejsi.ts` composes both languages on one card and refuses
  a licensed photograph with no credit.

## What is left

Ten open issues, in checklist order.

- **TS-17c, TS-18** — the venture's render module
  (`orchestrator/src/ventures/tehdejsi-svet/render.ts`, marketingShark shape) building deck
  payloads from a recommendation's bilingual slides, recorded summaries under
  `state/ventures/carousel-studio/summaries/tehdejsi-svet/`, and the byte-stable bilingual
  determinism test. **This is the join**: every piece it needs now exists, and nothing
  today calls `tehdejsiDeckTemplate` from the orchestrator.
- **TS-19…TS-20d** — the admin approval path with the blocking tier-2 review, the
  server-only loader, and the three panels.
- **TS-21a…TS-23b** — community signals, the product-insight queue, the GoVIRAL topic set
  and timing factor, owner results, the experiment ladder.
- **TS-24a…TS-24c** — documentation truth, INBOX approvals, honest gaps, the checkbox
  sweep, and deleting the spec.

One thing worth knowing before TS-17c: the pipeline is built but not yet *called*.
`run.ts` still records the `$0` checkpoint and advances the deterministic cycle; it does
not yet call `generateTsStoryBriefs` or `produceBilingualDraft`. That wiring is a small
job and belongs with TS-17c, because the render module is what makes a produced package
worth storing.

Then the other programmes, untouched: SWEEP (338–350) and REV (351–364).

## Three deviations the owner should look at

None of these blocks anything. All three are recorded in the code beside the decision and
in the closing comment on their issue, and any of them can be reversed cheaply.

1. **The brand's fonts are Literata / Inter / IBM Plex Mono**, not the brief's
   Literata / Literata / Inter (TS-16). `mono` turns out to be a structural monospace slot
   — `timeline`'s time chip is calibrated to a 600-unit advance — and Literata at 659 is
   the widest face in the set and overflows `comparison`'s body slots. So Literata takes
   the headline, Inter takes the body, and both identity faces stay reachable. The
   alternative is Literata as body with `timeline` and `comparison` dropped from this
   brand's template set.
2. **Two palette colours are nudged.** The brief anticipated this for the coral and it was
   needed: `#d9684f` reaches only 3.1:1 on paper, and the shared families use `accent` for
   both rules and text, so it ships as `#8b4333`. `muted` moved a hair the same way,
   `#4d5f59` → `#4a5b55`. Paper, ink and green are exact.
3. **The anti-mirror check is a backstop, not a detector.** What prevents mirroring is the
   instruction sent to VERBA. No lexical measure separates a close adaptation from a loose
   translation without reading both, and one that tried would reject good Ukrainian copy
   for resembling good Czech copy. It catches the blatant case — sentence-level alignment
   across every slide — and reports "too little signal" below three aligned sentences
   rather than guessing.

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
- **`\b` and `\w` never match beside a Cyrillic letter.** They are defined on
  `[A-Za-z0-9_]`, so a pattern using either passes every Ukrainian phrase in it while
  looking exactly like a pattern that checked them. Eleven alternatives in `gates.ts` were
  dead this way and one whole stop-slop rule in `production-gates.ts`. Use `\p{L}` with the
  `u` flag, and write a test in the language the rule is about.
- **Diacritics are optional in the wild.** A gate that only matches `nucené` misses
  `nucene`. Every character class in these lints carries its ASCII fallback, because a rule
  a missing háček bypasses is not a rule.
- **A light brand inverts the ground ladder.** `background`, `surface` and `surface-strong`
  are three grounds a family may put the same text over. On the six dark brands they run
  near-black *upward*; on a light one they must run paper *downward*. Reaching for a dark
  identity colour as `surface-strong` makes the darkest ground darker than the text tokens
  and every family setting muted type on a panel fails at once. BOOKSOFHISTORY already had
  this shape — copy it rather than deriving it again.
- **The metrics generator has its own character set.** Committing a font with Cyrillic
  glyphs is half the job: if `generate-font-metrics.ts` does not enumerate those
  codepoints, every one of them measures at the fallback average and the whole alphabet
  fits at one flat width. Coverage in the file and coverage in the table are different
  questions and both need asking.
- **`mono` is a monospace slot, not a third brand face.** The `timeline` template's time
  chip is calibrated to a 600-unit advance and every brand binds IBM Plex Mono there; a
  proportional face at 625 does not fit. Similarly Literata at 659 is the widest face in
  the set and overflows `comparison`'s body slots. Check a new brand's faces against
  `FONT_METRICS[...].average` before choosing them.
- **A deck family is one text slot per slide.** `DECK_FAMILIES` composers receive one
  `context.slot` and the template requires that one slot, so a bilingual layout cannot live
  there. `families-tehdejsi.ts` is its own builder for that reason.
- **Adding a brand grows four lists beyond the token record.** The studio id enum, the
  recipe and copy venture enums, `CarouselSummaryVenture` with its kicker and closing line,
  and the site's Design Lab reader — plus two tests that pin the brand list verbatim.

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

Green: orchestrator 1699, site 520, studio 167, both typechecks, lint,
`pnpm run docs:check`. `--phase ts-desk --dry` records a $0 paused checkpoint plus a
shortlist and a cycle record; `bh-desk` and `dm-desk` still run clean beside it.

## Nothing was opened

No account, no channel, no credential, no scope, no spend. `PORTFOLIO_LIVE_ENABLED`
governs whether the phase reaches the runner at all, and the founding decision is still
pending countersignature, so the room stays at $0 either way. The five approval items
(`TS-SNAPSHOT-001`, `TS-MEDIA-002`, `TS-ACCOUNTS-003`, `TS-RESEARCH-004`,
`TS-RESULTS-005`) are unresolved and belong to the owner.
