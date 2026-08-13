# Upstream

- Source: https://github.com/coreyhaines31/marketingskills (`skills/ai-seo`)
- Commit: `7868cb9251fad80a73d26e488a5ad5f6c4a9f335` (v2.10.0)
- License: MIT (see `LICENSE`) — Copyright (c) 2025 Corey Haines

Vendored and mirrored byte-for-byte into `.agents/skills/ai-seo/`. The sole local adaptation
replaces a link to the upstream tools registry, which is not included in this subset, with an
explicit environment and approval boundary. Re-vendor from upstream rather than hand-editing; edit both copies in the same
commit, because `orchestrator/tests/architecture.test.ts` fails on any drift.

This is generic marketing advice. **This repository's own contracts always win**
where the two disagree — the $30 all-in operating cap, the social triple-lock, the
truth gates and the treasury rules are not negotiable by a vendored skill.

Its workflow is manual and free; ignore the optional paid-tool mentions. Note that
both magazines are deliberately `noindex` today, so this is preparation rather than
a current tactic.
