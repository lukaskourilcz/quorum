# Manual steps — finish the live setup

`NEEDED.md` is the complete owner checklist. This file gives the safest order.
The `$50` limit, Caught Up approval, FightAIQ founding and Titty Tuesdays founding
are already countersigned; do not repeat those steps or rewrite their historical
predecessors.

## 1. Finish the protected admin

In the BoardlessAI Vercel Production environment, add `ADMIN_USER`, a long random
`ADMIN_PASSWORD` and a fine-grained `BOARDLESSAI_GITHUB_TOKEN` limited to Contents
read/write on `lukaskourilcz/quorum`. Redeploy, sign in at `/admin`, save one harmless
rating and confirm the commit appears on `main`. Never put private or personal text in
an admin note because accepted writes become repository history.

The global admin page now shows the specialist meeting-agenda queue. Project pages
show the optional agent switches. Social production agents start off.

## 2. Finish the MMA Files delivery installation

Add `lukaskourilcz/mma-files` to the existing `boardlessai-delivery` GitHub App
installation. Keep Contents read/write as its only write permission. The App ID and
private key stay in BoardlessAI Actions secrets; do not copy them into MMA Files or
Vercel.

Connect the MMA Files Vercel project to `main`, set
`NEXT_PUBLIC_SITE_URL=https://mma-files.vercel.app`, keep
`NEXT_PUBLIC_DEMO_MODE=true` for the first delivery and keep
`NEXT_PUBLIC_ALLOW_INDEXING=false` through the showcase review.

## 3. Add only the source credentials you intend to use

Add `THE_ODDS_API_KEY` and `CITO_API_KEY` as BoardlessAI Actions secrets when you
want live FightAIQ intake. The Odds API quota is recorded and calls stop when its
reported monthly credits reach zero. Oktagon still needs owner-reviewed inputs until
an approved adapter exists. Do not add the dropped GNews, Guardian or New York Times
keys.

The daily email is optional. If wanted, verify a Resend domain and configure the
exact secret/variable set in `NEEDED.md`; otherwise the digest safely stays in log
mode.

## 4. Prove Caught Up once

Run `cu-edition` manually with dry mode off and delivery-only off. In the mode step,
confirm `dry=false` and `skip=false`. Review the BoardlessAI cycle commit, package,
delivery receipt, both languages, hero and the Caught Up Vercel deployment. If content
was produced and only delivery failed, rerun the same phase with dry mode off and
delivery-only on; that retry makes no model call.

Then run `morning` and `cu-product`. Afternoon and night are now deterministic
checkpoints, so they cost `$0` in model calls. Review the first three real editions
before treating the pipeline as unattended.

## 5. Prove FightAIQ and MMA Files

Set `PORTFOLIO_LIVE_ENABLED=true`, `FIGHTAIQ_LIVE_ENABLED=true`,
`MMA_FILES_LIVE_ENABLED=true` and explicitly keep
`FIGHTAIQ_ANALYSIS_ENABLED=false`. Run:

1. `mma-intake` — verify the guarded source snapshot and the content-only FightAIQ
   delivery in MMA Files.
2. `mag-editorial` — verify the two-slot editorial slate.
3. One assigned `article-am` or `article-pm` — verify the bilingual article and hero
   in MMA Files.
4. `mag-desk` — use a manual run for the launch check even if no scheduled agenda is
   pending.

A missing source packet should kill an article slot before a model call. Keep analysis
off until one reviewed UFC event and one reviewed Oktagon event support a separate
mode-change decision.

## 6. Understand the new meeting behavior

Scheduled jobs are wake-ups, not automatic paid meetings. The 06:00 decision room can
queue one bounded specialist agenda. Titty Tuesdays, both incubator rooms, FightAIQ
analysis and the MMA Files desk open on schedule only when an agenda is due. FightAIQ
intake also opens when its source snapshot materially changes. Otherwise the calendar
shows **Not needed** and records `$0`.

Manual workflow runs intentionally bypass only this agenda check so you can test a
room. They still require every live switch, credential, evidence and budget gate.
Keep `SOCIAL_KILL_SWITCH=true`.

## 7. Complete human and legal review before promotion

Clear BoardlessAI, Caught Up, Titty Tuesdays, FightAIQ/Fight AIQ and MMA Files for the
countries and uses you intend. Replace the MMA Files corrections placeholder, add the
real operator/privacy details before personal data is collected, and approve payment,
tax, sponsorship and refund terms before money moves. No live switch authorizes those
decisions.
