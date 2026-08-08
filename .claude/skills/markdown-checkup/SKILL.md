---
name: markdown-checkup
description: Review every markdown file in the repo and clean stale info, update changes, or verify each is still accurate.
---

# markdown-checkup

Review **every** markdown file in the repo and, for each, either clean out
information that is no longer relevant, update what has changed, or confirm it is
still accurate and on point.

Never rewrite these. Report them and move on:

- `state/decisions/*.md` and any dated `docs/*AUDIT-*.md` or `docs/REVIEW-*.md`
  are append-only records. A superseded figure in one of them is correct history
  (GOVERNANCE.md, "Historical decision records are append-only evidence"). Once
  the work a record describes is finished and its findings are folded into the
  standing docs, retire the whole file rather than editing it — git keeps the trail.
- Any skill folder holding an `UPSTREAM.md` is vendored. Re-vendor from source;
  never hand-edit.
- Every file under `.claude/skills/<name>/` that is mirrored in
  `.agents/skills/<name>/` must stay byte-identical. Edit both or `pnpm test`
  fails.

Pay special attention to:

- the owner document (`docs/NEEDED.md` here, `NEEDED.md` in the magazines) — remove done
  items, keep the marker format (below) intact.
- `about-project.md` — the tech stack must match the actual code/manifests.
- `scaling.md` — cost/scaling only (no stack); prices dated and honest.
- `monetization.md` — options and likelihoods still realistic.

Report a short per-file verdict: kept / updated / trimmed, with what changed.

## Marker format (shared across all repos)

`- [ ] **Title** — desc. [imp:1-5] [owner:me|ai] [time:30m] [kind:K]`
`[kind:K]` ∈ `setup` `deploy` `legal` `content` `decision`.
