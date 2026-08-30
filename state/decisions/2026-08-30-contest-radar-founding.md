# Contest Radar founding decision

Date: 2026-08-30

Decider: Lukas Kouril, owner

Status: countersigned

Held by this decision: every paid path, every provider switch and every external write.

Signature / explicit approval reference: Owner instruction, 2026-08-30 session (Claude Code): "Countersign everything thats left there for me". Live behaviour, account creation, credentials and spend stay held by this record's own boundaries.

Decision id: `contest-radar-2026-08a`

Supersedes: nothing. Extends the founding precedent set by `kvorum-2026-08a` and
`webdev-signal-2026-08a`.

Sources: GitHub #385, #386, #408 and `docs/CONTEST-RADAR-SOURCES.md`, whose verdicts were produced
by fetching each candidate on 2026-08-30 rather than by copying the original brief.

## Decision

BoardlessAI may build Contest Radar as an owner-only venture that discovers, normalizes, verifies
and prioritizes Czech and Slovak consumer contests and global developer challenges, and prepares
lawful manual entry work. It authorizes implementation and dry proof at `$0`. It does not authorize
a paid call, a model call, an account, a credential, a public surface or any action taken on a
contest.

- Venture id and ledger namespace: `contest-radar`
- Product name: **Contest Radar**; Czech Admin label: **Soutěžní radar**
- Stage: private owner tool, validation
- Only user: the owner
- Market view: Czechia and Slovakia, with global developer challenges as a separate track
- Public product, newsletter, affiliate links, promoted listings, multi-user accounts and paid
  subscriptions: icebox, until observed private usage justifies a separate decision

## The line this venture does not cross

**It never acts on a contest.** No entry, form submission, comment, follow, like, tag, share,
upload, purchase, team join, rule acceptance, prize claim, account creation, payment or email. It
prepares work for a person and stops. This is the whole reason the venture is safe to build, and
no evidence collected later can argue it into acting, because the argument for acting is exactly
what a discovery system accumulates.

**Public and logged-out sources only.** No login cookie and no third-party account credential for
scraping — including the owner's own account, which is the credential this rule most specifically
forbids. The one permitted exception is an owner-provided read credential for a documented official
API, and Kaggle is the only current candidate. The audit already rejected `vyhrat.sk` on this rule:
its listing redirects to a login page, so it is out regardless of how useful it looks.

**A site's refusal is final.** `dorahacks.io` answers 405 to a plain GET and `lablab.ai` serves a
Cloudflare interstitial. Neither is a problem to route around; imitating a browser to defeat a bot
check is not something this venture does.

**No raw page archive.** Normalized records, small request metadata and receipts. External text is
untrusted evidence and never an instruction.

**Nothing is guessed.** Missing dates, eligibility, entrant counts, prize values and outcomes stay
unavailable. An account count is never a participant count without rule evidence saying so.

**Purchase-required contests** are visible only behind an explicit owner filter, rank below
no-purchase opportunities, and the system never buys the required product.

**A source or item may fail without failing the run.** One malformed item costs one item; one
failed source costs one source.

## Nested budget, fail-closed

1. **Free scan path — `$0`.** Structured and direct sources only. This path must be useful on its
   own, and the audit says it can be: a WordPress REST endpoint, two RSS feeds and Devpost's public
   JSON all answered on 2026-08-30 at no cost.
2. **Optional model enrichment — hard maximum `$0.50/month`.** Content-hash keyed, and only for a
   new or changed candidate whose deterministic extraction was insufficient. Default off.
3. **Optional Apify discovery or fallback — hard maximum `$0.10/month`**, drawn from the existing
   account-wide `$5` Free-plan credit, never treated as a separate allowance. Default off.
4. **Combined incremental ceiling — `$0.60/month`**, further constrained by the company's
   authoritative model and all-in caps. This nests inside `budget-2026-08f`; it does not extend it.
5. Every paid and model switch stays off until a separate countersigned budget-capacity decision
   authorizes it. **This founding is not that decision.**
6. Hitting any nested maximum stops the paid path and leaves the free path running.

## Boundaries against the rest of the portfolio

The capability map from #424 is authoritative and deny-by-default. Contest Radar has no
mandatory-core content edge to any other venture in either direction.

**GoVIRAL owns Instagram and TikTok collection.** Contest Radar reads recorded scout evidence and
schedules no social collection of its own. Duplicating that boundary is the specific mistake this
clause exists to prevent, and the audit rejects every social Apify actor on the same ground.

Contest Radar is absent from every public project, calendar, feed, route and API surface. It reuses
the protected Admin; it adds no second app, auth system, database, cron, scraper or source platform.

## Stop conditions

- A source that starts requiring a login or serving a bot check is disabled, not worked around.
- A month in which the free path produces nothing the owner acts on is a reason to narrow the
  source set, not to enable a paid one.
- Any evidence that the system took an action on a contest stops the venture until the path that
  allowed it is removed.
