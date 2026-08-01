# Manual steps — connect accounts and prove the live paths

`NEEDED.md` is the complete owner checklist. The decisions, admin credentials, model
keys and Caught Up App installation are already done. The steps below verify plumbing;
they are not content-approval gates.

## 1. Finish the remaining account connections

1. Add MMA Files to the existing delivery GitHub App if it is not already selected.
   Keep Contents read/write as the only write permission. The App ID and private key
   remain BoardlessAI Actions secrets; do not copy them into either consumer app.
2. Confirm MMA Files Vercel production tracks `main`, uses
   `NEXT_PUBLIC_SITE_URL=https://mma-files.vercel.app`, and remains in demo/noindex
   mode.
3. Add `PEXELS_API_KEY` and `PIXABAY_API_KEY` if you want their photo libraries in the
   licensed-image search. Openverse and Commons need no key; missing keys fall back to
   FRAME art without blocking an article.
4. Add the three brands’ Instagram and Threads tokens/IDs from `NEEDED.md`. Keep
   `SOCIAL_KILL_SWITCH=true` during account validation.

## 2. Prove Caught Up delivery

Run **Guarded council cycle** for `cu-edition` with dry mode off and delivery-only off.
The mode step must say `dry=false` and `skip=false`. A successful path now:

1. creates the English and Czech article with exactly one licensed photo or FRAME
   fallback;
2. commits the two image sizes into `lukaskourilcz/aifirst`;
3. deploys the newest article as the home-page hero and older ones as thumbnails;
4. polls CI and both public language routes for up to 30 minutes;
5. records the content hash, image dimensions and attribution in a release proof.

If delivery fails after production, rerun the same phase with dry mode off and
delivery-only on. That retry reuses the package and makes no model call. If the
automated verifier fails twice, it reverts the target commit and pauses Caught Up.

Then run `morning` and `cu-product` once with dry mode off to populate the normal
product path. Afternoon and night are `$0` checkpoints.

## 3. Prove FightAIQ and MMA Files delivery

Keep `FIGHTAIQ_ANALYSIS_ENABLED=false`. With the data and newsroom switches enabled,
run:

1. `mma-intake` — saves sourced UFC/Oktagon data and delivers the public FightAIQ file
   to MMA Files;
2. `mag-editorial` — assigns or evidence-kills both article slots;
3. the assigned `article-am` or `article-pm` — produces, delivers and verifies one
   bilingual article plus its image;
4. `mag-desk` — exercises the desk room when manually requested.

Missing source evidence must kill the article before a model call. Successful article
delivery receives the same CI, route, content-hash, image and attribution proof as
Caught Up. A verifier failure retries once, then reverts and pauses only MMA Files.

## 4. Prove every boardroom without spending

Run `pnpm proof:rooms`. It dispatches every room kind with `fixture: true`, saves the
visible records and labels them as tests. This proves routing, contracts, calendar
projection and room pages; it does not claim a live provider decision.

Scheduled windows are wake-ups, not guaranteed paid meetings. The 06:00 board chooses
from the priority queue and may commission a focused specialist room. Empty or
unsupported work becomes `not-needed`, `NO_EDITION`, a killed slot or a reasoned
`why-not` at `$0`.

## 5. Validate social readiness without posting

Run **Guarded social publisher** with **Validate only** selected. The daily evaluator
shows these counters in `/admin` and the digest:

- Caught Up: seven consecutive passed release proofs; `NO_EDITION` is neutral.
- MMA Files: ten consecutive passed article proofs with no unresolved failure.
- Titty Tuesdays: four complete approved campaigns, credentials and the tested safety
  checker.

When the accounts are correct and you want the pre-authorized project gates to post,
set `SOCIAL_KILL_SWITCH=false`. The global switch remains the immediate owner stop.
Every post is idempotent, verified live and retried once; a second failure pauses only
that project. Titty Tuesdays posts on Prague Tuesdays and uses typographic graphics,
never people photography.

## 6. Leave the human-only boundaries closed

Do not enable FightAIQ analysis until a separate mode-change decision is signed. Keep
MMA Files noindex until name, corrections, operator and privacy details are ready.
Budget raises, commerce, payments, ads, personal data and legal posture remain manual
owner decisions; no live switch can authorize them.
