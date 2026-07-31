# Manual steps — BoardlessAI portfolio

`NEEDED.md` is the canonical checklist. Use this shorter runbook to move from
the shipped dry portfolio to live operation.

## 1. Make `/admin` writable and private

In Vercel → `quorum-site` → Settings → Environment Variables, add Production
values for:

- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `BOARDLESSAI_GITHUB_TOKEN` — fine-grained, Contents read/write, limited to
  `lukaskourilcz/quorum`

The repository and branch default to `lukaskourilcz/quorum` and `main`. Override
them only with `BOARDLESSAI_GITHUB_REPOSITORY` and
`BOARDLESSAI_GITHUB_BRANCH` when the canonical target changes. Redeploy, then
verify that `/admin` returns `401` without credentials and `200` after browser
login. A `503` means authentication or rating persistence is still incomplete.

Ratings and optional notes are committed public state. Do not enter private
information.

## 2. Sign the portfolio decisions

Review and countersign:

1. `state/decisions/2026-08-01-titty-tuesdays-founding.md` for Venture 002’s
   pre-commerce planning scope.
2. `state/decisions/2026-08-01-budget-raise.md`, choosing either Shape A or
   Shape B.

An unsigned budget decision uses Shape B: `$15` monthly, `$0.70` daily,
Titty Tuesdays capped at `$0.06`, and no incubator synthesis meeting. This is a
safe operating choice, not an error.

## 3. Configure the one daily digest

Verify a Resend sending domain, then add Actions secrets:

- `RESEND_API_KEY`
- `DAILY_DIGEST_EMAIL_TO`

Add repository variables:

- `DAILY_DIGEST_EMAIL_MODE=resend`
- `DAILY_DIGEST_EMAIL_FROM`
- `RESEND_FREE_TIER_MONTHLY=3000`
- `RESEND_FREE_TIER_DAILY=100`

The workflow sends at most one digest per Prague date after the night room. It
does not send per-meeting email. Without Resend configuration, the digest uses
the safe log sink.

## 4. Prove delivery and run dry portfolio rooms

Create the `boardlessai-delivery` GitHub App with repository Contents read/write
only, install it only on `lukaskourilcz/aifirst`, and add its App ID and private
key to Quorum Actions secrets. Add
`CAUGHT_UP_SITE_URL=https://caughtup-ai.vercel.app` as a repository variable.

Before any live switch, dispatch these phases with `dry=true` and review their
meeting records:

- `cu-edition`
- `tt-marketing`
- `incubator-scan`
- `incubator-synthesis`

Keep `SOCIAL_KILL_SWITCH=true`.

## 5. Enable one runtime at a time

After Caught Up delivery checks pass, set `CAUGHT_UP_LIVE_ENABLED=true`. After
the portfolio decisions, dry rooms and digest are reviewed, set
`PORTFOLIO_LIVE_ENABLED=true`. Do not enable both for the first time in the same
change window.

Review the first three Caught Up editions and the first portfolio week in
`/admin`. Check bilingual articles, citations, social drafts, ratings, taste
distillation, incubator shortlist behavior, per-venture cost and the daily
digest. Rate at least 10 cards before judging PALATE’s usefulness.

## 6. Keep external actions locked

Manual social posting needs no Meta credentials. Automatic publishing stays off
until a separate reviewed implementation supports the full Instagram carousel.
The eshop, inventory, payment, ads, new accounts and founding an incubator winner
are future owner-approved projects, not latent capabilities in this repository.
