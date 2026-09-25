# The social Queue workspace

Version: 2026-09-26

Authority: GitHub #573 (step B6 of `SECOND-HANDOFF-25-9-2026.md`), under the proposed decision
`state/decisions/2026-09-26-devshark-social-queue.md` (`devshark-social-2026-09a`).

`/admin/queue` lists every social post that waits for the owner, and what became of the ones that
no longer wait. The owner can edit a post's text in place, open its graphic in the Design Lab, and
approve it. An approval moves the item to `queued`. It does not add a way to send: the publisher
still applies the kill switch, the channel mode, the held connection, the provider verdict, the
per-venture activation and the cadence before it touches a platform.

## One read boundary

`site/src/lib/admin-queue.ts` (`readAdminQueue`) is the only reader. It reads
`state/social/queue/*.json`: queue v2 items as they are, v1 items through the registry's
`legacyQueueMappings`. Alongside the items it reads the post receipts under `state/social/posts/`,
provider health, the pause and kill-switch files, and the owner's events under
`state/social/queue-events/`. It returns bounded view models and two counts: `unreadable` (not
JSON) and `dropped` (JSON that is not a queue item, event or receipt).

| Group | Items |
| --- | --- |
| `waiting` | `draft` with its window still open |
| `scheduled` | `approved` or `queued`, window open, no pause file on the profile or connection |
| `sending` | `publishing` |
| `sent` | `published`, with the receipt's permalink |
| `failed` | `failed` and `needs_reconciliation`, with one sanitised reason and the next safe action |
| `held` | `cancelled`, `expired`, any draft or approval whose window closed, and approved items behind a pause |

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
matches the stored item answers 409. Each accepted action first appends one `social-queue-event/1`
to `state/social/queue-events/<timestamp>-<itemId>-<action>.json`, then changes the item. The item
never points at evidence that was not written.

| Action | Applies to | Effect |
| --- | --- | --- |
| `approve` | v2 `draft` or `approved`, window open | Reruns the six deterministic checks: `schema` (the hash matches), `duplicate` (the caption is not already live on the profile), `accessibility` (alt text wherever there are images), `budget` (an approval spends nothing), `capability` (the exact edge in `config/venture-capabilities.json`) and `authority` (the profile and connection belong to the venture and platform). Any failure refuses the approval and names it. The owner's approval is the evidence for `brand`, `claims`, `quill`, `keeper` and `policy`. The event id becomes `approvalProvenance.approvalRef`, the status becomes `queued` and the hash is recomputed. `mode: "now"` narrows the window to the next hour, never past its end. |
| `edit` | v2 `draft`, `approved`, `queued` or `failed`, window open | Writes `<id>-r<n>` as a fresh draft with the edited caption or alt text, pending checks and its own hash. The original becomes `cancelled`. An approved item is never changed in place. |
| `hold` | `draft`, `approved`, `queued` (v1 too) | `cancelled`, with the owner's reason. |
| `reject` | as hold, plus `failed` and `expired` | `cancelled`, with the reason recorded as a `tasteNote` addressed to the venture that drafted the item. |
| `rerender` | none yet | Answers 501. The Design Lab's devShark editing (#575, B8) builds it and then behaves like `edit`. |

The caption editor holds each platform to what it accepts: LinkedIn 3,000 characters, Instagram
2,200, Threads 500. The queue v2 schema lets Threads store 2,200, the old v1 limit, but Threads
itself refuses more than 500.

## Persistence

Writes go through the GitHub Contents API when `BOARDLESSAI_GITHUB_TOKEN` is set and to the local
checkout in development, as `caught-up-events-store.ts` does. A deployment without the token shows
the write-disabled banner, keeps every control inert and answers 503 without writing. The store
writes only JSON files under `state/social/queue/` and `state/social/queue-events/`. It creates an
event or a superseding item only if the path is new, and replaces an item only against the version
it read: the blob sha on GitHub, the bytes on disk. A publisher claim made in between turns the
owner's action into a conflict instead of being overwritten. Both directories sit inside the
cycle's `runtime_paths` through `state/social`.

A deployment reads the repository as it stood when it was deployed, like every Admin page. An
action is saved to GitHub at once and the publisher sees it on its next run, but the list shows it
only after the next deploy. Until then the item still reads as it did. Approving it again answers
that the approval is already recorded; any other action on it is refused as a conflict, because the
version on GitHub has moved on. An edit skips any revision id already written on GitHub.

## Not built here

- **Dispatch on approval (#574, B7).** An approved item waits for the next publisher run.
- **Re-render and per-item Design Lab links (#575, B8).** "Open in Design Lab" opens the brand's
  section. The article-level deep link arrives with B8.
- **The marketingShark ledger reading taste notes.** Reject events carry them now; the room reads
  them in a later step.

## QA

- `site/src/lib/admin-queue.test.ts`: the loader. A missing directory, counted malformed files, v1
  mapped, v2 read, supersession, failure reasons, pause holds, and no file names or credential
  references in the snapshot.
- `site/src/lib/admin-queue/actions.test.ts` and `site/src/app/admin/api/queue/actions/route.test.ts`:
  the hash guard, approval, the supersede chain, event shape, hold and reject, v1 handling, and the
  write-disabled refusal.
- `site/src/components/admin/queue-panel.test.tsx`: the panel's empty, write-disabled, failed,
  reconciliation, filtered, sent and replaced states.
- `site/tests/e2e/operating-surfaces.spec.ts`, write journey "the Queue edits a draft into a new one,
  approves it and rejects it". It reads the capability map to decide whether the approval must
  succeed or be refused by name.
- `admin-navigation-qa.spec.ts` and `admin-shell.spec.ts` list `/admin/queue` as a canonical
  destination. `admin-panels.spec.ts` checks `/admin/queue` and `/admin/queue?status=held` at 390px
  with axe. `admin-visual-qa.spec.ts` opens the held list at all six widths in both themes.
