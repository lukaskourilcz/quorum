# Social queue events

One `social-queue-event/1` file per owner decision on a queue item, written only by the Admin
Queue (`/admin/queue`, #573). The schema is `contracts/social-queue-event.schema.json`, and
`docs/SOCIAL-QUEUE.md` describes the workspace.

Files are named `<timestamp>-<itemId>-<action>.json` and are never rewritten. Each binds the
content hash the owner was shown. An `approve`, `hold` or `reject` event is written before the item
it changes; an `edit` or `rerender` event lands in one commit with the superseding item and the
cancelled original, so none of the three exists without the others.

- `approve` names the approved window and hash; its id is the item's `approvalRef`.
- `edit` names the superseding `<id>-r<n>` item and the fields that changed (`caption`,
  `altText`).
- `rerender` (#575) names the superseding `<id>-r<n>` item, bound to a package revision under
  `state/ventures/marketingshark/packages/<date>/<brand>/revisions/`, and its `changedFields`
  include `frames` (and `altText` when the slides' alt text changed).
- `hold` and `reject` carry the owner's reason; a rejection also carries a taste note for the
  venture that drafted the item.

Readers parse each file or drop it and count it. No event sends anything.
