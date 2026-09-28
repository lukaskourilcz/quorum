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
- Security dependency overrides and Vitest patches reduced GitHub alerts from 23 (including six high) to eight (six moderate, two low). The remaining alerts concern Undici 5.29.0 in the pinned Vercel CLI/build-tool dependency tree; follow-up is in MAINTENANCE-BACKLOG.md.
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

The earlier 28 September legacy review retains its unavailable images. The new live review has
four usable images; the owner's selection is still required to prove delivery.
No article or social post has been approved on the owner's behalf.

The live authenticated Queue successfully read the current 28 September article. The old blanket token-renewal task was removed; write/dispatch permissions remain to be proved by the first real owner approval. No test approval was fabricated. Optional missing photo-provider keys now stay in image reports rather than being automatically appended as required tasks.


## Release verification

PR #594 is merged. Commit `6015d105a3f1f321e345d85226846eae39b08f42` passed the full local release gate: 4,715 tests, lint, type checks, production build, and the route/link smoke check. GitHub CI also passed. The preview was checked in Chrome; production was released using the guarded local prebuilt command at 13:13 UTC on 28 September.

Production: https://boardless-ai.vercel.app
Deployment: https://quorum-site-6cs9nmkn2-lukas-kourils-projects.vercel.app

The deployed homepage names DNESKAi as its single active project. The authenticated Queue describes four headline/image choices and keeps social drafts archived. No owner approval was submitted.

The existing fal.ai account has $9.60 credit and had zero requests in the preceding seven days. Older successful illustration requests confirm prior use. No new key, account or credit purchase was needed for this inspection. Guarded live run [36427134977](https://github.com/lukaskourilcz/quorum/actions/runs/36427134977) tests the updated provider path.

The live run produced review/2 `b88ee16bedabc7ad3107896ec5dafbe7284aaf15db7e705bab08023558f0c486`, with four distinct titles, one licensed Pexels photo and three fal.ai illustrations. All four images passed the existing vision gate without vetoes and have distinct image bytes. The live Queue displays all four thumbnails, each loaded at 640×360; a browser screenshot confirmed the previews. Fal.ai recorded three completed requests and zero errors, with $9.59 credit afterward. No new credentials or extra credit were required.

The production error-log query for this deployment returned zero entries in the first 15-minute window. This is a bounded release check, not a claim of continuous monitoring. The older incomplete review remains available; only the owner may reject it or choose and approve the new article.

The verification cycle recorded $0.1932745 in model/image spend; the day total became $0.533814, below the existing $1 daily cap. Documentation checks passed after completed release and image-verification tasks were removed from NEEDED.

The live workflow completed successfully. Its final social-activation refresh re-added an obsolete Instagram/Threads setup task, so that step was removed from the article cycle and the regenerated task was removed. Social scouting, posting and activation refreshes are now all outside the recurring article workflow.
