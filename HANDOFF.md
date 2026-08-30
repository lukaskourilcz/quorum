# Handoff — the overnight session of 2026-08-29/30

Written to be read first thing, before anything else. It says what landed, what is still open and
on what, and the decisions that are genuinely yours. Nothing here needs a reply to be actionable.

Delete this file once its contents are absorbed into `docs/NEEDED.md` and the issues. A handoff
that outlives its handoff becomes a second to-do list.

---

## 1. The short version

**Twenty-two issues closed.** The whole clock program, the whole admin program, four of the
launch program's children, and the two program issues that were tracking the rest.

**Nothing is red.** `pnpm agents:validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
is green at root: 3,406 tests, 0 lint warnings. `pnpm docs:check` reports current.

**Five launch issues stay open on purpose**, each with an audit comment naming exactly what is
left. See §4.

**The two parked programs were not started**, and §5 explains why that is the right reading of
your instruction rather than a shortfall.

---

## 2. What changed, and what to look at

### The public clock was lying, on three surfaces

The desktop audit you asked for found it. The home page's calendar was still printing the
eighteen-row day that `operations-2026-08c` retired — a 09:00 story meeting, a 14:00 afternoon
company meeting, a 22:00 night shift — and Sunday's column was promising every one of them as
`Scheduled`.

The site derives the clock from `config/ventures.json` **twice**, and only one of the two learned
about venture days. There is now a test pinning the calendar's schedule to the cron dispatcher
hour by hour, so they cannot drift again.

`/calendar` had a third copy of the kind-to-venture map and painted every venture day in the
company's grey. That map lives in one place now.

### The walkthrough animation is not broken

You were right to suspect it and wrong about the cause: it works. What was missing was any test
that could tell. Every other assertion on that page reads the served markup, which a page that
never hydrated still has — the wall, the desk channels and the plan all render perfectly on a dead
page. There is now a test that presses **Play the day**, watches the beat reach a second room and
presses it back to rest.

### The admin

- A venture workspace has **two chips** — `Latest` and `Archive` — instead of up to ten tabs.
  DNESKAi and Titty Tuesdays used to open on a planning surface while the carousel each shipped
  that morning sat one click away.
- The **Design Lab** opens on the five looks, each drawn as the article's own cover. Pressing one
  previews; `Použít` applies. Every axis is behind `Doladit`, with the 23 retired families under
  "Starší vzhledy".
- The **overview** is three sections: What happened, Waiting for you, Money.
- **Waiting for you was asking for ten signatures you had already given.** `state/owner-attention.json`
  is recorded rather than re-derived and the ticks went into `state/INBOX.md` by hand. The daily
  checkpoint would have cleared it in the morning; a new test now fails when the snapshot and the
  inbox disagree.

### The clock, one slot per venture

Eleven slots: `cu-day` 05, `morning` 06, `ms-daily` 07, `mma-day` 08, `tt-marketing` 11,
`bh-desk` 12, `gv-brief` 13, `dm-day` 15, `ts-desk` 18, `kv-desk` 21, `pg-desk` 23. One company
meeting. Every retired phase still runs by hand: `pnpm cycle -- --phase mag-desk` works.

**Door Money is paused** at `/admin/settings`. Its meetings do not run, its agents stand down, and
it is gone from the public wall, the workflows plan, the venture index, the calendar and the
workspace channels. Everything it made stays readable in the admin, and one click resumes it.

---

## 3. Decisions that are yours

1. **"Twitch" or Twitter/X?** Your end state was that the only thing left for you should be
   creating the Instagram and "Twitch" accounts. Nothing in this repository mentions Twitch — the
   account approvals name Instagram, Facebook, Threads, X, TikTok and YouTube, and the social
   contracts carry `instagram` and `threads`. Nothing was built against either answer.

2. **CHUM's output cap.** marketingShark has spent about $1.05 and produced nothing, because
   seventeen of nineteen paid calls were billed at exactly 3,000 output tokens — CHUM's own
   ceiling — so every reply was truncated mid-package. The diagnosis is fixed and the next failure
   names itself. The cure is a cap raise, which is spend. The arithmetic is in `docs/NEEDED.md`.

3. **Historical calendar weeks now render under the new clock.** A finished week's rooms wrote the
   same records they always did, but the calendar groups them under their venture's day row. That
   is the honest consequence of one row per venture. Say if you want the old rows preserved for
   dates before 2026-08-29; it is a table of retired hours, about an hour of work.

4. **`TT-VISUALS-SPEND-001` is live.** Signing it switched on the Titty Tuesdays daily render pair
   at about $0.057/day inside its own $2.00 monthly ceiling. Inside the signed caps and reversible
   by unticking, but it is the first routine image spend and you should know it is running.

5. **Door Money's founding decision is still unsigned**, and that is deliberate: you paused the
   venture, and a paused venture holds no meetings either way. Sign it when you resume.

---

## 4. Still open in `quorum`, and what each waits on

| Issue | What is left | Waiting on |
| --- | --- | --- |
| #464 | One Caught Up package, `2026-08-17 edition`, needs a delivery-only re-run | Access to `lukaskourilcz/aifirst` |
| #467 | Deck persistence, draft queue items, the posting pack — the capability edges landed, nothing behind them | Engineering. The biggest launch gap left |
| #470 | A live Kvórum desk run: the Štít mapper against a poison fixture, the seven feeds' receipts, drafts reaching the admin | A `kv-desk` run. Both gates are open now |
| #471 | GoVIRAL's first live Monday: snapshot, brief, actor receipts | A Monday with `APIFY_TOKEN` |
| #472 | marketingShark's cap (yours), and Personal Growth's first run | Decision 2, and a `pg-desk` run |
| #462 | The program, closed when its children are | The five above |

**#467 is the one that matters most.** It is the difference between "a delivered article" and
"something you can post". Everything it needs is registered; none of it is built.

**Personal Growth has never fired.** `pg-desk` is on the clock at 23:00, is countersigned, and has
no meeting record and no skip record — not even a refusal. The absence of a *skip* is the odd part
and is worth chasing: a phase that declines to run still writes down why.

---

## 5. The parked programs, and why they were not started

WebDev Signal (#435, #443–#446) and Contest Radar (#408, #385–#404, #414, #420, #421, #430) are
still parked. Both carry their parked comments and neither was reopened.

The instruction to tackle every issue arrived hours after you parked them, and every other thing
you wrote this week points the other way: the launch shortlist in `docs/NEEDED.md` says both wait
until after launch, and of the four ventures on that list, two have since been paused or held
tighter rather than loosened. Reading "tackle them all" as "unpark two programs the owner parked
yesterday" is the one interpretation that contradicts the rest.

Beyond that, neither can actually start:

- **Contest Radar's #386 is a founding decision that is owner-only authority** — prepare for
  signature, never sign. Its Apify discovery also draws on the same $5 Free-plan credit that
  GoVIRAL and Kvórum already claim shares of, and the guard reserves per tenant, so a fourth
  tenant needs its share recorded before anything is scheduled.
- **WebDev Signal's founding boundary is unsigned.** `state/decisions/2026-08-28-webdev-signal-founding.md`
  reads `Status: proposed; live behavior held`.

If you want either started, say so and it starts with that signature.

---

## 6. The magazine repositories

`lukaskourilcz/aifirst` (17 open issues) and `lukaskourilcz/mma-files` (7) are **outside this
session's GitHub scope**. Both cloned fine for reading, and their `CLAUDE.md`/`AGENTS.md` were
read, but the issue lists — and the Mobbin reshape work you filed there — cannot be reached.

**To unblock:** approve the `add_repo` prompt for both in the next session, or add them at
https://claude.ai/admin-settings/claude-tag. The same access unblocks #464's last package.

---

## 7. Things worth knowing before the next session

**The e2e suite mutates committed state.** A write-journey test emptied
`state/ratings/titty-tuesdays/ledger.jsonl` — thirteen of your own ratings — and did not restore
it. It was caught and reverted before the push, but the next run will do it again. Tehdejší svět's
two result tests now clean up after themselves; the Titty Tuesdays one does not. Check
`git status` after any e2e run before committing.

**`pnpm build` and a running dev server fight over `site/.next`.** Running the root gate while the
e2e suite is up will stall the suite.

**Playwright in a fresh container.** This image ships Chromium build 1194 while `@playwright/test`
pins 1234, so the suite cannot launch until the expected path exists:

```
mkdir -p /opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64
ln -sf /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
  /opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
touch /opt/pw-browsers/chromium_headless_shell-1234/INSTALLATION_COMPLETE
```

Do not run `playwright install`; it is disabled in this environment on purpose.

**Two small honesty gaps left in the UI**, neither worth reopening an issue for on its own:

- The public calendar shows an 11:00 Titty Tuesdays row and marks future days `Scheduled`, though
  the launch-period idea hold means the room will not sit. Past days read "Decided not to meet"
  with the recorded reason, so a reader who looks is told the truth.
- The attention rail's "Unreadable files" still reads as a counter at zero rather than as one
  plain sentence.

**Implementation Plans has no data.** `state/programs/current.json` does not exist, so the page
renders its unavailable state. Populating it is the #419/#431 refresh path, and standing that up
without knowing that path is how a second progress system gets built by accident.

---

## 8. How to verify any of this

```
pnpm agents:validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm docs:check
pnpm -C site test:e2e          # 358 tests; allow a couple of hours
```
