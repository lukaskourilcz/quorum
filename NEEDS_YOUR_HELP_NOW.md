# Needs your help now

The build and fixture proof are complete. Only owner-controlled account plumbing
remains; content approval is not required.

1. Add the Instagram and Threads account IDs and access tokens for Caught Up, MMA
   Files and Titty Tuesdays. Exact variable/secret names are in `NEEDED.md`.
2. Add `PEXELS_API_KEY` and `PIXABAY_API_KEY` if you want those licensed-photo
   libraries. Openverse, Commons and the FRAME fallback already work without them.
3. Confirm `lukaskourilcz/mma-files` is selected in the delivery GitHub App and its
   Vercel production project remains connected to `main` in demo/noindex mode.
4. If a live workflow names another missing secret, add only that exact secret and
   rerun its validation or delivery-only path. No other missing secret is known now.

The safe order and automated proof behavior are in `MANUAL STEPS.md`.

## SOCIAL-PLATFORM-CREDENTIALS

Add the Instagram and Threads account IDs and access tokens as GitHub Actions secrets/variables for each brand. Missing now: caught-up: CAUGHT_UP_THREADS_ACCESS_TOKEN, CAUGHT_UP_THREADS_USER_ID, CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN, CAUGHT_UP_INSTAGRAM_USER_ID; mma-files: MMA_FILES_THREADS_ACCESS_TOKEN, MMA_FILES_THREADS_USER_ID, MMA_FILES_INSTAGRAM_ACCESS_TOKEN, MMA_FILES_INSTAGRAM_USER_ID; titty-tuesdays: TITTY_TUESDAYS_THREADS_ACCESS_TOKEN, TITTY_TUESDAYS_THREADS_USER_ID, TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN, TITTY_TUESDAYS_INSTAGRAM_USER_ID. The per-venture gates remain locked and no post is attempted.
