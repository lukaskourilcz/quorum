# NEEDED — manual owner actions for BoardlessAI

BoardlessAI is operating pre-revenue and Caught Up is Venture 001. This file
contains only work that requires the owner’s accounts, secrets, legal judgment
or explicit go-live decision. Vercel Pro coverage is already confirmed.

> Never paste passwords, private keys or API keys into Git, an issue, or chat.
> Store them in the relevant provider and GitHub/Vercel secret fields.

## Required before the first live Caught Up edition

- [ ] **Configure the protected BoardlessAI admin in Vercel** — add a unique `ADMIN_USER` and long `ADMIN_PASSWORD` to the `quorum-site` Production environment, then redeploy. Production `/admin` returned `503` on 2026-07-31, which correctly means credentials are missing; after setup it must return `401` without credentials and `200` after browser login. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Install the `boardlessai-delivery` GitHub App on `lukaskourilcz/aifirst` only** — grant repository contents read/write and no broader permission; add its App ID and private key to Quorum Actions secrets as `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY`. Neither secret exists yet. [imp:5] [owner:me] [time:30m] [kind:setup]
- [ ] **Set the Caught Up production URL in Quorum** — add the repository variable `CAUGHT_UP_SITE_URL=https://caughtup-ai.vercel.app`. It is currently missing and social-pack composition otherwise skips safely. [imp:5] [owner:me] [time:5m] [kind:setup]
- [ ] **Countersign the adopted API envelopes** — approve the committed caps of `$15` monthly API, `$0.70` daily API, `$0.08` per Caught Up meeting and `$0.35` per edition in `state/decisions/2026-08-01-caughtup-adoption.md`. [imp:5] [owner:me] [time:5m] [kind:decision]
- [ ] **Rotate the OpenAI and Anthropic keys that were pasted into chat** — replace them in Quorum GitHub Actions secrets and in any local secret store; then set provider-side billing limits below the `$20` all-in project cap. [imp:5] [owner:me] [time:20m] [kind:setup]
- [ ] **Choose and migrate optional source credentials** — move Guardian, NYTimes, GNews, StackExchange and Firecrawl/Jina keys to Quorum Actions secrets only for sources you want active; unconfigured sources self-skip. [imp:3] [owner:me] [time:20m] [kind:setup]
- [ ] **Enable live Caught Up phases only after the items above pass** — set the Quorum repository variable `CAUGHT_UP_LIVE_ENABLED=true`, dispatch `cu-edition` once, and leave `SOCIAL_KILL_SWITCH=true`. The workflow currently forces Caught Up phases to dry mode. [imp:5] [owner:me] [time:10m] [kind:deploy]
- [ ] **Review the first three editions and social packs** — check both article languages, sources, meeting record, delivery receipt and Vercel deployment; then inspect the English/Czech Instagram carousels and Threads copy in `/admin`. [imp:5] [owner:me] [time:60m] [kind:content]

## Optional meeting email

- [ ] **Configure Resend only if meeting emails are useful** — verify a sending domain and SPF/DKIM, create a sending-only key, then set `RESEND_API_KEY` and `MEETING_EMAIL_TO` as secrets plus `MEETING_EMAIL_MODE=resend`, `MEETING_EMAIL_FROM`, `RESEND_FREE_TIER_MONTHLY=3000` and `RESEND_FREE_TIER_DAILY=100` as variables. Without this, meetings remain stored and email uses the safe log sink. [imp:2] [owner:me] [time:45m] [kind:setup]

## Social publishing

No Meta setup is required to store or copy social content. The protected admin
reads the canonical Git-backed packs and carousel frames. Keep the global social
kill switch on while reviewing the first three packs.

- [ ] **Decide whether to post manually or fund carousel publishing support** — current drafts contain four-frame Instagram carousels, while the guarded Meta connector accepts only one Instagram image and text-only Threads posts. Do not enable autopublish until a reviewed connector change supports the intended carousel transaction. [imp:4] [owner:me] [time:15m] [kind:decision]
- [ ] **Configure Meta only after choosing autopublish** — secure the Instagram/Threads business accounts with 2FA, approve current OAuth scopes and platform terms, then add the Graph version, account IDs and access tokens. First run `validate_only=true`; enable one channel at a time through a separate human approval. [imp:3] [owner:me] [time:90m] [kind:setup]

## Before revenue or personal-data collection

- [ ] **Clear or rename the BoardlessAI studio name before paid sponsorship** — the documented collision risk remains open. Also run a product-name check for Caught Up before relying on it commercially. [imp:5] [owner:me] [time:60m] [kind:legal]
- [ ] **Complete privacy and operator disclosures** — have the privacy text reviewed, add real operator/contact details, define retention and data-subject handling, and sign DPAs before collecting analytics, email addresses or other personal data. [imp:4] [owner:me] [time:2h] [kind:legal]
- [ ] **Prepare commercial terms before taking payment** — approve sponsor disclosures, terms, refunds, invoicing and tax treatment; choose analytics and payment tooling only after the relevant experiment is validated. [imp:4] [owner:me] [time:2h] [kind:legal]

## Reliability and optional reporting

- [ ] **Enable production health monitoring when wanted** — store `PUBLIC_SITE_URL=https://quorum-site-chi.vercel.app` as a GitHub secret, add an independent uptime monitor and alert contact, test rollback, then set `HEALTH_CHECK_ENABLED=true`. [imp:3] [owner:me] [time:60m] [kind:deploy]
- [ ] **Enable Vercel Web Analytics for `quorum-site` if wanted** — the reader already avoids adding another analytics SDK; complete privacy review before using visitor data. [imp:2] [owner:me] [time:15m] [kind:setup]
- [ ] **Connect scheduled runs to OwnDashboard only if its receiver exists** — add `OWNDASHBOARD_CRON_URL` and `OWNDASHBOARD_CRON_TOKEN`; do not fabricate a receiver or status. [imp:1] [owner:me] [time:10m] [kind:setup]

## Confirmed complete

- Vercel Pro hosting and `main` production deployment are confirmed for both
  projects.
- The Caught Up dry edition meeting, bilingual edition fixture, STET gate,
  HACEK gate and social composer pass locally without paid calls.
- Social publishing remains draft-locked and every external payment remains a
  human action.
