# Upstream

- Source: https://github.com/coreyhaines31/marketingskills (`skills/social`)
- Commit: `7868cb9251fad80a73d26e488a5ad5f6c4a9f335` (v2.10.0)
- License: MIT (see `LICENSE`) — Copyright (c) 2025 Corey Haines

Vendored verbatim and mirrored byte-for-byte into `.agents/skills/social/`.
Re-vendor from upstream rather than hand-editing; edit both copies in the same
commit, because `orchestrator/tests/architecture.test.ts` fails on any drift.

This is generic marketing advice. **This repository's own contracts always win**
where the two disagree — the $30 all-in operating cap, the social triple-lock, the
truth gates and the treasury rules are not negotiable by a vendored skill.

## One divergence, recorded rather than edited

`references/reverse-engineering.md` opens its SCRAPE step by suggesting Apify or
PhantomBuster for collecting competitors' posts. That step is superseded here:
BoardlessAI owns a quota-guarded Apify pipeline (`config/goviral-sources.json`,
`orchestrator/src/sources/apify.ts`) whose Free-plan credit is the budget guard,
and nothing may open a second account or a second billing surface against it. In an
interactive session, use the manual collection paths the same file describes.

`references/carousel-frameworks.md` carries five slide-by-slide carousel
architectures. They are also design input for future Carousel Studio templates —
as a reference for a human designing one, never as bytes to copy.
