# Manual steps — BoardlessAI

`NEEDED.md` is the canonical owner checklist. Use this order for the first live
Caught Up edition.

## 1. Make `/admin` available

In Vercel → `quorum-site` → Settings → Environment Variables, add Production
values for `ADMIN_USER` and `ADMIN_PASSWORD`. Use a unique username and a long
random password. Redeploy `main`, then verify:

```bash
curl -I https://quorum-site-chi.vercel.app/admin
```

The unauthenticated response must be `401`; `503` means credentials are still
missing. Enter the credentials through the browser’s Basic Auth prompt. Do not
put them in a URL, command history or repository file.

## 2. Create the delivery App

Create the GitHub App `boardlessai-delivery`, grant only repository contents
read/write, and install it only on `lukaskourilcz/aifirst`. In Quorum Actions
secrets add:

- `DELIVERY_APP_ID`
- `DELIVERY_APP_PRIVATE_KEY`

The App private key never belongs in aifirst or Vercel.

## 3. Finish Quorum’s live configuration

In Quorum Actions variables add:

- `CAUGHT_UP_SITE_URL=https://caughtup-ai.vercel.app`
- later, after the checklist passes, `CAUGHT_UP_LIVE_ENABLED=true`

Keep `SOCIAL_KILL_SWITCH=true`. Rotate the exposed OpenAI/Anthropic keys, replace
the Quorum secrets and set provider billing limits. Add source credentials only
for the publishers you want to use.

## 4. Run and review one live edition

Dispatch the guarded council workflow with phase `cu-edition`. Verify the
meeting, English and Czech articles, delivery receipt, aifirst validation and
Vercel deployment. Then sign in at
`https://quorum-site-chi.vercel.app/admin` and review both language packs:

- four Instagram carousel frames plus caption;
- Threads text;
- destination URL and draft queue status.

Repeat this review for three editions. The admin is storage and review, not an
editor: the canonical files remain under `state/social/` and
`site/public/social/`.

## 5. Decide how to publish social posts

Manual posting needs no Meta credentials. Automatic publishing remains off
because the current guarded connector cannot upload the intended four-frame
Instagram carousel. If you later commission carousel support, approve current
OAuth scopes and terms, add the account IDs/tokens, run validation-only first
and enable one channel at a time.

Resend, external monitoring, OwnDashboard, analytics and revenue/legal setup are
optional or later-stage tasks listed in `NEEDED.md`; none blocks the first dry
meeting or the admin archive itself.
