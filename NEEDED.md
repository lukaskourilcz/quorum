# NEEDED — account setup only Lukas can finish

The application, dry proof and automated release checks are complete. Content review
is owned by the agents; there is no “review the first edition” or “approve the first
three articles” gate. Vercel Pro, the `$50` limit, founding decisions, model-key
rotation, admin login and the Caught Up delivery App setup are already confirmed.

Never paste credentials into Git, an issue, a meeting record or chat. Add secrets in
GitHub Actions and public/non-sensitive IDs as repository variables.

## Required account plumbing

- [ ] **Connect each brand’s Instagram and Threads accounts** — for Caught Up, MMA Files and Titty Tuesdays, add the four brand-specific values listed below. Each project remains locked until both accounts pass its deterministic health gate. [imp:5] [owner:me] [time:45m] [kind:setup]
- [ ] **Add the optional licensed-photo keys** — add `PEXELS_API_KEY` and `PIXABAY_API_KEY` as Actions secrets. Openverse and Wikimedia Commons already work without keys; missing paid-account keys never block an article because FRAME supplies a licensed-safe SVG fallback. [imp:3] [owner:me] [time:15m] [kind:setup]
- [ ] **Confirm the MMA Files delivery installation** — make sure `lukaskourilcz/mma-files` is included in the existing delivery GitHub App, keeping Contents read/write as its only write permission. In Vercel, production must track `main`, `NEXT_PUBLIC_SITE_URL=https://mma-files.vercel.app`, `NEXT_PUBLIC_DEMO_MODE=true` and `NEXT_PUBLIC_ALLOW_INDEXING=false`. [imp:5] [owner:me] [time:15m] [kind:deploy]
- [ ] **Add any secret reported by a failed-closed workflow** — if `NEEDS_YOUR_HELP_NOW.md` names a new missing credential, add only that exact value and rerun the delivery-only or validation path. No other required secret is currently known missing. [imp:4] [owner:me] [time:15m] [kind:setup]

### Social values for Caught Up

- Secret: `CAUGHT_UP_THREADS_ACCESS_TOKEN`
- Variable: `CAUGHT_UP_THREADS_USER_ID`
- Secret: `CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN`
- Variable: `CAUGHT_UP_INSTAGRAM_USER_ID`

### Social values for MMA Files

- Secret: `MMA_FILES_THREADS_ACCESS_TOKEN`
- Variable: `MMA_FILES_THREADS_USER_ID`
- Secret: `MMA_FILES_INSTAGRAM_ACCESS_TOKEN`
- Variable: `MMA_FILES_INSTAGRAM_USER_ID`

### Social values for Titty Tuesdays

- Secret: `TITTY_TUESDAYS_THREADS_ACCESS_TOKEN`
- Variable: `TITTY_TUESDAYS_THREADS_USER_ID`
- Secret: `TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN`
- Variable: `TITTY_TUESDAYS_INSTAGRAM_USER_ID`

Keep `SOCIAL_KILL_SWITCH=true` while validating accounts. Setting it to `false` only
removes the owner override; a project still cannot post until its own health counter,
credentials and safety checks unlock it. No likes, follows, comments, messages or
social-result collection are implemented.

## How a real run differs from a test run

`dry=true` proves routing and contracts with fixture labels. It makes no provider call,
writes only below `tmp/dry-run/state` and never creates live work. For a real run,
Actions must show `dry=false` and `skip=false`; the matching project switch and
evidence gates must also pass. A valid `NO_EDITION`, killed article slot or
`not-needed` meeting costs `$0` and is not an error.

The first-live order and exact proof locations are in `MANUAL STEPS.md`. Automated
post-deploy verification—not owner content approval—decides whether a delivery stays
live, retries once or is reverted and paused.

## Human-only gates that remain closed

These are not current setup tasks, but code cannot open them: FightAIQ analysis mode,
budget increases or unplanned spend, commerce/payments/ads, personal-data collection,
legal/name clearance and MMA Files indexing. They require a future explicit owner
decision when the business is ready.
