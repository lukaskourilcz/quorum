# NEEDED — things only Lukas can finish

The code, dry rooms and guarded storage are shipped. This list contains only steps
that need your account, secret, legal judgment, content review or explicit signature.
Vercel Pro is confirmed; there is no Hobby-plan task.

Never paste a credential into Git, an issue, a meeting record or chat. Put secrets in
GitHub Actions or Vercel only.

## Why the test meetings were empty

`dry=true` is a safety proof, not a rehearsal that creates real work. A dry meeting
makes no provider call, writes only under `tmp/dry-run/state`, never commits canonical
state and deliberately gives its agents no live contribution. The incubator also
rejects every proposal without a real source reference. You do not pair the 38 roles
one by one: the meeting router assigns them automatically after the provider accounts,
source accounts, approval records and project switches below are connected.

## Exact first-live sequence

1. Countersign the decisions in the next section, commit them to `main`, and rotate the
   two model keys.
2. Add the required GitHub Actions **secrets** and **repository variables** below.
   Secrets alone do not authorize a live run; the matching repository switch must
   already be `true`.
3. Open **Actions → Guarded council cycle → Run workflow**, choose one phase and turn
   **dry off**. In `Resolve guarded cycle mode`, require `dry=false` and `skip=false`.
   `dry=true`, `skip=true` or a `PAUSED` result means a gate is still missing.
4. Caught Up already has `CAUGHT_UP_LIVE_ENABLED=true`. Run `cu-edition` with dry off
   and **delivery only off** to create a new edition. Review the `cycle(...)` commit,
   EditionPackage, delivery receipt, bilingual articles and `aifirst` deployment. If a
   package was created but only delivery failed, rerun `cu-edition` with dry off and
   **delivery only on**; that retry makes no model call. Then run `morning` with dry off
   so SPARK can create the canonical Caught Up product idea, followed by `cu-product`.
   Run `afternoon` and `night` once as the final company-room check.
5. Set `PORTFOLIO_LIVE_ENABLED=true`; run `incubator-scan` before
   `incubator-synthesis`. The scan now saves a guarded source packet, so synthesis can
   keep source-backed ideas. Then run `tt-marketing`.
6. Complete the repository-app and MMA Files Vercel steps below. Add
   `THE_ODDS_API_KEY` and `CITO_API_KEY`, set `FIGHTAIQ_LIVE_ENABLED=true` and
   `MMA_FILES_LIVE_ENABLED=true`, then run `mma-intake`. The room saves a guarded,
   normalized UFC snapshot and sends the latest FightAIQ content file to MMA Files. It
   will not promote a one-source claim into a verified fighter file; complete the
   second-source review in admin. Keep `FIGHTAIQ_ANALYSIS_ENABLED=false` until the
   separate mode-change decision.
7. With `MMA_FILES_LIVE_ENABLED=true`, run `mag-editorial`, `article-am`, `article-pm`,
   then `mag-desk`. Each published article is delivered to MMA Files automatically. Missing
   evidence correctly kills an article slot at $0. A delivery retry can use dry off plus
   **delivery only on** for the matching article phase and makes no model call.
8. Once each manual live run has produced and pushed the expected canonical artifacts,
   leave its switch on for the Prague schedule. Keep `SOCIAL_KILL_SWITCH=true`.

## Do these before any live run

- [x] **Sign the one $50 limit** — countersigned in `state/decisions/2026-08-04-budget-fifty.md` (`budget-2026-08d`). The $50 all-in limit, $42 model monthly share and $2.20 daily pace are now recorded. [imp:5] [owner:me] [time:5m] [kind:decision]
- [x] **Sign the FightAIQ founding record** — countersigned in `state/decisions/2026-08-02-fightaiq-founding.md`. This approves its data-only scope, not betting, affiliates or live public probabilities. [imp:5] [owner:me] [time:5m] [kind:decision]
- [x] **Sign the Titty Tuesdays founding record** — countersigned in `state/decisions/2026-08-01-titty-tuesdays-founding.md`. This approves planning, not commerce, stock, payments, ads or publishing. [imp:5] [owner:me] [time:5m] [kind:decision]
- [x] **Rotate both model keys** — the owner confirmed that `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` were rotated and replaced in GitHub Actions on 2026-08-01. Keep provider billing alerts below the signed BoardlessAI limit. [imp:5] [owner:me] [time:20m] [kind:setup]
- [ ] **Approve the unfinished portraits or leave them blank** — 27 of 38 agents have portraits. The 11 new FightAIQ/MMA Files roles intentionally use the text fallback until you approve the image spend and generation. Never book an unknown image-tool charge as zero. [imp:2] [owner:me] [time:5m] [kind:decision]

## Private admin and Git-backed writes

