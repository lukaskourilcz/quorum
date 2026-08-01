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
4. Start Caught Up by setting `CAUGHT_UP_LIVE_ENABLED=true`, then run `cu-edition` with
   dry off. Review the new `cycle(...)` commit, EditionPackage, delivery receipt,
   bilingual articles and `aifirst` deployment. Set the switch back to `false` if any
   check fails. Then run `morning` with dry off so SPARK can create the canonical
   Caught Up product idea, followed by `cu-product` so the product room can decide it.
   Run `afternoon` and `night` once as the final company-room check.
5. Set `PORTFOLIO_LIVE_ENABLED=true`; run `incubator-scan` before
   `incubator-synthesis`. The scan now saves a guarded source packet, so synthesis can
   keep source-backed ideas. Then run `tt-marketing`.
6. Add `THE_ODDS_API_KEY` and `CITO_API_KEY`, set `FIGHTAIQ_LIVE_ENABLED=true`, then run
   `mma-intake`. The room now saves a guarded daily API snapshot. It will not promote a
   one-source claim into a verified fighter file; complete the second-source review in
   admin. Keep `FIGHTAIQ_ANALYSIS_ENABLED=false` until the separate mode-change decision.
7. After the signed $50 decision and a verified FightAIQ packet, set
   `MMA_FILES_LIVE_ENABLED=true` and run `mag-editorial`, `article-am`, `article-pm`, then
   `mag-desk`. Missing evidence correctly kills an article slot at $0.
8. Once each manual live run has produced and pushed the expected canonical artifacts,
   leave its switch on for the Prague schedule. Keep `SOCIAL_KILL_SWITCH=true`.

## Do these before any live run

- [x] **Sign the one $50 limit** — countersigned in `state/decisions/2026-08-04-budget-fifty.md` (`budget-2026-08d`). The $50 all-in limit, $42 model monthly share and $2.20 daily pace are now recorded. [imp:5] [owner:me] [time:5m] [kind:decision]
- [x] **Sign the FightAIQ founding record** — countersigned in `state/decisions/2026-08-02-fightaiq-founding.md`. This approves its data-only scope, not betting, affiliates or live public probabilities. [imp:5] [owner:me] [time:5m] [kind:decision]
- [x] **Sign the Titty Tuesdays founding record** — countersigned in `state/decisions/2026-08-01-titty-tuesdays-founding.md`. This approves planning, not commerce, stock, payments, ads or publishing. [imp:5] [owner:me] [time:5m] [kind:decision]
- [ ] **Rotate both model keys** — `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` exist in GitHub Actions, but earlier notes say they were shared outside the secret store. Rotate them at the providers, replace the Actions secrets and set provider billing alerts below the signed BoardlessAI limit. The local live-room proof could not call Anthropic because no local key was configured; dry proof passed. [imp:5] [owner:me] [time:20m] [kind:setup]
- [ ] **Approve the unfinished portraits or leave them blank** — 27 of 38 agents have portraits. The 11 new FightAIQ/MMA Files roles intentionally use the text fallback until you approve the image spend and generation. Never book an unknown image-tool charge as zero. [imp:2] [owner:me] [time:5m] [kind:decision]

## Private admin and Git-backed writes

- [ ] **Configure `/admin` in Vercel Production** — add a unique `ADMIN_USER` and long random `ADMIN_PASSWORD`, redeploy, then confirm `/admin` returns `401` without credentials and `200` after login. Missing config returns `503` on purpose. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Give admin a narrow GitHub writer** — create a fine-grained token limited to Contents read/write on `lukaskourilcz/quorum`; store it in Vercel as `BOARDLESSAI_GITHUB_TOKEN`. Production ratings, manual odds, fighter-disagreement reviews and MMA Files metrics fail closed without it. Defaults are `BOARDLESSAI_GITHUB_REPOSITORY=lukaskourilcz/quorum` and `BOARDLESSAI_GITHUB_BRANCH=main`. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Accept that admin reviews become public repository history** — ratings, notes, price snapshots, fighter resolutions, metrics and derived taste files are committed state. Do not enter personal or confidential information. [imp:4] [owner:me] [time:5m] [kind:decision]

## Caught Up delivery

- [ ] **Install the delivery GitHub App on `lukaskourilcz/aifirst` only** — grant Contents read/write and no broader permission; add `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY` to Quorum Actions secrets. [imp:5] [owner:me] [time:30m] [kind:setup]
- [x] **Set the reader URL** — repository variable `CAUGHT_UP_SITE_URL=https://caughtup-ai.vercel.app` is configured. [imp:5] [owner:me] [time:5m] [kind:setup]
- [x] **Confirm Caught Up’s adopted limits** — the owner approval reference is recorded in `state/decisions/2026-08-01-caughtup-adoption.md`. [imp:5] [owner:me] [time:5m] [kind:decision]
- [ ] **Enable Caught Up for one reviewed delivery** — set `CAUGHT_UP_LIVE_ENABLED=true`, dispatch `cu-edition` with dry off, then verify the bilingual package, delivery receipt, `aifirst` checks and deployment. Set the switch back to `false` on any failure. Keep `SOCIAL_KILL_SWITCH=true`. [imp:5] [owner:me] [time:30m] [kind:deploy]
- [ ] **Review the first three editions** — check both articles, citations, Czech and English tone, four-frame carousels, Instagram captions and Threads drafts in `/admin`. [imp:5] [owner:me] [time:90m] [kind:content]

