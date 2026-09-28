# Quorum cleanup review · 2026-09-28

The owner's final scope is DNESKAi article production only. The original checklist remains in
Git commit 514797d. This report records changes; outstanding tasks belong in `docs/NEEDED.md`.

## Scope and task triage

GoVIRAL, Marketing Shark, Design Lab and WebDev Signal are paused. Other inactive ventures remain
paused. GoVIRAL records are preserved; the plays library is empty and its latest brief found no
defensible trend. devShark marketing plans will be prepared in advance without BoardlessAI automation.
Inactive work is in `NEEDED-INACTIVE-TASKS.md`; optional improvements are in `MAINTENANCE-BACKLOG.md`.
Completed checklist items, stale launch instructions and decided product questions are removed from
NEEDED. No newsletter, social account setup, analytics, extra source subscription, repo rename or
broader process expansion is required for the article pipeline.

## Implementation

- Registry pauses, cron removal and runtime guards stop retired ventures, including manual live GoVIRAL and Design Lab runs.
- Social-reference and social-publisher GitHub workflows are disabled; their committed job guards also stop execution.
- DNESKAi produces review/2 packages with four headline/image choices. Licensed photos are preferred, with distinct, labelled illustrations filling gaps. Missing or duplicate images keep approval blocked. Legacy reviews retain their original hashes.
- Reviewed-article release stages only the chosen article, without social drafts or social-account dependencies.
- Image allowance is $0.05 per article and up to four generated images per day, within the unchanged $0.10 daily image and company caps.
- Security dependency overrides and Vitest patches address known dependency alerts; alerts must be rechecked after merge.
- Direct meeting-file lookup removes repeated whole-archive scans during static generation. The measured React Compiler overhead is removed. Unreadable-file notices appear only when nonzero.

## External account findings

Apify Starter includes $19 recurring credit; the next invoice is $22.99 with tax. The current $24
limit includes a temporary $5 promotion expiring 16 October. Actual account usage observed was $3.38.
Current Apify callers serve social scouting, not a direct DNESKAi news feed. The shared workflow no
longer receives its token. The subscription and account limit are unchanged; cancellation requires
the owner's instruction. No payment was invented in the owner-maintained treasury ledger.

Vercel quorum-site uses root directory `site` and the standard build machine. On-demand concurrency
was disabled. Git-driven deployments remain disabled in repository configuration; release uses the
existing validated preview/production commands.

The 28 September DNESKAi article exists but its legacy image options are unavailable. A successful
future four-image review and the owner's selection are still required to prove live delivery.
No article or social post has been approved on the owner's behalf.