- [ ] **Configure `/admin` in Vercel Production** — add a unique `ADMIN_USER` and long random `ADMIN_PASSWORD`, redeploy, then confirm `/admin` returns `401` without credentials and `200` after login. Missing config returns `503` on purpose. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Give admin a narrow GitHub writer** — create a fine-grained token limited to Contents read/write on `lukaskourilcz/quorum`; store it in Vercel as `BOARDLESSAI_GITHUB_TOKEN`. Production ratings, manual odds, fighter-disagreement reviews and MMA Files metrics fail closed without it. Defaults are `BOARDLESSAI_GITHUB_REPOSITORY=lukaskourilcz/quorum` and `BOARDLESSAI_GITHUB_BRANCH=main`. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Open the project agent switches** — after the two admin environment steps above, sign in at `/admin`, choose a project and check its Meeting controls. Optional roles can be turned on or off there. Caught Up starts with THREADS, INSTAGRAM and FRAME off; MMA Files starts with REACH and FRAME off. Locked roles protect writing, translation, delivery and safety. [imp:4] [owner:me] [time:10m] [kind:setup]
- [ ] **Accept that admin reviews become public repository history** — ratings, notes, price snapshots, fighter resolutions, metrics and derived taste files are committed state. Do not enter personal or confidential information. [imp:4] [owner:me] [time:5m] [kind:decision]

## Caught Up delivery

- [x] **Install the delivery GitHub App on `lukaskourilcz/aifirst`** — the owner configured `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY`, and the workflow minted a repository-scoped token successfully on 2026-08-01. Keep Contents read/write as its only write permission. [imp:5] [owner:me] [time:30m] [kind:setup]
- [x] **Set the reader URL** — repository variable `CAUGHT_UP_SITE_URL=https://caughtup-ai.vercel.app` is configured. [imp:5] [owner:me] [time:5m] [kind:setup]
- [x] **Confirm Caught Up’s adopted limits** — the owner approval reference is recorded in `state/decisions/2026-08-01-caughtup-adoption.md`. [imp:5] [owner:me] [time:5m] [kind:decision]
- [ ] **Complete one reviewed Caught Up delivery** — `CAUGHT_UP_LIVE_ENABLED=true` is already set. Dispatch `cu-edition` with dry off, then verify the bilingual package, delivery receipt, `aifirst` checks and deployment. Set the switch back to `false` on any failure. Keep `SOCIAL_KILL_SWITCH=true`. [imp:5] [owner:me] [time:30m] [kind:deploy]
- [ ] **Review the first three editions** — check both articles, citations, Czech and English tone, the hero image and the Caught Up render. Social drafts stay off until you turn THREADS, INSTAGRAM and FRAME on in `/admin`. [imp:5] [owner:me] [time:90m] [kind:content]

## FightAIQ data and launch gate

- [ ] **Create the UFC source keys** — add `THE_ODDS_API_KEY` (the-odds-api.com) and `CITO_API_KEY` to Actions secrets. The live intake stores their daily snapshot and stops requesting The Odds API after it reports zero remaining monthly credits. Use the owner form for Oktagon prices until an approved source is connected. [imp:5] [owner:me] [time:25m] [kind:setup]
- [ ] **Review the betting types against your actual books** — trim the committed catalog to markets you can really capture. Do not add bookmaker scraping or account automation. [imp:4] [owner:me] [time:20m] [kind:content]
- [ ] **Review one complete event per organization** — collect one UFC and one Oktagon card, two-source fighter facts, T-3/T-1/closing prices, results and calibration. Then record a separate owner decision before changing FightAIQ from `data-only` to `live-analysis`. [imp:5] [owner:me] [time:2h] [kind:decision]
- [ ] **Enable FightAIQ only after that decision** — set `FIGHTAIQ_LIVE_ENABLED=true` for live data rooms and `FIGHTAIQ_ANALYSIS_ENABLED=true` only when public/model analysis is approved. These variables are currently missing. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Clear both spellings before promotion** — run legal/domain checks for `FightAIQ` and `Fight AIQ`, plus age-gating and gambling-content rules in the intended countries. [imp:5] [owner:me] [time:90m] [kind:legal]

## MMA Files public site and repository delivery

