# Contest Radar: the two optional extensions, and what each is waiting for

Both extensions in the Contest Radar program are built and both are `held-optional`. Neither blocks
the private core, neither blocks its release audit, and both may stay held indefinitely without
making anything incomplete. This file records what each is, what holds it, and what it would take to
open — which for both is an owner decision rather than a piece of work.

Built and held is the point rather than a compromise. The shapes are settled while there is time to
think about them, the refusals are structural rather than promised, and the day either becomes worth
opening, the decision is about the venture and not about a schedule.

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

**Built as a contract, a projection and a gate. The capability edge is registered `held`; nothing
publishes.**

A verified Contest Radar opportunity may become a transparent contest alert on an owned social
profile — but only where the contest's official rules explicitly permit public promotion or referral
sharing, and only where the target profile has an independent editorial reason to publish it.

### The blocker that had to be resolved first, and how

The founding says Contest Radar has no **mandatory-core** content edge to any other venture. The
isolation rule written to enforce it said something stricter — no outbound content edge at all — and
that was the implementation being more careful than the decision. Harmless in most places; not here,
where it made #430 unimplementable without looking like a weakened guard, and hid the real boundary
behind a stronger claim nobody had decided.

`state/decisions/2026-08-30-contest-radar-promotion-posture.md` states the boundary in the map's own
terms and is countersigned. It splits the isolation in two:

- `contest-radar-outbound-isolation` still denies `intelligence-read`,
  `bounded-render-summary` and `owner-manual-reference-read` to every target, Social Distribution
  included.
- `contest-radar-publish-isolation` denies `approved-publish-package` to every target **except**
  Social Distribution.
- One edge is registered: `contest-radar → social-distribution`, `approved-publish-package`,
  `contest-promotion-candidate/1`, decision **`held`**.

A held edge is a relationship that has been named and refused, which is better than one that was
never considered: `resolveVentureCapability` returns `held`, callers refuse, and the refusal is
legible instead of arriving as "no exact directional capability edge is registered", which reads
identically to a typo.

### What is built

| Piece | Where |
| --- | --- |
| Candidate, evidence and profile contracts | `orchestrator/src/contracts/contest-promotion.ts` |
| Derivation, gate, projection, staleness | `orchestrator/src/ventures/contest-radar/promotion.ts` |
| Posture decision | `state/decisions/2026-08-30-contest-radar-promotion-posture.md` |
| Edge and isolation split | `config/venture-capabilities.json` |
| Tests | `orchestrator/tests/contest-radar-promotion.test.ts` |

### Silence is held

Nine rule questions, each answered `permitted`, `prohibited` or `silent`. Six must be `permitted`
before a candidate promotes at all; three more before it may carry a referral link. Silence holds,
and so does ambiguity, which arrives as `silent` because nothing here is willing to read an
ambiguous clause as a yes.

The three values are not a boolean on purpose. A boolean collapses `silent` into `prohibited`, which
sounds safe and is not: it invites a later reader to "correct" the false to true on the grounds that
nothing actually forbade it.

Four more refusals sit beside the rules:

- **Several owned profiles are one entrant.** The projection carries an opaque beneficial-owner
  alias — enough to tell that two profiles are the same person, and nothing about who. An eligible
  candidate may name exactly one, in the gate and in the contract both.
- **A simulation is rejected with a reason, never filtered away.** A refusal that is a value gets
  looked at; an absence does not.
- **No referral link is ever constructed.** There is no code path that assembles one from a pattern,
  because a well-guessed pattern is still a fabrication. A link the rules do not establish comes off
  the record entirely rather than sitting there held, so nobody copies it out of a table.
- **A rules change expires the candidate.** `inputHash` covers the inputs and not the verdict, so a
  contest whose terms move produces a different candidate rather than an edited one.

### What eligibility still does not buy

`createVerifiedReleaseCampaign` refuses every Contest Radar release with `contest-source-excluded`,
on the source type and on the venture id, independently of anything decided here. A candidate
reaching `social-campaign-eligible` produces no campaign, and a test asserts both refusals are still
in the file — the regression the held edge makes possible for the first time is adding the edge and
quietly deleting the gate that ignores it.

There is no Admin surface for candidates and no candidate store, because nothing derives them on a
schedule while the edge is held. A panel showing an empty table would be a surface for data that
cannot exist yet.

**To move the edge from held to allowed:** a further countersigned decision naming the profile, the
contest, the rule evidence and the disclosure text. The posture decision says in its own words that
it is not that one.

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
