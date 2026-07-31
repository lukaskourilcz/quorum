# NEEDED — manual owner actions for BoardlessAI

BoardlessAI is operating pre-revenue with Caught Up as Venture 001, Titty
Tuesdays prepared as Venture 002, and the magazine incubator in research-only
exploration. This file contains only work that needs the owner’s accounts,
secrets, legal judgment or explicit approval. Vercel Pro is already confirmed.

> Never paste credentials into Git, an issue, or chat. Store them only in the
> named GitHub or Vercel secret fields.

## Production access and persistence

- [ ] **Configure the protected admin in Vercel** — add a unique `ADMIN_USER` and long random `ADMIN_PASSWORD` to the `quorum-site` Production environment, then redeploy. Production `/admin` returned `503` on 2026-07-31; after setup it must return `401` without credentials and `200` after login. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Give admin ratings a bounded GitHub writer** — create a fine-grained token limited to Contents read/write on `lukaskourilcz/quorum`, store it in Vercel as `BOARDLESSAI_GITHUB_TOKEN`, and leave `BOARDLESSAI_GITHUB_REPOSITORY=lukaskourilcz/quorum` plus `BOARDLESSAI_GITHUB_BRANCH=main` at their defaults unless the target changes. Without the token, production rating writes fail closed. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Acknowledge public ratings and taste state** — owner ratings, optional rating notes, derived `TASTE.md` files and visual weights are committed to the public repository. Do not enter private or personal information. [imp:4] [owner:me] [time:5m] [kind:decision]

## Portfolio approvals before live crons

- [ ] **Countersign the Titty Tuesdays founding record** — approve Venture 002’s pre-commerce, marketing-first scope in `state/decisions/2026-08-01-titty-tuesdays-founding.md`. This does not approve an eshop, payments, inventory, ads or publishing. [imp:5] [owner:me] [time:5m] [kind:decision]
- [ ] **Choose the August budget shape** — countersign Shape A in `state/decisions/2026-08-01-budget-raise.md` to use `$18` monthly and `$1.00` daily API caps, or select Shape B knowingly to keep `$15` and `$0.70`. Silence already resolves to Shape B and disables the incubator synthesis room. [imp:5] [owner:me] [time:5m] [kind:decision]
- [ ] **Approve the portfolio avatar envelope** — acknowledge the six-role extension’s `$1.80` maximum and recorded `$1.489005` API-equivalent estimate. The session image tool did not charge the project API, so actual project spend remains unavailable rather than booked as zero. [imp:2] [owner:me] [time:5m] [kind:decision]
- [ ] **Run a Titty Tuesdays name and trademark screen** — check apparel classes in the US, EU and Czech Republic, plus existing internet use and brand-safety conflicts, before commerce or paid promotion. [imp:4] [owner:me] [time:60m] [kind:legal]
- [ ] **Acknowledge the platform-policy risk record** — review the recorded Meta sensitive-content limits. Hashtag suppression remains an unverified risk that SCENE must investigate with evidence during week one; do not state it as fact. [imp:4] [owner:me] [time:10m] [kind:decision]
- [ ] **Configure the one daily email digest** — verify a Resend sending domain and SPF/DKIM, create a sending-only key, store `RESEND_API_KEY` and `DAILY_DIGEST_EMAIL_TO` as Actions secrets, and set `DAILY_DIGEST_EMAIL_MODE=resend`, `DAILY_DIGEST_EMAIL_FROM`, `RESEND_FREE_TIER_MONTHLY=3000` and `RESEND_FREE_TIER_DAILY=100` as repository variables. The official Free allowance was rechecked as 3,000/month and 100/day; the runtime refuses an unverified or insufficient tier. [imp:4] [owner:me] [time:45m] [kind:setup]
- [ ] **Approve portfolio cron go-live** — after the decisions above and one reviewed dry dispatch of `tt-marketing`, `incubator-scan` and `incubator-synthesis`, set the repository variable `PORTFOLIO_LIVE_ENABLED=true`. Current scheduled portfolio jobs skip safely because the variable is absent. [imp:5] [owner:me] [time:20m] [kind:deploy]
- [ ] **Review portfolio week one** — inspect the first Titty Tuesdays rooms, incubator proposals, taste distillations and daily digests; confirm the 400-word digest ceiling and rate at least 10 cards so PALATE has owner signal. [imp:4] [owner:me] [time:90m] [kind:content]

## Caught Up live delivery

