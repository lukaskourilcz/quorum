# Social campaign evidence

This directory stores immutable `social-campaign/1` records and
`social-campaign-generation-decision/1` records created from verified venture releases.

Campaign files use `<social-campaign-id>.json`. Generation decisions use
`<social-campaign-decision-id>.decision.json`. A repeated idempotency key must resolve the same
record; a same-path content conflict is refused.

The directory contains no draft-release, public-scrape, relationship or Contest Radar fallback.
An empty directory means no verified campaign has been created.
