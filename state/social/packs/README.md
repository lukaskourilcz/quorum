# Caught Up social packs

Each successful live Caught Up edition writes one
`YYYY-MM-DD.json` `social-pack/1` record here. The record contains Instagram and Threads copy,
destinations, carousel paths, alt text and provenance only for locales the edition actually
carries. DNESKAi currently carries Czech only; legacy bilingual records remain valid history.

The protected `/admin` page reads these files as the canonical social-content
archive. Carousel PNG files rendered from live Carousel Studio templates live under
`site/public/social/<date>/<locale>/`;
queue lifecycle records live in `state/social/queue/`. The admin is read-only,
and no pack authorizes publication while the social kill switch remains on.
