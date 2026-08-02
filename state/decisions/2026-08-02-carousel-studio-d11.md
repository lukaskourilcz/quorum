# Carousel Studio founding and shared render engine

Date: 2026-08-02

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `D11`

## Owner direction

- Found Carousel Studio as the sixth project by direct owner decision. Its stable
  slug is `carousel-studio`; its display name stays configurable.
- Keep the engine inside this monorepo. Content pipelines call it while they build a
  post. Reader sites remain bounded consumers and never orchestrate rendering.
- Express each social visual as a live template id, semantic version and content
  payload. Remove freeform social-image instructions from every producer contract.
- Use deterministic SVG and PNG rendering from saved template data and brand tokens.
  The renderer cannot call a model or image provider.
- Start with ten original layouts. EASEL may author original template data after
  MOTIF records cited textual observations. KEEPER blocks copied designs, downloaded
  inspiration imagery and restricted-platform crawling.
- Run the studio room at 13:00 Europe/Prague only when a due agenda exists. Its paid
  envelope is `$0.06`; an empty agenda costs `$0`.
- Let passing schema, safe-area, contrast, token and overflow checks move a version
  to `live`. Owner ratings remain advisory. The owner may deprecate a version at any
  time; no process deletes it.
- Publish an English project gallery and fixture Socials showcase. Carousel Studio
  has no social account, marketing activity or visitor measurement.

## Money boundary

Carousel Studio is an internal engine and has no Q1 earning method. A future owner
may approve extraction into a standalone product. That possibility stays `locked`.

## Authority and approval reference

This decision does not enable social posting. Project unlock counters, account
health checks, platform credentials and `SOCIAL_KILL_SWITCH` still control posting.

Owner approval reference: the Carousel Studio implementation prompt supplied by
Lukas Kouril and the direct instruction to complete and publish it on 2026-08-02.
