# Social queue events

One `social-queue-event/1` file per owner decision on a queue item, written only by the Admin
Queue (`/admin/queue`, #573). The schema is `contracts/social-queue-event.schema.json`, and
`docs/SOCIAL-QUEUE.md` describes the workspace.

Files are named `<timestamp>-<itemId>-<action>.json` and are never rewritten. An event is written
before the item it changes, and binds the content hash the owner was shown:

- `approve` names the approved window and hash; its id is the item's `approvalRef`.
- `edit` names the superseding `<id>-r<n>` item and the fields that changed.
- `hold` and `reject` carry the owner's reason; a rejection also carries a taste note for the
  venture that drafted the item.

Readers parse each file or drop it and count it. No event sends anything.
