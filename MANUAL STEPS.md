# Manual steps — from dry proof to live work

`NEEDED.md` is the complete owner checklist. This is the recommended order.

## 1. Sign the boundaries

Review and countersign:

1. `state/decisions/2026-08-04-budget-fifty.md`
2. `state/decisions/2026-08-02-fightaiq-founding.md`
3. `state/decisions/2026-08-01-titty-tuesdays-founding.md`
4. the approval reference in `state/decisions/2026-08-01-caughtup-adoption.md`

Do not edit old decisions to imply a later approval. Fill the intended signature area
or add a superseding record. Until the `$50` decision is signed, the older `$20`
fallback remains correct and MMA Files live work stays off.

## 2. Rotate and add secrets

- Rotate `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`; replace the GitHub Actions secrets.
- Add `THE_ODDS_API_KEY` and `CITO_API_KEY` for FightAIQ.
- Verify a Resend domain; add `RESEND_API_KEY` and `DAILY_DIGEST_EMAIL_TO`.
- Install a Contents-only GitHub App on `lukaskourilcz/aifirst`; add
  `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY`.

Set repository variables for the Resend sender/tier and
`CAUGHT_UP_SITE_URL=https://caughtup-ai.vercel.app`. Keep every live switch absent or
false during this step.

## 3. Make `/admin` private and writable

In Vercel Production add:

- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `BOARDLESSAI_GITHUB_TOKEN` — fine-grained Contents read/write on
  `lukaskourilcz/quorum` only

Redeploy. Confirm `401` without credentials, `200` after login, a saved rating, a
manual FightAIQ price and an MMA Files metrics entry. A `503` means setup is incomplete.
Do not store personal or confidential text in admin notes because writes become
repository history.

## 4. Review proof and prepare the first real inputs

Open every link in `docs/LIVE-PROOF.md`. Fixture labels must remain visible. Then:

- confirm the Caught Up delivery App is installed on `aifirst` and ready for the first
  live package;
- capture one full UFC, KSW and Oktagon event, including two-source fighter facts,
  T-3/T-1/closing prices and results;
- confirm the committed bet types match markets you can actually capture;
- review the first private MMA Files article and its English/Czech social drafts.

Record a separate owner mode-change decision before FightAIQ live analysis.

## 5. Enable one switch at a time

1. Set `CAUGHT_UP_LIVE_ENABLED=true`, manually run `cu-edition` with dry off, review the
   delivered bilingual edition, and switch it back off if delivery fails.
2. Set `PORTFOLIO_LIVE_ENABLED=true`, then run `incubator-scan` before
   `incubator-synthesis`; the scan supplies the source packet required for real ideas.
3. Set `FIGHTAIQ_LIVE_ENABLED=true`, then run `mma-intake`; the configured API sources
   supply a guarded daily snapshot, while critical fighter fields still need a second
   agreeing source before model use.
4. `FIGHTAIQ_ANALYSIS_ENABLED=true` only after the event review and decision
5. `MMA_FILES_LIVE_ENABLED=true` only after the signed `$50` limit

Review a full day after each change. Keep `SOCIAL_KILL_SWITCH=true`. The magazine has
no public destination yet, and the Instagram path does not publish the required
four-frame set automatically.

## 6. Do the human/legal work before promotion

Clear BoardlessAI, Caught Up, Titty Tuesdays, FightAIQ/Fight AIQ and MMA Files for the
intended countries and uses. Add the real operator/privacy details before collecting
personal data. Approve sponsorship, payment, tax and refund terms before money moves.
No current live switch authorizes these activities.