## FightAIQ data and launch gate

- [ ] **Create the free source keys** — add `THE_ODDS_API_KEY` (the-odds-api.com) and `CITO_API_KEY` to Actions secrets. The live intake now stores their daily snapshot and stops requesting The Odds API after it reports zero remaining monthly credits. Verify whether its EU MMA feed includes KSW; if not, use the same manual price form used for Oktagon. [imp:5] [owner:me] [time:25m] [kind:setup]
- [ ] **Review the betting types against your actual books** — trim the committed catalog to markets you can really capture. Do not add bookmaker scraping or account automation. [imp:4] [owner:me] [time:20m] [kind:content]
- [ ] **Review one complete event per organization** — collect UFC, KSW and Oktagon cards, two-source fighter facts, T-3/T-1/closing prices, results and calibration. Then record a separate owner decision before changing FightAIQ from `data-only` to `live-analysis`. [imp:5] [owner:me] [time:3h] [kind:decision]
- [ ] **Enable FightAIQ only after that decision** — set `FIGHTAIQ_LIVE_ENABLED=true` for live data rooms and `FIGHTAIQ_ANALYSIS_ENABLED=true` only when public/model analysis is approved. These variables are currently missing. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Clear both spellings before promotion** — run legal/domain checks for `FightAIQ` and `Fight AIQ`, plus age-gating and gambling-content rules in the intended countries. [imp:5] [owner:me] [time:90m] [kind:legal]

## MMA Files newsroom and future site

- [ ] **Enable live newsroom calls only after the $50 signature** — set `MMA_FILES_LIVE_ENABLED=true`. The source-first job will still kill a slot at $0 if no verified FightAIQ packet exists. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Enter social results after publishing** — once a post is 48 hours old, spend about one minute entering views, likes, comments, shares and clicks in `/admin`; do this for at least the first 20 posts so the newsroom has real feedback. [imp:4] [owner:me] [time:20m/week] [kind:content]
- [ ] **Choose and clear the publication identity** — check `MMA Files` for trademark/domain conflicts and decide the canonical domain before any public launch. [imp:5] [owner:me] [time:90m] [kind:legal]
- [ ] **Create the separate public magazine repository when ready** — install a repository-scoped delivery GitHub App, set the destination contract and domain, then approve a public site launch. This repository intentionally has no public `/magazine` route. [imp:4] [owner:me] [time:2h] [kind:deploy]

## Email, social and portfolio switches

- [ ] **Configure the one daily email** — verify a Resend sending domain and SPF/DKIM; add `RESEND_API_KEY` and `DAILY_DIGEST_EMAIL_TO` as Actions secrets; add `DAILY_DIGEST_EMAIL_MODE=resend`, `DAILY_DIGEST_EMAIL_FROM`, `RESEND_FREE_TIER_MONTHLY=3000` and `RESEND_FREE_TIER_DAILY=100` as variables. Without them the digest safely logs instead of emailing. [imp:4] [owner:me] [time:45m] [kind:setup]
- [ ] **Turn on the shared portfolio schedule last** — after signed decisions and reviewed dry rooms, set `PORTFOLIO_LIVE_ENABLED=true`. It currently is not configured. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Keep social posting manual for now** — the storage and copy tools work, but the guarded Instagram connector does not yet publish the required four-frame transaction. Keep `SOCIAL_KILL_SWITCH=true`; no Meta setup is needed to copy drafts. [imp:4] [owner:me] [time:5m] [kind:decision]

## Before revenue or personal data

- [ ] **Clear the portfolio names** — review BoardlessAI, Caught Up, Titty Tuesdays, FightAIQ/Fight AIQ and MMA Files for intended commercial use before sponsorship, paid promotion or sales. [imp:5] [owner:me] [time:3h] [kind:legal]
- [ ] **Add the real operator and privacy details** — define contact, retention, data-subject handling and required DPAs before analytics, email collection or other personal data. [imp:4] [owner:me] [time:2h] [kind:legal]
- [ ] **Approve commercial terms before money moves** — sponsorship disclosure, terms, refunds, invoicing and tax handling need human legal/accounting review. No current code authorizes an eshop, payment or autonomous spend increase. [imp:4] [owner:me] [time:2h] [kind:legal]

## Confirmed complete

- Five project workspaces, 38 agents, 14 Prague slots and one daily summary share one guarded runtime.
- All 12 room kinds have fixture-labeled public proof; the production build, contracts and tests pass.
- FightAIQ has deterministic Glicko-2/model output, source controls, manual odds, immutable performance history and private fighter review.
- MMA Files stores two daily slots, bilingual article packages, four social variants per article, a private newsroom and manual metrics; it has no public magazine route.
- Stateful buttons preserve scroll position. Vercel Pro is confirmed.
