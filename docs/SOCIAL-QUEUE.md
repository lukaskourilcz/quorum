# The social Queue workspace

Version: 2026-09-26

Authority: GitHub #573, #574 and #575 (steps B6, B7 and B8 of `SECOND-HANDOFF-25-9-2026.md`), under the
proposed decision `state/decisions/2026-09-26-devshark-social-queue.md` (`devshark-social-2026-09a`).

`/admin/queue` lists every social post that waits for the owner, and what became of the ones that
no longer wait. The owner can edit a post's text in place, open its graphic in the Design Lab, and
approve it. An approval moves the item to `queued` and wakes the publisher. It does not add a way
to send: the publisher still applies the kill switch, the channel mode, the held connection, the
provider verdict, the per-venture activation and the cadence before it touches a platform.

## One read boundary

`site/src/lib/admin-queue.ts` (`readAdminQueue`) is the only reader. It reads
`state/social/queue/*.json`: queue v2 items as they are, v1 items through the registry's
`legacyQueueMappings`. Alongside the items it reads the post receipts under `state/social/posts/`,
provider health, the pause and kill-switch files, and the owner's events under
`state/social/queue-events/`. It returns bounded view models and two counts: `unreadable` (not
JSON) and `dropped` (JSON that is not a queue item, event or receipt).

| Group | Items |
| --- | --- |
| `waiting` | a queue v2 `draft` with its window still open |
| `scheduled` | `approved` or `queued`, window open, no pause file on the profile or connection; also a legacy v1 `draft` whose checks all pass, which the publisher sends without an approval |
| `sending` | `publishing` |
| `sent` | `published`, with the receipt's permalink |
| `failed` | `failed` and `needs_reconciliation`, with one sanitised reason and the next safe action |
| `held` | `cancelled`, `expired`, any draft or approval whose window closed, and approved items behind a pause |

The publisher treats as due only what an approval made `queued`, plus a legacy v1 draft whose
checks all pass: DNESKAi's pack wrote those before the Queue existed, and they send once their
connection is live, as they always would have. Their card says so and offers hold and reject. A v2
draft is never due, so an unapproved sibling cannot hold up the approved post beside it.

A connection that is not activated yet does not move an item out of `waiting` or `scheduled`. The
card names it instead ("the LinkedIn connection is not activated yet"), so the owner can approve
drafts before the profiles go live. The navigation badge and the Overview's "N posts wait in the
Queue" both count `waiting`.

No file name, credential reference, token value or raw provider payload crosses to the browser. A
frame is addressed as `/admin/api/queue/frame/<itemId>/<slide>`. That owner-only route serves the
committed file under `site/public/social/` that the item's own asset path names. A legacy DNESKAi
item whose frames were never written is re-rendered from its social pack instead. The build traces
`site/public/social` into that one route only.

The site does not depend on the orchestrator, so `site/src/lib/admin-queue/item.ts` mirrors
`CapabilityAwareQueueItemSchema` and `capabilityAwareQueuePayloadHash` by hand. Three shared
fixtures keep the two sides in step. `contracts/fixtures/social-queue-item-v2.valid.json` is a
devShark draft hashed by the orchestrator. `social-queue-item-v2-approved.valid.json` and
`social-queue-event.valid.json` are that draft as the site approves it.
`orchestrator/tests/social-queue-event.test.ts` proves the approved item passes
`assertQueueItemPublishable`. `site/src/lib/admin-queue/item.test.ts` proves the site still
produces exactly those bytes.

## Actions

`POST /admin/api/queue/actions` accepts
`{ action, itemId, expectedContentHash, reason?, edits?: { caption?, altText? }, mode?: "now" | "window" }`.
The route is same-origin and owner-only, and caps the body at 20,000 bytes. A hash that no longer
matches the stored item answers 409. Each accepted action appends one `social-queue-event/1` to
`state/social/queue-events/<timestamp>-<itemId>-<action>.json` and changes the item. Approve, hold
and reject write the event first, so the item never points at evidence that was not written. Edit
and re-render write the event, the superseding item and the cancelled original as one commit, so a
conflict on any of the three writes none of them.

