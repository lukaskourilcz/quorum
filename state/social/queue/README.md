# Social queue

A queue item's content is immutable: `content.contentHash` binds it, and a change of copy, frames or
target is a new item that supersedes the old one. Its status and approval provenance do change in
place, through the owner's events in `../queue-events/` and through the publisher's claim and
receipts. The publisher ignores this documentation file and processes only schema-valid `.json`
items. The four committed records remain queue v1 evidence and
are migrated in memory through the explicit mapping in `config/social-publisher-registry.json`;
their source hash and mapping reference are preserved. New writers use capability-aware queue v2.
marketingShark writes three v2 drafts per devShark package, `<date>-devshark-en-<platform>.json` for
LinkedIn, Instagram and Threads, each bound to devShark's own profile and carrying the package hash.
DNESKAi's edition pack writes two per published edition since #583, `<date>-cs-instagram.json` and
`<date>-cs-threads.json`, bound to DNESKAi's own profile and connection and carrying the hash of
`../packs/<date>.json`. Every check on them stays `pending` until the owner approves them. A v1 file
written today would count as migration evidence and fail the audit's pinned totals, which is how
the post-cycle gate caught the pack still writing v1 after #563.

The lifecycle is `draft` → `approved` → `queued` → `publishing`, followed by
`published`, `failed`, `expired`, or `needs_reconciliation`. A human may also
set `cancelled`. Only a `queued` item is due, plus a legacy v1 draft whose checks all pass (the
committed four, whose windows closed in August). The
publisher's claim phase writes `publishing` with its attempt and pushes it before any provider is
called; a claim that never finished stays `publishing` and is never sent again by itself.

The owner acts on these files only through the Admin Queue (`/admin/queue`, #573,
`docs/SOCIAL-QUEUE.md`). Each action appends a `social-queue-event/1` under `../queue-events/`.
An approval sets `queued`, passes every check and writes the event id into
`approvalProvenance.approvalRef`. An edit or a re-render writes a new `<id>-r<n>` draft and cancels
the original in the same commit. A hold or a rejection cancels with a reason. No action accepts a
`publishing` item. Every deterministic check must pass, and the SHA-256
`content.contentHash` covers the source release/campaign, exact profile/connection target,
capability/policy/approval provenance, audience, destination, UTM data, factual claims, assets,
publication window and copy.
Changing any of those fields after approval invalidates the item.

`content.rendererVersion` is fixed to `carousel-studio-1`. Upstream social contracts
must reference a live template id/version and bounded payload; a freeform visual or
alternate renderer never becomes a valid queue item.

Queue v2 permits only `publish-original` to `primary | umbrella | amplifier`. There is no generic
`sister`, engagement, account, browser, DM, ad, purchase or contest action. A profile/connection
record never grants authority by itself.

The connector checks its idempotency seam before each bounded attempt. An uncertain result that
still cannot be reconciled becomes `needs_reconciliation`, pauses the connection and is never
failed over to another provider or connection.
