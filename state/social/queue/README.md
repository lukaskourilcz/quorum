# Social queue

Validated queue items are immutable JSON files. The publisher ignores this documentation file and
processes only schema-valid `.json` items. The four committed records remain queue v1 evidence and
are migrated in memory through the explicit mapping in `config/social-publisher-registry.json`;
their source hash and mapping reference are preserved. New writers use capability-aware queue v2.

The lifecycle is `draft` → `approved` → `queued` → `publishing`, followed by
`published`, `failed`, `expired`, or `needs_reconciliation`. A human may also
set `cancelled`. Every deterministic check must pass, and the SHA-256
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