| Action | Applies to | Effect |
| --- | --- | --- |
| `approve` | v2 `draft` or `approved`, window open | Reruns the six deterministic checks: `schema` (the hash matches), `duplicate` (the caption is not already live on the profile), `accessibility` (alt text wherever there are images), `budget` (an approval spends nothing), `capability` (the exact edge in `config/venture-capabilities.json`) and `authority` (the profile and connection belong to the venture and platform). Any failure refuses the approval and names it. So does copy that promises a reward for engagement (below). The owner's approval is the evidence for `brand`, `claims`, `quill`, `keeper` and `policy`. The event id becomes `approvalProvenance.approvalRef`, the status becomes `queued` and the hash is recomputed. `mode: "now"` narrows the window to the next hour, never past its end. |
| `edit` | v2 `draft`, `approved`, `queued` or `failed`, window open | Writes `<id>-r<n>` as a fresh draft with the edited caption or alt text, pending checks and its own hash. The original becomes `cancelled`. An approved item is never changed in place. |
| `hold` | `draft`, `approved`, `queued` (v1 too) | `cancelled`, with the owner's reason. |
| `reject` | as hold, plus `failed` and `expired` | `cancelled`, with the reason recorded as a `tasteNote` addressed to the venture that drafted the item. |
| `rerender` | a marketingShark v2 quiz carousel (`draft`, `approved`, `queued` or `failed`), window open, under the `marketingshark -> design-lab` edge | Reads the Design Lab's saved slide edits, runs marketingShark's caps and the clip gate, and renders the package through the studio's quiz path: a PNG and a JPEG per slide. It writes the frames and a package revision that records their hashes, then behaves like `edit`: `<id>-r<n>` as a fresh draft bound to the revision, with the joined slide alt text, and the original `cancelled`. The event's `changedFields` name `frames`, and `altText` when it changed. Slides that read as the package does send the draft back to the package's own frames. It refuses when nothing changed. It wakes no publisher. |

A revision's name is the first twelve hex of the hash of the base package's hash and the five
slides' words. The LinkedIn, Instagram and Threads drafts of one package therefore share one set of
frames: the first re-render writes them and the next two find the same bytes already there.
Instagram gets the JPEG copies and the other two the PNGs, as the room assigns them. The Design
Lab's "Send to Queue" runs this action for every live draft of the package, one after another.

No approval waives one copy rule. Meta and LinkedIn forbid a reward for engagement, so an edit
whose caption or alt text promises coins, discounts, access or any reward for following, liking,
sharing or commenting is refused, and so is its approval, whatever wrote the copy. The Design Lab's
slide save and `rerender` refuse such a slide too. All of them use `promisesEngagementReward` from the
studio package, the function the marketingShark room's `engagement-reward` gate runs, so the two
cannot disagree. A card whose copy breaks the rule says so before the owner tries to approve it. The
fact sheet's other `neverClaim` entries are judgments rather than patterns; the owner's approval is
the evidence for `claims`.

The caption editor holds each platform to what it accepts: Instagram 2,200 and Threads 500. LinkedIn
takes 3,000, and a single-image LinkedIn post also carries a blank line and the item's tracked link,
so a LinkedIn caption holds 3,000 less that link (2,849 for the fixture draft). The queue v2 schema
lets Threads store 2,200, the old v1 limit, but Threads itself refuses more than 500.

## Persistence

Writes go through the GitHub Contents API when `BOARDLESSAI_GITHUB_TOKEN` is set and to the local
checkout in development, as `caught-up-events-store.ts` does. A deployment without the token shows
the write-disabled banner, keeps every control inert and answers 503 without writing. The store
writes JSON files under `state/social/queue/` and `state/social/queue-events/`, and for a
re-render a package revision under `state/ventures/marketingshark/packages/<date>/<brand>/revisions/`
and frames under `site/public/social/<brand>/<date>/<locale>/<revision>/`. The one other file it
reads is the Design Lab's `state/ventures/carousel-studio/slide-overrides.json`, which it never
writes. It creates an event, a superseding item, a revision or a frame only if the path is new (a
frame or revision already there must hold the same bytes), and replaces an item only against the version
it read: the blob sha on GitHub, the bytes on disk. The publisher pushes its claim before it sends
(`publishing`, see `docs/SOCIAL-PROVIDERS.md`). An owner action saved before that push makes the
claim's rebase conflict, and the run stops without sending. One that reads the item after the push
finds it `publishing`, which no action accepts, and one that read it before the push and saves after
it no longer matches the blob sha and is answered as a conflict.

