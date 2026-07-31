# Live shift record projection

Date: 2026-07-31

Owner: Lukas Kouril

Status: Accepted and implemented

## Decision

Three-shift runtime activation must produce real, bounded council work rather
than a deterministic preflight artifact. Each non-dry Morning, Afternoon and
Night cycle collects one structured public position from VIZE, FORGE, PULSE and
AUDIT. LEDGER records the actual API cost. The runtime creates a sanitized,
timestamped boardroom transcript and commits it under `state/standups/`.

The public site reads that committed projection at build time. It places live
records before the founding fixture in the episode index, Boardroom table,
homepage links, public log, feeds and sitemap. Three shifts from one date have
distinct route IDs, so every replay stays directly accessible.

## Boundaries

- Only items in `config/internal-work-queue.json` may be planned.
- The queue is internal maintenance and observability work only.
- It cannot authorize market research, spending, external publishing, account
  changes, credentials, business-stage changes or autonomous code changes.
- Public records contain concise position summaries and recorded send times,
  never raw prompts, private reasoning or secrets.
- The hobby / non-commercial decision remains fully in force.

## Scheduler repair

GitHub Actions had retained the previous AM/PM cron payload after the workflow
source changed. The workflow continues to reject that unknown payload
fail-closed. The active workflow must be disabled and re-enabled once this
release reaches `main`, so GitHub registers only the three Prague shift crons.