- [ ] **Add MMA Files to the existing delivery GitHub App installation** — allow `lukaskourilcz/mma-files` in addition to `aifirst`, keeping Contents read/write as the only write permission. Reuse the existing BoardlessAI `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY`; do not copy them into MMA Files. [imp:5] [owner:me] [time:10m] [kind:setup]
- [ ] **Configure the MMA Files Vercel project** — connect `lukaskourilcz/mma-files` production to `main`, set `NEXT_PUBLIC_SITE_URL=https://mma-files.vercel.app`, keep `NEXT_PUBLIC_DEMO_MODE=true` through the first delivery, and keep `NEXT_PUBLIC_ALLOW_INDEXING=false` through the showcase review. The target needs no model, source, admin or GitHub App secrets. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Enable the three missing BoardlessAI switches** — the current repository-variable list does not contain `PORTFOLIO_LIVE_ENABLED`, `FIGHTAIQ_LIVE_ENABLED` or `MMA_FILES_LIVE_ENABLED`. Add each as `true`. Add `FIGHTAIQ_ANALYSIS_ENABLED=false` explicitly so the separate analysis gate is visible. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Enable live newsroom calls** — after the target app installation, set `MMA_FILES_LIVE_ENABLED=true`. The source-first job still kills a slot at $0 if no verified FightAIQ packet exists. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Verify one content-only article delivery** — run `mag-editorial`, then one assigned `article-am` or `article-pm`; confirm only `data/boardless/articles.json` changed in MMA Files, its CI passed and Vercel rendered both languages. [imp:5] [owner:me] [time:30m] [kind:deploy]
- [ ] **Verify one content-only FightAIQ delivery** — run `mma-intake`; confirm only `data/boardless/fightaiq.json` changed in MMA Files and check Fighters, Events and Data Desk in English and Czech. [imp:5] [owner:me] [time:30m] [kind:deploy]
- [ ] **Enter social results after publishing** — once a post is 48 hours old, spend about one minute entering views, likes, comments, shares and clicks in `/admin`; do this for at least the first 20 posts so the newsroom has real feedback. [imp:4] [owner:me] [time:20m/week] [kind:content]
- [ ] **Choose and clear the publication identity** — check `MMA Files` for trademark/domain conflicts and decide the canonical domain before any public launch. [imp:5] [owner:me] [time:90m] [kind:legal]
- [ ] **Choose the corrections inbox and indexing date** — replace MMA Files' placeholder corrections contact before inviting readers, then turn `NEXT_PUBLIC_DEMO_MODE=false`. Keep indexing off until the name/legal and first-content reviews are complete. [imp:4] [owner:me] [time:15m] [kind:content]

## Titty Tuesdays read-only pairing

- [ ] **Point the storefront at the public concept feed when you want to test it** — in Titty Tuesdays Vercel set `BOARDLESSAI_BASE_URL=https://boardless-ai.vercel.app` and `BOARDLESSAI_SYNC_MODE=read_only`. No service token is needed for the sanitized concept-only endpoint. The storefront remains concept-only; BoardlessAI still cannot write Shopify or publish anything. [imp:2] [owner:me] [time:5m] [kind:setup]

## Email, social and portfolio switches

- [ ] **Configure the one daily email** — verify a Resend sending domain and SPF/DKIM; add `RESEND_API_KEY` and `DAILY_DIGEST_EMAIL_TO` as Actions secrets; add `DAILY_DIGEST_EMAIL_MODE=resend`, `DAILY_DIGEST_EMAIL_FROM`, `RESEND_FREE_TIER_MONTHLY=3000` and `RESEND_FREE_TIER_DAILY=100` as variables. Without them the digest safely logs instead of emailing. [imp:4] [owner:me] [time:45m] [kind:setup]
- [ ] **Turn on the shared portfolio schedule last** — after signed decisions and reviewed dry rooms, set `PORTFOLIO_LIVE_ENABLED=true`. It currently is not configured. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [x] **Keep social production off for now** — the owner asked to focus on brainstorming and articles. Caught Up THREADS, INSTAGRAM and FRAME are off; MMA Files REACH and FRAME are off. `SOCIAL_KILL_SWITCH=true` still blocks posting if draft production is turned back on. [imp:4] [owner:me] [time:5m] [kind:decision]

## Before revenue or personal data

- [ ] **Clear the portfolio names** — review BoardlessAI, Caught Up, Titty Tuesdays, FightAIQ/Fight AIQ and MMA Files for intended commercial use before sponsorship, paid promotion or sales. [imp:5] [owner:me] [time:3h] [kind:legal]
- [ ] **Add the real operator and privacy details** — define contact, retention, data-subject handling and required DPAs before analytics, email collection or other personal data. [imp:4] [owner:me] [time:2h] [kind:legal]
- [ ] **Approve commercial terms before money moves** — sponsorship disclosure, terms, refunds, invoicing and tax handling need human legal/accounting review. No current code authorizes an eshop, payment or autonomous spend increase. [imp:4] [owner:me] [time:2h] [kind:legal]

## Confirmed complete

- Five project workspaces, 38 agents, 14 Prague slots and one daily summary share one guarded runtime.
- All 12 room kinds have fixture-labeled public proof; the production build, contracts and tests pass.
- FightAIQ has deterministic Glicko-2/model output, source controls, manual odds, immutable performance history and private fighter review.
- MMA Files accepts hash-checked bilingual articles and FightAIQ content files in its own repository, renders them publicly in both languages and deploys from `main`.
- BoardlessAI no longer exposes duplicate public fighter or upcoming-event pages.
- Stateful buttons preserve scroll position. Vercel Pro is confirmed.