On GitHub the supersession's one commit goes through the Git Data API: the store reads the branch
head, checks at that commit that the event and the successor do not exist and that the original's
blob sha is still the one it read, builds one tree and one commit on that head, and moves the branch
with `force: false`. A branch that moved in between answers 422, and the owner reads a conflict with
nothing written. In a local checkout every precondition is checked before the first write. Before
this, the three were separate Contents API writes, and a publisher claim that moved the original
between them left the event and the `-r1` draft on the branch beside a live original: the Queue then
hid the original's actions and offered the successor as a second approvable copy. Both directories
sit inside the cycle's `runtime_paths` through `state/social`.

A deployment reads the repository as it stood when it was deployed, like every Admin page. An
action is saved to GitHub at once and the publisher sees it on its next run, but the list shows it
only after the next deploy. Until then the item still reads as it did. Approving it again answers
that the approval is already recorded and wakes the publisher once more; any other action on it is
refused as a conflict, because the version on GitHub has moved on. An edit skips any revision id
already written on GitHub.

## Dispatch on approval

Once an approval is saved on GitHub, `site/src/lib/queue-dispatch.ts` starts the publisher:
`POST /repos/<repository>/actions/workflows/social-publisher.yml/dispatches` with
`{ "ref": "<branch>", "inputs": { "validate_only": "false" } }`, authorised by
`BOARDLESSAI_GITHUB_TOKEN`. The repository and branch are `BOARDLESSAI_GITHUB_REPOSITORY` and
`BOARDLESSAI_GITHUB_BRANCH`, the same settings the store uses. The token needs the Actions write
permission as well as Contents write; that is an owner item in `docs/NEEDED.md`.

The dispatch is a wake-up, not authority. It asks only for what the workflow's "Run workflow" form
offers, and the run applies the kill switch, the channel, the connection, activation, cadence and
every check. The Admin never decides from its own copy of the repository whether a post may send:
that copy is as old as the last deploy, and a connection activated since would read as held there.
A run that finds nothing due sends nothing.

Only `approve` dispatches. Hold, reject and edit never do, and neither does an approval that was
refused or ran into a conflict. The dispatch comes after the item is written, because the run
checks out the branch and must find the item there.

