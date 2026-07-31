# Caught Up social packs

Each successful live Caught Up edition writes one
`YYYY-MM-DD.json` `social-pack/1` record here. The record contains separate
English and Czech Instagram captions, Threads copy, destinations, carousel
paths, alt text and provenance.

The protected `/admin` page reads these files as the canonical social-content
archive. Carousel WebP files live under `site/public/social/<date>/<locale>/`;
queue lifecycle records live in `state/social/queue/`. The admin is read-only,
and no pack authorizes publication while the social kill switch remains on.
