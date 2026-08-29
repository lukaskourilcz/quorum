# Free worst-day capacity for the Kvórum desk

Date: 2026-08-12

Drafted: 2026-08-29, from the launch review

Decider: owner countersignature pending

Status: pending countersignature

Decision id: `budget-2026-08g`

Signature / explicit approval reference: ____________________

Freed worst-day capacity USD: $0.08

Sources: `state/decisions/2026-08-12-kvorum-founding.md`, `budget-2026-08f`, GitHub #470

## Why this record exists at all

Kvórum is built. The monitor, the clustering, the truth gates, the content gates, the desk and the
TRIBUN prompts are all implemented and tested, and the venture has never held a single meeting. It
is held by two separate countersignatures, and this is the second one.

The first is its founding. The second is this: a daily room costs money on the day it runs, and the
worst day of the month is the one where every scheduled room opens at once. Kvórum's `kv-desk`
envelope is `$0.10`, of which the gate requires at least `$0.08` to have been freed by a recorded
reallocation before the desk may run live. That requirement is not a formality — it is the
difference between adding a room and admitting what another room will stop doing to pay for it.

The gate reads this file. Until the status line says `countersigned` and the signature line is
filled, `kv-desk` is dropped from the schedule and every slot records a `$0` skip naming the gate,
which is what `state/meetings/skips/2026-08-28-kv-desk.json` shows today.

## The reallocation

`tt-marketing` — the Titty Tuesdays marketing room, daily at 11:00, envelope `$0.08` — is held for
the launch period by the operations decision drafted beside this one. That hold frees exactly
`$0.08` of worst-day capacity, which is the amount this gate requires.

The two records are deliberately one story. Holding a room and founding a room are the same
decision seen from either end, and signing one without the other would either fund Kvórum from
capacity nobody released or release capacity nothing uses.

| | Room | Cadence | Envelope |
| --- | --- | --- | --- |
| Freed | `tt-marketing` | daily 11:00 | `$0.08` |
| Claimed | `kv-desk` | daily 21:00 | `$0.10`, of which `$0.08` is covered here |

The remaining `$0.02` of Kvórum's envelope sits inside the existing model share and is not a
reallocation: the `$25` monthly share and the `$1.00` daily pace from `budget-2026-08f` are
unchanged, and no cap moves in either direction.

## What this does not authorize

- No source. The Štít demokracie page and the seven Czech feeds each need their own approval —
  `KV-APIFY-001` and `KV-SOURCES-002` — and both still fail closed without them.
- No spend beyond the envelope. The runtime daily pre-flight remains authoritative and may tighten
  this ceiling; it may never raise it.
- No account, credential, channel or publishing path. Kvórum has none in this repository and this
  record creates none.
- No editorial authority. `KV-EDITORIAL-004` is a separate countersignature.
- Not the founding. `state/decisions/2026-08-12-kvorum-founding.md` is still pending, and the desk
  needs both.

## Reversal

Unsigning is a one-line edit to the status. The desk drops out of the schedule on the next run and
records a skip; nothing is deleted and no recorded recommendation is withdrawn. If `tt-marketing`
resumes before Kvórum is retired, the freed capacity is gone and this record needs replacing rather
than amending — a reallocation that outlives its source is a cap raise with extra steps.