| Outcome | When | What the owner reads |
| --- | --- | --- |
| `dispatched` | GitHub answers 200 (API version 2026-03-10, with the run's details) or 204 (earlier versions) | "Queued. The publisher runs within a few minutes.", with a link to the run when GitHub names it |
| `failed` | 401 or 403 (the token lacks Actions write), 404, 422, any other status, or no answer within 10 seconds | "Queued, but the publisher did not start.", with the reason. The approval stands, the answer is still 201 and the item stays `queued` |
| `skipped` | the approval was saved to a local checkout, or the window has not opened or has closed | why no run was started. A local checkout is never dispatched from, because the publisher reads GitHub |

A failed wake-up is retried by approving the same copy again, which records nothing new, or by
running "Guarded social publisher" from GitHub Actions with `validate_only` off. Either works while
the item's window is open. Nothing runs the publisher on a schedule; see
`docs/SOCIAL-DAILY-OPERATIONS.md`.

Two approvals a minute apart start two runs. The workflow's concurrency group makes the second wait
for the first, and its checkout names `github.ref`, so the second starts from the branch as the first
left it. Checking out the commit its own dispatch named would hide the first run's receipts, and
the second run would send the first post again.

The card shows `sending` and then `sent` once the publisher's commits are in the checkout the Admin
reads: in a local checkout after a pull, and in production at the next deploy. Until then the owner
follows the post through the run link. The target is under five minutes from click to permalink.
The first live run measures it and `docs/NEEDED.md` records the result. Before it publishes, the run
installs dependencies, runs the orchestrator's typecheck and tests, and pushes its claim. A run that
ends with a refused or ambiguous post still commits the item's status, its receipts and the pauses
before the job goes red.

## The Design Lab link

"Open in Design Lab" opens the brand's section. For a marketingShark quiz draft it opens the package
the draft was built from, selected:
`/admin?venture=design-lab&tab=studio&brand=devshark&article=devshark:<package id>:<date>`. The
card's Re-render button runs `rerender` on that one draft; the Design Lab's "Send to Queue" runs it
on every live draft of the package.

The room drafts other kinds on other weekdays (#576): a feature spotlight, a challenge teaser, the
weekly note and the owner's launch announcement. Most of their slides are code's facts, laid out by
the studio's post-deck mapping, so neither the Lab's slide editor nor `rerender` applies to them.
Their captions are edited here with `edit`. A draft is a quiz when it cites a
`marketingshark:question:` ref; the others cite their own subject (`marketingshark:feature:`,
`marketingshark:challenge:`, `marketingshark:week:`, `marketingshark:announcement:`). Their "Open in
Design Lab" link opens the brand's section, Re-render stays disabled, and a `rerender` request is
refused with the reason.

A deployed Admin reads the repository as of its deploy, so a draft a re-render wrote on GitHub, and
its frames, show in the Queue only after the next deploy. The action reads the saved slide edits
from GitHub, not from the deployment's copy.

## Not built here

- **The marketingShark ledger reading taste notes.** Reject events carry them now; the room reads
  them in a later step.

## QA

- `site/src/lib/admin-queue.test.ts`: the loader. A missing directory, counted malformed files, v1
  mapped, v2 read, supersession, failure reasons, pause holds, and no file names or credential
  references in the snapshot.
- `site/src/lib/admin-queue/actions.test.ts` and `site/src/app/admin/api/queue/actions/route.test.ts`:
  the hash guard, approval, the supersede chain, event shape, hold and reject, v1 handling, and the
  write-disabled refusal. The route test also shows a failed wake-up answered as a saved 201.
- `site/src/lib/admin-queue/rerender.test.ts`: the re-render on the package the room drafts for
  2026-09-26 (the committed `contracts/fixtures/marketingshark-*.valid.json`). Frames and the
  revision are written before the event, the draft and the cancellation; the revision hashes to the
  draft's `packageHash`; Instagram gets the JPEGs of the same revision; the new draft can be approved;
  slides edited back point at the package again; nothing changed, a clipping slide, a closed window,
  a missing edge and a draft of another kind are refused with nothing written; in a deployment the
  saved slides are read from GitHub and every write goes there.
- `site/src/lib/admin-queue/dispatch-on-approve.test.ts`: the deployed path against a fake GitHub
  (`fake-github.ts`, the Contents API and the dispatch endpoint). One dispatch after the approved
  item is written; none on hold, reject, edit, refusal or conflict; a failed wake-up named in the
  response with the item still queued; the retry by approving again; no GitHub call for a local
  checkout.
- `site/src/lib/queue-dispatch.test.ts`: the request the wake-up sends, each GitHub answer, the
  skipped cases, and the workflow it starts. That test checks the workflow declares
  `validate_only` as a boolean input, checks out `github.ref` and keeps its concurrency group.
- `site/src/lib/admin-queue/notice.test.ts`: what the card says after an action, and that it links
  only to a GitHub Actions run.
- `site/src/components/admin/queue-panel.test.tsx`: the panel's empty, write-disabled, failed,
  reconciliation, filtered, sent and replaced states.
- `site/tests/e2e/operating-surfaces.spec.ts`, write journey "the Queue edits a draft into a new one,
  approves it and rejects it". It reads the capability map to decide whether the approval must
  succeed or be refused by name.
- `admin-navigation-qa.spec.ts` and `admin-shell.spec.ts` list `/admin/queue` as a canonical
  destination. `admin-panels.spec.ts` checks `/admin/queue` and `/admin/queue?status=held` at 390px
  with axe. `admin-visual-qa.spec.ts` opens the held list at all six widths in both themes.
