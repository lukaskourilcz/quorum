# Contest Radar: the two optional extensions, and what each is waiting for

Both extensions in the Contest Radar program are `held-optional`. Neither blocks the private core,
neither blocks its release audit, and both may stay held indefinitely without making anything
incomplete. This file records what each would be, what it would take to open it, and — for one of
them — why opening it is a decision rather than a piece of work.

## #414 — GoVIRAL-owned Instagram and TikTok contest discovery

**Built as a fixture-backed slice. Both lanes disabled; nothing collects.**

The pilot exists to answer one question: does bounded public Instagram and TikTok discovery find
unique, entry-ready Czech and Slovak contests the four free structured sources miss, at a cost worth
its share of the existing GoVIRAL Apify capacity? Everything below is arranged to answer that with a
fixture and to refuse to answer it with money.

The ownership split is what makes the pilot considerable at all. GoVIRAL owns actor selection,
queries, scheduling, retries, the shared quota reservation, the actual cost and source health.
Contest Radar owns the shape of a lead, the arithmetic of the yield and the gate; it instantiates no
actor, holds no token and reruns no collection.

### What is built

| Piece | Where |
| --- | --- |
| Lane configuration, queries, envelopes | `config/contest-radar-social-pilot.json` |
| Lead, lane and receipt contracts | `orchestrator/src/contracts/contest-radar.ts` |
| Gate, lane run, verdicts | `orchestrator/src/ventures/contest-radar/social-pilot.ts` |
| Intake, deduplication, lead-only rule | `orchestrator/src/ventures/contest-radar/social-leads.ts` |
| Fixtures and tests | `orchestrator/tests/contest-radar-social-pilot.test.ts` |
| Lane health, yield, cost and verdict | Admin → Soutěžní radar → Zdroje |

`social-contest-lead/1` is a ceiling rather than a description: a URL, a caption clipped to 280
characters, a platform, the query that found it, quoted source-stated snippets, aggregate like and
comment counts, when it was seen and when it stops mattering. It carries no handle, no author, no
follower count, no audience identity, no comment text and no media, and `strictObject` is what keeps
it that way — a field for an author cannot be added quietly.

The caption's quoted snippets stay on the lead and never reach the candidate. A candidate crosses
with `rulesUrl: null`, no deadline hint and no prize hint, because a caption is marketing copy: its
"do 31. 8." arriving in the same field a WordPress listing's structured date arrives in is how
nobody could later tell which one the owner was planning around.

### The three refusals

1. **A lead is never entry-ready.** `contestReadinessForLead` returns `needs-detail` and has no
   other branch. The seven pieces of evidence entry-readiness needs — open state, mechanics,
   deadline, eligibility, organizer legitimacy, purchase risk, official rules URL — all live on the
   rules page.
2. **A live pilot is unrepresentable without three authorities.** `contest-social-pilot/1` refuses
   to parse a `live` receipt missing a countersigned capacity decision, owner source authority for
   the specific actors, or a GoVIRAL quota reservation. A fixture receipt whose cost is above zero
   is refused the same way. Flipping a config flag does not produce a live pilot; it produces a
   receipt that will not parse.
3. **A failure costs one query.** A failed actor costs its query and a line in the receipt; a
   malformed item costs one item and is recorded as `malformed` rather than dropped, because a lane
   that returned nothing useful and a lane that returned nothing at all deserve different verdicts.

### Verdicts, on today's evidence

Both lanes are **undecided**, which is the only honest verdict for a lane that has not run. The
fixture proves the classification, the deduplication, the arithmetic and the gate; it proves nothing
about yield, because a fixture cannot. `decideLaneVerdict` decides each lane on its own evidence:
Instagram producing nothing would disable Instagram and say nothing about TikTok.

**To open a lane, all of these:**

1. The private core is complete and its release audit passes. *(Done.)*
2. Current shared-capacity evidence shows the GoVIRAL Apify quota can absorb the pilot's share.
3. A countersigned budget-capacity decision authorises the Apify rung — the same one
   `mayContestRadarSpend` already requires and refuses without.
4. Owner source authority for the specific actors, with their terms read at that time. Provisional
   actor names in the original brief are not authority.

The gate reports every unmet condition at once rather than stopping at the first, so satisfying one
does not look like progress while the answer stays no.

Facebook is out of scope, along with private groups, login cookies, owner sessions, DMs, comment
collection, browser automation and any account interaction. It is excluded by a closed enum rather
than by configuration: a Facebook lane cannot be parsed, so adding one would be a visible contract
change with a test failing beside it.

## #430 — Rule-permitted referral promotion through Social Distribution

**Held, and opening it is an owner decision rather than an implementation task.**

The idea is that a verified Contest Radar opportunity could become a transparent contest alert on
an owned social profile, but only where the contest's official rules explicitly permit public
promotion or referral sharing, and only where the target profile has an independent editorial
reason to publish it.

**This contradicts a rule the founding decision established**, and that is the honest blocker
rather than a missing dependency. `config/venture-capabilities.json` carries
`contest-radar-outbound-isolation`: Contest Radar has no outbound content edge to any venture,
service or public surface. The release audit checks it. Implementing #430 means removing or
narrowing that rule, which is a change to what the venture is — an owner-only tool becomes a
content source — and no amount of evidence gathered inside the tool can authorise that.

**To open it, in this order:**

1. An owner decision that amends the founding's outbound posture, naming exactly which capability
   edge it grants and to which target.
2. The Social Distribution foundations the issue lists, verified present rather than assumed.
3. A rule-permission check that reads the contest's own rules and refuses by default: silence is
   not permission to promote, exactly as silence is not evidence a contest is free.

Everything the issue rules out stays ruled out under any decision: no simulated profile as a
participant, no counting several owner-controlled profiles as several people, no automated entry
or follow or share, no invented referral link, no self or reciprocal referral, no click or view
recorded as an entry, and no broadening of a capability or routine scope through this route.

## Why both stay held

The private core is useful without either. It reads four free structured sources, clusters and
extracts at `$0`, ranks by what is worth an evening, resolves lawful entry capacity and opens the
windows a person should work — and it does all of that without a social collector or a publishing
path. Adding either extension buys reach or coverage; neither buys correctness, and both add a way
for this venture to touch the world it currently only reads.