- [ ] **Install the delivery GitHub App on `lukaskourilcz/aifirst` only** — grant repository Contents read/write and no broader permission; add `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY` to Quorum Actions secrets. Both are currently absent. [imp:5] [owner:me] [time:30m] [kind:setup]
- [ ] **Set the Caught Up production URL** — add repository variable `CAUGHT_UP_SITE_URL=https://caughtup-ai.vercel.app`. It is currently absent and social-pack composition otherwise skips safely. [imp:5] [owner:me] [time:5m] [kind:setup]
- [ ] **Confirm the adopted Caught Up envelopes** — add an explicit owner approval reference for the committed `$15` monthly, `$0.70` daily, `$0.08` meeting and `$0.35` edition envelopes in `state/decisions/2026-08-01-caughtup-adoption.md`. [imp:5] [owner:me] [time:5m] [kind:decision]
- [ ] **Rotate the OpenAI and Anthropic keys previously pasted into chat** — replace the existing Actions secrets and local copies, then set provider-side billing limits below the `$20` all-in cap. [imp:5] [owner:me] [time:20m] [kind:setup]
- [ ] **Choose optional source credentials** — add Guardian, NYTimes, GNews, StackExchange and Firecrawl/Jina secrets only for sources you want active; unconfigured sources self-skip. [imp:3] [owner:me] [time:20m] [kind:setup]
- [ ] **Enable Caught Up only after its checklist passes** — set `CAUGHT_UP_LIVE_ENABLED=true`, dispatch `cu-edition` once, and keep `SOCIAL_KILL_SWITCH=true`. The variable is currently absent, so scheduled Caught Up work remains dry. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Review the first three editions and social packs** — verify both article languages, citations, meeting record, delivery receipt, aifirst checks and deployment; inspect both Instagram carousels, captions and Threads drafts in `/admin`. [imp:5] [owner:me] [time:90m] [kind:content]

## Social publishing

No Meta setup is required to store or copy drafts. Keep
`SOCIAL_KILL_SWITCH=true` while reviewing the first three packs.

- [ ] **Choose manual posting or fund carousel publishing support** — the intended Instagram output is a four-frame carousel, while the current guarded connector supports one image. Do not enable autopublish until a reviewed connector supports the full transaction. [imp:4] [owner:me] [time:15m] [kind:decision]
- [ ] **Configure Meta only after choosing autopublish** — secure the Instagram and Threads business accounts with 2FA, approve current scopes and terms, store account IDs and tokens, run `validate_only=true`, and enable one channel at a time through a separate approval. [imp:3] [owner:me] [time:90m] [kind:setup]

## Before revenue or personal-data collection

- [ ] **Clear or rename the BoardlessAI studio name before paid sponsorship** — the documented collision risk remains open. Also clear Caught Up and Titty Tuesdays for their intended commercial uses. [imp:5] [owner:me] [time:90m] [kind:legal]
- [ ] **Complete privacy and operator disclosures** — add real operator/contact details, define retention and data-subject handling, and sign needed DPAs before collecting analytics, email addresses or other personal data. [imp:4] [owner:me] [time:2h] [kind:legal]
- [ ] **Prepare commercial terms before payment** — approve sponsor disclosures, terms, refunds, invoicing and tax treatment. No current artifact authorizes an eshop or payment flow. [imp:4] [owner:me] [time:2h] [kind:legal]

## Reliability and later stages

- [ ] **Enable production health monitoring when wanted** — add an independent uptime monitor and alert contact, test rollback, then set `HEALTH_CHECK_ENABLED=true`. `PUBLIC_SITE_URL` already exists as an Actions secret. [imp:3] [owner:me] [time:60m] [kind:deploy]
- [ ] **Enable Vercel Web Analytics only after privacy review** — no extra analytics SDK is required in the app. [imp:2] [owner:me] [time:15m] [kind:setup]
- [ ] **Connect OwnDashboard only if its receiver exists** — add `OWNDASHBOARD_CRON_URL` and `OWNDASHBOARD_CRON_TOKEN`; do not invent a receiver or status. [imp:1] [owner:me] [time:10m] [kind:setup]
- [ ] **Open future commerce or magazine founding as separate work** — an eshop repository and delivery contract, ad accounts, and a founding record for any incubator winner each require a new scoped owner decision. They are not part of this launch. [imp:3] [owner:me] [time:15m] [kind:decision]

## Confirmed complete

- Vercel Pro coverage is confirmed; no Hobby-plan limitation applies.
- The shared registry exposes Caught Up, Titty Tuesdays and the research-only
  incubator. The public clock has eight collision-free Prague slots.
- Dry portfolio meetings, the one-digest path, protected rating flow, binder,
  responsive layouts, scroll preservation and accessibility checks pass.
- Social output remains draft-locked, commerce is absent, and external payments
  remain human-only.
