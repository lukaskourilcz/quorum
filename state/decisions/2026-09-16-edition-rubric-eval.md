# Grade every edition against a versioned rubric, with no judge model

Date: 2026-09-16

Decider: Lukas Kouril, owner

Status: pending owner countersignature

Decision id: `edition-rubric-2026-09a`

Supersedes: nothing. `evaluateEditionQuality` in `orchestrator/src/edition/quality.ts` remains the
only gate that can stop an edition. The rubric describes that gate and decides nothing.

Sources: GitHub #535, `config/edition-quality.json`, `orchestrator/src/edition/quality.ts`,
`orchestrator/src/edition/rubric.ts`, `orchestrator/tests/setup/provider-env.ts`

## Decision

The fourteen violation codes the edition gate already enforces are written down as a versioned
rubric of independently gradeable criteria, and every committed run report is regraded against it
into one receipt per date. The regrade is deterministic and free, which is the only reason it can
run on every push.

| Part | Where it lives |
| --- | --- |
| The rubric: fourteen criteria, each with its category, the metrics it reads, the threshold it reads and what passing it asserts | `config/edition-quality.json` under `rubric`, at `edition-rubric/1` revision 1 |
| The grader and the per-date receipt builder | `orchestrator/src/edition/rubric.ts` |
| The receipt contract | `contracts/edition-rubric-receipt.schema.json` |
| The receipts | `state/quality/edition-rubric/<date>.json`, 34 dates covering 49 runs |
| The gate | `pnpm edition:rubric -- --check`, a step in `.github/workflows/ci.yml` |

The rubric carries no threshold and no grading logic. `thresholdKey` is a dotted path into the same
config the gate reads, and the regrade calls `evaluateEditionQuality`. A rubric that re-derived the
comparisons would be a second gate over one decision, and two gates disagree the first time either
moves.

## What the first regrade found

Every one of the 31 gradable reports regrades to the verdict it recorded. Two things are worth
recording, because both are facts about the records rather than about the code:

- **Eighteen of the 49 reports cannot be graded at all.** Each is a run that ended before the
  quality gate was reached, so it recorded no metrics. The receipt marks those `ungraded` with the
  reason. Counting them as passes would report a gate that never ran as a gate that was satisfied.
- **`action` cannot be reproduced from a run report.** `evaluateEditionQuality` chooses `publish`,
  `regenerate` or `no_edition` by reading the regeneration attempt it was called with, and a report
  records the run's *final* attempt count. Two reports — 2026-08-02 and 2026-08-04 — therefore
  differ on `action` alone. The rubric grades the fourteen codes, which are a pure function of the
  recorded metrics and the committed thresholds, and says nothing about what the run did next.

## What this does not do

- **It cannot stop an edition.** The gate that can is unchanged. The receipt is a record of what
  that gate decided and of whether the rubric still agrees.
- **It spends nothing.** Two file reads and a pure function. No model, no provider, no network, so
  it sits outside the `budget-2026-08f` model share entirely.
- **It does not judge writing.** Everything it grades is a number the run already measured.
  Whether the prose is any good is not in scope here and is not claimed anywhere in the receipt.

## The judged half of #535 is not built, and the reason is a guard

The issue asks for promptfoo assertions or DeepEval faithfulness metrics with a bounded judge cost.
That cannot run in this repository's CI as it stands:

- `.github/workflows/ci.yml` sets no `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Only `cycle.yml` does.
- `orchestrator/tests/setup/provider-env.ts` deletes both variables before every test, by design.

So a judged eval needs either a model credential in CI — a budget and a security decision — or the
removal of that guard. The guard is not weakened here and must not be weakened to make a judge fit.
A CI gate that calls a model on every push also spends on every push, against a `$25` monthly model
share and a `$1.00` daily pace, which is the opposite of what a gate is for.

## Owner tasks

- [ ] Countersign this record, or leave it unsigned: the deterministic rubric and its CI step work
      either way, because neither reads `enforcement` from anything.
- [ ] Decide whether a judged eval over edition prose is wanted at all. If it is, it needs its own
      record naming the judge, the per-run and monthly ceiling, and where the credential lives —
      and it will not be a per-push gate.

## Reversal

Delete the CI step and `state/quality/edition-rubric/`. The rubric block in
`config/edition-quality.json` is read only by the grader, so leaving it costs nothing, and the gate
that actually stops editions is untouched in either direction.
