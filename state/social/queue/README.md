# Social queue

Validated queue items are immutable JSON files. The publisher ignores this
documentation file and processes only schema-valid `.json` items.

The lifecycle is `draft` → `approved` → `queued` → `publishing`, followed by
`published`, `failed`, `expired`, or `needs_reconciliation`. A human may also
set `cancelled`. PULSE is the only selector, every deterministic check must
pass, and the SHA-256 `content.contentHash` covers the campaign, audience,
destination, UTM data, factual claims, assets, publication window, and copy.
Changing any of those fields after approval invalidates the item.

`content.rendererVersion` is fixed to `carousel-studio-1`. Upstream social contracts
must reference a live template id/version and bounded payload; a freeform visual or
alternate renderer never becomes a valid queue item.

The connector claims an item before making a remote call. An uncertain remote
result becomes `needs_reconciliation`; it is never retried automatically.
