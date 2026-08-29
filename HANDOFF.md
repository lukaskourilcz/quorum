# Handoff — 2026-08-29 overnight session

Written for the owner to read first thing. It says what landed, what is blocked and on what, and
the exact next step for everything still open. Nothing here needs a reply to be actionable; the
decisions that genuinely need you are in their own section and are marked.

Delete this file once its contents are absorbed into `docs/NEEDED.md` and the issues. A handoff
that outlives its handoff is a second to-do list.

---

## 1. What landed, merged and deployed

| Work | Issues | Where |
| --- | --- | --- |
| Five launch carousel families, rotation locked to them | #466 | PR #493, merged |
| Every pending approval resolved; dead docs deleted; admin phase 0; GoVIRAL trends panel; Settings with venture pause switches | — | PR #494, merged |
| One calendar slot per venture per day; one company meeting | #504–#509 | PR #510 |
| Admin IA reset — three places, not eight | #496 | PR #510 |

**Door Money is paused.** You asked for it, and the switch is at `/admin/settings`. Paused means
its meetings do not run, its agents stand down, and it is gone from the public wall, the workflows
plan, the venture index, the calendar and the workspace channel list. Everything it made is still
readable in the admin, and one click resumes it.

**The clock is now eleven slots**: `cu-day` 05, `morning` 06, `ms-daily` 07, `mma-day` 08,
`tt-marketing` 11, `bh-desk` 12, `gv-brief` 13, `dm-day` 15, `ts-desk` 18, `kv-desk` 21,
`pg-desk` 23. Every retired phase still runs by hand — `pnpm cycle -- --phase mag-desk` works.

---

## 2. Blocked, and what unblocks it

### 2.1 The magazine repositories — blocked on repository access

`lukaskourilcz/aifirst` (17 open issues) and `lukaskourilcz/mma-files` (7 open issues) are
**outside this session's GitHub scope**. Both repositories cloned fine for reading, but the issue
list, and therefore the Mobbin reshape work you filed there, cannot be reached. Adding them needs
an approval prompt that could not be answered while you were asleep.

**To unblock:** in the next session, approve the `add_repo` prompt for both, or add them at
https://claude.ai/admin-settings/claude-tag. Then the reshape work can start immediately — the
clones are already on `main` and their `CLAUDE.md`/`AGENTS.md` were read.

### 2.2 Nothing else is blocked on access

Everything below is simply unfinished work, in priority order.

---

## 3. Still open in `quorum`, in the order I would work it

### 3.1 The admin program #495 — five children remain

Done: #496 (IA reset). Remaining, each self-contained:

- **#497 — every venture page leads with its latest output.** The biggest win left for you. Today a
  venture workspace is still a row of up to ten tabs over stored records; it should open on the
  newest thing that venture shipped, rendered to be read.
- **#498 — the copy pass.** Apply `stop-slop` to every heading, lead, note, empty state and badge.
  No internal ids in visible text (`carousel-studio` should read "Design Lab" everywhere).
- **#499 — Design Lab simple mode.** Five looks side by side per brand, one click to apply, and the
  full axis surface behind a "Fine-tune" disclosure. The engine is ready: the rotation already
  deals only the launch five and the preset write path exists.
- **#500 — the overview's three questions.** What happened / what waits / what it costs, in that
  order, with everything else one click deeper.
- **#501 — facilities map.** Started, not finished. See §4.

### 3.2 The launch program #462 (#463–#473) — implemented, not closed

The work is in PRs #482–#494. Nobody closed the issues. Someone should audit each against the
repository, finish #473 (regression, docs, closing the program) and close each with an evidence
comment naming its commits. This is bookkeeping, but it is the difference between "39 open issues"
and a true picture.

### 3.3 The parked programs

- **WebDev Signal #435** (#443–#446). Its boundary docs bind; publishing steps respect every social
  gate. Its 05:00 dispatcher anchor was retargeted to `cu-day` in this session, which is the only
  change it received.
- **Contest Radar #408** (#385–#404, #414, #420, #421, #430). #386 is an owner-only founding
  decision — prepare it for signature, never sign it.

---

## 4. #501 facilities map — what I found, what is left

The audit ran against the real page at mobile width, and the walkthrough is **not broken in the way
you suspected**. Concretely, verified passing:

- Every operating venture has a wall card, a desk channel and a room on the workflows plan, and the
  three agree with each other. That assertion is now computed from the registry rather than pinned
  at eleven, so pausing a venture moves all three together and the test still guards them.
- No horizontal overflow at 390px.

What is left for #501:

- A real browsing pass at desktop width for the animation itself. The e2e suite proves structure and
  containment; it cannot tell you whether the scroll *feels* broken. That needs eyes.
- `webdev-signal` is still off the wall. It is registry status `exploration`, so it is correctly
  absent — but the issue asks for that to be a written decision rather than an accident.
- The accreted sections (calendar, meetings, workflows dock) could lose material. Nothing was cut in
  this session.

---

## 5. Decisions that need you

Each is genuinely yours; none blocks the engineering behind it.

1. **"Twitch" or Twitter/X?** Your end-state instruction was that the only thing left for you should
   be creating the Instagram and "Twitch" accounts. No approval, decision or config in this
   repository mentions Twitch; the account approvals name Instagram, Facebook, Threads, X, TikTok
   and YouTube. If you meant X, say so and `docs/NEEDED.md` can be finished. Nothing is built
   against either answer yet.
2. **Historical calendar weeks now render under the new clock.** A finished week's rooms wrote the
   same records they always did, but the calendar groups them under their venture's day row rather
   than the old per-room rows. This is the honest consequence of one row per venture, and it is what
   you asked for — but it does re-label history, and #509's original wording said past weeks should
   render "under the old clock". Say if you want the old rows preserved for dates before 2026-08-29;
   it is a table of retired hours, roughly an hour of work.
3. **Two of the five approvals you signed tonight now allow spending.** `TT-VISUALS-SPEND-001`
   switches on the Titty Tuesdays daily render pair at about $0.057/day inside its own $2.00 monthly
   ceiling. It is inside the signed caps and it is reversible by unticking the item, but it is the
   first routine image spend and you should know it is live.

---

## 6. Owner actions still outstanding

Unchanged from `docs/NEEDED.md`; repeated here because they gate real paths.

- **Apify token.** `APIFY-ACCOUNT-001` is approved. Until `APIFY_TOKEN` exists in the repository's
  Actions secrets, GoVIRAL's trend panel says so honestly and the whole path is a $0 no-op.
- **Vercel dispatch token and cron secret.** `DISPATCH-TOKEN-001` is approved. Without them the
  punctual cron path stays closed and meetings arrive whenever GitHub's queue gets to them.
- **Door Money private repository.** `BOOK-SOURCE-001` is approved; the private clone and
  `BOOK_SOURCE_TOKEN` are yours to create. Door Money is paused anyway, so this is not urgent.
- **The social accounts.** Instagram and the second platform, per decision 5.1 above.

---

## 7. How to verify any of this

```
pnpm agents:validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm docs:check
pnpm -C site test:e2e     # admin and office surfaces
```

One environment note for whoever runs the e2e suite next: this container ships Chromium build 1194
while `@playwright/test` pins 1234. The suite cannot launch until the expected path exists:

```
mkdir -p /opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64
ln -sf /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
  /opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
touch /opt/pw-browsers/chromium_headless_shell-1234/INSTALLATION_COMPLETE
```

Do not run `playwright install`; it is disabled in this environment on purpose.
